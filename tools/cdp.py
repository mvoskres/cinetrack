"""Невелика бібліотека для headless-Chrome через CDP: сервер репо, Chrome, evaluate/wait/screenshot, збір помилок.
Без Runtime.enable і Network.* (на Chrome 157 це зависало); помилки збирає скрипт у сторінці (window.__errs).
Мережа вимкнена: Fetch-перехоплення віддає сіру картинку замість постерів і порожні JSON замість API."""
import atexit, base64, json, os, re, shutil, signal, socket, subprocess, tempfile, threading, time
import http.server, socketserver, urllib.request
import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
SEED = os.path.join(ROOT, 'tools', 'fixtures', 'seed.json')
CLOCK = 1794571200000  # 2026-11-13 12:00 UTC: заморожений «сьогодні»

ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S948B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36'
ANDROID_META = {'brands': [{'brand': 'Google Chrome', 'version': '157'}, {'brand': 'Chromium', 'version': '157'},
                           {'brand': 'Not.A/Brand', 'version': '24'}],
                'fullVersion': '157.0.0.0', 'platform': 'Android', 'platformVersion': '14.0.0',
                'architecture': '', 'model': 'SM-S948B', 'mobile': True}
IMG_HOSTS = ('image.tmdb.org', 'm.media-amazon.com')
API_STUBS = {  # хост -> тіло-заглушка; все інше зовнішнє блокується
    'www.omdbapi.com': '{"Response":"False","Error":"offline"}', 'omdbapi.com': '{"Response":"False","Error":"offline"}',
    'api.themoviedb.org': '{"results":[],"success":false}', 'api.tvmaze.com': '[]',
    'www.googleapis.com': '{}', 'oauth2.googleapis.com': '{}',
}
# 1x1 сірий PNG: усі постери однакові, тож знімки детерміновані
GRAY_PNG = base64.b64encode(base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==')).decode()


def _tmdb_detail(mt, i):
    """Правдоподібна картка TMDB для будь-якого id: картка тайтлу відкривається з даними, а не з помилкою."""
    d = {'id': i, 'overview': 'Короткий опис для перевірки. ' * 6, 'tagline': 'Підпис', 'poster_path': '/p.jpg',
         'backdrop_path': '/b.jpg', 'vote_average': 7.1, 'vote_count': 1234, 'status': 'Ended',
         'genres': [{'id': 28, 'name': 'Бойовик'}, {'id': 18, 'name': 'Драма'}],
         'production_countries': [{'iso_3166_1': 'US', 'name': 'United States of America'}],
         'external_ids': {'imdb_id': ''},
         'credits': {'cast': [{'id': 100 + k, 'name': f'Актор {k}', 'character': f'Роль {k}', 'profile_path': '/f.jpg'} for k in range(6)],
                     'crew': [{'id': 200, 'name': 'Режисер', 'job': 'Director', 'profile_path': '/f.jpg'}]},
         'videos': {'results': []}, 'watch/providers': {'results': {}},
         'recommendations': {'results': [{'id': 900 + k, 'media_type': mt, 'title': f'Схожий {k}', 'name': f'Схожий {k}',
                                          'poster_path': '/p.jpg', 'release_date': '2001-01-01', 'vote_average': 6.5} for k in range(4)]}}
    if mt == 'tv':
        d.update(name=f'Тестовий серіал {i}', original_name=f'Test Series {i}', first_air_date='2019-03-01', last_air_date='2023-05-01',
                 episode_run_time=[45], origin_country=['US'], networks=[{'name': 'Мережа'}], created_by=[{'name': 'Автор'}],
                 seasons=[{'season_number': n, 'episode_count': 10, 'air_date': f'{2018 + n}-03-01'} for n in range(1, 4)])
        d['aggregate_credits'] = {'cast': [{'id': c['id'], 'name': c['name'], 'profile_path': c['profile_path'], 'roles': [{'character': c['character']}]}
                                           for c in d['credits']['cast']], 'crew': []}
    else:
        d.update(title=f'Тестовий фільм {i}', original_title=f'Test Movie {i}', release_date='1987-06-12', runtime=107)
    return d


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def app_version():
    m = re.search(r"CHANGELOG=\[\s*\{v:'([\d.]+)'", open(os.path.join(ROOT, 'js', 'settings.js'), encoding='utf-8').read())
    return m.group(1) if m else ''


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()


class _Srv(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Browser:
    """with Browser() as b: b.configure(mode='android'); b.load(); b.eval('1+1')"""

    def __init__(self, headless=True):
        self.port = free_port(); self.dport = free_port()
        self.base = f'http://127.0.0.1:{self.port}'
        self.proc = None; self.ws = None; self.srv = None; self.tmp = None
        self._id = 0; self._pending = {}; self._lock = threading.Lock(); self._wl = threading.Lock()
        self._scripts = []; self.blocked = []; self.seed = {}
        atexit.register(self.close)

    # ── життєвий цикл ──
    def __enter__(self):
        try: self.start()
        except BaseException: self.close(); raise
        return self

    def __exit__(self, *a): self.close()

    def start(self):
        self.srv = _Srv(('127.0.0.1', self.port), _Quiet)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.tmp = tempfile.mkdtemp(prefix='ct-chrome-')
        self.proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={self.dport}',
                                      f'--user-data-dir={self.tmp}', '--no-first-run', '--no-default-browser-check',
                                      '--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none',
                                      '--disable-lcd-text', '--disable-background-timer-throttling',
                                      '--disable-renderer-backgrounding', '--disable-extensions', 'about:blank'],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        url = None; t0 = time.time()
        while time.time() - t0 < 20:
            try:
                for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{self.dport}/json/list', timeout=2)):
                    if t.get('type') == 'page': url = t['webSocketDebuggerUrl']; break
                if url: break
            except Exception: pass
            time.sleep(0.15)
        if not url: raise RuntimeError('Chrome не відповів на debug-порт')
        self.ws = websocket.create_connection(url, max_size=None, suppress_origin=True, timeout=30)
        self.ws.settimeout(None)
        threading.Thread(target=self._reader, daemon=True).start()
        self.send('Page.enable')
        self.send('Emulation.setFocusEmulationEnabled', enabled=True)  # інакше :focus/hasFocus хибні
        self.send('Emulation.setEmulatedMedia', features=[{'name': 'prefers-reduced-motion', 'value': 'reduce'}])
        self.send('Fetch.enable', patterns=[{'urlPattern': '*'}])
        self.seed = json.load(open(SEED, encoding='utf-8'))
        self.default_ua = self.send('Browser.getVersion')['userAgent'].replace('HeadlessChrome', 'Chrome')

    def close(self):
        ws, self.ws = self.ws, None
        if ws:
            try: ws.close()
            except Exception: pass
        p, self.proc = self.proc, None
        if p:
            try: subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], capture_output=True, timeout=15)
            except Exception: p.kill()
        s, self.srv = self.srv, None
        if s:
            try: s.shutdown(); s.server_close()
            except Exception: pass
        t, self.tmp = self.tmp, None
        if t: shutil.rmtree(t, ignore_errors=True)

    # ── CDP ──
    def _reader(self):
        while True:
            try: raw = self.ws.recv()
            except Exception: break
            if not raw: break
            m = json.loads(raw)
            if 'id' in m:
                with self._lock: slot = self._pending.pop(m['id'], None)
                if slot: slot[1] = m; slot[0].set()
            elif m.get('method') == 'Fetch.requestPaused':
                self._paused(m['params'])
        for slot in list(self._pending.values()): slot[0].set()

    def _paused(self, p):  # викликається з потоку-читача: лише send без очікування
        url = p['request']['url']; rid = p['requestId']; host = re.sub(r'^\w+://([^/:]+).*', r'\1', url)
        try:
            if url.startswith(('http://127.0.0.1', 'data:', 'blob:', 'about:')) or host == '127.0.0.1':
                self._raw('Fetch.continueRequest', requestId=rid)
            elif host in IMG_HOSTS:
                self._raw('Fetch.fulfillRequest', requestId=rid, responseCode=200,
                          responseHeaders=[{'name': 'Content-Type', 'value': 'image/png'}], body=GRAY_PNG)
            elif host in API_STUBS:
                body = API_STUBS[host]
                m = re.match(r'https://api\.themoviedb\.org/3/(movie|tv)/(\d+)(\?|$)', url)
                if m: body = json.dumps(_tmdb_detail(m.group(1), int(m.group(2))), ensure_ascii=False)
                m = re.match(r'https://api\.themoviedb\.org/3/find/tt(\d+)', url)
                if m:
                    n = int(m.group(1)); body = json.dumps({'movie_results': [{'id': n}], 'tv_results': [{'id': n}], 'person_results': []})
                self._raw('Fetch.fulfillRequest', requestId=rid, responseCode=200,
                          responseHeaders=[{'name': 'Content-Type', 'value': 'application/json'},
                                           {'name': 'Access-Control-Allow-Origin', 'value': '*'}],
                          body=base64.b64encode(body.encode()).decode())
            else:
                self.blocked.append(url)
                self._raw('Fetch.failRequest', requestId=rid, errorReason='BlockedByClient')
        except Exception: pass

    def _raw(self, method, **params):
        with self._lock: self._id += 1; i = self._id
        with self._wl: self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        return i

    def send(self, method, timeout=30, **params):
        ev = threading.Event(); slot = [ev, None]
        with self._lock: self._id += 1; i = self._id; self._pending[i] = slot
        with self._wl: self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        if not ev.wait(timeout): raise TimeoutError(f'CDP {method} не відповів за {timeout} с')
        r = slot[1]
        if r is None: raise RuntimeError('з\'єднання з Chrome розірвано')
        if 'error' in r: raise RuntimeError(f'CDP {method}: {r["error"]}')
        return r.get('result', {})

    def eval(self, expr, timeout=30):
        """Виконує вираз (await дозволений). Повертає значення або кидає Exception з повідомленням з сторінки."""
        r = self.send('Runtime.evaluate', timeout=timeout, expression=expr, returnByValue=True, awaitPromise=True)
        if 'exceptionDetails' in r:
            d = r['exceptionDetails']; raise RuntimeError((d.get('exception') or {}).get('description') or d.get('text'))
        return r['result'].get('value')

    def wait(self, expr, timeout=5.0, what=None, interval=0.05):
        """Чекає, поки вираз стане істинним; повертає його значення, інакше TimeoutError."""
        t0 = time.time(); last = None
        while time.time() - t0 < timeout:
            try: last = self.eval(expr)
            except Exception as e: last = None
            if last: return last
            time.sleep(interval)
        raise TimeoutError(f'не дочекався: {what or expr[:90]}')

    def sleep(self, s): time.sleep(s)

    # ── налаштування середовища ──
    def _init_script(self, cfg):
        seed = self.seed
        data = {'ls': seed['ls'], 'bump': seed['bump'], 'touch': seed['touch'], 'clock': CLOCK,
                'ver': app_version(), 'cfg': cfg}
        return ('(()=>{const D=' + json.dumps(data, ensure_ascii=False) + ';' + _PAGE_JS + '})()')

    def configure(self, mode='desktop', app=False, seed_extra=None):
        """mode: 'android' (UA Android Chrome → CloseWatcher), 'fallback' (телефон без нього → історія), 'desktop'.
        app=True: matchMedia каже standalone + pointer:coarse (встановлений застосунок)."""
        phone = mode in ('android', 'fallback')
        if phone:
            self.send('Emulation.setDeviceMetricsOverride', width=412, height=915, deviceScaleFactor=1, mobile=True)
        else:
            self.send('Emulation.setDeviceMetricsOverride', width=1400, height=900, deviceScaleFactor=1, mobile=False)
        if mode == 'android':
            self.send('Emulation.setUserAgentOverride', userAgent=ANDROID_UA, userAgentMetadata=ANDROID_META)
        else:
            self.send('Emulation.setUserAgentOverride', userAgent=self.default_ua)  # без metadata: не Android
        for sid in self._scripts:
            try: self.send('Page.removeScriptToEvaluateOnNewDocument', identifier=sid)
            except Exception: pass
        cfg = {'app': app, 'coarse': app or phone, 'extra': seed_extra or {}}
        self._scripts = [self.send('Page.addScriptToEvaluateOnNewDocument', source=self._init_script(cfg))['identifier']]
        self.mode = mode

    def load(self, path='index.html', fresh=True, wait_ready=True):
        if fresh:
            try: self.eval('sessionStorage.clear()')
            except Exception: pass
        self.blocked.clear()
        self.send('Page.navigate', url=f'{self.base}/{path}')
        if wait_ready:
            self.wait("document.readyState==='complete' && typeof goTab==='function' && typeof _inertSync==='function'", 15, 'застосунок завантажився')
            self.sleep(0.15)

    # ── зручності ──
    def errors(self):
        return self.eval('window.__errs||[]') or []

    def key(self, key, code=None, vk=None):
        vk = vk or {'Escape': 27, 'Enter': 13, 'Tab': 9}.get(key, 0)
        for t in ('rawKeyDown', 'keyUp'):
            self.send('Input.dispatchKeyEvent', type=t, key=key, code=code or key, windowsVirtualKeyCode=vk)

    def back(self):
        """Системне «Назад»: у режимі android — Esc, який сторінка пропускає до CloseWatcher; інакше історія."""
        if self.mode == 'android':
            self.eval('window.__back=true'); self.key('Escape')
            self.eval('window.__back=false')
        else:
            self.eval('history.back()')

    def shot(self, path):
        r = self.send('Page.captureScreenshot', format='png')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(base64.b64decode(r['data']))


