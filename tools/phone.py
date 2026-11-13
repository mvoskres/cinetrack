"""Перевірка на справжньому телефоні (Android + Chrome, USB-налагодження): py tools/check.py --phone
або окремо: py tools/phone.py
Телефон має бути підключений кабелем, авторизований і розблокований; кінопис встановлений як застосунок.
На телефоні РЕАЛЬНІ дані користувача: сценарії лише відкривають і закривають вікна, нічого не змінюють.
Що перевіряє (те, чого не бачить headless): справжній системний жест «Назад» (свайп від краю) у встановленому застосунку —
закриває верхнє вікно без кроку в історії; на головному екрані перший «Назад» — підказка, другий — вихід.
Знімки екрана кожного кроку — у tools/_out/phone/."""
import json, os, subprocess, time, urllib.request

ADB = os.environ.get('ADB', r'C:\Users\mvosk\platform-tools\adb.exe')
WEBAPK = os.environ.get('CT_WEBAPK', 'org.chromium.webapk.aadb85ea26b642570_v2')
PORT = 9230
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_out', 'phone')


def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True, timeout=30)


def sh(cmd):
    return adb('shell', cmd).stdout.decode('utf-8', 'ignore').strip()


def focus():
    return sh('dumpsys window | grep mCurrentFocus')


def shot(name):
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, name + '.png'), 'wb').write(adb('exec-out', 'screencap', '-p').stdout)


def _size():
    w, h = sh('wm size').split(':')[-1].strip().split('x')
    return int(w), int(h)


def back():
    """справжній жест «Назад»: свайп від лівого краю"""
    w, h = _size()
    adb('shell', 'input', 'swipe', '3', str(h // 2), str(w // 2), str(h // 2), '300')


def launch():
    act = sh(f'cmd package resolve-activity --brief --user 0 -c android.intent.category.LAUNCHER {WEBAPK}').splitlines()[-1]
    adb('shell', 'am', 'start', '--user', '0', '-n', act)  # --user 0: на Samsung є Secure Folder (інший користувач)


class Page:
    def __init__(self, t):
        import websocket
        self.ws = websocket.create_connection(t['webSocketDebuggerUrl'], suppress_origin=True, timeout=15)
        self.n = 0

    def ev(self, expr):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self.n:
                return r.get('result', {}).get('result', {}).get('value')

    def wait(self, expr, t=4, what=''):
        end = time.time() + t
        while time.time() < end:
            if self.ev(expr): return
            time.sleep(0.15)
        raise AssertionError(f'не дочекався: {what or expr}')


def app():
    """сторінка встановленого застосунку (видима, display-mode standalone)"""
    adb('forward', f'tcp:{PORT}', 'localabstract:chrome_devtools_remote')
    for _ in range(20):
        try:
            for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=3)):
                if t['type'] == 'page' and 'cinetrack' in t['url']:
                    p = Page(t)
                    if p.ev("matchMedia('(display-mode: standalone)').matches&&document.visibilityState==='visible'"):
                        return p
        except Exception:
            pass
        time.sleep(0.5)
    raise AssertionError('сторінку застосунку не знайдено (телефон розблокований? застосунок встановлений?)')


def _ready():
    devs = adb('devices').stdout.decode()
    if '\tdevice' not in devs:
        raise AssertionError('телефон не підключений або не авторизований (adb devices: ' + devs.strip().replace('\n', ' | ') + ')')
    if 'NotificationShade' in focus() or 'isKeyguardShowing=true' in sh('dumpsys window | grep isKeyguardShowing'):
        raise AssertionError('телефон заблокований — розблокуй')
    launch(); time.sleep(3)
    p = app()
    p.ev("typeof closeTitle==='function'&&closeTitle()"); time.sleep(0.5)
    return p


CARD_OPEN = "document.body.classList.contains('ts-on')"


def s_card_back():
    p = _ready(); shot('0-home')
    hl = p.ev('history.length')
    iid = p.ev("(JSON.parse(localStorage.getItem('ct_watched')||'[]')[0]||{}).imdbID||''")
    assert iid, 'у списку немає тайтлів'
    p.ev(f'openTitle({json.dumps(iid)})'); p.wait(CARD_OPEN, 5, 'картка відкрилась'); time.sleep(1); shot('1-card')
    back(); p.wait('!' + CARD_OPEN, 3, 'картка закрилась жестом «Назад»'); time.sleep(0.5); shot('2-after')
    assert 'WebApk' in focus(), 'після «Назад» застосунок закрився замість картки'
    assert p.ev('history.length') == hl, 'history.length виріс — «Назад» іде через історію (буде анімація Chrome)'


def s_exit_guard():
    p = _ready()
    back(); time.sleep(0.7); shot('3-guard')
    assert 'WebApk' in focus(), 'перший «Назад» закрив застосунок'
    assert p.ev("[...document.querySelectorAll('#toasts *')].some(e=>e.textContent.includes('Назад'))"), 'немає підказки «Ще раз «Назад»»'
    back(); time.sleep(1.2)
    assert 'WebApk' not in focus(), 'другий «Назад» не закрив застосунок'
    launch(); time.sleep(2)  # повертаємо застосунок на екран


SCENARIOS = [('card-back', s_card_back), ('exit-guard', s_exit_guard)]

if __name__ == '__main__':
    bad = 0
    for name, fn in SCENARIOS:
        t = time.time()
        try: fn(); print(f'PASS  phone/{name}  ({time.time() - t:.1f}s)')
        except Exception as e: bad += 1; print(f'FAIL  phone/{name}  {e}')
    raise SystemExit(1 if bad else 0)
