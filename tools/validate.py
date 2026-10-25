#!/usr/bin/env python3
"""Schema + vocabulary check over the six files in data/.

Modelled on Law/tools/validate.py. app.js renders these files with no
defaulting, so a dangling reference (a grab item in a category that does not
exist, a threat on a layer that is not listed) is a row that silently falls
out of every filter, and a malformed url is a source line that goes nowhere.
The rules are the ones each file's own `_comment` states.

    python3 tools/validate.py              # every file
    python3 tools/validate.py grablist     # one file

Exit 0 clean, 1 if anything failed. Warnings do not fail the run.
software.json is generated: run tools/sync-software.py --check for its drift.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MONTH = re.compile(r'^20\d\d-(0[1-9]|1[0-2])$')
SECTIONS = ('grab', 'stack', 'iron', 'sneak', 'plan')   # panel keys in app.js SECTIONS


def load(name, errs):
    try:
        with open(os.path.join(DATA, name + '.json'), encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        errs.append('%s.json: %s' % (name, e))
        return None


def common(name, d, errs):
    if not MONTH.match(str(d.get('updated') or '')):
        errs.append('%s.json: updated must be YYYY-MM, got %r' % (name, d.get('updated')))
    if not d.get('_comment'):
        errs.append('%s.json: the _comment that documents the schema is missing' % name)


def ids(name, arr, errs, key='id', where=None):
    seen = set()
    for i, o in enumerate(arr or []):
        v = o.get(key)
        if v in (None, ''):
            errs.append('%s: %s[%d] has no %s' % (name, where or 'items', i, key))
        elif v in seen:
            errs.append('%s: %s %r is used twice' % (name, key, v))
        seen.add(v)
    return seen


def url_ok(name, where, o, errs, warns, required=False):
    u = o.get('url')
    if u in (None, ''):
        if required:
            errs.append('%s: %s has no url' % (name, where))
        return
    if not str(u).startswith('https://'):
        (warns if str(u).startswith('http://') else errs).append('%s: %s url is not https: %r' % (name, where, u))


def need(name, where, o, keys, errs):
    for k in keys:
        if o.get(k) in (None, '', []):
            errs.append('%s: %s is missing "%s"' % (name, where, k))


def check_grablist(d, errs, warns):
    n = 'grablist.json'
    tiers = ids(n, d.get('tiers'), errs, where='tiers')
    cats = ids(n, d.get('cats'), errs, where='cats')
    ids(n, d.get('items'), errs)
    for it in d.get('items') or []:
        w = 'item %r' % it.get('id')
        need(n, w, it, ['name', 'tier', 'cat', 'what'], errs)
        if it.get('tier') not in tiers:
            errs.append('%s: %s tier %r is not a tiers[].id' % (n, w, it.get('tier')))
        if it.get('cat') not in cats:
            errs.append('%s: %s cat %r is not a cats[].id' % (n, w, it.get('cat')))
        if it.get('store') not in (None, 'nas', 'usb', 'hdd', 'disc', 'paper'):
            errs.append('%s: %s store %r is not nas|usb|hdd|disc|paper' % (n, w, it.get('store')))
        for k in ('gb', 'minutes'):
            if it.get(k) is not None and not isinstance(it[k], (int, float)):
                errs.append('%s: %s %s must be a number' % (n, w, k))
        url_ok(n, w, it, errs, warns)
    return len(d.get('items') or [])


def check_software(d, errs, warns):
    n = 'software.json'
    roles = ids(n, d.get('roles'), errs, where='roles')
    ids(n, d.get('items'), errs)
    for it in d.get('items') or []:
        w = 'item %r' % it.get('id')
        need(n, w, it, ['name', 'role', 'does', 'offline'], errs)
        if it.get('role') not in roles:
            errs.append('%s: %s role %r is not a roles[].id' % (n, w, it.get('role')))
        if it.get('offline') not in ('full', 'sync', 'tethered'):
            errs.append('%s: %s offline %r is not full|sync|tethered' % (n, w, it.get('offline')))
        url_ok(n, w, it, errs, warns)
    return len(d.get('items') or [])


def check_hardware(d, errs, warns):
    n = 'hardware.json'
    tiers = ids(n, d.get('tiers'), errs, where='tiers')
    groups = ids(n, d.get('groups'), errs, where='groups')
    ids(n, d.get('items'), errs)
    if not isinstance(d.get('fx'), (int, float)) or d['fx'] <= 0:
        errs.append('%s: fx must be a positive number' % n)
    for it in d.get('items') or []:
        w = 'item %r' % it.get('id')
        need(n, w, it, ['name', 'group', 'tiers', 'spec'], errs)
        if it.get('group') not in groups:
            errs.append('%s: %s group %r is not a groups[].id' % (n, w, it.get('group')))
        for t in it.get('tiers') or []:
            if t not in tiers:
                errs.append('%s: %s tier %r is not a tiers[].id' % (n, w, t))
        for t in (it.get('tierSpec') or {}):
            if t not in tiers:
                errs.append('%s: %s tierSpec key %r is not a tiers[].id' % (n, w, t))
        if not isinstance(it.get('usd'), (int, float)):
            errs.append('%s: %s usd must be a number' % (n, w))
        if 'cloudFree' in it and not isinstance(it['cloudFree'], bool):
            errs.append('%s: %s cloudFree must be true/false' % (n, w))
        url_ok(n, w, it, errs, warns)
    # the page prints each tier's headline beside the sum of its items
    for t in d.get('tiers') or []:
        total = sum((it.get('usd') or 0) * (it.get('qty') or 1) for it in d.get('items') or []
                    if t.get('id') in (it.get('tiers') or []))
        head = t.get('usd') or 0
        if head and abs(total - head) / head > 0.05:
            warns.append('%s: tier %r headline $%s is more than 5%% off its items ($%s)' % (n, t.get('id'), head, round(total)))
    return len(d.get('items') or [])


def check_sneakernet(d, errs, warns):
    n = 'sneakernet.json'
    chans = ids(n, d.get('channels'), errs, where='channels')
    seen = set(chans)
    count = 0
    for arr in ('media', 'recipes', 'artifacts', 'uses'):
        for i, o in enumerate(d.get(arr) or []):
            count += 1
            w = '%s[%d] %r' % (arr, i, o.get('id'))
            need(n, w, o, ['id', 'name', 'channel'], errs)
            if o.get('id') in seen:
                errs.append('%s: id %r is not unique across the file' % (n, o.get('id')))
            seen.add(o.get('id'))
            if o.get('channel') not in chans:
                errs.append('%s: %s channel %r is not a channels[].id' % (n, w, o.get('channel')))
            url_ok(n, w, o, errs, warns)
    return count


def check_playbook(d, errs, warns):
    n = 'playbook.json'
    layers = ids(n, d.get('layers'), errs, where='layers')
    count = 0
    for i, t in enumerate(d.get('threats') or []):
        count += 1
        w = 'threats[%d]' % i
        need(n, w, t, ['failure', 'works', 'likelihood', 'layer'], errs)
        if t.get('likelihood') not in ('high', 'medium', 'low'):
            errs.append('%s: %s likelihood %r is not high|medium|low' % (n, w, t.get('likelihood')))
        if t.get('layer') not in layers:
            errs.append('%s: %s layer %r is not a layers[].id' % (n, w, t.get('layer')))
    for i, b in enumerate(d.get('breaks') or []):
        count += 1
        need(n, 'breaks[%d]' % i, b, ['thing', 'mitigation', 'severity'], errs)
        if b.get('severity') not in ('hard', 'soft', 'avoidable'):
            errs.append('%s: breaks[%d] severity %r is not hard|soft|avoidable' % (n, i, b.get('severity')))
    for i, p in enumerate(d.get('phases') or []):
        count += 1
        if p.get('id') != i:
            errs.append('%s: phases[%d] id must be the integer %d (a localStorage key)' % (n, i, i))
        need(n, 'phases[%d]' % i, p, ['name', 'tasks'], errs)
    ids(n, d.get('drills'), errs, where='drills')
    count += len(d.get('drills') or []) + len(d.get('cadence') or []) + len(d.get('principles') or [])
    return count


def check_start(d, errs, warns):
    n = 'start.json'
    for i, s in enumerate(d.get('steps') or []):
        if s.get('goes') not in SECTIONS:
            errs.append('%s: steps[%d] goes %r is not a panel key %s' % (n, i, s.get('goes'), SECTIONS))
    for i, s in enumerate(d.get('sections') or []):
        if s.get('key') not in SECTIONS:
            errs.append('%s: sections[%d] key %r is not a panel key' % (n, i, s.get('key')))
    ids(n, d.get('premise'), errs, where='premise')
    ids(n, d.get('limits'), errs, where='limits')
    return len(d.get('steps') or [])


CHECKS = {'grablist': check_grablist, 'software': check_software, 'hardware': check_hardware,
          'sneakernet': check_sneakernet, 'playbook': check_playbook, 'start': check_start}


def main():
    names = sys.argv[1:] or list(CHECKS)
    errs, warns, lines = [], [], []
    for name in names:
        if name not in CHECKS:
            print('unknown file %r; one of %s' % (name, ', '.join(CHECKS)))
            return 1
        d = load(name, errs)
        if d is None:
            continue
        common(name, d, errs)
        lines.append('%s.json: %d entries' % (name, CHECKS[name](d, errs, warns)))
    for w in warns:
        print('warn  ' + w)
    for e in errs:
        print('FAIL  ' + e)
    print('\n'.join(lines) + '\n')
    if errs:
        print('%d error(s).' % len(errs))
        return 1
    print('schema OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
