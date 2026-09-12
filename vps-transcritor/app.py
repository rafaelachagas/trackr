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


def _ig_feed(handle: str, sessionid: str, limit: int, cursor: str = ""):
    # Sempre pelo endpoint by-username (resolve pelo @ e é o único que pagina).
    # `cursor` = max_id pra continuar de onde parou. Devolve também o próximo
    # cursor e se ainda há mais, pra varredura de "todo o período" página a página.
    s, _ = _ig_cffi_session(sessionid)
    hh = _ig_headers(handle)
    vids, meta, max_id, more, guard = [], {}, (cursor or ""), True, 0
    while len(vids) < limit and more and guard < 14:
        guard += 1
        api = f"https://www.instagram.com/api/v1/feed/user/{handle}/username/?count=12"
        if max_id:
            api += f"&max_id={max_id}"
        r = s.get(api, headers=hh, timeout=45)
        if r.status_code == 401:
            raise RuntimeError("cookie do Instagram inválido/expirado (reconecte a conta)")
        if r.status_code == 404:
            raise RuntimeError("perfil não encontrado")
        if r.status_code != 200:
            if not vids and not cursor:
                raise RuntimeError(f"feed {r.status_code}: {r.text[:120]}")
            break
        # 200 mas HTML (parede de login) = sessão deslogada/expirada.
        ct = (r.headers.get("content-type") or "")
        if "application/json" not in ct and r.text.lstrip()[:1] in ("<",):
            raise RuntimeError("sessão do Instagram expirada/deslogada — reconecte a conta")
        try:
            data = r.json() or {}
        except Exception:
            raise RuntimeError("sessão do Instagram expirada/deslogada — reconecte a conta")
        if not meta:  # primeira página: captura nome/bio/uid
            u = data.get("user") or {}
            uid = str(u.get("pk") or u.get("id") or "")
            if uid:
                _IG_UID_CACHE[handle.lower()] = uid
            meta = _ig_user_meta(u)
            # Só confia no nome se o username do feed bater com o handle pedido —
            # senão pode ser o nome da CONTA LOGADA (viewer), não o do alvo.
            if (u.get("username") or "").lower() != handle.lower():
                meta["nome"] = None
            if not meta.get("nome"):
                meta["nome"] = handle
        novos = data.get("items") or []
        if not novos:
            more = False
            break
        for it in novos:
            vids.append(_ig_feed_item_to_dict(it))
        more = bool(data.get("more_available"))
        max_id = data.get("next_max_id") or ""
        if not max_id:
            more = False
    proximo = max_id if more else ""
    return vids, proximo, bool(more and proximo), meta


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
    limit = min(max(int(request.args.get("limit", "20")), 1), 120)
    cursor = request.args.get("cursor", "")

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
            vids, proximo, mais, meta = _ig_feed(handle, sid, limit, cursor)
            if not (meta.get("nome")):
                meta["nome"] = handle
            return jsonify(ok=True, videos=vids, total=len(vids), perfil=meta, proximo=proximo, mais=mais,
                           com_views=sum(1 for v in vids if isinstance(v.get("views"), int)), fonte="ig-feed")
        except Exception as e:
            return jsonify(error=_erro_proxy(str(e)) or f"instagram: {e}"), 502

    cookies = _cookies_file(request.args.get("ig_cookie"))
    try:
        # dump-json (metadados completos, com view_count). playlist-end limita
        # quantos vídeos ele extrai — extração completa é ~1s por vídeo.
        # cursor = deslocamento (nº de vídeos já lidos). playlist-start/end pega a
        # próxima janela, pra varredura de "todo o período" página a página.
        off = int(cursor) if str(cursor).isdigit() else 0
        cmd = ["yt-dlp", "-J", "--flat-playlist", "--no-warnings", "--user-agent", UA]
        cmd += _yt_extra(url) + _yt_proxy()
        cmd += ["--playlist-start", str(off + 1), "--playlist-end", str(off + limit), url]
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
        # se veio a janela cheia, provavelmente ainda há mais (próxima janela)
        mais = len(vids) >= limit
        proximo = str(off + len(vids)) if mais else ""
        return jsonify(ok=True, videos=saida, total=len(vids), perfil=meta, proximo=proximo, mais=mais, com_views=len(com_views))
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


