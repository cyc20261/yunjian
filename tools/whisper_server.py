#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云笺 · 本地语音转写服务（faster-whisper）

云笺（index.html）的「录音转写」模块通过本服务在**本机离线**完成语音转写，
音频不会上传到任何服务器。NDJSON 流式输出进度与结果。

安装（仅需一次）：
    pip install faster-whisper

启动：
    python whisper_server.py                 # 默认 base 模型、端口 8765
    python whisper_server.py --model small   # 更高精度（首次需下载模型）
    python whisper_server.py --port 9000     # 端口被占用时换一个

Windows 可直接双击同目录的「启动转写服务.bat」。

接口：
    GET  /health   -> {"ok":true,"faster_whisper":true,"model":"base"}
    POST /transcribe?lang=auto&model=base   （请求体 = 原始音频字节）
       <- 逐行 NDJSON：
          {"type":"status","message":"..."}
          {"type":"progress","pct":42}
          {"type":"done","segments":[{"start":0.0,"end":2.1,"text":"..."}],
           "duration":12.3,"language":"zh"}
"""

import argparse
import io
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# whisper 常见幻觉文本（借鉴 VideoCaptioner 的过滤思路）：整段很短且命中才过滤
import re

HALLUCINATION_PATTERNS = [
    re.compile(r"请不吝点赞|订阅.*转发|打赏|明镜|由.*字幕组|字幕制作|字幕由"),
    re.compile(r"^(谢谢观看|谢谢收看|请订阅|感谢观看)[!.，。！？\s]*$"),
    re.compile(r"^(音乐|音乐播放|掌声|笑声|静默|空白音频|\[音乐\]|\(音乐\))$", re.I),
    re.compile(r"amara\.org|subtitles?\s+by|translated\s+by", re.I),
]
MAX_HALLUCINATION_LEN = 30

_args = None
_model_cache = {"name": None, "model": None}
_model_lock = threading.Lock()
_busy = threading.Lock()


def log(msg):
    print(msg, flush=True)


def get_model(name):
    """惰性加载模型：首次转写时自动下载并缓存，之后常驻内存。"""
    with _model_lock:
        if _model_cache["model"] is None or _model_cache["name"] != name:
            from faster_whisper import WhisperModel
            log(f"[云笺转写] 加载模型 {name}（首次使用会自动下载）…")
            _model_cache["model"] = WhisperModel(name, device="auto", compute_type="auto")
            _model_cache["name"] = name
            log(f"[云笺转写] 模型 {name} 就绪")
        return _model_cache["model"]


def is_hallucination(text):
    t = (text or "").strip()
    if not t or len(t) > MAX_HALLUCINATION_LEN:
        return False
    return any(p.search(t) for p in HALLUCINATION_PATTERNS)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # 安静模式

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            body = {"ok": True, "faster_whisper": True, "model": _args.model, "port": _args.port}
            try:
                import faster_whisper  # noqa: F401
            except ImportError:
                body["faster_whisper"] = False
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/transcribe":
            self.send_error(404, "Not Found")
            return
        if not _busy.acquire(blocking=False):
            data = json.dumps({"error": "已有转写任务进行中，请稍候"}, ensure_ascii=False).encode("utf-8")
            self.send_response(409)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        try:
            self._transcribe(parse_qs(url.query))
        finally:
            _busy.release()

    def _emit(self, obj):
        line = (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
        self.wfile.write(line)
        self.wfile.flush()

    def _transcribe(self, qs):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._send_json_error(400, "请求体为空（缺少音频数据）")
            return
        audio = self.rfile.read(length)
        lang = (qs.get("lang") or ["auto"])[0]
        model_name = (qs.get("model") or [_args.model])[0]

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        # NDJSON 流式响应无 Content-Length：必须显式关闭连接，
        # 否则 HTTP/1.1 keep-alive 下浏览器 ReadableStream 等不到结束信号
        self.send_header("Connection", "close")
        self.close_connection = True
        self.end_headers()
        try:
            self._emit({"type": "status", "message": f"加载模型 {model_name}（首次需下载）…"})
            model = get_model(model_name)
            self._emit({"type": "status", "message": "转写中，请稍候…"})

            segments_iter, info = model.transcribe(
                io.BytesIO(audio),
                language=None if lang in ("auto", "", None) else lang,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            results = []
            last_pct = 0
            total = getattr(info, "duration", None) or 0
            for seg in segments_iter:
                text = (seg.text or "").strip()
                if text and not is_hallucination(text):
                    results.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": text})
                if total > 0:
                    pct = min(99, int(seg.end / total * 100))
                    if pct > last_pct:  # 进度只允许单调递增（借鉴 VideoCaptioner）
                        last_pct = pct
                        self._emit({"type": "progress", "pct": pct})

            duration = total or (results[-1]["end"] if results else 0)
            self._emit({
                "type": "done",
                "segments": results,
                "duration": round(duration, 3),
                "language": getattr(info, "language", "") or "",
                "model": model_name,
            })
            log(f"[云笺转写] 完成：{len(results)} 段 / {duration:.1f}s / 语言 {getattr(info, 'language', '?')}")
        except BrokenPipeError:
            log("[云笺转写] 客户端已取消")
        except Exception as e:  # noqa: BLE001
            log(f"[云笺转写] 出错：{e}")
            try:
                self._emit({"type": "error", "message": f"转写失败：{e}"})
            except Exception:
                pass

    def _send_json_error(self, code, msg):
        data = json.dumps({"error": msg}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    global _args
    parser = argparse.ArgumentParser(description="云笺本地语音转写服务（faster-whisper）")
    parser.add_argument("--model", default="base",
                        help="模型：tiny / base / small / medium / large-v3（默认 base，首次使用自动下载）")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    _args = parser.parse_args()

    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        log("[云笺转写] 未安装 faster-whisper！请先执行：pip install faster-whisper")
        sys.exit(1)

    server = ThreadingHTTPServer((_args.host, _args.port), Handler)
    log(f"[云笺转写] 服务已启动：http://{_args.host}:{_args.port}  (模型 {_args.model})")
    log("[云笺转写] 请保持本窗口开启，回到云笺页面「录音转写」点「检测」即可连接。Ctrl+C 退出。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("[云笺转写] 已退出")


if __name__ == "__main__":
    main()
