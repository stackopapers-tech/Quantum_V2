# (c) Quantum Hub — proprietary hub build. All rights reserved.
import urllib.request
import re

# Try the Google Doc link
url = 'https://docs.google.com/document/d/1JBhyNwurO02JYGBzx0p58B9e74qcphEKN8bI-i2dCcc/preview'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8')
        print(f'Status: {resp.status}')
        print(f'Length: {len(html)} chars')
        
        # Search for common game names
        game_titles = ['minecraft', 'krunker', 'slither', 'agar', 'tetris', 'shellshock', 'diep', 'paper.io', 'slope', 'run 3', 'pacman', 'dino', '2048', 'cookie clicker', 'wordle', 'chess', '1v1', 'snake', 'roblox', 'eaglercraft', 'evazoid', 'cut the wire', 'google maze']
        for title in game_titles:
            count = html.lower().count(title.lower())
            if count > 0:
                print(f'  "{title}": {count} occurrences')
except Exception as e:
    print(f'Error: {e}')