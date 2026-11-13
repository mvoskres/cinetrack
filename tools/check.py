"""Швидка перевірка Кіноперу в headless Chrome: py tools/check.py [--quick] [-k підрядок] [--shots|--baseline] [--phone] [--list]
Без аргументів — повний набір (усі режими «Назад»). --quick — вкладки й оверлеї лише в режимі Android Chrome (~30 с)."""
import argparse, os, sys, time, zlib, struct, traceback
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdp, scenarios as S

OUT = os.path.join(cdp.ROOT, 'tools', '_out')


def _png_pixels(path):
    """Мінімальний декодер PNG (8 біт, без interlace) → (w, h, bytes RGBA/RGB) для підрахунку різниці."""
    d = open(path, 'rb').read(); p = 8; idat = b''; w = h = ct = 0
    while p < len(d):
        n, t = struct.unpack('>I4s', d[p:p + 8]); body = d[p + 8:p + 8 + n]; p += 12 + n
        if t == b'IHDR': w, h, _, ct = struct.unpack('>IIBB', body[:10])
        elif t == b'IDAT': idat += body
    ch = {2: 3, 6: 4}.get(ct, 4); raw = zlib.decompress(idat); st = w * ch; out = bytearray(); prev = bytearray(st); q = 0
    for _ in range(h):
        f = raw[q]; line = bytearray(raw[q + 1:q + 1 + st]); q += 1 + st
        for i in range(st):
            a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line; prev = line
    return w, h, ch, bytes(out)


def compare(a, b):
    """None якщо піксель-в-піксель однакові, інакше короткий опис."""
    if open(a, 'rb').read() == open(b, 'rb').read(): return None
    try:
        wa, ha, ca, da = _png_pixels(a); wb, hb, cb, db = _png_pixels(b)
        if (wa, ha) != (wb, hb): return f'розмір {wa}x{ha} проти {wb}x{hb}'
        n = sum(1 for i in range(0, len(da), ca) if da[i:i + ca] != db[i:i + ca])
        return f'{n} px відрізняються' if n else None  # різні байти PNG, однакові пікселі = ок
    except Exception as e:
        return f'різні байти ({e})'


def pick(args):
    runs = []
    for name, fn, modes, app in S.SCENARIOS:
        ms = [m for m in modes if (m == 'android' or not args.quick)]
        for m in ms:
            full = f'{name}[{m}]'
            if args.k and not any(k in full for k in args.k): continue
            runs.append((full, name, fn, m, app))
    runs.sort(key=lambda r: (S.MODES[r[3]]['cfg'], r[4]))  # менше перемикань середовища
    return runs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--quick', action='store_true'); ap.add_argument('--full', action='store_true')
    ap.add_argument('-k', action='append', help='лише сценарії, чия назва містить підрядок (можна кілька)')
    ap.add_argument('--shots', action='store_true', help='знімки в tools/_out/shots + порівняння з baseline')
    ap.add_argument('--baseline', action='store_true', help='(пере)створити tools/_out/baseline')
    ap.add_argument('--phone', action='store_true', help='додатково tools/phone.py (справжній телефон), якщо є')
    ap.add_argument('--list', action='store_true')
    args = ap.parse_args()
    runs = pick(args)
    if args.list:
        for r in runs: print(r[0])
        print(len(runs), 'сценаріїв'); return 0
    shots = args.shots or args.baseline
    sdir = os.path.join(OUT, 'baseline' if args.baseline else 'shots')
    if shots:
        import shutil; shutil.rmtree(sdir, ignore_errors=True)
    t0 = time.time(); res = []; cur = None
    try:
        with cdp.Browser() as b:
            for full, name, fn, m, app in runs:
                key = (S.MODES[m]['cfg'], app)
                if key != cur: b.configure(S.MODES[m]['cfg'], app=app); cur = key
                b.mode = S.MODES[m]['cfg']
                ctx = S.Ctx(b, m, full, (lambda f: os.path.join(sdir, f)) if shots else None)
                ts = time.time(); err = None
                try:
                    b.load()
                    fn(ctx)
                    e = b.errors()
                    if e: err = 'помилки сторінки: ' + ' || '.join(e[:3])
                except Exception as ex:
                    err = f'{type(ex).__name__}: {ex}'.split('\n')[0][:300]
                    try:
                        e = b.errors()
                        if e: err += ' || сторінка: ' + ' || '.join(e[:2])
                    except Exception: pass
                xf = S.XFAIL.get(full); tag = 'FAIL' if err else 'PASS'
                if xf and err: tag, err2, err = 'XFAIL', err, None   # відома вада: не рахується
                elif xf: tag, err = 'XPASS', 'виправлено? прибери з XFAIL: ' + xf
                res.append((full, err, time.time() - ts, ctx.shot_names))
                print(f'{tag}  {full}  ({res[-1][2]:.1f}s)' + (f'  {err}' if err else f'  [{xf}]' if tag == 'XFAIL' else ''), flush=True)
            # відрізняємо від baseline
            diffs = []
            if args.shots and not args.baseline:
                bdir = os.path.join(OUT, 'baseline')
                for full, err, dt, names in res:
                    for n in names:
                        a, bb = os.path.join(bdir, n), os.path.join(sdir, n)
                        if not os.path.exists(a): diffs.append(f'{n}: немає в baseline'); continue
                        d = compare(a, bb)
                        if d: diffs.append(f'{n}: {d}')
                for d in diffs: print('DIFF  ' + d)
                if not diffs: print('знімки: збігаються з baseline')
    except KeyboardInterrupt:
        print('перервано'); return 130
    # tools/phone.py: сценарії зі справжнього телефона, якщо модуль існує
    if args.phone:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phone.py')
        if not os.path.exists(p): print('SKIP  phone.py відсутній (--phone пропущено)')
        else:
            try:
                import phone
                for name, fn in getattr(phone, 'SCENARIOS', []):
                    ts = time.time(); err = None
                    try: fn()
                    except Exception as ex: err = f'{type(ex).__name__}: {ex}'.split('\n')[0][:300]
                    res.append((f'phone/{name}', err, time.time() - ts, []))
                    print(f'{"FAIL" if err else "PASS"}  phone/{name}  ({res[-1][2]:.1f}s)' + (f'  {err}' if err else ''), flush=True)
            except Exception:
                traceback.print_exc(); res.append(('phone', 'phone.py не імпортується', 0, []))
    bad = [r for r in res if r[1]]
    nd = len(diffs) if args.shots and not args.baseline else 0
    print(f'\n{len(res) - len(bad)}/{len(res)} PASS' + (f', {nd} знімків відрізняються' if nd else '') + f', {time.time() - t0:.1f} с')
    return 1 if bad or nd else 0


if __name__ == '__main__':
    sys.exit(main())
