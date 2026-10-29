"""Serve the hub locally with a real team's data, read-only.

    python tests/serve.py https://owner.github.io/team-repo/

Pages come from this folder, as they would on GitHub Pages. Requests for team/ go to that team's
published site, so the hub shows its current roster, rotations and games. team/site.json is never
passed through, so Save to GitHub stays hidden and nothing can be written back. Edits stay in the
browser (Download still works).

Without a site address it serves the local team/ folder instead (see "Testing locally" in the README).
"""
import argparse
import http.server
import os
import urllib.error
import urllib.request

HUB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('site', nargs='?', help="the team site's address, like https://owner.github.io/team-repo/")
    ap.add_argument('--port', type=int, default=8000)
    a = ap.parse_args()
    site = a.site.rstrip('/') + '/' if a.site else None

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw):
            super().__init__(*args, directory=HUB, **kw)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def do_GET(self):
            path = self.path.split('?')[0]
            if not site or not path.startswith('/team/'):
                return super().do_GET()
            # Read-only: without site.json the pages don't offer Save to GitHub
            if path == '/team/site.json':
                return self.send_error(404)
            try:
                with urllib.request.urlopen(site + self.path.lstrip('/'), timeout=20) as r:
                    body, kind, code = r.read(), r.headers.get('Content-Type', 'application/octet-stream'), r.status
            except urllib.error.HTTPError as e:
                return self.send_error(e.code)
            except OSError as e:
                return self.send_error(502, str(e))
            self.send_response(code)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    print(f'Hub at http://localhost:{a.port}/' + (f', team data from {site} (read-only)' if site else ', team data from team/'))
    http.server.ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
