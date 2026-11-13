"""Сценарії для tools/check.py. Додати новий = написати функцію з @scenario(...) (або рядок у OVERLAYS / STACKS).
Функція отримує Ctx: c.b (Browser з cdp.py), c.eval/c.wait/c.snap/c.back(), c.assert_(умова, 'що не так').
Будь-який виняток або помилка сторінки (console.error, exception, CSP) = FAIL."""
import time

# режими «Назад». closer: back = системне «Назад» Android Chrome (CloseWatcher), hist = history.back(), esc = клавіша Esc
MODES = {
    'android':      dict(cfg='android',  closer='back', label='Android Chrome, CloseWatcher'),
    'history':      dict(cfg='fallback', closer='hist', label='телефон без CloseWatcher, історія'),
    'desktop':      dict(cfg='desktop',  closer='esc',  label='ПК, Esc'),
    'mouse-back':   dict(cfg='desktop',  closer='hist', label='ПК, кнопка «назад» миші'),
    'android-esc':  dict(cfg='android',  closer='esc',  label='Android Chrome, Esc з клавіатури'),
}
ALL_MODES = tuple(MODES)
PHONE_MODES = ('android', 'history', 'android-esc')
TABS = ['watched', 'watching', 'planned', 'stats', 'recs', 'collections', 'people', 'game']

SCENARIOS = []  # (name, fn, modes, app)


def scenario(name, modes=('android',), app=False):
    def deco(fn):
        SCENARIOS.append((name, fn, tuple(modes), app)); return fn
    return deco


class Ctx:
    def __init__(self, b, mode, name, shots=None):
        self.b = b; self.mode = mode; self.m = MODES[mode]; self.name = name; self.shots = shots; self.shot_names = []
    def eval(self, e, timeout=30): return self.b.eval(e, timeout)
    def wait(self, e, timeout=4.0, what=None): return self.b.wait(e, timeout, what)
    def sleep(self, s): self.b.sleep(s)
    def assert_(self, cond, msg):
        if not cond: raise AssertionError(msg)
    def snap(self, label):
        if self.shots is None: return
        self.b.sleep(0.35)
        fn = f'{self.name}__{label}'.replace('/', '_').replace(':', '_').replace(' ', '_') + '.png'
        self.b.shot(self.shots(fn)); self.shot_names.append(fn)
    def close_top(self):
        """Закриває верхній шар так, як це робить користувач у поточному режимі."""
        k = self.m['closer']
        if k == 'back': self.b.back()
        elif k == 'hist': self.b.eval('history.back()')
        else: self.b.key('Escape')


# ───────────── оверлеї: як відкрити, як побачити, що відкрито ─────────────
HID = "document.getElementById('{}').classList.contains('hidden')"
OVERLAYS = {
    'title':    dict(open="openTitle('tt0093773')", is_open="!" + HID.format('titleSheet') + "&&!document.querySelector('#tsBody .spinner')", root='#titleSheet', focus=True),  # відкрита = дані завантажені (фокус тепер ставиться ще до завантаження)
    'search':   dict(open="searchOpen()", is_open="document.body.classList.contains('srch-on')", root='#srch', focus=True),
    'dialog':   dict(open="modal('<div class=\"modal-title\">Тест</div><button class=\"btn\">Гаразд</button>')",
                     is_open="!!document.getElementById('mbox').innerHTML.trim()", root='#mbox', focus=True),
    'game':     dict(open="startGame('round')", is_open="!" + HID.format('gameModalBg'), root='#gameModalBg', focus=True),
    'nav':      dict(open="navOpen()", is_open="document.body.classList.contains('nav-on')", root='.dk-big', phone=True),
    'filters':  dict(open="fsOpen('watched')", is_open="document.body.classList.contains('fs-on')", root='#fsh', focus=True),
    'watching': dict(open="goTab('watching'); wbOpen(watching[0].id)", is_open="document.body.classList.contains('wb-on')", root='#wbSheet', focus=True),
    'tags':     dict(open="tagEdit(watched[0].id)", is_open="document.body.classList.contains('tg-on')", root='#tgSheet', focus=True),
    # справжня кнопка ⋯ на картці; меню не реєструється як шар (Back його не закриває — див. XFAIL нижче), закривається Esc
    'menu':     dict(open="document.querySelector('#tab-watched .pc-fab.more, #tab-watched .lrow-more').click()",
                     is_open="!!document.querySelector('.ct-menu')", root='.ct-menu', focus=True, esc_only=True),
}


def _inert_state(c):
    return c.eval("[...document.querySelectorAll('[inert]')].map(e=>(e.id||e.className||e.tagName)+'').sort().join('|')")


def _open(c, key, what=None):
    o = OVERLAYS[key]
    c.eval(o['open'])
    c.wait(o['is_open'], 5, f'{key}: відкрився')
    if o.get('focus'):  # картка тайтлу ставить фокус після завантаження даних
        try: c.wait(f"!!document.activeElement && !!document.activeElement.closest('{o['root']}')", 3)
        except TimeoutError:
            raise AssertionError(f'{key}: фокус не всередині шару ({c.eval("document.activeElement&&(document.activeElement.id||document.activeElement.className||document.activeElement.tagName)")})')
    c.assert_(c.eval(f"!document.querySelector('{o['root']}').closest('[inert]')"), f'{key}: сам шар inert')


def _closer(c, key):
    o = OVERLAYS[key]
    if o.get('esc_only'):
        c.b.key('Escape')
    else:
        c.close_top()


def _closed(c, key):
    o = OVERLAYS[key]
    c.wait(f"!({o['is_open']})", 4, f'{key}: закрився')


