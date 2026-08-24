// Backup manual de todas as tabelas do Supabase, em JSON (uma por tabela),
// via service_role (bypassa RLS, então pega tudo mesmo sem sessão).
// Uso: node scripts/backup-supabase.mjs [nome-da-pasta]
// Sai em backups/<nome-da-pasta>/ (gitignored -- contém tokens em texto e
// e-mail de comprador, nunca comitar). Rode antes de qualquer migração de
// schema ou mudança em massa nos dados.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TABELAS = [
  'organizations', 'organization_members', 'organization_invites', 'subscriptions',
  'vendas', 'gastos', 'vsls', 'configuracoes', 'produtos_mapeamento', 'criativos',
  'alertas_log', 'simulacoes_funil', 'performance_criativo_snapshot', 'rastreador_snapshots',
  'rastreador_bibliotecas', 'rastreador_copy_ger', 'rastreador_criativos_hist',
  'rastreador_novidades', 'rastreador_paginas_hist', 'rastreador_radar_achados',
  'rastreador_radar_termos', 'rastreador_transcricoes',
]

const stamp = process.argv[2] || 'backup'
const dir = path.join('backups', stamp)
fs.mkdirSync(dir, { recursive: true })

const resumo = []
for (const t of TABELAS) {
  const todas = []
  let offset = 0
  let erro = null
  while (true) {
    const { data, error } = await sb.from(t).select('*').range(offset, offset + 999)
    if (error) { erro = error.message; break }
    if (!data || data.length === 0) break
    todas.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  if (erro) {
    console.log(t, '-> ERRO:', erro)
    resumo.push({ tabela: t, erro })
    continue
  }
  fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(todas, null, 1))
  console.log(t, '->', todas.length, 'linhas')
  resumo.push({ tabela: t, linhas: todas.length })
}
fs.writeFileSync(path.join(dir, '_resumo.json'), JSON.stringify({ criadoEm: new Date().toISOString(), tabelas: resumo }, null, 1))
console.log('\nOK ->', dir)
