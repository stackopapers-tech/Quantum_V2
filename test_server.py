# (c) Quantum Hub — proprietary hub build. All rights reserved.
import sys, threading, time, urllib.request, json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class TestHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        import sys
        sys.stderr.write('[TEST] POST received\n')
        sys.stderr.flush()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

httpd = ThreadingHTTPServer(('127.0.0.1', 8001), TestHandler)
print('Test server created on port 8001', file=sys.stderr)

t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(1)

import urllib.request, json
data = json.dumps({'test': 'data'}).encode()
req = urllib.request.Request('http://127.0.0.1:8001/test', data=b'test', headers={'Content-Type': 'application/json'})
try:
    r = urllib.request.urlopen(req, timeout=5)
    print('Response:', r.read().decode())
except Exception as e:
    print('Error:', e)

httpd.shutdown()