# ============================================================
# CAMUFLAGEM DE ÁUDIO — reprocessa o áudio de um MP4 mantendo o vídeo intacto.
# ------------------------------------------------------------
# Fluxo (o Vercel corta corpo > 4,5MB e o navegador bloqueia HTTP a partir de
# página HTTPS, então o arquivo NÃO passa pelo Next nem chega aqui por upload):
#   1. o navegador sobe o MP4 direto pro Supabase Storage (HTTPS, signed URL);
#   2. o The Track (server-side) chama esta rota passando só os PATHS + params;
#   3. aqui a gente BAIXA do Storage, roda o ffmpeg e SOBE o resultado de volta;
#   4. o navegador baixa o resultado do Storage (HTTPS).
# Só o áudio é recodificado; o vídeo é copiado sem reencode (-c:v copy).
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CAMUFLAGEM_LOCK = threading.Lock()


def _ffmpeg_disponivel() -> bool:
    try:
        return subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=10).returncode == 0
    except Exception:
        return False


# Requisito de ambiente: avisa no startup se o ffmpeg sumir do PATH.
if not _ffmpeg_disponivel():
    print("[camuflagem] AVISO: ffmpeg não encontrado no PATH — a camuflagem de áudio não vai funcionar.", flush=True)


def _clamp(v, lo, hi, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


# Monta a cadeia de filtros de áudio do ffmpeg a partir dos parâmetros. Cada
# efeito é opcional — só entra quando difere do neutro.
def _filtro_audio(pitch_steps, time_stretch, eq_gain_db, reverb_wet):
    filtros = []
    if abs(time_stretch - 1.0) > 1e-3:
        filtros.append(f"atempo={time_stretch:.3f}")
    if abs(pitch_steps) > 1e-3:
        ratio = 1 + (pitch_steps * 100) / 1200
        novo_rate = int(round(44100 * ratio))   # valor numérico (não expressão) p/ robustez
        # asetrate mexe no tom TOCANDO MAIS RÁPIDO — sozinho ele encurta o
        # áudio (1,5 semitom = 12% mais curto!). O atempo inverso devolve a
        # duração original; sem isso o vídeo sai cortado no fim.
        filtros.append(f"asetrate={novo_rate},aresample=44100,atempo={1 / ratio:.4f}")
    if eq_gain_db != 0:
        filtros.append(f"equalizer=f=2000:width_type=o:width=2:g={eq_gain_db}")
    if reverb_wet > 0:
        delay = max(1, int(reverb_wet * 80))
        filtros.append(f"aecho=0.8:{reverb_wet:.2f}:{delay}:{reverb_wet:.2f}")
    return ",".join(filtros) if filtros else "anull"


def _storage_baixar(bucket, path, dest):
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}"
    with requests.get(url, headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}, stream=True, timeout=300) as r:
        if r.status_code != 200:
            raise RuntimeError(f"storage GET {r.status_code}: {r.text[:200]}")
        with open(dest, "wb") as fh:
            for chunk in r.iter_content(1024 * 256):
                if chunk:
                    fh.write(chunk)


def _storage_subir(bucket, path, src, content_type="video/mp4"):
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}"
    with open(src, "rb") as fh:
        r = requests.post(url, headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "content-type": content_type,
            "x-upsert": "true",
        }, data=fh, timeout=300)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"storage PUT {r.status_code}: {r.text[:200]}")


def _storage_apagar(bucket, path):
    # Supabase apaga por LISTA de prefixes (DELETE no bucket, não no path).
    try:
        requests.delete(f"{SUPABASE_URL}/storage/v1/object/{bucket}",
                        headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "content-type": "application/json"},
                        json={"prefixes": [path]}, timeout=30)
    except Exception:
        pass


