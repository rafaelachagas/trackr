FROM python:3.11-slim

# ffmpeg é necessário pro Whisper ler o áudio do vídeo.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# yt-dlp nightly: os extratores de YouTube/Instagram/TikTok mudam quase toda
# semana; a nightly traz os contornos mais novos de bloqueio. O `>=` (bump a
# data quando precisar) força uma versão mínima que funciona E quebra o cache
# de layer do Docker, senão o rebuild mantém uma nightly velha e quebrada.
RUN pip install --no-cache-dir -U --pre "yt-dlp>=2026.8.30"

COPY app.py .

# gunicorn com 1 worker e timeout alto (transcrição é demorada em CPU).
RUN pip install --no-cache-dir gunicorn
ENV WHISPER_MODEL=small
EXPOSE 8082
# threads: o worker continua respondendo (health, polls de status) enquanto
# uma transcrição longa roda em thread de fundo.
CMD ["gunicorn", "-b", "0.0.0.0:8082", "-w", "1", "--threads", "8", "--timeout", "900", "app:app"]
