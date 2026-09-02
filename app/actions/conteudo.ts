'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Rastreador de Conteúdos — perfis salvos (espionagem contínua), no mesmo estilo
// das Bibliotecas do Rastreador de Anúncios. Guardado em `configuracoes` como
// JSON (conteudo_perfis_<orgId>), sem precisar de tabela nova. Os vídeos virais
// ficam cacheados no próprio perfil pra abrir instantâneo; "Atualizar" re-puxa.

export interface VideoViral {
  id: string; url: string; titulo: string; views: number | null; likes: number | null
  comentarios: number | null; duracao: number | null; thumb: string | null
}
export interface PerfilMeta { nome?: string | null; bio?: string | null; link?: string | null }
export interface PerfilConteudo {
  id: string
  url: string
  plataforma: 'tiktok' | 'instagram' | 'youtube' | 'outro'
  handle: string
  addedAt: string
  ultimaBusca: string | null
  freqDias: number | null   // re-puxa os virais a cada N dias (null = só salvo, sem agendamento)
  virais: VideoViral[]
  nome?: string | null      // nome de exibição (ex.: "Rafaela Chagas")
  bio?: string | null
  link?: string | null      // link externo da bio
  grupoId?: string          // perfis da MESMA pessoa compartilham o grupoId
}

function plataformaDe(url: string): PerfilConteudo['plataforma'] {
  if (/tiktok\.com/i.test(url)) return 'tiktok'
  if (/instagram\.com/i.test(url)) return 'instagram'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  return 'outro'
}
function handleDe(url: string): string {
  const m = url.match(/(?:tiktok\.com\/@|instagram\.com\/|youtube\.com\/@)([\w.\-]+)/i)
    || url.match(/youtube\.com\/channel\/([\w-]+)/i)
  return m ? m[1] : url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 40)
}
function normalizar(url: string): string {
  try { const u = new URL(url); return `${u.origin}${u.pathname}`.replace(/\/$/, '').toLowerCase() } catch { return url.toLowerCase() }
}

async function lerPerfis(orgId: string): Promise<PerfilConteudo[]> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', `conteudo_perfis_${orgId}`).maybeSingle()
    return data?.valor ? JSON.parse(data.valor) : []
  } catch { return [] }
}
async function gravarPerfis(orgId: string, perfis: PerfilConteudo[]) {
  await supabaseAdmin.from('configuracoes').upsert(
    { chave: `conteudo_perfis_${orgId}`, valor: JSON.stringify(perfis.slice(0, 60)), org_id: orgId, updated_at: new Date().toISOString() },
    { onConflict: 'chave' })
}

// Cookie do Instagram — configurado UMA VEZ pelo admin, guardado no servidor.
// Qualquer usuário do The Track usa esse cookie sem precisar colar nada.
const CHAVE_IG = 'instagram_sessionid'

async function cookieInstagram(): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE_IG).maybeSingle()
    return (data?.valor || '').toString().trim()
  } catch { return '' }
}

// Só diz SE está configurado (nunca devolve o cookie em si pro cliente).
export async function statusInstagram(): Promise<{ configurado: boolean }> {
  return { configurado: !!(await cookieInstagram()) }
}

// Conectar Instagram por LOGIN (@ + senha): nosso backend (instagrapi) loga e
// devolve o sessionid, que a gente guarda. O usuário não mexe em cookie. A senha
// NÃO é guardada — só passa pra VPS logar e pegar a sessão.
export async function conectarInstagramLogin(username: string, password: string, code = ''): Promise<{ success: boolean; twoFactor?: boolean; checkpoint?: boolean; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    if (!username.trim() || !password) return { success: false, error: 'Usuário e senha são obrigatórios.' }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 90000)
    const r = await fetch(`${TRANSCRITOR_URL}/ig_login`, {
      method: 'POST', signal: ctrl.signal, cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: TRANSCRITOR_APIKEY, username: username.trim(), password, code }),
    }).finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j) return { success: false, error: 'Resposta inválida do servidor.' }
    if (j.twoFactor) return { success: false, twoFactor: true, error: j.error }
    if (j.checkpoint) return { success: false, checkpoint: true, error: j.error }
    if (!j.ok || !j.sessionid) return { success: false, error: j.error || 'Falha no login.' }
    // Guarda o sessionid (não a senha).
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: CHAVE_IG, valor: String(j.sessionid).trim(), org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: 'chave' })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.name === 'AbortError' ? 'O login demorou demais.' : e.message }
  }
}

export async function salvarCookieInstagram(cookie: string): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    let val = (cookie || '').trim()
    if (val.toLowerCase().startsWith('sessionid=')) val = val.split('=', 2)[1]
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: CHAVE_IG, valor: val, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: 'chave' })
    return { success: true }
  } catch (e: any) { return { success: false, error: e.message } }
}

