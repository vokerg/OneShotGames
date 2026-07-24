#!/usr/bin/env python3
"""Launch Cat & Two Balconies with only the Python standard library."""

from __future__ import annotations

import argparse
import contextlib
import http.server
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Serve this game's folder and keep console output useful."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stdout.write("[game] " + (fmt % args) + "\n")


def available_port(preferred: int) -> int:
    """Use the requested port when possible, otherwise ask the OS for a free one."""
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as probe:
        try:
            probe.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            probe.bind(("127.0.0.1", 0))
            return int(probe.getsockname()[1])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Cat & Two Balconies locally.")
    parser.add_argument("--port", type=int, default=8000, help="preferred local port")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="serve without opening the default browser",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    port = available_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), QuietHandler) as server:
        print("Cat & Two Balconies")
        print(f"Serving {ROOT}")
        print(f"Open {url}")
        print("Press Ctrl+C to stop.")

        if not args.no_browser:
            threading.Timer(0.35, lambda: webbrowser.open(url)).start()

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping game server.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
