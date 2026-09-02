import os
import json
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
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

# Extensões de mídia direta (baixa com requests). Qualquer outra coisa é tratada
# como PÁGINA de conteúdo (TikTok/Instagram/YouTube) e resolvida pelo yt-dlp.
MEDIA_EXT = (".mp4", ".mov", ".webm", ".m4a", ".mp3", ".wav", ".aac", ".ogg")


# Proxy residencial (opcional): quando setado, TUDO sai por esse IP — resolve os
# bloqueios de IP de datacenter (YouTube/Instagram). Vem do env PROXY_URL, no
# formato http://user:pass@host:port. Sem ele, funciona direto (TikTok/IG público).
PROXY_URL = os.environ.get("PROXY_URL", "").strip()


def _yt_extra(url: str):
    """YouTube bloqueia IP de datacenter ('confirm you're not a bot'). SEM proxy,
    os clients alternativos (tv/mweb) ajudam a furar. COM proxy residencial, o
    client PADRÃO funciona — e os alternativos aí dão 'page needs to be reloaded'.
    Então: com proxy, não passa extractor-args."""
    if PROXY_URL:
        return []
    low = (url or "").lower()
    if "youtube.com" in low or "youtu.be" in low:
        return ["--extractor-args", "youtube:player_client=tv,web_safari,mweb"]
    return []


