# Carino Offline

Planning an intranet you can still use when the internet is taken away →
**[offline.carino.systems](https://offline.carino.systems)**

One page for the question *"what happens to everything I run if DNS, my domain, or transit
gets blocked?"* — and, more usefully, *what do I download, buy and build before that day.*
It opens on **00 · Start**, which states the argument in three cards and routes you into the
other five sections. Everything runs in the browser; the site is itself fully offline-capable,
which is the minimum it owes its own subject.

The thesis is **decoupling, not hiding**. Nothing here is about evading anyone. It's about
making the internet a *sync channel* instead of a *dependency*, so the media, games,
documents, medical imaging and reference material that actually get used live on hardware
in the building, on a network you own, under names you define, behind certs you sign.

The full written plan this site is built from lives in
[`OFFLINE.md`](OFFLINE.md) — the site is its interactive form. Keep the two in sync.

## The six sections

The layout is a **single-screen tabbed app**: the page itself never scrolls. The six section
tabs live in the **shared Carino navbar** — `carino-navbar.js` relocates the
`[data-carino-actions]` tab strip into its right-hand cluster — and one content panel fills
the viewport below the section description and search bar. Each tab is backed by one editable
JSON file in [`data/`](data/); the search bar filters the active panel, except on **Start**,
where it searches all five of the others at once.

| Tab | Data | Contents |
| --- | --- | --- |
| **00 · Start** | [`start.json`](data/start.json) | The argument in three cards, the five sections with live counts, a numbered route through them, the `carino-offline` image, and 6 stated limits |
| **01 · Triage** | [`grablist.json`](data/grablist.json) | The grab list — what to download, ordered by how long it takes |
| **02 · Stack** | [`software.json`](data/software.json) | 68 pieces of self-hosted software across 11 roles |
| **03 · Iron** | [`hardware.json`](data/hardware.json) | 59-line bill of materials in three budget tiers |
| **04 · Sneakernet** | [`sneakernet.json`](data/sneakernet.json) | 6 physical channels, 11 media, 8 recipes, 12 printed artifacts, 23 uses |
| **05 · Playbook** | [`playbook.json`](data/playbook.json) | 13 threats, 7 rollout phases, 10 things that genuinely don't work offline |

## Start

The default panel (`#start`), and the only one that reads the other files rather than its own.
The five section cards print their own counts, and `app.js` derives every one of them at render
time out of the file it points at — `START_COUNT` in `app.js` counts `grablist.items`,
`software.items`, `hardware.items`, the four Sneakernet arrays and the three Playbook ones — so
a card can never disagree with the list behind it, and no count is stored in
[`start.json`](data/start.json). A section whose file failed to load shows a dash instead of a
confident zero. Searching from Start searches **all five** other files at once and hands each
hit to the same detail dialog its own section would, capped at four rows per section so the
panel stays a screen rather than becoming a scroll.

The rest of the panel is `start.json`: three `premise` cards (only the first sentence of the
first one is printed — the rest opens in the dialog), the five numbered `steps`, whose `goes`
field must be one of the panel keys `app.js` declares in `SECTIONS` (`grab`, `stack`, `iron`,
`sneak`, `plan`), and six stated `limits`. The existing hashes — `#triage`, `#stack`, `#iron`,
`#sneakernet`, `#playbook` — are the fleet-hub contract and are unchanged; Start added `#start`
and took the default.

It also carries the one row on the site that points at hardware you can actually build:
**`carino-offline`**, the headless Fedora bootc image from
[Custom-Images](https://github.com/MiguelCarino/Custom-Images) ([images.carino.systems](https://images.carino.systems))
that serves the LAN's names, time, trust, packages and content. It is an image rather than a
setup script because the work is system integration a post-install run cannot own: arbitrating
port 53 against `systemd-resolved`, getting an internal CA into the trust store, pointing dnf at
a LAN mirror, and holding a correct clock with no upstream NTP reachable. That repo points back
here for the *why*. The row's `note` says plainly that no registry ref is published yet, so
today it is build-it-yourself — the `bootc switch` line shown is the shape it will take, not a
download that exists. Leave that note in place while it is still true.

## The grab list

The centrepiece, and the oldest idea here — it comes from a post the owner wrote years ago.
Its insight is that during a shutdown the useful question isn't *"what's important?"* but
**"what fits in the time I have left?"**, so the list is tiered by **wall-clock download
time**, not by category:

- **Fastest** — under an hour for the whole tier
- **Average** — 1–3 hours
- **Longest** — 4–14 hours
- **Wouldn't** — deliberate non-goals

Pick a **time budget** (1 hour / 3 hours / 14 hours / everything) and the page walks the list
in tier order, marking what still fits and dimming what doesn't. Tick items off as you get
them — the state persists in `localStorage`, ticked items free up budget, and a readiness bar
tracks how much of the kit you actually hold. Export the result as a **Markdown checklist**,
a runnable **`fetch-list.sh`**, or raw JSON.

Sizes assume a **300 Mbit/s sustained link (≈ 2.25 GB/minute)**; items gated by rate limits,
pagination or hand-curation rather than bandwidth carry a note saying so. The numbers are the
point — a tier whose contents don't add up to its own label is a lie the interface tells.

The **Wouldn't** tier is deliberate and stays. It excludes copyrighted media on the reasoning
that an internet shutdown doesn't end media *distribution* — discs, vinyl and other offline
formats still exist, and with USB storage and hard drives you can simply pay for digital
copies. It's an argument, not an oversight, and the Sneakernet section is that argument built
out. Those items are excluded from every total and can't be ticked.

## Offline ratings

Every entry in **Stack** carries the rating the whole site is organised around:

- **Full** — keeps working indefinitely with the WAN cable pulled
- **Needs sync** — works offline, but the *content* rots without a periodic refresh
- **Tethered** — needs a vendor account or cloud to function

The test for *sync* is whether the content goes stale, not whether it was downloaded once — a
local LLM weight file is a one-time fetch, a CVE feed is not. Every `sync` and `tethered`
entry must carry an **escape** field saying what you do about it; `full` entries must not.
Three tethered entries are listed purely as warnings.

## Iron

Three tiers — **Lean ≈ $5.2k**, **Balanced ≈ $13.6k** (recommended), **Extended ≈ $25k** —
priced for the Mexican market and shown in USD with MXN derived from the file's own `fx`
rate. Switching tier re-filters the list and recomputes the total live, so the headline and
the line items always reconcile.

The governing rule is **no cloud-tethered hardware**: anything needing a vendor account to
function is either excluded or carries an explicit escape path, and printers, 3D printers and
appliances are planned onto a VLAN with no WAN route at all.

Prices and models age fast, so every data file carries an `updated` field (`YYYY-MM`) that the
page renders as a visible stamp. Bump it whenever you refresh figures.

## Design

**One line per thing, detail on click.** Every list is a row carrying a name, a one-clause
gist and the two numbers you scan by — size and time, price and quantity, capacity and cost
per TB. Prose, shell commands, alternatives and caveats live in a **detail dialog** that opens
on click (or Enter, or Space; Escape and the backdrop close it). A 66-item list stays a list
instead of becoming an essay, and nothing needs a second screen to be comparable.

The two longest sections — Sneakernet and Playbook — have **sub-navigation** so exactly one
block is on screen at a time, rather than five stacked ones. Rarely-pressed controls (select,
export) sit behind small popup menus, and the grab-list totals are a single strip rather than
a bank of tiles. The page itself still never scrolls; only the active panel does.

`index.html` holds all CSS; `app.js` holds all rendering, filtering and export; the six data
files are fetched at runtime (so serve it over http — `python3 -m http.server` locally, or
GitHub Pages — not `file://`). No build step, no framework, no runtime dependencies, and
**no external resources of any kind** — fonts are self-hosted and nothing is loaded from a
CDN. Shares the Carino navbar (`carino-navbar.js` + `carino-clock.js`), language switcher and
branding with the rest of carino.systems. UI chrome is translated into Spanish, Brazilian
Portuguese, Japanese and Russian; the data files stay English on purpose.

To extend any section, edit its JSON — no code changes. Each file's `_comment` documents its
own schema.

## Notes

- Planning and reference tool. It recommends; it doesn't configure anything or touch your
  network.
- Sizes, prices and download times are honest estimates that age. Verify before spending.
- Install commands are real but abbreviated — read the upstream docs before running them.
- Nothing here is legal advice. Some things genuinely have no offline answer; the Playbook
  section names them rather than pretending otherwise.

## Licensing

**Mine — GNU Affero General Public License v3.0 or later.** Everything in this
repository *except* the paths listed below. Copyright © 2026 Miguel Carino.
Full terms in [LICENSE](LICENSE).

**Not mine.** The files below are third-party works redistributed here. This
project's licence does not cover them and could not: they are not mine to
relicense. Each keeps its own terms, and each carries its own notice.

| Path | What it is | Licence | Notice |
| --- | --- | --- | --- |
| [`fonts/`](fonts/) | IBM Plex Mono, IBM Plex Sans, Red Hat Display | SIL OFL 1.1 | [`fonts/OFL.txt`](fonts/OFL.txt) |

Those files travel with any fork, mirror or repackaging of this repository, and
their notices must travel with them.
