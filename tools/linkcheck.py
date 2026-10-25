#!/usr/bin/env python3
"""Fetch every url in data/*.json and report what came back.

Copied from Law/tools/linkcheck.py (the fleet's reference implementation);
only collect() and the loading differ. Every row prints "checked YYYY-MM"
from its file's `updated`, so run this before bumping that date.

    python3 tools/linkcheck.py                 # every file
    python3 tools/linkcheck.py grablist        # one file
    python3 tools/linkcheck.py --slow          # 4 workers instead of 12

Standard library only. Sites that answer an automated request with 401/403/
405/406/429/503 (Akamai, Cloudflare) are reported as BLOCKED, not DEAD, and do
not fail the run; only 404, 410, DNS failure and refused connections do.
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0 Safari/537.36')
TIMEOUT = 25

# Failing the run on these would mean failing on someone else's WAF policy.
# 402/418/421 and Cloudflare's 52x are what bot walls answer with too.
BLOCKED_CODES = {401, 402, 403, 405, 406, 418, 421, 429, 503, 520, 521, 522, 523, 524, 525, 526}
DEAD_CODES = {404, 410}

# A bot wall that answers 200 and redirects to its own interstitial looks like a
# healthy redirect unless you know the destination. These are the ones seen in
# this data set; the link itself is fine in a browser.
WALL_HOSTS = ('validate.perfdrive.com', 'geo.captcha-delivery.com', 'challenges.cloudflare.com',
              '/_Incapsula_Resource', 'imperva', '/distil_r_captcha',
              'unblock.federalregister.gov')

# A server that answers TLS with the wrong SNI name breaks urllib but usually
# serves browsers fine. Report it as its own category rather than as dead.
TLS_HINTS = ('UNRECOGNIZED_NAME', 'CERTIFICATE_VERIFY_FAILED', 'SSLV3', 'WRONG_VERSION_NUMBER')

# No answer at all, even on the patient second pass: a timeout, a reset, or a
# network this machine cannot reach (an IPv6-only host from an IPv4 box). That
# says nothing about the link, so it is listed for a look, never a failure.
# DNS failure and a refused connection are not here: those do mean dead.
UNREACHABLE_HINTS = ('TIMED OUT', 'TIMEOUT', 'NETWORK IS UNREACHABLE', 'CONNECTION RESET',
                     'REMOTEDISCONNECTED', 'NO ROUTE TO HOST', 'TEMPORARILY UNAVAILABLE')


FILES = ('grablist', 'software', 'hardware', 'sneakernet', 'playbook', 'start')


def collect(names):
    """→ [(file, where, url)] — every `url` field, at any depth."""
    out = []

    def walk(name, node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == 'url' and isinstance(v, str) and v.startswith('http'):
                    out.append((name, '%s' % (node.get('id') or path), v))
                else:
                    walk(name, v, '%s.%s' % (path, k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(name, v, '%s[%d]' % (path, i))

    for name in names:
        path = os.path.join(DATA, name + '.json')
        if os.path.exists(path):
            with open(path, encoding='utf-8') as fh:
                walk(name, json.load(fh), name)
    return out


def fetch(item):
    iso, where, url = item
    ctx = ssl.create_default_context()
    # Some ministries still run expired or mis-chained certs. A cert problem is
    # worth knowing about but it is not a dead link, so it is reported, not fatal.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en;q=0.9',
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            final = r.geturl()
            moved = '' if final.rstrip('/') == url.rstrip('/') else final
            return (iso, where, url, r.status, moved, '')
    except urllib.error.HTTPError as e:
        return (iso, where, url, e.code, '', '')
    except urllib.error.URLError as e:
        return (iso, where, url, 0, '', str(e.reason)[:70])
    except Exception as e:                                    # timeouts, resets
        return (iso, where, url, 0, '', type(e).__name__ + ': ' + str(e)[:60])


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith('--')]
    workers = 4 if '--slow' in sys.argv else 12

    codes = argv or list(FILES)

    items = collect(codes)
    if not items:
        print('nothing to check — is the data in place?')
        return 1
    print('checking %d urls across %d files, %d at a time\n' % (len(items), len(codes), workers))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(fetch, items))

    # Second pass, serial and patient. Several of these sites answer in 6-20s
    # when nothing else is competing and time out under 12-way concurrency —
    # calling that "dead" is a false alarm that sends someone hunting for a
    # replacement URL that was never broken.
    retry = [i for i, r in enumerate(results) if not r[3]]
    if retry:
        print('re-checking %d slow/failed urls one at a time...\n' % len(retry))
        global TIMEOUT
        TIMEOUT = 45
        for i in retry:
            results[i] = fetch(items[i])

    ok, blocked, dead, moved, tls, unreachable = [], [], [], [], [], []
    for r in results:
        iso, where, url, status, redirect, err = r
        wall = redirect and any(w in redirect for w in WALL_HOSTS)
        if status and 200 <= status < 300:
            if wall:
                blocked.append(r)
            elif redirect:
                moved.append(r)
            else:
                ok.append(r)
        elif status in BLOCKED_CODES:
            blocked.append(r)
        elif not status and any(h in err.upper() for h in TLS_HINTS):
            tls.append(r)
        elif not status and any(h in err.upper() for h in UNREACHABLE_HINTS):
            unreachable.append(r)
        else:
            dead.append(r)

    def show(title, rows, detail):
        if not rows:
            return
        print('%s (%d)' % (title, len(rows)))
        for iso, where, url, status, redirect, err in rows:
            print('  %-22s %-4s %s' % (where, status or '-', url))
            d = detail(redirect, err)
            if d:
                print('  %-22s      → %s' % ('', d))
        print('')

    print('%d ok   %d redirected   %d blocked   %d tls   %d unreachable   %d dead\n'
          % (len(ok), len(moved), len(blocked), len(tls), len(unreachable), len(dead)))
    show('REDIRECTED — point the data at the destination', moved, lambda rd, er: rd)
    show('BLOCKED — WAF or bot wall, verify by hand, not a failure', blocked,
         lambda rd, er: rd or er)
    show('TLS — handshake refused by urllib, usually fine in a browser, check by hand', tls,
         lambda rd, er: er)
    show('UNREACHABLE — no answer from here, check by hand, not a failure', unreachable,
         lambda rd, er: er)
    show('DEAD — fix or remove these', dead, lambda rd, er: er or 'no response')

    if dead:
        print('%d dead link(s). This fails.' % len(dead))
        return 1
    print('no dead links.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
