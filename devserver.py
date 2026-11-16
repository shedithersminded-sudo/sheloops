import http.server, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8780
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
print(f'SHELOOPS running at http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