def _proxies():
    return {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None


def _yt_proxy():
    return ["--proxy", PROXY_URL] if PROXY_URL else []


# Detecta se um erro foi do PROXY (sem saldo/GB, fora do ar, credencial mudou) e
# devolve um aviso claro pro usuário saber que é só recarregar. Senão, None.
def _erro_proxy(txt: str):
    low = (txt or "").lower()
    marcas = ["proxy", "407 ", "proxyerror", "tunnel connection failed",
              "unable to connect to proxy", "cannot connect to proxy",
              "failed to establish a new connection", "econnrefused",
              "remote end closed connection", "max retries exceeded"]
    if any(m in low for m in marcas):
        return ("⚠️ PROXY: o proxy residencial falhou — provavelmente acabou o "
                "saldo (GB) ou ele caiu. Recarregue o proxy (IPRoyal) e tente de novo.")
    return None


def _cookies_file(ig_cookie: str):
    """Monta um cookies.txt (Netscape) com o sessionid do Instagram, pra o
    yt-dlp entrar como a conta logada. Devolve o caminho ou None."""
    if not ig_cookie:
        return None
    val = ig_cookie.strip()
    if val.startswith("sessionid="):
        val = val.split("=", 1)[1]
    fd, path = tempfile.mkstemp(suffix=".txt")
    with os.fdopen(fd, "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write(".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t%s\n" % val)
    return path


def _ytdlp_audio_wav(url: str, cookies: str = None) -> str:
    """Baixa o áudio de uma página de conteúdo via yt-dlp e converte pra wav
    16k mono (o que o Whisper quer). Tenta ANÔNIMO primeiro (sem login); só usa
    o cookie como reserva se o conteúdo exigir login. Assim transcrever um link
    público funciona mesmo sem conta conectada."""
    d = tempfile.mkdtemp()
    try:
        def _run(with_cookies):
            cmd = ["yt-dlp", "-f", "bestaudio/best", "--no-playlist", "--no-warnings",
                   "--user-agent", UA] + _yt_extra(url) + _yt_proxy() + ["-o", os.path.join(d, "src.%(ext)s"), url]
            if with_cookies and cookies:
                cmd += ["--cookies", cookies]
            # 2h de teto: aguenta baixar o áudio de um vídeo de várias horas.
            return subprocess.run(cmd, capture_output=True, timeout=7200)
        r = _run(False)
        srcs = [f for f in os.listdir(d) if f.startswith("src.")]
        if (r.returncode != 0 or not srcs) and cookies:
            r = _run(True)  # reserva: com a conta conectada
            srcs = [f for f in os.listdir(d) if f.startswith("src.")]
        if r.returncode != 0 or not srcs:
            err = r.stderr[-400:].decode(errors="ignore")
            raise RuntimeError(_erro_proxy(err) or ("yt-dlp: " + err))
        src = os.path.join(d, srcs[0])
        fd, wav = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        r2 = subprocess.run(["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav],
                            capture_output=True, timeout=7200)
        if r2.returncode != 0 or os.path.getsize(wav) < 1000:
            raise RuntimeError("ffmpeg: " + r2.stderr[-200:].decode(errors="ignore"))
        return wav
    finally:
        shutil.rmtree(d, ignore_errors=True)


def _ytdlp_video_mp4(url: str, cookies: str = None) -> str:
    """Baixa o vídeo (mp4) de uma página de conteúdo via yt-dlp."""
    d = tempfile.mkdtemp()
    try:
        cmd = ["yt-dlp", "-f", "mp4/bestvideo+bestaudio/best", "--no-playlist", "--no-warnings",
               "--merge-output-format", "mp4", "--user-agent", UA] + _yt_extra(url) + _yt_proxy() + ["-o", os.path.join(d, "v.%(ext)s"), url]
        if cookies:
            cmd += ["--cookies", cookies]
        r = subprocess.run(cmd, capture_output=True, timeout=7200)
        vs = [f for f in os.listdir(d) if f.startswith("v.")]
        if r.returncode != 0 or not vs:
            err = r.stderr[-400:].decode(errors="ignore")
            raise RuntimeError(_erro_proxy(err) or ("yt-dlp: " + err))
        final = os.path.join(tempfile.gettempdir(), uuid.uuid4().hex + ".mp4")
        shutil.move(os.path.join(d, vs[0]), final)
        return final
    finally:
        shutil.rmtree(d, ignore_errors=True)


def baixar(video_url: str, cookies: str = None) -> str:
    # m3u8 (streaming HLS — padrão da VTurb) não é um arquivo: o ffmpeg junta os
    # segmentos e extrai só o áudio (wav 16k mono, o que o Whisper quer).
    if ".m3u8" in video_url.lower():
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        cmd = [
            "ffmpeg", "-y", "-user_agent", UA, "-i", video_url,
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", path,
        ]
        # 30 min de teto: sobra pra extrair o áudio de uma VSL de 1h.
        r = subprocess.run(cmd, capture_output=True, timeout=7200)
        if r.returncode != 0 or os.path.getsize(path) < 1000:
            os.path.exists(path) and os.remove(path)
            raise RuntimeError(f"ffmpeg falhou no m3u8: {r.stderr[-300:].decode(errors='ignore')}")
        return path
    # Página de conteúdo (TikTok/Instagram/YouTube/etc.) — não é mídia direta:
    # o yt-dlp resolve e baixa o áudio.
    low = video_url.lower().split("?")[0]
    if not low.endswith(MEDIA_EXT):
        return _ytdlp_audio_wav(video_url, cookies)
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


def _rodar_job(job_id: str, video_url: str, cookies: str = None):
    with JOBS_LOCK:
        JOBS[job_id]["status"] = "fila"
    if not TRANSCRIBE_LOCK.acquire(timeout=7200):
        with JOBS_LOCK:
            JOBS[job_id].update(status="erro", erro="transcritor ocupado por mais de 2h")
        return
    path = None
    try:
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "rodando"
        path = baixar(video_url, cookies)
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
        if cookies and os.path.exists(cookies):
            os.remove(cookies)


def _limpar_jobs_velhos():
    corte = time.time() - 24 * 3600
    with JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if v.get("criado", 0) < corte]:
            del JOBS[k]


@app.route("/transcribe_async", methods=["GET", "POST"])
def transcribe_async():
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    video_url = request.args.get("video_url")
    ig_cookie = request.args.get("ig_cookie")
    if request.is_json:
        video_url = video_url or (request.json or {}).get("video_url")
        ig_cookie = ig_cookie or (request.json or {}).get("ig_cookie")
    if not video_url:
        return jsonify(error="video_url ausente"), 400
    _limpar_jobs_velhos()
    cookies = _cookies_file(ig_cookie)
    job_id = uuid.uuid4().hex
    with JOBS_LOCK:
        JOBS[job_id] = {"status": "fila", "criado": time.time()}
    threading.Thread(target=_rodar_job, args=(job_id, video_url, cookies), daemon=True).start()
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
        low = video_url.lower().split("?")[0]
        if ".m3u8" in video_url.lower():
            fd, path = tempfile.mkstemp(suffix=".mp4")
            os.close(fd)
            cmd = ["ffmpeg", "-y", "-user_agent", UA, "-i", video_url, "-c", "copy",
                   "-bsf:a", "aac_adtstoasc", path]
            r = subprocess.run(cmd, capture_output=True, timeout=7200)
            if r.returncode != 0 or os.path.getsize(path) < 10000:
                raise RuntimeError(f"ffmpeg: {r.stderr[-300:].decode(errors='ignore')}")
        elif not low.endswith(MEDIA_EXT):
            # Página de conteúdo (TikTok/Instagram/YouTube) → yt-dlp baixa o mp4.
            cookies = _cookies_file(request.args.get("ig_cookie"))
            try:
                path = _ytdlp_video_mp4(video_url, cookies)
            finally:
                if cookies and os.path.exists(cookies):
                    os.remove(cookies)
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


# Scraper PRÓPRIO do Instagram: chama a API web interna deles (a mesma do site),
# com o sessionid. Muito mais confiável que o yt-dlp pra LISTAR o feed do perfil.
IG_APP_ID = "936619743392459"


def _ig_sessionid(raw: str) -> str:
    v = (raw or "").strip()
    if v.lower().startswith("sessionid="):
        v = v.split("=", 1)[1]
    return v


# --- Scraper próprio do Instagram via curl_cffi ---
# O Instagram bloqueia (429) as APIs internas quando a requisição vem do
# fingerprint TLS do requests/python. curl_cffi com impersonate="chrome" imita
# o TLS do Chrome de verdade e passa. Fluxo: (1) abre a página HTML do perfil
# (pública, 200) pra extrair o uid; (2) puxa os posts pelo /api/v1/feed/user/
# (que responde 200 com play_count/like_count) — o web_profile_info está
# entupido de 429 e não serve mais.
IG_IMPERSONATE = "chrome120"
_IG_UID_CACHE = {}


def _ig_cffi_session(sessionid: str):
    from curl_cffi import requests as cr
    uid = urllib.parse.unquote(sessionid).split(":")[0] if sessionid else ""
    kw = {"impersonate": IG_IMPERSONATE}
    if PROXY_URL:
        kw["proxies"] = {"http": PROXY_URL, "https": PROXY_URL}
    s = cr.Session(**kw)
    if sessionid:
        s.cookies.set("sessionid", sessionid, domain=".instagram.com")
        if uid:
            s.cookies.set("ds_user_id", uid, domain=".instagram.com")
    return s, uid


def _ig_uid_do_handle(s, handle: str) -> str:
    cached = _IG_UID_CACHE.get(handle.lower())
    if cached:
        return cached
    # Resolve o uid pelo @ direto (mesmo endpoint do feed, robusto).
    r = s.get(f"https://www.instagram.com/api/v1/feed/user/{handle}/username/?count=1",
              headers=_ig_headers(handle), timeout=45)
    if r.status_code == 404:
        raise RuntimeError("perfil não encontrado")
    if r.status_code != 200:
        raise RuntimeError(f"não consegui resolver o perfil ({r.status_code})")
    u = ((r.json() or {}).get("user")) or {}
    uid = str(u.get("pk") or u.get("id") or "")
    if not uid:
        raise RuntimeError("não consegui resolver o perfil")
    _IG_UID_CACHE[handle.lower()] = uid
    return uid


def _ig_feed_item_to_dict(it: dict) -> dict:
    code = it.get("code") or ""
    mt = it.get("media_type")  # 1 foto, 2 vídeo, 8 carrossel
    is_video = mt == 2
    views = it.get("play_count") or it.get("ig_play_count") or it.get("view_count")
    # thumbnail: no carrossel vem no primeiro filho
    node = it
    if mt == 8 and it.get("carousel_media"):
        node = it["carousel_media"][0]
        if node.get("media_type") == 2:
            is_video = True
            views = views or node.get("play_count") or node.get("view_count")
    cands = ((node.get("image_versions2") or {}).get("candidates")) or []
    thumb = cands[0].get("url") if cands else None
    cap = ((it.get("caption") or {}) or {}).get("text") or ""
    return {
        "id": str(it.get("pk") or it.get("id") or ""),
        "url": f"https://www.instagram.com/{'reel' if is_video else 'p'}/{code}/",
        "titulo": cap.strip()[:200],
        "views": views if is_video else None,
        "likes": it.get("like_count"),
        "comentarios": it.get("comment_count"),
        "duracao": it.get("video_duration"),
        "thumb": thumb,
        "data": it.get("taken_at"),  # unix (s) — pra filtro por período
    }


def _ig_headers(handle: str) -> dict:
    return {
        "x-ig-app-id": IG_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        "Referer": f"https://www.instagram.com/{handle}/",
    }


def _ig_user_meta(u: dict) -> dict:
    return {
        "nome": u.get("full_name") or None,
        "bio": u.get("biography") or None,
        "link": u.get("external_url") or None,
    }


def _ig_feed(handle: str, sessionid: str, limit: int):
    s, _ = _ig_cffi_session(sessionid)
    hh = _ig_headers(handle)
    # 1ª página resolve pelo @ direto (robusto — não depende do HTML): esse
    # endpoint devolve o objeto `user` (uid, nome, bio) + os primeiros posts.
    api = f"https://www.instagram.com/api/v1/feed/user/{handle}/username/?count=12"
    r = s.get(api, headers=hh, timeout=45)
    if r.status_code == 401:
        raise RuntimeError("cookie do Instagram inválido/expirado (reconecte a conta)")
    if r.status_code == 404:
        raise RuntimeError("perfil não encontrado")
    if r.status_code != 200:
        raise RuntimeError(f"feed {r.status_code}: {r.text[:120]}")
    data = r.json() or {}
    u = data.get("user") or {}
    uid = str(u.get("pk") or u.get("id") or "")
    if uid:
        _IG_UID_CACHE[handle.lower()] = uid
    meta = _ig_user_meta(u)
    if not meta.get("nome"):
        meta["nome"] = handle
    vids = [_ig_feed_item_to_dict(it) for it in (data.get("items") or [])]
    max_id = data.get("next_max_id") or ""
    more = data.get("more_available")
    # Paginação: as próximas páginas vão por uid.
    guard = 0
    while len(vids) < limit and more and max_id and uid and guard < 10:
        guard += 1
        r = s.get(f"https://www.instagram.com/api/v1/feed/user/{uid}/?count=12&max_id={max_id}", headers=hh, timeout=45)
        if r.status_code != 200:
            break
        data = r.json() or {}
        for it in (data.get("items") or []):
            vids.append(_ig_feed_item_to_dict(it))
        more = data.get("more_available")
        max_id = data.get("next_max_id") or ""
    return vids[:limit], meta


def _ig_stories(handle: str, sessionid: str):
    s, _ = _ig_cffi_session(sessionid)
    uid = _ig_uid_do_handle(s, handle)
    hh = {"x-ig-app-id": IG_APP_ID, "x-requested-with": "XMLHttpRequest",
          "Referer": f"https://www.instagram.com/{handle}/"}
    r = s.get(f"https://www.instagram.com/api/v1/feed/reels_media/?reel_ids={uid}", headers=hh, timeout=45)
    if r.status_code != 200:
        return []
    reels = ((r.json() or {}).get("reels") or {}).get(str(uid)) or {}
    itens = []
    for it in (reels.get("items") or []):
        mt = it.get("media_type")
        vv = (it.get("video_versions") or [{}])
        cands = ((it.get("image_versions2") or {}).get("candidates")) or []
        itens.append({
            "id": str(it.get("pk") or ""),
            "url": (vv[0].get("url") if mt == 2 and vv and vv[0] else None) or (cands[0].get("url") if cands else None),
            "thumb": cands[0].get("url") if cands else None,
            "duracao": it.get("video_duration"),
            "quando": it.get("taken_at"),
            "tipo": "video" if mt == 2 else "foto",
        })
    return itens


# ---- Rastreador de conteúdos: lista os vídeos mais virais de um perfil ----
# GET /perfil?url=<perfil>&limit=20&ig_cookie=<sessionid?>
# Instagram: instagrapi (API mobile) com fallback pro endpoint web. TikTok/YT: yt-dlp.
@app.get("/perfil")
def perfil():
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    url = request.args.get("url")
    if not url:
        return jsonify(error="url ausente"), 400
    limit = min(max(int(request.args.get("limit", "20")), 1), 90)

    # Instagram → scraper próprio (API web interna), não yt-dlp.
    if "instagram.com" in url.lower():
        sid = _ig_sessionid(request.args.get("ig_cookie", ""))
        if not sid:
            return jsonify(error="Instagram não conectado (sem cookie)."), 400
        import re as _re
        m = _re.search(r"instagram\.com/([A-Za-z0-9_.]+)", url)
        handle = m.group(1) if m else ""
        if not handle:
            return jsonify(error="perfil inválido"), 400
        try:
            vids, meta = _ig_feed(handle, sid, limit)  # curl_cffi + /feed/user/
            if not (meta.get("nome")):
                meta["nome"] = handle
            return jsonify(ok=True, videos=vids, total=len(vids), perfil=meta,
                           com_views=sum(1 for v in vids if isinstance(v.get("views"), int)), fonte="ig-feed")
        except Exception as e:
            return jsonify(error=_erro_proxy(str(e)) or f"instagram: {e}"), 502

    cookies = _cookies_file(request.args.get("ig_cookie"))
    try:
        # dump-json (metadados completos, com view_count). playlist-end limita
        # quantos vídeos ele extrai — extração completa é ~1s por vídeo.
        cmd = ["yt-dlp", "-J", "--flat-playlist", "--no-warnings", "--user-agent", UA]
        cmd += _yt_extra(url) + _yt_proxy()
        cmd += ["--playlist-end", str(min(limit * 2, 120)), url]
        if cookies:
            cmd += ["--cookies", cookies]
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        if r.returncode != 0:
            return jsonify(error="yt-dlp: " + r.stderr[-400:].decode(errors="ignore")), 502
        data = json.loads(r.stdout.decode(errors="ignore") or "{}")
        entries = data.get("entries") or []
        vids = []
        for e in entries:
            if not e:
                continue
            vids.append({
                "id": e.get("id"),
                "url": e.get("url") or e.get("webpage_url"),
                "titulo": (e.get("title") or "").strip()[:200],
                "views": e.get("view_count"),
                "likes": e.get("like_count"),
                "comentarios": e.get("comment_count"),
                "duracao": e.get("duration"),
                "thumb": e.get("thumbnail") or (e.get("thumbnails") or [{}])[-1].get("url"),
                "data": e.get("timestamp") or e.get("release_timestamp"),
            })
        com_views = [v for v in vids if isinstance(v.get("views"), int)]
        meta = {
            "nome": data.get("uploader") or data.get("channel") or data.get("title"),
            "bio": data.get("description"),
            "link": data.get("channel_url") or data.get("uploader_url") or data.get("webpage_url"),
        }
        # Devolve na ORDEM RECENTE (do feed). O The Track ordena por views quando
        # quer a aba "virais" — assim a mesma resposta serve pro feed e pros virais.
        saida = vids[:limit]
        return jsonify(ok=True, videos=saida, total=len(vids), perfil=meta, com_views=len(com_views))
    except Exception as e:
        return jsonify(error=f"falha no perfil: {e}"), 500
    finally:
        if cookies and os.path.exists(cookies):
            os.remove(cookies)


# ---- Stories ativos de um perfil do Instagram (efêmeros, 24h) ----
# GET /stories?url=<perfil>&ig_cookie=<sessionid>. Precisa do cookie e que a
# conta conectada consiga ver os stories (perfil público ou seguido).
@app.get("/stories")
def stories():
    if APIKEY and request.args.get("key") != APIKEY:
        return jsonify(error="nao autorizado"), 401
    url = request.args.get("url", "")
    if "instagram.com" not in url.lower():
        return jsonify(error="stories só do Instagram"), 400
    import re as _re
    m = _re.search(r"instagram\.com/([A-Za-z0-9_.]+)", url)
    handle = m.group(1) if m else ""
    if not handle:
        return jsonify(error="perfil inválido"), 400
    sid = _ig_sessionid(request.args.get("ig_cookie", ""))
    if not sid:
        return jsonify(error="Instagram não conectado (sem cookie)."), 400
    try:
        itens = _ig_stories(handle, sid)
        return jsonify(ok=True, itens=itens, total=len(itens))
    except Exception as e:
        return jsonify(ok=True, itens=[], aviso=_erro_proxy(str(e)) or f"falha nos stories: {e}")


# ---- Login do Instagram (nosso backend) ----
# POST /ig_login {username, password, code?} → loga com a instagrapi e devolve o
# sessionid pra guardar. É o "conectar conta" sem o usuário mexer em cookie.
# Se o Insta pedir 2FA, devolve {twoFactor:true} e o app manda de novo com o code.
@app.post("/ig_login")
def ig_login():
    if APIKEY and (request.args.get("key") or (request.json or {}).get("key")) != APIKEY:
        return jsonify(error="nao autorizado"), 401
    body = request.json or {}
    u = (body.get("username") or "").strip().lstrip("@")
    p = body.get("password") or ""
    code = (body.get("code") or "").strip()
    if not u or not p:
        return jsonify(error="usuário e senha são obrigatórios"), 400
    try:
        from instagrapi import Client
        from instagrapi.exceptions import TwoFactorRequired, ChallengeRequired, BadPassword
        cl = Client()
        cl.delay_range = [1, 3]
        # CRÍTICO: logar PELO PROXY, pra a sessão nascer no IP residencial BR
        # (senão nasce no IP do datacenter e o Instagram flaga na hora).
        if PROXY_URL:
            cl.set_proxy(PROXY_URL)
        try:
            cl.login(u, p, verification_code=code)
        except TwoFactorRequired:
            return jsonify(twoFactor=True, error="Conta com 2FA — digite o código do app autenticador."), 200
        sid = cl.sessionid
        if not sid:
            return jsonify(error="login sem sessionid (tenta de novo)"), 200
        return jsonify(ok=True, sessionid=sid)
    except Exception as e:
        name = e.__class__.__name__
        msg = str(e)
        low = (name + " " + msg).lower()
        if "twofactor" in low or "two_factor" in low:
            return jsonify(twoFactor=True, error="Conta com 2FA — digite o código."), 200
        if "challenge" in low or "checkpoint" in low:
            return jsonify(checkpoint=True, error="O Instagram pediu verificação (checkpoint). Abra o app do Insta, aprove o login, e tente de novo — ou desative o 2FA na conta dedicada."), 200
        if "badpassword" in low or "bad_password" in low or "incorrect" in low:
            return jsonify(error="Usuário ou senha incorretos."), 200
        return jsonify(error=f"{name}: {msg[:250]}"), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8082")))
