"""Випуск на живий сайт: py tools/ship.py "<повідомлення коміту>" [--full] [--no-check] [--dry-run]
Перевіряє версію й дерево → stamp.py → check.py (--quick або --full) → commit → push → чекає, поки Pages віддасть нову версію."""
import argparse, os, random, re, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
LIVE = 'https://mvoskres.github.io/cinetrack/js/settings.js'
VRE = re.compile(r"CHANGELOG=\[\s*\{v:'([\d.]+)'")
AUTHOR = ['-c', 'user.name=mvoskres', '-c', 'user.email=mvoskres@users.noreply.github.com']
TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'


def vt(v): return tuple(int(x) for x in v.split('.'))


def git(*a, check=True):
    r = subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if check and r.returncode: sys.exit(f'git {" ".join(a)}: {r.stderr.strip() or r.stdout.strip()}')
    return r.stdout.strip()


def live_version():
    req = urllib.request.Request(f'{LIVE}?x={random.randrange(10**9)}', headers={'Cache-Control': 'no-cache', 'User-Agent': 'ship.py'})
    m = VRE.search(urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace'))
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('msg'); ap.add_argument('--full', action='store_true'); ap.add_argument('--no-check', action='store_true')
    ap.add_argument('--dry-run', action='store_true', help='усі перевірки, без commit/push')
    a = ap.parse_args()
    local = VRE.search(open(os.path.join(ROOT, 'js', 'settings.js'), encoding='utf-8').read()).group(1)
    try: live = live_version()
    except Exception as e: sys.exit(f'не вдалося дізнатися живу версію: {e}')
    if not live: sys.exit('у живому settings.js не знайдено версії')
    print(f'версія: у коді {local}, на живому {live}')
    if vt(local) <= vt(live): sys.exit(f'ВІДМОВА: версія в CHANGELOG ({local}) не новіша за живу ({live}) — підніми версію й додай запис')
    subprocess.run([sys.executable, os.path.join(TOOLS, 'stamp.py')], cwd=ROOT, check=True)
    if not git('status', '--porcelain'): sys.exit('ВІДМОВА: у git нічого комітити')
    if not a.no_check:
        r = subprocess.run([sys.executable, os.path.join(TOOLS, 'check.py'), '--full' if a.full else '--quick'], cwd=ROOT)
        if r.returncode: sys.exit('ПЕРЕВІРКА НЕ ПРОЙШЛА — нічого не закомічено й не запушено (є --no-check)')
    if a.dry_run: print('dry-run: перевірки пройшли, commit/push пропущено'); return
    t0 = time.time()
    git('add', '-A')
    git(*AUTHOR, 'commit', '-m', a.msg, '-m', TRAILER)
    h = git('rev-parse', '--short', 'HEAD')
    git('push')
    print(f'запушено {h}, чекаю Pages…', flush=True)
    while time.time() - t0 < 300:
        try:
            if live_version() == local:
                print(f'LIVE {local} {h}  ({time.time() - t0:.0f} с)'); return
        except Exception: pass
        time.sleep(5)
    sys.exit(f'ТАЙМАУТ 5 хв: {local} ({h}) запушено, але Pages ще не віддає. gh run list -R mvoskres/cinetrack')


if __name__ == '__main__':
    main()