_PAGE_JS = r"""
const C=D.cfg;
try{
  /* заморожений годинник: Date.now()/new Date() рухаються від CLOCK */
  const RD=Date,r0=RD.now(),now=()=>D.clock+(RD.now()-r0);
  const FD=function(...a){return a.length?new RD(...a):new RD(now());};
  FD.prototype=RD.prototype;FD.now=now;FD.UTC=RD.UTC;FD.parse=RD.parse;window.Date=FD;
}catch(e){}
try{
  if(!sessionStorage.getItem('__seeded')){
    localStorage.clear();
    for(const k in D.ls){let v=D.ls[k];
      if(D.bump.includes(k)&&v&&typeof v==='object')Object.keys(v).forEach(i=>{if(v[i]&&typeof v[i]==='object'&&'ts' in v[i])v[i].ts=D.clock;});
      if(k==='ct_watching')v.forEach(it=>{if(it.liveStatus)it.liveStatus._cachedAt=D.clock;});
      localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));}
    D.touch.forEach(k=>localStorage.setItem(k,String(D.clock)));
    localStorage.setItem('ct_gate','1');localStorage.setItem('ct_seen_ver',D.ver);
    for(const k in C.extra)localStorage.setItem(k,typeof C.extra[k]==='string'?C.extra[k]:JSON.stringify(C.extra[k]));
    sessionStorage.setItem('__seeded','1');
  }
}catch(e){}
/* помилки: console.error, винятки, відхилені проміси, порушення CSP */
const E=window.__errs=[];
const ce=console.error.bind(console);
console.error=function(...a){E.push('console.error: '+a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));ce(...a);};
addEventListener('error',e=>{if(e.target&&e.target!==window)E.push('resource: '+(e.target.src||e.target.href));else E.push('exception: '+e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);},true);
addEventListener('unhandledrejection',e=>E.push('rejection: '+String(e.reason&&e.reason.stack||e.reason).slice(0,300)));
document.addEventListener('securitypolicyviolation',e=>E.push('CSP: '+e.violatedDirective+' '+e.blockedURI));
/* Назад на Android: помічений Esc проходить повз захисний обробник застосунку до CloseWatcher */
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.__back)e.stopImmediatePropagation();},true);
/* встановлений застосунок і дотик */
if(C.app||C.coarse){
  const mm=window.matchMedia.bind(window);
  window.matchMedia=q=>{
    const forced=(C.app&&/display-mode:\s*(standalone|minimal-ui|fullscreen)/.test(q)&&/standalone/.test(q))||(C.coarse&&/pointer:\s*coarse/.test(q));
    if(!forced)return mm(q);
    return {matches:true,media:q,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false}};
  };
}
"""
