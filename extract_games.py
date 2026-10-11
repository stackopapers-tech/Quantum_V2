# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

url = 'https://docs.google.com/document/d/1JBhyNwurO02JYGBzx0p58B9e74qcphEKN8bI-i2dCcc/preview'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as resp:
    html = resp.read().decode('utf-8')

# The doc is huge, let's look for structured game lists
# Search for URLs that look like game links
urls = re.findall(r'https?://[^\s<>"\'\)]+', html)

# Filter for game-related URLs
game_domains = ['krunker.io', 'slither.io', 'agar.io', 'shellshock.io', 'diep.io', 'paper.io', 'tetris.com', 'play2048.co', 'chess.com', 'coolmathgames.com', 'poki.com', 'crazygames.com', 'unblockedgames', 'unblocked', 'eaglercraft', 'evazoid', 'cutthewire.com', 'elgoog.im', 'chromedino.com', 'tetr.io', 'run3.io', 'tetr.io', '1v1.lol', 'shellshock.io', 'diep.io', 'cookieclicker', 'orteil.dashnet.org', 'littlealchemy2.com', 'geoguessr.com', 'wordle', 'nytimes.com/games', 'catanuniverse.com', 'google.com/doodles', 'classic.minecraft.net']

print("Found game URLs in doc:")
found = set()
for u in urls:
    for domain in game_domains:
        if domain in u:
            found.add(u)
            break

for u in sorted(found)[:100]:
    print(f'  {u}')

print(f"\nTotal unique game URLs found: {len(found)}")

# Also look for a structured list pattern
# Look for bullet points or numbered lists with game names
print("\n=== Looking for game titles in text ===")
# Extract text content (strip HTML tags)
text = re.sub(r'<[^>]+>', ' ', html)
text = re.sub(r'\s+', ' ', text)

# Look for lines that might be game entries
lines = text.split('\n')
game_keywords = ['game', 'play', 'unblocked', 'link', 'url']
for line in lines[:5000]:
    line = line.strip()
    if len(line) > 20 and len(line) < 200:
        for kw in game_keywords:
            if kw in line.lower():
                # Check if it contains a URL or game-like pattern
                if re.search(r'https?://', line) or re.search(r'\b[a-z]{3,}\b', line):
                    print(f'  {line[:200]}')
                    break