def _sane(c, base_inert):
    c.sleep(0.4)
    inert = _inert_state(c)
    c.assert_(inert == base_inert, f'inert лишився після закриття: «{inert}» (було «{base_inert}»)')
    c.assert_(c.eval("""(()=>{const a=document.activeElement;if(!a||a===document.body)return true;
      return a.isConnected&&!a.closest('[inert]')&&!!(a.offsetWidth||a.offsetHeight||a.getClientRects().length)})()"""),
              'фокус застряг на прихованому/inert елементі')
    if c.m['cfg'] == 'android':
        c.assert_(c.eval('_cwL.length') == 0, f'_cwL не порожній: {c.eval("_cwL.map(l=>l.key).join()")}')
    else:
        c.assert_(c.eval("_LY.every(l=>l.dead)"), 'живий шар лишився в _LY')


def _overlay_single(key):
    o = OVERLAYS[key]
    modes = PHONE_MODES if o.get('phone') else ALL_MODES

    def fn(c):
        base = _inert_state(c)
        _open(c, key); c.snap('open')
        c.assert_(c.eval('window.__errs.length') == 0, 'помилки при відкритті: ' + str(c.b.errors()))
        _closer(c, key); _closed(c, key); _sane(c, base)
    SCENARIOS.append((f'overlay/{key}', fn, modes, False))


for _k in OVERLAYS: _overlay_single(_k)


# ───────────── шари один на одному: Назад закриває лише верхній ─────────────
STACKS = [('search', 'title'), ('title', 'dialog'), ('title', 'tags'), ('title', 'menu'), ('watching', 'tags')]


def _stack(a, b_):
    def fn(c):
        base = _inert_state(c)
        _open(c, a); _open(c, b_); c.snap('both')
        c.assert_(c.eval(OVERLAYS[a]['is_open']), f'{a} зник одразу після відкриття {b_}')
        _closer(c, b_); _closed(c, b_)
        c.sleep(0.3)
        c.assert_(c.eval(OVERLAYS[a]['is_open']), f'Назад закрив і нижній шар «{a}», а мав лише «{b_}»')
        _closer(c, a); _closed(c, a); _sane(c, base)
    SCENARIOS.append((f'stack/{a}+{b_}', fn, ALL_MODES, False))


for _a, _b in STACKS: _stack(_a, _b)


# ───────────── вкладки ─────────────
def _tab(t):
    def fn(c):
        c.eval(f"goTab('{t}')")
        c.wait(f"!document.getElementById('tab-{t}').classList.contains('hidden')", 5, f'вкладка {t} видима')
        c.sleep(0.5)
        w = c.eval('[document.documentElement.scrollWidth, innerWidth]')
        c.assert_(w[0] <= w[1] + 1, f'горизонтальний скрол: scrollWidth {w[0]} > {w[1]}')
        c.assert_(c.eval(f"document.getElementById('tab-{t}').innerText.trim().length>0"), 'вкладка порожня')
        c.snap('tab')
    SCENARIOS.append((f'tab/{t}', fn, ('android', 'desktop'), False))


for _t in TABS: _tab(_t)


# ───────────── вихід із застосунку: тост при першому «Назад» ─────────────
@scenario('exit-guard', modes=('android',), app=True)
def _exit(c):
    c.assert_(c.eval('_exitOn'), '_exitOn=false (режим застосунку не розпізнано)')
    toast = "!!document.querySelector('#toasts')&&/Ще раз/.test(document.querySelector('#toasts').innerText)"
    c.b.back(); c.wait(toast, 3, 'тост «Ще раз Назад»'); c.snap('toast')
    c.wait("!/Ще раз/.test(document.querySelector('#toasts').innerText)", 5, 'тост зник')
    c.sleep(0.3)
    c.b.back(); c.wait(toast, 3, 'сторож знову взведений після 2 с')
    c.wait("!/Ще раз/.test(document.querySelector('#toasts').innerText)", 5)
    c.sleep(0.3)
    # відкритий оверлей: Назад закриває його, а не показує тост
    c.eval("openTitle('tt0093773')"); c.wait("!" + HID.format('titleSheet'), 4)
    c.b.back(); c.wait(HID.format('titleSheet'), 4, 'картка закрилась')
    c.assert_(not c.eval(toast), 'тост виходу з\'явився замість закриття картки')


# ───────────── відомі вади: падіння = XFAIL (не ламає код виходу); коли виправлять — стане XPASS і треба прибрати рядок ─────────────
XFAIL = {
}


@scenario('overlay/title-load-fail', modes=('android', 'desktop'))
def _title_fail(c):
    # деталі не завантажились (немає мережі/ключа): картка показує помилку, фокус усе одно всередині, Назад/Esc закриває
    c.eval("window._tsLoad0=window._tsLoad0||_tsLoad;_tsLoad=()=>Promise.reject(new Error('offline'))")
    try:
        c.eval("openTitle('tt0000001')")
        c.wait("document.body.classList.contains('ts-on')&&!!document.querySelector('#tsBody .empty')", 5, 'картка з помилкою')
        c.wait("!!document.activeElement&&!!document.activeElement.closest('#titleSheet')", 2, 'фокус усередині картки з помилкою')
        c.close_top() if c.mode != 'android' else c.b.back()
        c.wait("!document.body.classList.contains('ts-on')", 2, 'картка з помилкою закрилась')
    finally:
        c.eval("_tsLoad=window._tsLoad0")


@scenario('overlay/menu-back', modes=('android',))
def _menu_back(c):
    _open(c, 'menu'); c.close_top() if c.mode != 'android' else c.b.back()
    c.wait("!document.querySelector('.ct-menu')", 2, 'меню ⋯ закрилось системним «Назад»')
