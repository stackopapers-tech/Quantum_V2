# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

url = 'https://quantil.jsdelivr.net/gh/s0n-1m-cr1n3/sc13nc3/assets/index.html'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8')
        print(f'Status: {resp.status}')
        print(f'Length: {len(html)} chars')
        links = re.findall(r'href=["\']([^"\']+)["\']', html)
        print('\nFound links (first 50):')
        for l in links[:50]:
            print(f'  {l}')
except Exception as e:
    print(f'Error: {e}')