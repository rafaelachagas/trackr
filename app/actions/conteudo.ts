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
export interface PerfilConteudo {
  id: string
  url: string
  plataforma: 'tiktok' | 'instagram' | 'youtube' | 'outro'
  handle: string
  addedAt: string
  ultimaBusca: string | null
  freqDias: number | null   // re-puxa os virais a cada N dias (null = só salvo, sem agendamento)
  virais: VideoViral[]
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
export async function buscarViraisPerfil(url: string, igCookie = '', limit = 24): Promise<{ success: boolean; videos: VideoViral[]; error?: string }> {
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
    return { success: true, videos: j.videos || [] }
  } catch (e: any) {
    return { success: false, videos: [], error: e?.name === 'AbortError' ? 'O perfil demorou demais (timeout).' : 'Não consegui falar com o serviço na VPS.' }
  }
}

export interface StoryItem { id: string; url: string; thumb: string | null; duracao: number | null; quando: number | null }

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

// Adiciona um perfil pra rastrear (já puxa os virais e cacheia).
export async function salvarPerfilConteudo(url: string, igCookie = '', freqDias: number | null = null): Promise<{ success: boolean; data?: PerfilConteudo[]; error?: string }> {
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
    }
    perfis.unshift(novo)
    await gravarPerfis(orgId, perfis)
    return { success: true, data: perfis }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
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
    p.ultimaBusca = new Date().toISOString()
    await gravarPerfis(orgId, perfis)
    return { success: true, perfil: p }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
