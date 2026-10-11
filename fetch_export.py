# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

# Try export format
url = 'https://docs.google.com/document/d/1JBhyNwurO02JYGBzx0p58B9e74qcphEKN8bI-i2dCcc/export?format=txt'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        text = resp.read().decode('utf-8')
        print(f'Status: {resp.status}')
        print(f'Length: {len(text)} chars')
        print('\nFirst 5000 chars:')
        print(text[:5000])
except Exception as e:
    print(f'Error: {e}')

print("\n\n=== Trying HTML export ===")
url2 = 'https://docs.google.com/document/d/1JBhyNwurO02JYGBzx0p58B9e74qcphEKN8bI-i2dCcc/export?format=html'
try:
    req = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8')
        print(f'Status: {resp.status}')
        print(f'Length: {len(html)} chars')
        
        # Extract links
        urls = re.findall(r'href=["\']([^"\']+)["\']', html)
        game_domains = ['krunker.io', 'slither.io', 'agar.io', 'shellshock.io', 'diep.io', 'paper.io', 'tetris.com', 'play2048.co', 'chess.com', 'coolmathgames.com', 'poki.com', 'crazygames.com', 'unblockedgames', 'unblocked', 'eaglercraft', 'evazoid', 'cutthewire.com', 'elgoog.im', 'chromedino.com', 'tetr.io', 'run3.io', '1v1.lol', 'shellshock.io', 'diep.io', 'cookieclicker', 'orteil.dashnet.org', 'littlealchemy2.com', 'geoguessr.com', 'wordle', 'nytimes.com/games', 'catanuniverse.com', 'google.com/doodles', 'classic.minecraft.net']
        
        found = set()
        for u in urls:
            for domain in game_domains:
                if domain in u:
                    found.add(u)
                    break
        
        print(f"\nFound {len(found)} game URLs:")
        for u in sorted(found):
            print(f'  {u}')
except Exception as e:
    print(f'Error: {e}')