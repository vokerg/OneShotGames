#!/usr/bin/env python3
"""Serve the OneShot Games launcher locally with no third-party dependencies."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))


def open_browser(url: str) -> None:
    if os.environ.get("NO_OPEN") == "1":
        return
    threading.Timer(0.35, lambda: webbrowser.open(url)).start()


def main() -> None:
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"OneShot Games launcher is running at {url}")
    print("Press Ctrl+C to stop.")
    open_browser(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
