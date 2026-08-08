#!/usr/bin/env python3
"""Launch Flat Earth: Last Meridian with only the Python standard library."""

from __future__ import annotations

import contextlib
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path


GAME_DIR = Path(__file__).resolve().parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the game without noisy access logs."""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


def find_open_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> int:
    os.chdir(GAME_DIR)
    port = find_open_port()
    url = f"http://127.0.0.1:{port}/index.html"

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    try:
        with ReusableTCPServer(("127.0.0.1", port), QuietHandler) as server:
            print("Flat Earth: Last Meridian is running.")
            print(f"Open {url} if your browser does not launch automatically.")
            print("Press Ctrl+C to stop.")
            threading.Timer(0.35, lambda: webbrowser.open(url)).start()
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        return 0
    except OSError as exc:
        print(f"Unable to start the local server: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
