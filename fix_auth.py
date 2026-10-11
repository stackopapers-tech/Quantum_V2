# (c) Quantum Hub — proprietary hub build. All rights reserved.
import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Use regex to replace from hideStaticAuthModal to isLoggedIn
pattern = (
    r"hideStaticAuthModal\(\) \{\s*\n"
    r"\s*document\.getElementById\('auth-modal'\)\?\.\s*classList\.add\('hidden'\);\s*\n"
    r"\s*\}\s*\n\n"
    r"\s*async updateUserPreferences\(prefs\) \{\s*\n"
    r".*?"
    r"\n\s*\}\s*\n\n"
    r"\s*async changePassword\(currentPassword, newPassword\) \{\s*\n"
    r".*?"
    r"\n\s*\}\s*\n\n"
    r"\s*async deleteAccount\(password\) \{\s*\n"
    r".*?"
    r"\n\s*\}\s*\n\n"
    r"\s*isLoggedIn\(\) \{"
)

replacement = (
    "hideStaticAuthModal() {\n"
    "        document.getElementById('auth-modal')?.classList.add('hidden');\n"
    "    }\n\n"
    "    isLoggedIn() {"
)

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content != content:
    with open('js/app.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('REPLACED')
else:
    print('NOT MATCHED - trying simpler approach')

    # Simpler: just find the lines and remove them manually
    lines = content.split('\n')
    out = []
    skip = False
    for line in lines:
        if 'hideStaticAuthModal()' in line:
            skip = True
            out.append(line)
            continue
        if skip:
            if 'isLoggedIn()' in line and '{' in line and 'async' not in line:
                out.append('')
                out.append(line)
                skip = False
            continue
        out.append(line)
    
    if len(out) < len(lines):
        with open('js/app.js', 'w', encoding='utf-8') as f:
            f.write('\n'.join(out))
        print('REPLACED with line-by-line')
    else:
        print('STILL NOT FOUND')