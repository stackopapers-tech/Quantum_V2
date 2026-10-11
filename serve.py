# (c) Quantum Hub — proprietary hub build. All rights reserved.
"""
Tiny static dev server for the Game & Media Hub.

Identical to `python -m http.server` EXCEPT it sends no-store cache headers.
Browsers aggressively cache ES modules, which repeatedly caused the browser to
run a stale copy of js/app.js (mirrors still pointed at the old test URLs).
This server makes every reload pick up the file on disk.

    py serve.py            # http://localhost:8000
    py serve.py 8080       # custom port
"""

import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class DualStackServer(ThreadingHTTPServer):
    """Accept both IPv4 (127.0.0.1) and IPv6 (::1).

    Browsers resolve "localhost" to ::1 first on many systems. An IPv4-only
    bind makes those requests fail, which shows up as a 502 / blank page.
    """

    address_family = socket.AF_INET6

    def server_bind(self):
        # allow_reuse_address must be set before bind; V6ONLY off so IPv4
        # clients (127.0.0.1) are accepted on the same socket if AF_INET6.
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
        return super().server_bind()


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Allow the hub to be opened from a different dev port if needed.
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console quiet; uncomment to see requests.
        # super().log_message(fmt, *args)
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=".")

    httpd = None
    for family, host in ((socket.AF_INET6, "::"), (socket.AF_INET, "0.0.0.0")):
        try:
            DualStackServer.address_family = family
            httpd = DualStackServer((host, port), handler)
            break
        except OSError as e:
            print(f"Could not bind {host}:{port} ({e}); trying next family...")

    if httpd is None:
        print(f"ERROR: port {port} is already in use. Stop the other server or pass a different port.")
        sys.exit(1)

    with httpd:
        print(f"Quantum Launcher dev server -> http://localhost:{port}  (no-cache enabled)")
        print("Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