@app.route("/audio_camouflage", methods=["POST"])
def audio_camouflage():
    # Auth: só o The Track (server-side) chama esta rota — mesma chave do serviço.
    key = request.args.get("key") or (request.get_json(silent=True) or {}).get("key")
    if APIKEY and key != APIKEY:
        return jsonify(error="nao autorizado"), 401
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify(error="storage não configurado no servidor"), 500

    body = request.get_json(silent=True) or {}
    bucket = body.get("bucket") or "camuflagem"
    inp = body.get("input_path")
    outp = body.get("output_path")
    if not inp or not outp:
        return jsonify(error="input_path/output_path ausentes"), 400

    # Clamp server-side — nunca confia no range que veio do cliente.
    pitch = _clamp(body.get("pitch_steps"), -6, 6, 0.0)
    tempo = _clamp(body.get("time_stretch"), 0.85, 1.15, 1.0)
    ruido = _clamp(body.get("noise_volume"), 0.0, 0.30, 0.0)
    eq = int(round(_clamp(body.get("eq_gain_db"), -12, 12, 0)))
    reverb = _clamp(body.get("reverb_wet"), 0.0, 0.40, 0.0)

    # CPU: uma por vez (o box também roda Whisper). Espera a vez até 3 min.
    if not CAMUFLAGEM_LOCK.acquire(timeout=180):
        return jsonify(error="processador ocupado — tente de novo em instantes"), 503

    tmp = tempfile.mkdtemp(prefix="camuf_")
    entrada = os.path.join(tmp, "in.mp4")
    saida = os.path.join(tmp, "out.mp4")
    try:
        _storage_baixar(bucket, inp, entrada)
        filtro = _filtro_audio(pitch, tempo, eq, reverb)
        if ruido > 0:
            cmd = [
                "ffmpeg", "-i", entrada,
                "-f", "lavfi", "-i", "anoisesrc=c=white:amplitude=0.03",
                "-filter_complex",
                f"[0:a]{filtro}[main];[1:a]volume={ruido:.2f}[noise];[main][noise]amix=inputs=2:duration=first[out]",
                "-map", "0:v", "-map", "[out]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                saida, "-y",
            ]
        else:
            cmd = [
                "ffmpeg", "-i", entrada,
                "-map", "0:v", "-map", "0:a",
                "-c:v", "copy", "-af", filtro,
                "-c:a", "aac", "-b:a", "192k",
                saida, "-y",
            ]
        r = subprocess.run(cmd, capture_output=True, timeout=600)
        if r.returncode != 0 or not os.path.exists(saida):
            return jsonify(error="ffmpeg: " + r.stderr[-400:].decode(errors="ignore")), 500
        _storage_subir(bucket, outp, saida)
        _storage_apagar(bucket, inp)   # não guarda o original enviado
        return jsonify(ok=True)
    except subprocess.TimeoutExpired:
        return jsonify(error="processamento excedeu o tempo limite"), 504
    except Exception as e:
        return jsonify(error=f"falha: {e}"), 500
    finally:
        CAMUFLAGEM_LOCK.release()
        shutil.rmtree(tmp, ignore_errors=True)



# ============================================================
# CAMUFLAGEM COMPLETA — vídeo + imagem, com camadas de proteção.
# ------------------------------------------------------------
# Mesmo fluxo de storage do /audio_camouflage (o arquivo nunca passa pelo Next).
# Além do áudio, aqui mexemos no vídeo: ruído imperceptível, micro-pulsos de
# brilho, variação de matiz/saturação e sobreposições (camada de entrada, de
# saída e contexto visual). Tudo escalado pela "intensidade" (1–10).
# ============================================================
ASSETS_DIR = os.environ.get("CAMUFLAGEM_ASSETS", "/app/assets")


def _bool(v, default=False):
    if isinstance(v, bool):
        return v
    if v is None:
        return default
    return str(v).lower() in ("1", "true", "sim", "yes", "on")


def _ffprobe(path):
    """(largura, altura, duração) — com defaults sãos se o probe falhar."""
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height", "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1", path,
        ], capture_output=True, timeout=60)
        vals = [x for x in r.stdout.decode(errors="ignore").split() if x]
        w, h = int(float(vals[0])), int(float(vals[1]))
        d = float(vals[2]) if len(vals) > 2 else 0.0
        return (w - w % 2, h - h % 2, d)
    except Exception:
        return (720, 1280, 0.0)


def _fps(path):
    """Taxa de quadros MÉDIA do vídeo. Arquivo de celular/gravação de tela
    costuma ser VFR (taxa variável): players de navegador lidam bem, muitos
    players de desktop tocam acelerado. Forçar CFR na saída resolve."""
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=avg_frame_rate", "-of", "default=nw=1:nk=1", path,
        ], capture_output=True, timeout=60)
        txt = r.stdout.decode(errors="ignore").strip()
        num, _, den = txt.partition("/")
        val = float(num) / float(den or 1)
        return val if 1 < val <= 120 else 0.0
    except Exception:
        return 0.0