// Puxa os vídeos virais de um perfil pelo transcritor da VPS (yt-dlp). Se for
// Instagram e não vier cookie, usa o cookie guardado no servidor.
export async function buscarViraisPerfil(url: string, igCookie = '', limit = 24): Promise<{ success: boolean; videos: VideoViral[]; perfil?: PerfilMeta; error?: string }> {
  if (!/^https?:\/\//i.test(url)) return { success: false, videos: [], error: 'Cole a URL do perfil (com https://).' }
  if (!igCookie && /instagram\.com/i.test(url)) igCookie = await cookieInstagram()
  if (/instagram\.com/i.test(url) && !igCookie) return { success: false, videos: [], error: 'Instagram ainda não conectado — configure o cookie da conta dedicada (uma vez) no topo da aba.' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 190000)
    const extra = igCookie ? `&ig_cookie=${encodeURIComponent(igCookie)}` : ''
    const r = await fetch(`${TRANSCRITOR_URL}/perfil?url=${encodeURIComponent(url)}&limit=${limit}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}${extra}`, {
      signal: ctrl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j) return { success: false, videos: [], error: 'Resposta inválida do serviço.' }
    if (j.error) return { success: false, videos: [], error: j.error }
    return { success: true, videos: j.videos || [], perfil: j.perfil || undefined }
  } catch (e: any) {
    return { success: false, videos: [], error: e?.name === 'AbortError' ? 'O perfil demorou demais (timeout).' : 'Não consegui falar com o serviço na VPS.' }
  }
}

export interface StoryItem { id: string; url: string; thumb: string | null; duracao: number | null; quando: number | null; tipo?: 'video' | 'foto' }

// Gera um link assinado pro navegador baixar a mídia do story pela nossa origem
// (força o salvamento e não expõe a chave/IP da VPS).
export async function linkBaixarStory(cdnUrl: string): Promise<string> {
  const { assinarVslUrl } = await import('@/lib/vigia-pagina')
  return `/api/rastreador/story-download?u=${encodeURIComponent(cdnUrl)}&t=${encodeURIComponent(assinarVslUrl(cdnUrl))}`
}

// Stories ativos (24h) de um perfil do Instagram. Usa o cookie guardado.
export async function verStoriesPerfil(url: string): Promise<{ success: boolean; itens: StoryItem[]; aviso?: string; error?: string }> {
  if (!/instagram\.com/i.test(url)) return { success: false, itens: [], error: 'Stories só do Instagram.' }
  const cookie = await cookieInstagram()
  if (!cookie) return { success: false, itens: [], error: 'Instagram não conectado.' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 120000)
    const r = await fetch(`${TRANSCRITOR_URL}/stories?url=${encodeURIComponent(url)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}&ig_cookie=${encodeURIComponent(cookie)}`, {
      signal: ctrl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j) return { success: false, itens: [], error: 'Resposta inválida.' }
    if (j.error) return { success: false, itens: [], error: j.error }
    return { success: true, itens: j.itens || [], aviso: j.aviso }
  } catch (e: any) {
    return { success: false, itens: [], error: e?.name === 'AbortError' ? 'Stories demoraram demais.' : 'Falha ao buscar stories.' }
  }
}

export async function listarPerfisConteudo(): Promise<{ success: boolean; data: PerfilConteudo[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  return { success: true, data: await lerPerfis(orgId) }
}

// --- Correlação: descobre se dois perfis são a MESMA pessoa ---
function slug(s?: string | null): string {
  // NFD + remover tudo que não é a-z0-9 já elimina acentos (marcas combinantes)
  return (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
}
// Pontua (0..100) o quanto `novo` parece ser a mesma pessoa que `p`.
function scoreCorrelacao(novo: { handle: string; nome?: string | null; bio?: string | null; link?: string | null; plataforma: string }, p: PerfilConteudo): number {
  if (p.plataforma === novo.plataforma) return 0 // mesma plataforma = perfis distintos
  let sc = 0
  const h1 = slug(novo.handle), h2 = slug(p.handle)
  // 1) link cruzado na bio/link (o sinal mais forte: o @ de um aparece na bio do outro)
  const txtNovo = `${slug(novo.bio)} ${slug(novo.link)}`
  const txtP = `${slug(p.bio)} ${slug(p.link)}`
  if (h2 && h2.length >= 4 && txtNovo.includes(h2)) sc += 60
  if (h1 && h1.length >= 4 && txtP.includes(h1)) sc += 60
  // 2) mesmo nome de exibição
  const n1 = slug(novo.nome), n2 = slug(p.nome)
  if (n1 && n2 && n1.length >= 4 && n1 === n2) sc += 45
  // 3) um @ contém o outro (byrafaelachagas ⊃ rafaelachagas)
  if (h1 && h2 && h1.length >= 4 && h2.length >= 4 && (h1.includes(h2) || h2.includes(h1))) sc += 30
  return Math.min(100, sc)
}

export interface SugestaoGrupo { comId: string; comHandle: string; comNome?: string | null; score: number }

// Adiciona um perfil pra rastrear (já puxa os virais e cacheia). Correlaciona
// automaticamente com perfis já rastreados da mesma pessoa (TikTok/Insta/YT):
// sinal forte (>=60) junta sozinho; sinal médio (>=30) devolve uma `sugestao`.
export async function salvarPerfilConteudo(url: string, igCookie = '', freqDias: number | null = null): Promise<{ success: boolean; data?: PerfilConteudo[]; novoId?: string; sugestao?: SugestaoGrupo; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const perfis = await lerPerfis(orgId)
    const norm = normalizar(url)
    const existente = perfis.find((p) => normalizar(p.url) === norm)
    if (existente) { existente.freqDias = freqDias; await gravarPerfis(orgId, perfis); return { success: true, data: perfis } }
    const r = await buscarViraisPerfil(url, igCookie)
    if (!r.success) return { success: false, error: r.error }
    const agora = new Date().toISOString()
    const novo: PerfilConteudo = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      url, plataforma: plataformaDe(url), handle: handleDe(url), addedAt: agora, ultimaBusca: agora, freqDias, virais: r.videos.slice(0, 24),
      nome: r.perfil?.nome ?? null, bio: r.perfil?.bio ?? null, link: r.perfil?.link ?? null,
    }
    // Correlação: acha o melhor candidato entre os já rastreados.
    let melhor: { p: PerfilConteudo; score: number } | null = null
    for (const p of perfis) {
      const s = scoreCorrelacao(novo, p)
      if (s > 0 && (!melhor || s > melhor.score)) melhor = { p, score: s }
    }
    let sugestao: SugestaoGrupo | undefined
    if (melhor && melhor.score >= 60) {
      // sinal forte → junta automaticamente
      const gid = melhor.p.grupoId || melhor.p.id
      melhor.p.grupoId = gid
      novo.grupoId = gid
    } else if (melhor && melhor.score >= 30) {
      sugestao = { comId: melhor.p.id, comHandle: melhor.p.handle, comNome: melhor.p.nome, score: melhor.score }
    }
    perfis.unshift(novo)
    await gravarPerfis(orgId, perfis)
    return { success: true, data: perfis, novoId: novo.id, sugestao }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Junta dois perfis no mesmo grupo (mesma pessoa).
export async function agruparPerfis(id: string, comId: string): Promise<{ success: boolean; data: PerfilConteudo[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const perfis = await lerPerfis(orgId)
  const a = perfis.find((p) => p.id === id), b = perfis.find((p) => p.id === comId)
  if (a && b) {
    const gid = b.grupoId || a.grupoId || b.id
    // reetiqueta todos que já estavam em qualquer um dos grupos
    const antigos = new Set([a.grupoId, b.grupoId, a.id, b.id].filter(Boolean) as string[])
    for (const p of perfis) if (p.grupoId && antigos.has(p.grupoId)) p.grupoId = gid
    a.grupoId = gid; b.grupoId = gid
    await gravarPerfis(orgId, perfis)
  }
  return { success: true, data: perfis }
}

// Tira um perfil do grupo (volta a ser um card sozinho).
export async function desagruparPerfil(id: string): Promise<{ success: boolean; data: PerfilConteudo[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const perfis = await lerPerfis(orgId)
  const p = perfis.find((x) => x.id === id)
  if (p) { delete p.grupoId; await gravarPerfis(orgId, perfis) }
  await gravarPerfis(orgId, perfis)
  return { success: true, data: perfis }
}

export async function removerPerfilConteudo(id: string): Promise<{ success: boolean; data: PerfilConteudo[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const perfis = (await lerPerfis(orgId)).filter((p) => p.id !== id)
  await gravarPerfis(orgId, perfis)
  return { success: true, data: perfis }
}

// Re-puxa os virais de um perfil salvo e atualiza o cache.
export async function atualizarViraisPerfil(id: string, igCookie = ''): Promise<{ success: boolean; perfil?: PerfilConteudo; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const perfis = await lerPerfis(orgId)
    const p = perfis.find((x) => x.id === id)
    if (!p) return { success: false, error: 'Perfil não encontrado.' }
    const r = await buscarViraisPerfil(p.url, igCookie)
    if (!r.success) return { success: false, error: r.error }
    p.virais = r.videos.slice(0, 24)
    if (r.perfil) { p.nome = r.perfil.nome ?? p.nome; p.bio = r.perfil.bio ?? p.bio; p.link = r.perfil.link ?? p.link }
    p.ultimaBusca = new Date().toISOString()
    await gravarPerfis(orgId, perfis)
    return { success: true, perfil: p }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
