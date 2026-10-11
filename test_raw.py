# (c) Quantum Hub — proprietary hub build. All rights reserved.
import socket

s = socket.socket()
s.connect(('127.0.0.1', 8000))
req = b'POST /api/register HTTP/1.1\r\nHost: 127.0.0.1:8000\r\nContent-Type: application/json\r\nContent-Length: 80\r\n\r\n{"username":"Test","email":"test@test.com","password":"ValidPass123!"}'
s.send(req)
response = s.recv(4096)
print(response.decode())
s.close()