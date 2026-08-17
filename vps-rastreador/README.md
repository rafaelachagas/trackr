# Rastreador — serviço de scraping (VPS)

Serviço que abre a Biblioteca de Anúncios da Meta num Chromium headless e devolve
os criativos ativos em JSON. Roda na mesma VPS do Evolution, na porta **8081**.

## Subir na VPS

1. Copie a pasta `vps-rastreador/` pra VPS (ex.: `/opt/rastreador`).
2. Defina o segredo (o mesmo vai no The Track):
   ```bash
   cd /opt/rastreador
   echo "SCRAPER_APIKEY=coloque-um-segredo-forte-aqui" > .env
   ```
3. Suba:
   ```bash
   docker compose up -d --build
   ```
4. Abra a porta 8081 no firewall da Hostinger (ou deixe só acessível pela rede se for chamar via localhost).

## Testar (antes de ligar no app)

Health:
```bash
curl http://SEU_IP:8081/
```

Scrape de um concorrente (pegue o link na Biblioteca de Anúncios da Meta → filtre pela página → copie a URL):
```bash
curl -X POST http://SEU_IP:8081/scrape \
  -H "Content-Type: application/json" \
  -H "x-api-key: SEU_SEGREDO" \
  -d '{"url":"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&view_all_page_id=PAGE_ID","debug":true}'
```

- `debug:true` devolve também `raw_amostra` (o 1º payload cru da Meta) — mande pra mim
  se os campos vierem faltando, que eu calibro o parser.
- `maxScrolls` (padrão 12) controla quantas vezes rola pra carregar mais anúncios.

## Retorno
```json
{
  "ok": true,
  "stats": { "encontrados": 23, "duplicacoes": 76, "idade_media_dias": 17 },
  "criativos": [
    {
      "ad_archive_id": "…", "page_name": "…", "headline": "…", "body": "…",
      "cta_text": "…", "media_type": "video", "video_url": "…", "image_url": "…",
      "start_date": "…", "dias_ativo": 27, "copias": 2,
      "snapshot_url": "https://www.facebook.com/ads/library/?id=…"
    }
  ]
}
```
