# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

# Get more of the HTML to find actual game entries
url = 'https://quantil.jsdelivr.net/gh/s0n-1m-cr1n3/sc13nc3/assets/index.html'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as resp:
    html = resp.read().decode('utf-8')

# Look for game card patterns
import re
# Find all anchor tags with their text
anchors = re.findall(r'<a[^>]*>(.*?)</a>', html, re.DOTALL)
print("Anchor texts (first 100):")
for i, a in enumerate(anchors[:100]):
    text = re.sub(r'<[^>]+>', '', a).strip()
    if text and len(text) > 1:
        print(f'  {i}: {text[:100]}')

print("\n--- Looking for game IDs / data attributes ---")
# Look for data-game or similar
game_ids = re.findall(r'data-(?:game|id|slug)=["\']([^"\']+)["\']', html)
print("Data game IDs:", game_ids[:50])

# Look for game list in JSON
json_matches = re.findall(r'var\s+games\s*=\s*(\[.*?\]);', html, re.DOTALL)
if json_matches:
    print("\nFound games array:")
    print(json_matches[0][:500])
else:
    print("\nNo games array found")

# Search for common game titles in the HTML
game_titles = ['minecraft', 'krunker', 'slither', 'agar', 'tetris', 'shellshock', 'diep', 'paper.io', 'slope', 'run 3', 'pacman', 'dino', '2048', 'cookie clicker', 'wordle', 'chess', '1v1', 'snake']
print("\nSearching for known game titles in HTML:")
for title in game_titles:
    count = html.lower().count(title.lower())
    if count > 0:
        print(f"  '{title}': {count} occurrences")

# Check for script tags with game data
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
for i, s in enumerate(scripts[:10]):
    if 'game' in s.lower() and len(s) > 100:
        print(f"\nScript {i} (first 300 chars):")
        print(s[:300])