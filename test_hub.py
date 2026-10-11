# (c) Quantum Hub — proprietary hub build. All rights reserved.
import sys, threading, time, urllib.request, json
from functools import partial
sys.path.insert(0, '.')

from server import HubHandler, init_db
from http.server import ThreadingHTTPServer

init_db()

handler = partial(HubHandler, directory='.')
httpd = ThreadingHTTPServer(('127.0.0.1', 8000), handler)
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