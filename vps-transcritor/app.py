import os
import subprocess
import tempfile
import threading
import time
import uuid
import requests
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

# Serviço de transcrição self-hosted (Whisper) — roda na VPS, ilimitado e gratuito.
# Recebe um video_url (ex.: vídeo da Biblioteca de Anúncios da Meta), baixa e transcreve.

APIKEY = os.environ.get("TRANSCRITOR_APIKEY", "")
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")   # tiny/base/small/medium
COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")     # int8 é o mais leve em CPU

app = Flask(__name__)

# Carrega o modelo uma vez (fica em memória entre requests).
print(f"[transcritor] carregando modelo {MODEL_SIZE} ({COMPUTE})...", flush=True)
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE)
print("[transcritor] pronto.", flush=True)

TRANSCRIBE_LOCK = threading.Lock()

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def baixar(video_url: str) -> str:
    # m3u8 (streaming HLS — padrão da VTurb) não é um arquivo: o ffmpeg junta os
    # segmentos e extrai só o áudio (wav 16k mono, o que o Whisper quer).
    if ".m3u8" in video_url.lower():
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        cmd = [
            "ffmpeg", "-y", "-user_agent", UA, "-i", video_url,
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=600)
        if r.returncode != 0 or os.path.getsize(path) < 1000:
            os.path.exists(path) and os.remove(path)
            raise RuntimeError(f"ffmpeg falhou no m3u8: {r.stderr[-300:].decode(errors='ignore')}")
        return path
    r = requests.get(video_url, headers={"User-Agent": UA}, stream=True, timeout=60)
    r.raise_for_status()
    fd, path = tempfile.mkstemp(suffix=".mp4")
    with os.fdopen(fd, "wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 16):
            if chunk:
                f.write(chunk)
    return path


@app.get("/health")
def health():
    return jsonify(ok=True, model=MODEL_SIZE)


# ---- Transcrição assíncrona (VSLs longas estouram o timeout do site) ----
# POST/GET /transcribe_async?video_url= → {job_id}; a transcrição roda numa
# thread (respeitando a mesma trava de CPU) e o resultado fica em memória.
# GET /result?id= → {status: fila|rodando|ok|erro, texto?, erro?}.
JOBS = {}
JOBS_LOCK = threading.Lock()


def _rodar_job(job_id: str, video_url: str):
    with JOBS_LOCK:
        JOBS[job_id]["status"] = "fila"
    if not TRANSCRIBE_LOCK.acquire(timeout=3600):
        with JOBS_LOCK:
            JOBS[job_id].update(status="erro", erro="transcritor ocupado por mais de 1h")
        return
    path = None
    try:
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "rodando"
        path = baixar(video_url)
        segments, info = model.transcribe(path, language="pt", vad_filter=True)
        texto = " ".join(s.text.strip() for s in segments).strip()
        with JOBS_LOCK:
            JOBS[job_id].update(status="ok", texto=texto, idioma=info.language, duracao=round(info.duration, 1))
    except Exception as e:
        with JOBS_LOCK:
            JOBS[job_id].update(status="erro", erro=f"falha ao transcrever: {e}")
    finally:
        TRANSCRIBE_LOCK.release()
        if path and os.path.exists(path):
            os.remove(path)


def _limpar_jobs_velhos():
    corte = time.time() - 2 * 3600
    with JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if v.get("criado", 0) < corte]:
            del JOBS[k]


@app.route("/transcribe_async", methods=["GET", "POST"])
def transcribe_async():
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    video_url = request.args.get("video_url")
    if not video_url and request.is_json:
        video_url = (request.json or {}).get("video_url")
    if not video_url:
        return jsonify(error="video_url ausente"), 400
    _limpar_jobs_velhos()
    job_id = uuid.uuid4().hex
    with JOBS_LOCK:
        JOBS[job_id] = {"status": "fila", "criado": time.time()}
    threading.Thread(target=_rodar_job, args=(job_id, video_url), daemon=True).start()
    return jsonify(ok=True, job_id=job_id)


@app.get("/result")
def result():
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    job = JOBS.get(request.args.get("id") or "")
    if not job:
        return jsonify(error="job desconhecido (expirou ou o serviço reiniciou)"), 404
    return jsonify({k: v for k, v in job.items() if k != "criado"})


@app.get("/download")
def download():
    """Baixa uma VSL como arquivo .mp4. m3u8 (HLS) é remontado pelo ffmpeg
    (-c copy: só junta os segmentos, sem re-encodar — rápido). mp4 direto é
    repassado. Sem trava: é IO, não compete com a CPU do Whisper."""
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    video_url = request.args.get("video_url")
    if not video_url:
        return jsonify(error="video_url ausente"), 400

    from flask import Response, stream_with_context

    path = None
    try:
        if ".m3u8" in video_url.lower():
            fd, path = tempfile.mkstemp(suffix=".mp4")
            os.close(fd)
            cmd = ["ffmpeg", "-y", "-user_agent", UA, "-i", video_url, "-c", "copy",
                   "-bsf:a", "aac_adtstoasc", path]
            r = subprocess.run(cmd, capture_output=True, timeout=900)
            if r.returncode != 0 or os.path.getsize(path) < 10000:
                raise RuntimeError(f"ffmpeg: {r.stderr[-300:].decode(errors='ignore')}")
        else:
            r = requests.get(video_url, headers={"User-Agent": UA}, stream=True, timeout=60)
            r.raise_for_status()
            fd, path = tempfile.mkstemp(suffix=".mp4")
            with os.fdopen(fd, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 16):
                    if chunk:
                        f.write(chunk)

        tamanho = os.path.getsize(path)

        def gerar(p):
            try:
                with open(p, "rb") as f:
                    while True:
                        chunk = f.read(1 << 16)
                        if not chunk:
                            break
                        yield chunk
            finally:
                os.path.exists(p) and os.remove(p)

        return Response(
            stream_with_context(gerar(path)),
            mimetype="video/mp4",
            headers={
                "Content-Disposition": "attachment; filename=vsl-concorrente.mp4",
                "Content-Length": str(tamanho),
            },
        )
    except Exception as e:
        if path and os.path.exists(path):
            os.remove(path)
        return jsonify(error=f"falha ao baixar: {e}"), 500


@app.route("/transcribe", methods=["GET", "POST"])
def transcribe():
    if APIKEY:
        key = request.args.get("key") or (request.json or {}).get("key") if request.is_json else request.args.get("key")
        if key != APIKEY:
            return jsonify(error="nao autorizado"), 401

    video_url = request.args.get("video_url")
    if not video_url and request.is_json:
        video_url = (request.json or {}).get("video_url")
    if not video_url:
        return jsonify(error="video_url ausente"), 400

    # CPU não aguenta duas transcrições ao mesmo tempo (as duas estouram o
    # timeout). Trava global: uma roda, as outras esperam a vez (até 4 min).
    if not TRANSCRIBE_LOCK.acquire(timeout=240):
        return jsonify(error="transcritor ocupado — tente de novo em instantes"), 503
    path = None
    try:
        path = baixar(video_url)
        segments, info = model.transcribe(path, language="pt", vad_filter=True)
        texto = " ".join(s.text.strip() for s in segments).strip()
        return jsonify(ok=True, texto=texto, idioma=info.language, duracao=round(info.duration, 1))
    except Exception as e:
        return jsonify(error=f"falha ao transcrever: {e}"), 500
    finally:
        TRANSCRIBE_LOCK.release()
        if path and os.path.exists(path):
            os.remove(path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8082")))
