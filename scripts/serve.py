#!/usr/bin/env python3
"""Tiny static server for Privta. No backend or API is involved."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Origin-Agent-Cluster", "?1")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".js"):
            return "text/javascript"
        return super().guess_type(path)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    print("Privta at http://127.0.0.1:4173", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
