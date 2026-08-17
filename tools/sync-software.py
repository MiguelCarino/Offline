#!/usr/bin/env python3
"""Regenerate data/software.json from the fleet software catalogue.

    python3 tools/sync-software.py            # write
    python3 tools/sync-software.py --check    # exit 1 if it would change

WHY THIS EXISTS
---------------
The Stack panel and software.carino.systems were two hand-maintained lists of
the same software. They had drifted to the point where only 19 of the Stack's
68 entries existed in the catalogue at all. One list is now canonical — the
catalogue — and this rebuilds the other from it.

WHY A COPY RATHER THAN A FETCH
------------------------------
Offline must keep working with the WAN cable pulled; that is the entire claim
of the site. A page that fetched its own data from another host at runtime
would break in exactly the situation it is written about. So the data is
copied at edit time, the way the fleet's shared navbar files are.

WHY AN EXTRACT RATHER THAN THE WHOLE FILE
-----------------------------------------
The catalogue is ~500 KB for 1358 entries. Offline draws 68 of them. Shipping
the other 1290 to a site about slow links — one that just dropped 405 KB of
unused font faces for the same reason — would be indefensible.

THE CONTRACT
------------
A catalogue entry belongs to the Stack when it carries an `offline` block:

    "offline": { "id", "role", "rating", "icon", "why",
                 "lang"?, "platform"?, "ram"?, "disk"?, "install"?,
                 "escape"?, "alts"?, "tags"? }

`rating` is full | sync | tethered and is the verdict the panel prints. To add
software to the Stack, add that block in the catalogue and re-run this. Editing
data/software.json by hand works until the next run and then silently reverts,
which is why --check exists: wire it into anything that would rather find out
early.
"""

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
OFFLINE = HERE.parent / 'data' / 'software.json'
# Sibling checkout. The fleet lives side by side under one directory; there is
# no package registry in this workflow and adding one for a JSON file would be
# a worse trade than a relative path that is obvious when it breaks.
CATALOGUE = HERE.parent.parent / 'SoftwareCatalog' / 'assets' / 'json' / 'software.json'

RATINGS = ('full', 'sync', 'tethered')

# The order the panel groups by. Roles absent from the catalogue simply produce
# no group, so this can name more than the data currently has.
ROLE_ORDER = ['core', 'storage', 'mirrors', 'ops', 'security', 'knowledge',
              'media', 'games', 'comms', 'ai', 'medical']


def load(path):
    if not path.exists():
        sys.exit(f'not found: {path}\n'
                 f'This expects the fleet checked out side by side under one directory.')
    with path.open() as fh:
        return json.load(fh, object_pairs_hook=collections.OrderedDict)


def build_items(catalogue):
    """Catalogue entries carrying an `offline` block, in the panel's shape."""
    items, seen = [], {}
    for entry in catalogue:
        block = entry.get('offline')
        if not isinstance(block, dict):
            continue

        ident = str(block.get('id') or '').strip()
        if not ident:
            sys.exit(f'catalogue entry "{entry.get("name")}" has an offline block with no id')
        if ident in seen:
            sys.exit(f'two catalogue entries claim offline id "{ident}": '
                     f'{seen[ident]} and {entry.get("name")}')
        seen[ident] = entry.get('name')

        rating = str(block.get('rating') or '')
        if rating not in RATINGS:
            sys.exit(f'"{entry.get("name")}" has rating {rating!r}; '
                     f'expected one of {", ".join(RATINGS)}')

        item = collections.OrderedDict()
        item['id'] = ident
        item['role'] = block.get('role')
        item['name'] = entry.get('name')
        item['icon'] = block.get('icon')
        # The catalogue's own one-liner is what the panel's row shows, so a
        # description edited there lands here — which is the whole point.
        item['does'] = entry.get('description')
        item['why'] = block.get('why')
        item['offline'] = rating
        if entry.get('licence'):
            item['license'] = entry['licence']
        # Everything else the block carries, in the panel's field order. Listed
        # rather than swept so the output order is stable, but `extra` catches
        # anything added to the catalogue later — a new field showing up in the
        # data must reach the panel, not vanish between the two files.
        ordered = ('lang', 'platform', 'ram', 'disk', 'install')
        for key in ordered:
            if block.get(key) not in (None, '', []):
                item[key] = block[key]
        if entry.get('link'):
            item['url'] = entry['link']
        for key in ('escape', 'alts', 'tags'):
            if block.get(key) not in (None, '', []):
                item[key] = block[key]
        known = set(ordered) | {'id', 'role', 'rating', 'icon', 'why',
                                'escape', 'alts', 'tags'}
        for key, value in block.items():
            if key not in known and value not in (None, '', []):
                item[key] = value
        items.append(item)

    order = {role: i for i, role in enumerate(ROLE_ORDER)}
    items.sort(key=lambda it: (order.get(str(it.get('role')), 99), str(it.get('name')).lower()))
    return items


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true',
                    help='report drift and exit 1 instead of writing')
    args = ap.parse_args()

    catalogue = load(CATALOGUE)
    current = load(OFFLINE)

    out = collections.OrderedDict()
    # Everything that is not the item list is Offline's own: the role labels the
    # panel groups by, the comment, the stamp. Regenerating those would throw
    # away editing that never belonged to the catalogue.
    for key, value in current.items():
        if key != 'items':
            out[key] = value
    out['items'] = build_items(catalogue)

    text = json.dumps(out, indent=2, ensure_ascii=False) + '\n'
    old = OFFLINE.read_text()

    if args.check:
        if text != old:
            print(f'data/software.json is stale — {len(out["items"])} entries in the '
                  f'catalogue, run: python3 tools/sync-software.py')
            return 1
        print(f'data/software.json is current ({len(out["items"])} entries)')
        return 0

    OFFLINE.write_text(text)
    verb = 'unchanged' if text == old else 'rewritten'
    print(f'data/software.json {verb} — {len(out["items"])} entries from {CATALOGUE.name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
