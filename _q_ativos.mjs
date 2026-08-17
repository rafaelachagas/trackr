import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const faseToken = t => { const m = (t || '').toLowerCase().match(/fase\s*0?([123])/); return m ? `FASE0${m[1]}` : null }
const flagsToken = t => { const s=(t||'').toLowerCase(); return `${s.includes('bmsub')?'S':'-'}${s.includes('bmus')?'U':'-'}${/(^|[^a-z0-9])v2([^0-9]|$)/.test(s)?'2':'-'}` }
const extrairCriativo = texto => { if (!texto) return null; const p = texto.split('|'); const alvo = p.length >= 3 ? p[2] : texto; const m = alvo.match(/^(ad\d+)/i); return m ? m[1].toLowerCase() : null }

const { data: cfg } = await sb.from('configuracoes').select('chave,valor').in('chave',['meta_access_token','meta_ad_account_ids','meta_ad_account_id'])
const map = Object.fromEntries((cfg||[]).map(c=>[c.chave,c.valor]))
const token = map['meta_access_token']
let ids = []; try { ids = JSON.parse(map['meta_ad_account_ids']||'[]') } catch {}
if (!ids.length && map['meta_ad_account_id']) ids=[map['meta_ad_account_id']]
console.log('contas configuradas:', ids.length)

const BASE='https://graph.facebook.com/v25.0'
let totalActive=0; const keys=new Set()
for (const id of ids) {
  const acct = id.startsWith('act_')?id:`act_${id}`
  let url = `${BASE}/${acct}/ads?`+new URLSearchParams({fields:'name,effective_status,campaign{name}',filtering:JSON.stringify([{field:'effective_status',operator:'IN',value:['ACTIVE']}]),limit:'500',access_token:token})
  let pag=0, cnt=0, err=null
  while(url&&pag<20){ const r=await fetch(url); const j=await r.json(); if(j.error){err=j.error.message;break} for(const ad of j.data||[]){cnt++;totalActive++;const cod=extrairCriativo(ad.name);if(cod)keys.add(`${cod}|${faseToken(ad.campaign?.name)??'?'}|${flagsToken(ad.name)}`)} url=j.paging?.next||null; pag++ }
  console.log(`  ${acct}: ${cnt} ativos${err?' ERRO: '+err:''}`)
}
console.log('\nTOTAL anuncios ativos:', totalActive)
console.log('chaves ativas unicas:', keys.size)
console.log('amostra chaves ativas:', [...keys].slice(0,8))

// compara com chaves de gasto (o que a tabela tentaria mostrar)
const { data: g } = await sb.from('gastos').select('criativo,campaign_name,ad_name').not('ad_id','is',null).gte('data','2026-07-16').limit(2000)
const gkeys=new Set(); for(const r of g||[]){ if(!r.criativo)continue; gkeys.add(`${r.criativo}|${faseToken(r.campaign_name)??'?'}|${flagsToken(r.ad_name)}`) }
console.log('\nchaves de GASTO (7d):', gkeys.size)
console.log('amostra gasto:', [...gkeys].slice(0,8))
let inter=0; for(const k of gkeys) if(keys.has(k)) inter++
console.log('INTERSECAO gasto x ativos:', inter, '(se 0 -> filtro zera a tabela)')
