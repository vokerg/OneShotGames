#!/usr/bin/env python3
"""Launch Red Fortress with Python's standard library only."""
from __future__ import annotations

import contextlib
import http.server
import os
import socket
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        pass


def main() -> None:
    os.chdir(ROOT)
    port = free_port()
    url = f"http://127.0.0.1:{port}/index.html"
    with socketserver.TCPServer(("127.0.0.1", port), QuietHandler) as server:
        print(f"Red Fortress is running at {url}")
        print("Press Ctrl+C to stop.")
        threading.Thread(target=lambda: (time.sleep(0.35), webbrowser.open(url)), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