def _tem_audio(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                            "-show_entries", "stream=index", "-of", "csv=p=0", path],
                           capture_output=True, timeout=60)
        return bool(r.stdout.strip())
    except Exception:
        return False


def _overlay_padrao(dest, w, h, fonte=None):
    """Sem imagem de CTA enviada, a melhor sobreposição é o PRÓPRIO criativo:
    um quadro dele, borrado e levemente escurecido. Fica invisível pra quem
    assiste (nada de tela colorida aparecendo) e ainda assim altera os quadros
    de entrada/saída. O gradiente só entra se a extração falhar."""
    if fonte:
        try:
            r = subprocess.run([
                "ffmpeg", "-ss", "0.2", "-i", fonte, "-frames:v", "1",
                "-vf", "boxblur=12:2,eq=brightness=-0.03:saturation=0.95,scale=%d:%d" % (w, h),
                dest, "-y",
            ], capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.exists(dest):
                return True
        except Exception:
            pass
    tentativas = (
        ["ffmpeg", "-f", "lavfi", "-i", "gradients=s=%dx%d:c0=0x0B1220:c1=0x2E90FA:n=2" % (w, h),
         "-frames:v", "1", dest, "-y"],
        ["ffmpeg", "-f", "lavfi", "-i", "color=c=0x0B1220:s=%dx%d" % (w, h),
         "-frames:v", "1", dest, "-y"],
    )
    for cmd in tentativas:
        try:
            if subprocess.run(cmd, capture_output=True, timeout=60).returncode == 0 and os.path.exists(dest):
                return True
        except Exception:
            pass
    return False


def _white_audio_entrada(dur):
    """Pista alternativa neutra: usa o asset da VPS se existir; senão sintetiza
    um murmúrio filtrado na faixa da voz — é o que transcritor/IA vai ouvir."""
    for nome in ("white_audio.m4a", "white_audio.mp3", "white_audio.wav"):
        cam = os.path.join(ASSETS_DIR, nome)
        if os.path.exists(cam):
            return ["-stream_loop", "-1", "-t", "%.2f" % max(dur, 1), "-i", cam]
    return ["-f", "lavfi", "-t", "%.2f" % max(dur, 1), "-i",
            "anoisesrc=c=brown:a=0.30,highpass=f=180,lowpass=f=3400,tremolo=f=5:d=0.7"]


# Níveis da máscara de voz: (volume do murmúrio, filtro extra na voz).
# Medido com o Whisper small em PT-BR num criativo real: leve deixou 0,8% de
# erro de transcrição, médio 1,5% e pesado 8,1% — ou seja, a copy continua
# legível nos três. O que isto entrega de fato é assinatura sonora diferente,
# não proteção contra transcrição. Está aqui porque foi pedido sabendo disso.
MASCARA_NIVEIS = {
    "leve":   (0.10, "anull"),
    "medio":  (0.26, "equalizer=f=2400:width_type=o:width=1.4:g=-6"),
    "pesado": (0.45, "equalizer=f=2400:width_type=o:width=1.4:g=-9,"
                     "equalizer=f=3200:width_type=o:width=1:g=-6,tremolo=f=7:d=0.25"),
}


def _erro_ffmpeg(r):
    """Mensagem útil a partir de uma execução falha do ffmpeg.

    Os últimos 400 caracteres do stderr costumam ser só o cabeçalho (Input,
    Stream mapping, Metadata) e não dizem nada. Aqui a gente procura as linhas
    que realmente descrevem o erro; e um código de retorno NEGATIVO significa
    morte por sinal — 9 é o matador de falta de memória, que é o caso quando
    um criativo grande estoura o teto do container."""
    if r.returncode < 0:
        sinal = -r.returncode
        if sinal == 9:
            return ("o vídeo estourou a memória disponível na VPS "
                    "(processo morto). Tente um arquivo menor ou em 1080p.")
        return "processamento interrompido pelo sistema (sinal %d)" % sinal
    err = (r.stderr or b"").decode(errors="ignore")
    chaves = ("Error", "error", "Invalid", "No such", "Conversion failed",
              "Unable to", "not found", "Cannot", "failed")
    linhas = [l.strip() for l in err.splitlines()
              if l.strip() and any(k in l for k in chaves)]
    if linhas:
        return " | ".join(linhas[-3:])[:400]
    return err[-300:] or "falhou sem mensagem (código %d)" % r.returncode


def _mascara_voz_volume(nivel, f):
    """Volume do fundo e filtro extra na voz, já com o ajuste fino da barra."""
    vol, voz = MASCARA_NIVEIS.get(nivel) or MASCARA_NIVEIS["leve"]
    return vol * (0.7 + 0.6 * f), voz


def _mascara_voz_arquivo(entrada, fundo, saida, nivel, f):
    """Mesma máscara, mas com um áudio de fundo enviado pelo usuário (já em
    loop, vindo como entrada `fundo` do ffmpeg) no lugar do murmúrio
    sintetizado. Filtra na banda da voz do mesmo jeito — fora dela o fundo só
    suja o áudio sem esconder nada."""
    vol, voz = _mascara_voz_volume(nivel, f)
    return (
        "[%s]highpass=f=250,lowpass=f=3600,volume=%.3f,"
        "aformat=channel_layouts=stereo[mbab];"
        "[%s]%s[mvf];"
        "[mvf][mbab]amix=inputs=2:duration=first:normalize=0[%s]"
        % (fundo, vol, entrada, voz, saida)
    )


def _mascara_voz(entrada, saida, nivel, f):
    """Murmúrio de multidão sintetizado da PRÓPRIA locução: cópias dela
    invertidas, deslocadas e com tempo alterado, somadas e filtradas pra banda
    da voz. Soa como gente falando ao fundo (o ouvido humano descarta isso bem)
    e é o tipo de ruído que mais atrapalha reconhecedor automático.
    `f` (0,1–1,0) é o ajuste fino dentro do nível: ±30% no volume do murmúrio."""
    vol, voz = _mascara_voz_volume(nivel, f)
    return (
        "[%s]asplit=4[mv][mb1][mb2][mb3];"
        "[mb1]areverse,adelay=0|120[mr1];"
        "[mb2]areverse,atempo=0.93,adelay=380|500[mr2];"
        "[mb3]atempo=1.07,areverse,adelay=820|640[mr3];"
        "[mr1][mr2][mr3]amix=inputs=3:duration=first:normalize=1,"
        "highpass=f=250,lowpass=f=3600,volume=%.3f[mbab];"
        "[mv]%s[mvf];"
        "[mvf][mbab]amix=inputs=2:duration=first:normalize=0[%s]"
        % (entrada, vol, voz, saida)
    )


# Jobs em memória: id -> {"status": "rodando|pronto|erro", "erro": str}. O
# processo é único (gunicorn com 1 worker), então dict simples basta.
CAMUFLAGEM_JOBS = {}
CAMUFLAGEM_JOBS_LOCK = threading.Lock()


def _job_set(jid, **campos):
    with CAMUFLAGEM_JOBS_LOCK:
        j = CAMUFLAGEM_JOBS.setdefault(jid, {})
        j.update(campos)
        # não deixa a memória crescer pra sempre
        if len(CAMUFLAGEM_JOBS) > 200:
            for k in list(CAMUFLAGEM_JOBS)[:100]:
                CAMUFLAGEM_JOBS.pop(k, None)


def _camuflar(body):
    """Faz o trabalho todo. Devolve (payload, http_status). Roda numa thread —
    nada aqui pode tocar em `request` (não há contexto de requisição)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return ({"error": "storage não configurado no servidor"}, 500)

    bucket = body.get("bucket") or "camuflagem"
    inp = body.get("input_path")
    outp = body.get("output_path")
    if not inp or not outp:
        return ({"error": "input_path/output_path ausentes"}, 400)

    kind = "image" if str(body.get("kind") or "video") == "image" else "video"
    cta_path = body.get("cta_path") or None
    inten = _clamp(body.get("intensity"), 1, 10, 5)
    f = inten / 10.0   # 0,1 – 1,0

    entrada_on = _bool(body.get("entry_layer"))
    saida_on = _bool(body.get("exit_layer"))
    blindagem = _bool(body.get("invisible_shield"))
    pulsos = _bool(body.get("pulses"))
    cromatica = _bool(body.get("chroma"))
    contexto = _bool(body.get("safe_context"))
    audio_shield = _bool(body.get("audio_shield"))
    white_audio = _bool(body.get("white_audio"))
    voice_mask = _bool(body.get("voice_mask"))
    voice_mask_level = str(body.get("voice_mask_level") or "leve")
    bg_path = body.get("bg_path") or None

    if not CAMUFLAGEM_LOCK.acquire(timeout=180):
        return ({"error": "processador ocupado — tente de novo em instantes"}, 503)

    tempos = {}
    tmp = tempfile.mkdtemp(prefix="camuf_")
    ext = os.path.splitext(inp)[1].lower() or (".jpg" if kind == "image" else ".mp4")
    entrada = os.path.join(tmp, "in" + ext)
    saida = os.path.join(tmp, "out" + (ext if kind == "image" else ".mp4"))
    try:
        t0 = time.time()
        _storage_baixar(bucket, inp, entrada)
        tempos["baixar"] = round(time.time() - t0, 1)
        w, h, dur = _ffprobe(entrada)

        # Teto de 1080p: criativo de anuncio nao ganha nada acima disso e o
        # encode custa por PIXEL — um 4K leva ~4x mais tempo que o mesmo em
        # 1080p. So reduz, nunca amplia.
        escala = min(1.0, 1080.0 / min(w, h), 1920.0 / max(w, h))
        if kind == "video" and escala < 0.999:
            w = max(2, int(w * escala) // 2 * 2)
            h = max(2, int(h * escala) // 2 * 2)

        # Sobreposição (CTA do usuário ou quadro padrão) — só baixa se for usar.
        precisa_ov = entrada_on or saida_on or contexto
        ov = os.path.join(tmp, "ov.png")
        if precisa_ov:
            if cta_path:
                try:
                    _storage_baixar(bucket, cta_path, ov)
                except Exception:
                    _overlay_padrao(ov, w, h, entrada)
            else:
                _overlay_padrao(ov, w, h, entrada)
            if not os.path.exists(ov):
                precisa_ov = entrada_on = saida_on = contexto = False

        # Áudio de fundo da máscara de voz (opcional). Se o download falhar,
        # a máscara cai no murmúrio sintetizado em vez de quebrar o job.
        bg = None
        if voice_mask and bg_path and kind == "video":
            bg = os.path.join(tmp, "bg" + (os.path.splitext(bg_path)[1].lower() or ".mp3"))
            try:
                _storage_baixar(bucket, bg_path, bg)
            except Exception:
                bg = None

        # --- filtros base de vídeo (valem pra imagem também) ---
        base = []
        if kind == "video" and escala < 0.999:
            base.append("scale=%d:%d:flags=fast_bilinear" % (w, h))
        if cromatica:
            base.append("hue=h=%.2f:s=%.3f" % (1.5 + 6.0 * f, 1.0 + 0.06 * f))
        if blindagem:
            base.append("noise=alls=%d:allf=t+u" % int(round(2 + 10 * f)))
        if pulsos and kind == "video":
            base.append("eq=brightness='%.4f*sin(2*PI*t/2.6)':eval=frame" % (0.006 + 0.022 * f))
        vchain = ",".join(base) if base else "null"

        # --- cadeia de sobreposições ---
        chain = ["[0:v]%s,format=yuv420p[v0]" % vchain]
        cur = "v0"
        if precisa_ov:
            # Poucos quadros: o suficiente pra mudar o início/fim do arquivo,
            # curto demais pra alguém enxergar como "tela estranha".
            dur_camada = 0.10 + 0.14 * f
            alvos = []
            if entrada_on:
                alvos.append(("full", "between(t,0,%.2f)" % dur_camada if kind == "video" else None))
            if saida_on and kind == "video" and dur > dur_camada:
                alvos.append(("full", "between(t,%.2f,%.2f)" % (max(0.0, dur - dur_camada), dur + 1)))
            if contexto:
                alvos.append(("full", "between(t,0,%.2f)" % (0.10 + 0.10 * f) if kind == "video" else None))
                alvos.append(("mark", None))

            chain.append("[1:v]scale=%d:%d:force_original_aspect_ratio=increase,"
                         "crop=%d:%d,setsar=1,format=rgba[ovbase]" % (w, h, w, h))
            n = len(alvos)
            rotulos = ["ovc%d" % i for i in range(n)]
            if n == 1:
                chain.append("[ovbase]null[%s]" % rotulos[0])
            else:
                chain.append("[ovbase]split=%d%s" % (n, "".join("[%s]" % r for r in rotulos)))

            for i, (tipo, enable) in enumerate(alvos):
                src = rotulos[i]
                if tipo == "full":
                    chain.append("[%s]colorchannelmixer=aa=0.92[ovp%d]" % (src, i))
                    pos = "0:0"
                else:
                    chain.append("[%s]scale=%d:-1,format=rgba,colorchannelmixer=aa=%.3f[ovp%d]"
                                 % (src, max(64, w // 5), 0.06 + 0.07 * f, i))
                    pos = "W-w-%d:H-h-%d" % (max(8, w // 40), max(8, h // 40))
                en = ":enable='%s'" % enable if enable else ""
                chain.append("[%s][ovp%d]overlay=%s%s[v%d]" % (cur, i, pos, en, i + 1))
                cur = "v%d" % (i + 1)

        # ---------------- IMAGEM ----------------
        if kind == "image":
            gif = ext == ".gif"
            cmd = ["ffmpeg", "-i", entrada]
            if precisa_ov:
                cmd += ["-i", ov]
            cmd += ["-filter_complex", ";".join(chain), "-map", "[%s]" % cur, "-map_metadata", "-1"]
            cmd += ["-loop", "0"] if gif else ["-frames:v", "1"]
            cmd += [saida, "-y"]
            r = subprocess.run(cmd, capture_output=True, timeout=900)
            if r.returncode != 0 or not os.path.exists(saida):
                return ({"error": _erro_ffmpeg(r)}, 500)
            tipos = {".gif": "image/gif", ".png": "image/png", ".webp": "image/webp"}
            _storage_subir(bucket, outp, saida, content_type=tipos.get(ext, "image/jpeg"))
            _storage_apagar(bucket, inp)
            if cta_path:
                _storage_apagar(bucket, cta_path)
            return ({"ok": True}, 200)

        # ---------------- VÍDEO ----------------
        tem_audio = _tem_audio(entrada)
        # A VPS tem UM núcleo. Sem `nice`, o ffmpeg monopoliza esse núcleo
        # durante todo o encode e a máquina inteira para de responder — nem o
        # /health passa, e parece que travou. Com prioridade baixa, o vídeo
        # demora um pouco mais e todo o resto continua atendendo.
        cmd = ["nice", "-n", "10", "ffmpeg", "-threads", "1", "-i", entrada]
        idx = 1
        if precisa_ov:
            cmd += ["-i", ov]
            idx += 1
        bg_idx = None
        if bg and tem_audio:
            cmd += ["-stream_loop", "-1", "-t", "%.2f" % max(dur or 30, 1), "-i", bg]
            bg_idx = idx
            idx += 1
        wa_idx = None
        if white_audio and tem_audio:
            cmd += _white_audio_entrada(dur or 30)
            wa_idx = idx
            idx += 1

        achain = []
        alab = "a0"   # rótulo da faixa principal no fim da cadeia de áudio
        if tem_audio:
            if audio_shield:
                # Desvio imperceptível: no máximo ~0,08 semitom (8 cents, abaixo
                # do que o ouvido percebe) e um ombro de ±1,5dB. O suficiente pra
                # mudar a impressão digital do áudio sem mexer na voz.
                af = _filtro_audio(0.02 + 0.06 * f, 1.0, 0.0, 0.0)
                af = af + ",equalizer=f=%d:width_type=o:width=2:g=%.2f" % (
                    int(1800 + 900 * f), -(0.5 + 1.0 * f))
                achain.append("[0:a]%s[a0]" % af)
            else:
                achain.append("[0:a]anull[a0]")
            if voice_mask:
                if bg_idx is not None:
                    achain.append(_mascara_voz_arquivo(
                        "a0", "%d:a" % bg_idx, "a0m", voice_mask_level, f))
                else:
                    achain.append(_mascara_voz("a0", "a0m", voice_mask_level, f))
                alab = "a0m"
            if wa_idx is not None:
                achain.append("[%d:a]volume=0.9,aformat=channel_layouts=stereo[a1]" % wa_idx)

        cmd += ["-filter_complex", ";".join(chain + achain), "-map", "[%s]" % cur]
        if tem_audio:
            cmd += ["-map", "[%s]" % alab]
            if wa_idx is not None:
                cmd += ["-map", "[a1]", "-shortest"]
        cmd += ["-map_metadata", "-1",
                "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
                "-pix_fmt", "yuv420p", "-threads", "1"]
        fps = _fps(entrada)
        if fps:
            # CFR: sem isso, um fonte VFR sai com timestamps que vários players
            # de desktop interpretam como vídeo acelerado.
            cmd += ["-fps_mode", "cfr", "-r", "%.4f" % fps, "-video_track_timescale", "90000"]
        if tem_audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-disposition:a:0", "default"]
            if wa_idx is not None:
                cmd += ["-metadata:s:a:1", "title=alt", "-disposition:a:1", "0"]
        cmd += ["-movflags", "+faststart", saida, "-y"]

        t0 = time.time()
        r = subprocess.run(cmd, capture_output=True, timeout=3600)
        tempos["ffmpeg"] = round(time.time() - t0, 1)
        if r.returncode != 0 or not os.path.exists(saida):
            print("[camuflagem] ffmpeg falhou (rc=%d) %s"
                  % (r.returncode, (r.stderr or b"").decode(errors="ignore")[-4000:]), flush=True)
            return ({"error": _erro_ffmpeg(r)}, 500)
        t0 = time.time()
        _storage_subir(bucket, outp, saida)
        tempos["subir"] = round(time.time() - t0, 1)
        print("[camuflagem] %s %dx%d %.0fs -> %s" % (kind, w, h, dur, tempos), flush=True)
        _storage_apagar(bucket, inp)
        if cta_path:
            _storage_apagar(bucket, cta_path)
        if bg_path:
            _storage_apagar(bucket, bg_path)
        return ({"ok": True, "tempos": tempos}, 200)
    except subprocess.TimeoutExpired:
        return ({"error": "processamento excedeu o tempo limite"}, 504)
    except Exception as e:
        return ({"error": "falha: %s" % e}, 500)
    finally:
        CAMUFLAGEM_LOCK.release()
        shutil.rmtree(tmp, ignore_errors=True)


@app.route("/camouflage", methods=["POST"])
def camouflage():
    key = request.args.get("key") or (request.get_json(silent=True) or {}).get("key")
    if APIKEY and key != APIKEY:
        return jsonify(error="nao autorizado"), 401
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify(error="storage não configurado no servidor"), 500

    body = request.get_json(silent=True) or {}

    # Modo assíncrono (padrão do app): responde na hora com um job_id e roda o
    # ffmpeg numa thread. Vídeo grande com reencode passa MUITO do tempo limite
    # de uma função serverless — quem espera é o navegador, consultando o status.
    if _bool(body.get("async"), True):
        jid = uuid.uuid4().hex
        _job_set(jid, status="rodando", erro=None)

        def _rodar():
            try:
                payload, status = _camuflar(body)
                if status == 200 and payload.get("ok"):
                    _job_set(jid, status="pronto", tempos=payload.get("tempos") or {})
                else:
                    _job_set(jid, status="erro", erro=str(payload.get("error") or "falha"))
            except Exception as e:
                _job_set(jid, status="erro", erro=f"falha: {e}")

        threading.Thread(target=_rodar, daemon=True).start()
        return jsonify(ok=True, job_id=jid), 202

    payload, status = _camuflar(body)
    return jsonify(**payload), status


@app.route("/camouflage_status", methods=["GET"])
def camouflage_status():
    key = request.args.get("key")
    if APIKEY and key != APIKEY:
        return jsonify(error="nao autorizado"), 401
    jid = request.args.get("job") or ""
    with CAMUFLAGEM_JOBS_LOCK:
        j = dict(CAMUFLAGEM_JOBS.get(jid) or {})
    if not j:
        return jsonify(error="job desconhecido"), 404
    return jsonify(ok=True, status=j.get("status"), erro=j.get("erro"), tempos=j.get("tempos") or {})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8082")))
