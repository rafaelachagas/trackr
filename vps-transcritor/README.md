# Transcritor (Whisper self-hosted) — VPS

Serviço de transcrição próprio, ilimitado e gratuito, usando faster-whisper.
Roda na mesma VPS do scraper, na porta **8082**.

## Instalar na VPS (uma vez)

No terminal da VPS (Hostinger), cole os comandos abaixo em blocos curtos:

```bash
# 1. Clonar o repositório (público) e entrar na pasta do transcritor
cd ~
git clone https://github.com/rafaelachagas/trackr.git 2>/dev/null || (cd trackr && git pull)
cd trackr/vps-transcritor
```

```bash
# 2. Definir a chave (a MESMA que vai na Vercel como TRANSCRITOR_APIKEY)
export TRANSCRITOR_APIKEY="COLE_UMA_CHAVE_FORTE_AQUI"
```

```bash
# 3. Subir (a 1ª vez baixa o modelo Whisper — pode demorar alguns minutos)
docker compose up -d --build
```

```bash
# 4. Abrir a porta 8082 no firewall
ufw allow 8082/tcp
```

```bash
# 5. Testar
curl "http://localhost:8082/health"
```

Deve responder `{"ok": true, "model": "small"}`.

## Modelo

- Padrão: `small` (bom equilíbrio pra PT-BR em CPU).
- Mais rápido/leve: edite `WHISPER_MODEL=base` (ou `tiny`) no `docker-compose.yml` e rode `docker compose up -d --build`.
- Mais preciso (VPS forte): `medium`.

## Logs / reiniciar

```bash
docker compose logs -f       # ver logs
docker compose restart       # reiniciar
```
