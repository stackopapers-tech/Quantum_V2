# (c) Quantum Hub — proprietary hub build. All rights reserved.
import sys, threading, time, urllib.request, json
from http.server import ThreadingHTTPServer
from server import HubHandler, init_db

init_db()

class DebugHTTPServer(ThreadingHTTPServer):
    def process_request(self, request, client_address):
        import sys
        sys.stderr.write(f'[Server] process_request called for {client_address}\n')
        sys.stderr.flush()
        super().process_request(request, client_address)

    def finish_request(self, request, client_address):
        import sys
        sys.stderr.write(f'[Server] finish_request called for {client_address}\n')
        sys.stderr.flush()
        super().finish_request(request, client_address)

httpd = DebugHTTPServer(('127.0.0.1', 8000), HubHandler)
print('Test server created on port 8000', file=sys.stderr)

t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(2)

import urllib.request, json
data = json.dumps({'username': 'TestUser', 'email': 'test@local.hub', 'password': 'ValidPass123!'}).encode()
req = urllib.request.Request('http://127.0.0.1:8000/api/register', data=data, headers={'Content-Type': 'application/json'})
try:
    r = urllib.request.urlopen(req, timeout=5)
    print('Response:', r.read().decode())
except Exception as e:
    print('Error:', e)

httpd.shutdown()