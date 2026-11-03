"""Stamps css/js references in index.html with ?v=<first 8 hex of the file's sha1>.
Run before every commit that touches css/ or js/:  py tools/stamp.py
A changed file gets a new URL, so a browser (or the Pages CDN) never mixes an old script with a new one."""
import hashlib, re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(root, 'index.html')
html = open(p, encoding='utf-8', newline='').read()
def v(path):
    return hashlib.sha1(open(os.path.join(root, path), 'rb').read()).hexdigest()[:8]
def sub(m):
    attr, path = m.group(1), m.group(2)
    return '%s="%s?v=%s"' % (attr, path, v(path))
new = re.sub(r'(src|href)="((?:js|css)/[\w.\-/]+\.(?:js|css))(?:\?v=\w+)?"', sub, html)
if new != html:
    open(p, 'w', encoding='utf-8', newline='').write(new)
print('stamped' if new != html else 'unchanged')
