# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

url = 'https://quantil.jsdelivr.net/gh/s0n-1m-cr1n3/sc13nc3/assets/index.html'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as resp:
    html = resp.read().decode('utf-8')

# Look for the G4m3s section specifically
# Find the section after "G4m3s"
idx = html.find('G4m3s')
if idx > 0:
    print("=== G4m3s section context ===")
    print(html[idx:idx+5000])

print("\n=== Looking for Squid g4mes section ===")
idx = html.find('Squid g4mes')
if idx > 0:
    print(html[idx:idx+5000])

# Search for game card patterns
print("\n=== Looking for game card patterns ===")
# Look for onclick handlers with game URLs
onclick_matches = re.findall(r'onclick=["\']([^"\']*)["\']', html)
for o in onclick_matches[:30]:
    if 'game' in o.lower() or 'http' in o:
        print(f"  onclick: {o[:200]}")

# Look for href patterns that look like game launches
href_matches = re.findall(r'href=["\']([^"\']*(?:game|play|launch)[^"\']*)["\']', html, re.IGNORECASE)
print("\nGame-related hrefs:")
for h in href_matches[:50]:
    print(f"  {h}")

# Look for iframe sources
iframe_srcs = re.findall(r'<iframe[^>]*src=["\']([^"\']+)["\']', html)
print("\nIframe sources:")
for src in iframe_srcs[:20]:
    print(f"  {src}")

# Search for "diep" context since it appeared 419 times
print("\n=== DIEPI.IO context ===")
for m in re.finditer(r'.{0,100}diep.{0,100}', html, re.IGNORECASE):
    print(f"  ...{m.group()}...")
    break  # just first match