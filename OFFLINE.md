# OFFLINE.md — Carino Offline & Intranet Infrastructure Plan

> **Status:** planning draft · **Date:** 2026-08-15 · **Owner:** Miguel Carino
> **Goal:** be able to unplug the WAN on any given morning and lose *convenience*, not *capability*.
> **Budget posture:** deliberately mid-range. Not homelab-on-a-shoestring, not enterprise rack-and-support-contract.

---

## 0. Why this document exists

The public fleet (`carino.systems` + ~20 subdomains) depends on three things that a government can revoke without touching my hardware:

1. **DNS** — resolvers can be poisoned, blocked, or ordered to NXDOMAIN a zone.
2. **The domain itself** — a registrar or ccTLD operator can suspend or seize it.
3. **Transit / CA reachability** — ISP-level filtering, or simply not being able to reach Let's Encrypt to renew a cert, kills HTTPS on a schedule.

Hosting is the last bastion I control end-to-end, and it's the one worth hardening. The strategy is **not** "hide from the state." It's **decoupling**: build so that the things I and my clients actually use — media, games, documents, medical imaging, reference knowledge, software updates — live on hardware in the building, on a network I own, reachable by names I define, over certs I sign. Then the internet becomes a *sync channel*, not a *dependency*.

### The design principle

> **Everything must work with the WAN cable pulled. Internet is an optimization, not a requirement.**

Corollary: **the same URL must work online and offline.** No one should learn two sets of addresses. Split-horizon DNS makes `retina.carino.systems` resolve to a LAN IP inside the building and a public IP outside it. Bookmarks, printed QR codes, and NFC tags never need to change.

### What I already have going for me

The fleet is *accidentally pre-adapted* to this. Per existing convention:

- Every tool is **client-side static HTML/JS** — no server-side runtime, no database.
- **No CDNs.** Fonts are self-hosted (`fonts/carino-fonts.css`), libraries are vendored.
- The **Carino Bridge** (`carino-bridge.js`) does page-to-page file handoff locally — no upload server.
- Carino-PACS is store-only Python/pynetdicom — it never needed the internet.

Which means: **the fleet already runs from a USB stick.** Phase 1 is mostly packaging, not rewriting. That's the cheapest big win available and it's why this plan is realistic.

---

## 1. Threat model — what breaks, and what actually fixes it

Be honest about which countermeasure solves which failure. Most "resilience" spending solves nothing.

| Failure | Likelihood | What actually keeps working | What does *not* help |
|---|---|---|---|
| Public DNS resolvers block the zone | High | Own recursive resolver + authoritative internal zone | VPN alone (still needs DNS) |
| ISP DPI blocks the domain / SNI | High | Internal names, IP-literal fallback, overlay net | Changing DNS provider |
| Domain suspended or seized | Medium | `.internal` names + internal CA + printed IP/overlay cards | Anything DNS-based |
| Can't reach Let's Encrypt → certs expire | Medium (follows any block) | Internal CA (step-ca) with ACME, 10-yr root | Long-lived public certs (max 47 days by 2029) |
| National transit filtering / throttling | Medium | LAN-local everything; sneakernet for bulk | Faster WAN |
| Full internet cut (regional/national) | Low, non-zero | Local mirrors, media, games, knowledge base, LoRa mesh | Cloud backup |
| Power loss | Medium (Mexico) | UPS + LFP station, graceful shutdown | Bigger server |
| Hardware failure while offline | Medium | Spare parts on shelf, ZFS redundancy, second site | Warranty (RMA needs shipping+internet) |
| Cloud SaaS locks me out | Medium | Self-hosted equivalents already in production | Exporting data "later" |
| Vendor kills a device via cloud (e.g. printers) | Medium | LAN-only-capable hardware chosen at purchase time | Firmware rollback after the fact |

**Two failure modes I refuse to design around:** targeted state adversary with physical access, and legal compulsion. Those aren't engineering problems. This plan handles *infrastructure denial*, not *coercion*.

---

## 2. Architecture

### 2.1 Layers

```
┌─ L5  SNEAKERNET ─── BD-R/M-DISC · USB · printed docs · NFC cards · 3D-printed enclosures
│                     (the layer that survives everything, moves at 60 km/h)
├─ L4  RADIO ─────── Meshtastic LoRa (text, km range) · optional ham/Winlink
├─ L3  OVERLAY ───── WireGuard → offshore VPS · Yggdrasil · obfuscated transports
│                     (only for reaching OUT; nothing internal depends on it)
├─ L2  INTRANET ──── VLANs · MikroTik core · own DNS · own CA · own NTP  ← THE PRODUCT
├─ L1  COMPUTE ───── Proxmox node A (primary) + node B (replica, second site)
└─ L0  POWER ─────── UPS + LiFePO4 station (+ optional solar)
```

The rule: **L2 never depends on L3 or above.** If the overlay dies, the intranet doesn't notice.

### 2.2 Naming & addressing

Three names for every service, in fallback order:

| Tier | Example | Works when | Cert |
|---|---|---|---|
| 1. Public name, split-horizon | `retina.carino.systems` | Always (LAN answer inside, WAN answer outside) | Public ACME *or* internal CA |
| 2. Internal-only name | `retina.carino.internal` | Domain seized, DNS blocked | Internal CA (step-ca) |
| 3. IP literal | `https://10.20.0.30` | DNS entirely dead | Internal CA w/ IP SAN |

`.internal` is ICANN-reserved for private use (2024) — it will never collide with a real TLD. Tier 3 addresses go on the **printed IP card** (§6.2) and encoded into NFC tags. That card is the "break glass in case of DNS" artifact.

Also run mDNS/Avahi so `http://hub.local/` works with zero configuration for guests.

### 2.3 VLAN plan

| VLAN | Subnet | Purpose | WAN route? |
|---|---|---|---|
| 10 | 10.10.0.0/24 | Management (IPMI, switch, AP, hypervisor) | No |
| 20 | 10.20.0.0/24 | Core services (Proxmox guests, storage) | Egress-only, filtered |
| 30 | 10.30.0.0/24 | Trusted clients (my workstations) | Yes |
| 40 | 10.40.0.0/24 | Printers, 3D printers, IoT, NFC readers | **No** (cloud-tether cutoff) |
| 50 | 10.50.0.0/24 | Guests / kiosk / client devices | Internet only, no LAN |
| 60 | 10.60.0.0/24 | Lab / DMZ / public hosting reverse proxy | Yes |
| **99** | **10.99.0.0/24** | **Air-gapped PACS + medical imaging** | **No route, no gateway** |

**VLAN 40 is where cloud-dependency goes to die.** Every printer, every 3D printer, every appliance gets zero WAN. If it can't work that way, it doesn't get bought. VLAN 99 is a compliance feature as much as a security one — an air-gapped PACS is dramatically easier to argue under **LFPDPPP** and **NOM-024-SSA3** than a cloud one. That's a *sellable* property for the Carino Systems commercial side, not just a defensive one.

### 2.4 Core services

| Service | Software | Why this one |
|---|---|---|
| Hypervisor | **Proxmox VE 9** + ZFS | LXC for light services, KVM for the rest, snapshots + `zfs send` replication built in |
| Keystone OS | **`carino-offline`** — Fedora bootc image, headless | DNS + time + trust + mirror + content ship as one image that updates and rolls back with `bootc upgrade`, not as a package list run after install — §2.5 |
| DNS | **Technitium** (primary) + Unbound (recursor) | GUI, own authoritative zones, split-horizon, DoH/DoT server, DNSSEC, block lists |
| Internal CA | **step-ca** (smallstep), 10-yr root | Real ACME server → Caddy renews internally, forever, with no internet |
| Reverse proxy | **Caddy** | ACME client pointed at step-ca; one-line config per service |
| Time | **chrony** + **GPS/PPS on a Pi** (~$90) | *Nobody plans for this.* No NTP → cert validation and TOTP break in weeks |
| Identity | **Authelia** + LLDAP | Single sign-on across the intranet, offline TOTP |
| Secrets | **Vaultwarden** | Passwords + TOTP seeds local; printed emergency sheet in the safe |
| Monitoring | Uptime Kuma + Prometheus/Grafana | Know a disk is dying *before* the shop closes |
| Dashboard | **Homepage** | The `http://hub/` landing page; mirrors the public hub's search-first design |
| Backup | ZFS snapshots → replica → **restic** → cold HDD → BD-R | §7 |

**GPS-disciplined NTP is the single most underrated item on this list.** Cut the internet and clocks drift; drifted clocks break TLS, TOTP, DICOM timestamps, and log correlation. A $90 GPS hat removes an entire class of "why is everything broken three weeks later."

### 2.5 The keystone box — `carino-offline`

The services above are one machine's worth of work, and that machine is built from an image rather than from a checklist. `carino-offline` is a purpose in the Custom-Images repo (`config/purposes/offline.conf`, reasoning in `research/manifest-offline.json`) whose own `DESCRIPTION` reads:

> Intranet keystone appliance: authoritative and recursive DNS, LAN time, internal-CA trust store, an RPM mirror and offline content over HTTP, and the sneakernet media pipeline

It is 18 packages on a headless Fedora bootc base — an appliance-sized list, not a catalogue — and it pins `DE="headless"` for the reason recorded in its `PIN_REASON`: *"an appliance that has to answer on the LAN's own ports before anything else on the network is up: DNS, NTP and HTTP are its interfaces and SSH is its console, so a desktop would only add attack surface, RAM and packages to patch to the one box the network cannot lose."* Note this is **not** the `carino-offline.iso` of §5.1 — that one is the browser-side fleet bundle. This is the server it is served from.

It is an image rather than a package list run after install because four of its decisions are system integration a post-install script cannot own:

| Integration | What the image does | Why a script can't |
|---|---|---|
| **Port 53** | `systemd-resolved.service` is **masked**, not disabled, and `/etc/resolv.conf` is re-owned by tmpfiles to a file in `/usr` containing `nameserver 127.0.0.1`; NetworkManager gets `dns=none` + `rc-manager=unmanaged` | resolved is installed *and* preset-enabled on the base (`enable systemd-resolved.service` appears in both `90-default.preset` and `90-systemd.preset`), so `systemctl disable` does not survive a preset re-run. And masking it without re-owning `resolv.conf` — a symlink into `/run/systemd/resolve/` — leaves the box with no resolver at all, i.e. a script that can no longer resolve the name of its own source |
| **Internal CA** | Ships the mechanism only: both anchor directories, plus a first-boot unit that runs `update-ca-trust extract` so a root dropped in by kickstart, cloud-init or USB *before* first boot is actually trusted | The extract has to run on a booted machine with the trust store in place; skipping it presents as "the certificate is valid on the server and untrusted on the server," which reads as a cert fault and is not one. No root key is baked, and none can be — a private key inside an image is the same private key on every install |
| **dnf at a LAN mirror** | `carino-mirror.repo.example` sits in `/usr/share/carino-offline/`, deliberately **not** in `/etc/yum.repos.d/`; `gpgcheck` stays on with Fedora's own keys, which is what makes a plain-HTTP mirror safe | A repo file whose `baseurl` does not resolve makes *every* dnf command on the box fail, including the ones a rescue admin runs while fixing DNS. On bootc the appliance updates from a registry anyway, so an active repo file buys it nothing — the file is what you hand to clients |
| **Clock with nothing upstream** | `local stratum 10` in `/etc/chrony.conf.d/`, plus a build-time `confdir` line appended to Fedora's `chrony.conf` because the package ships no drop-in directory at all | Without `local stratum 10` every NTP answer carries leap indicator 3 and every client correctly rejects it, so the building's clocks free-run silently from the moment the WAN is cut. That is the failure §2.4 calls the most underrated one here, and it is a single directive nothing installs for you |

**Two substitutions against §2.4, stated rather than hidden.** Neither Technitium nor step-ca can come from a Fedora 44 RPM: the manifest records `dnf repoquery` returning nothing for `step-ca` and `step-cli`, and Technitium is a .NET application distributed as a tarball or a container image, which on a bootc host is exactly the class of thing the image cannot keep updatable. The image substitutes **bind** — the only thing in Fedora 44 that is authoritative and recursive in one process, which is what split-horizon `view` clauses need — and covers certificates with Caddy's embedded CA for the sites Caddy fronts plus **easy-rsa** for everything else. The cost is real and is the gap: no LAN-wide internal ACME server, so a printer or a switch gets a manually issued cert with a manually tracked expiry, and whoever wanted the DNS GUI gets `named.conf` and a text editor.

**Honest state, as of 2026-08.** No registry ref is published, so there is no working `bootc switch` line yet — today it is a build-it-yourself artifact: clone Custom-Images and build locally. Nothing in the manifest has been booted either; package names and versions were resolved against live Fedora 44 repos and the system facts (preset state, the `resolv.conf` symlink, `chrony.conf` contents) were checked inside the already-built parent layer, but no ISO has been installed and no unit has started. The piece most likely to bite first is the port-53 arbitration. And the content is not in the image and never will be — roughly 240 GB of Kiwix ZIMs plus up to 600 GB of mirror against a manifest that installs in the low hundreds of megabytes, so a freshly built box is a correctly-built box that does nothing until §3 arrives by rsync or by courier.

---

## 3. Content — what actually lives on the box

Storage sizing is driven by this table, not by "how big a disk can I afford."

### 3.1 Knowledge (the offline internet)

| Set | Tool | Size | Notes |
|---|---|---|---|
| Wikipedia ES + EN, full w/ images | **Kiwix** (`.zim`) | ~153 GB | `nopic` variants ~60 GB if tight |
| Wikivoyage, Wiktionary, Wikimed, Wikibooks | Kiwix | ~40 GB | Wikimed is genuinely useful in a clinic |
| Stack Exchange full dump | Kiwix / local Sphinx | ~100 GB | Programming lifeline offline |
| Project Gutenberg | Calibre-Web | ~80 GB | Public domain, distributable |
| OpenStreetMap México + tiles | Protomaps / OpenMapTiles | ~3–5 GB | A country extract is small; the *planet* basemap is ~120 GB |
| Dev docs (DevDocs, Zeal, man pages) | DevDocs self-hosted | ~2 GB | |
| Khan Academy / edu content | **Kolibri** | ~50 GB | Optional; good for client-facing offering |
| Web snapshots of pages I rely on | **ArchiveBox** | ~200 GB, grows | Point it at the bookmark bar, run monthly |
| **Local LLM + RAG over my docs** | Ollama / llama.cpp + open-weight 30B | ~40 GB | See §5.4 — this is the real "offline oracle" |

### 3.2 Software mirrors (the maintainability layer)

Without these, an offline machine slowly rots. Be **selective** — mirror the arch and releases you actually run, not everything.

| Mirror | Tool | Size (selective) |
|---|---|---|
| Fedora (x86_64, current + n-1) | `rsync` + `createrepo` | ~600 GB |
| Debian/Ubuntu LTS (amd64/arm64) | `apt-mirror` / aptly | ~800 GB |
| PyPI (partial, on-demand) | **devpi** (pull-through) | ~200 GB |
| npm | **Verdaccio** (pull-through) | ~150 GB |
| Container images | `registry:2` pull-through / Harbor | ~300 GB |
| Flatpak | ostree mirror | ~150 GB |
| Windows ISOs, drivers, portable tools | plain SMB share | ~300 GB |
| **Game downloads (Steam/Epic/GOG/Blizzard)** | **LANCache** | 2–5 TB |

**LANCache deserves special mention.** It transparently caches game/CDN downloads on the LAN — one machine downloads, every other machine gets it at line speed. It also turns a flaky or throttled WAN into a non-issue for large downloads. It's ~free and it's the highest-value single container in this whole plan for the games use case.

### 3.3 Media

| Service | Software | Notes |
|---|---|---|
| Video | **Jellyfin** | No account, no cloud, hardware transcode via iGPU |
| Music | **Navidrome** | Subsonic API → works with every offline mobile client |
| Audiobooks/podcasts | **Audiobookshelf** | Downloads for offline-offline (on the phone) |
| Comics/manga | **Komga** or Kavita | |
| Books/PDF | **Calibre-Web** | |
| Photos | **Immich** | Replaces Google Photos; the phone-backup story matters |
| Documents | **Paperless-ngx** | OCR'd, searchable; ties into the Media suite's OCR work |
| Files/calendar/contacts | **Nextcloud** | CalDAV/CardDAV so phones sync with no Google |

**On content sourcing:** the library is built from material I can legitimately hold and, where relevant, redistribute — my own productions, purchased DRM-free media, public domain (Gutenberg, Archive.org), Creative Commons, and Kiwix's openly-licensed corpora. That distinction matters most at L5: *personal archiving* and *pressing 200 discs to hand out* are different acts under the Ley Federal del Derecho de Autor. The distributable catalog (§6.1) is deliberately built from libre + owned + self-produced content so the sneakernet layer is unambiguously mine to ship.

### 3.4 Games

DRM is the enemy of offline. Priority order for acquisition:

1. **GOG** — DRM-free installers, archive them as files. *This is the single most offline-friendly game source that exists.* Buy here by default.
2. **Native/libre LAN games** — 0 A.D., OpenTTD, Xonotic, Veloren, Mindustry, Teeworlds, The Battle for Wesnoth, SuperTuxKart. Zero licensing friction, run a permanent server.
3. **Self-hosted servers** — Minecraft (Java, offline-mode LAN), Factorio (headless), Valheim, Terraria. Managed via Pterodactyl or plain compose.
4. **Steam** — works in Offline Mode *if* you log in periodically and pre-download. Fragile. Combine with LANCache. Treat as best-effort, not foundation.
5. **Retro/emulation** — **RomM** for cataloging + **EmulatorJS** for browser play, Batocera on a dedicated box for TV. My own dumps of my own cartridges/discs.

Plus **Asobi** (the existing Shogi/Hanafuda repo) — already a self-contained `window.GAMES` module set, already offline-capable. It ships in the Fleet Offline Edition as-is.

### 3.5 Communication (when the internet is gone but people aren't)

| Layer | Tool | Range |
|---|---|---|
| Intranet chat | **Matrix/Conduit** + Element, or Prosody (XMPP, lighter) | Building |
| Voice | **Mumble** | Building |
| Intranet email | docker-mailserver, internal-only domain | Building |
| Off-grid text | **Meshtastic** LoRa, 915 MHz | 2–15 km line of sight |
| Emergency | Ham (IFT licence, XE callsign) / Winlink | Regional |

Meshtastic is $48/node and needs no infrastructure at all — that's the cheapest genuine resilience in this document.

---

## 4. Bill of materials

Prices are estimates for **Mexico, mid-2026** (CyberPuerta / PCEL / Amazon MX / Mercado Libre), USD @ ~18.5 MXN. Recertified enterprise drives assumed for bulk storage — they're the correct call at this tier.

### 4.1 Tier B — **Balanced (recommended)**

| # | Item | Spec | USD |
|---|---|---|---|
| **Compute & storage** ||||
| 1 | Node A: DIY Proxmox server | AM5 Ryzen 7700, 64 GB ECC, ASRock Rack B650D4U | 950 |
| 2 | NVMe (VM pool, mirrored) | 2 × 2 TB Gen4 | 220 |
| 3 | Bulk storage | 6 × 16 TB recert Exos/Ultrastar → RAIDZ2 ≈ 60 TB usable | 1,350 |
| 4 | HBA + case + PSU | LSI 9300-8i IT, Jonsbo N4, 750 W Gold | 380 |
| 5 | Node B: replica @ second site | N305 mini-PC + 4-bay DAS + 3 × 16 TB | 1,100 |
| **Network** ||||
| 6 | Core router | MikroTik RB5009UG+S+IN | 230 |
| 7 | Switch | CRS310-1G-5S-4S+IN (10G SFP+) | 200 |
| 8 | 2.5G access switch | CRS310-8G+2S+IN — **PoE-in only, supplies none** | 190 |
| 9 | Wi-Fi | 3 × MikroTik cAP ax | 390 |
| 10 | Cabling, patch panel, keystones, DACs, **PoE injectors** | Cat6A + 4 × 802.3at injector | 270 |
| **Power** ||||
| 11 | UPS | 2 × APC Back-UPS Pro 1500VA + NUT | 460 |
| 12 | LiFePO4 station | EcoFlow Delta 2 (1 kWh) for core rack | 620 |
| **Optical / archive** ||||
| 13 | BD burner (internal) | Pioneer BDR-212 + **1 cold spare** | 240 |
| 14 | BD burner (external) | Pioneer BDR-XD08 | 200 |
| 15 | Duplicator tower | 1:3 BD | 340 |
| 16 | Media stock | 25× BD-R XL 100 GB, 10× M-DISC BD 100 GB, 100× DVD-R, 50× BD-R 25 GB | 620 |
| 17 | Cold rotation HDDs | 2 × 20 TB external + Pelican-style case | 720 |
| 18 | Fireproof media safe | | 210 |
| **Print** ||||
| 19 | Mono laser | Brother HL-L6210DW (duplex, high-yield) | 340 |
| 20 | Color + **disc printing** | Epson EcoTank L8180 | 630 |
| 21 | Label printer | Brother QL-820NWB (asset + NFC labels) | 200 |
| 22 | Finishing | Laminator + guillotine + binding | 170 |
| 23 | Consumables (yr 1) | Toner, ink, printable discs, labels, paper | 350 |
| **3D print** ||||
| 24 | FDM printer | **Prusa Core One / MK4S** (fully local, no cloud) | 1,050 |
| 25 | Filament + dry storage | PETG/ASA/PLA + dry box | 260 |
| 26 | Resin (optional, fine parts) | Elegoo Mars 5 + resin + wash/cure | 320 |
| **NFC / identity** ||||
| 27 | Reader/writer | ACR122U + spare PN532 | 80 |
| 28 | Multi-tool | Flipper Zero (NFC/RFID/IR/sub-GHz diagnostics) | 210 |
| 29 | Tag stock | 200 × NTAG215 stickers, 100 × PVC NFC cards, 20 × NTAG216 discs | 160 |
| **Radio / misc** ||||
| 30 | Meshtastic | 4 × Heltec V3 + antennas + enclosures | 190 |
| 31 | GPS NTP | Pi 4 + GPS/PPS HAT + antenna | 90 |
| 32 | Kiosk terminal | Mini-PC + 24" monitor (offline library station) | 420 |
| 33 | Spares shelf | PSU, fans, NIC, 1 × 16 TB cold spare, SATA/USB cables | 400 |
| **Recurring** ||||
| 34 | Offshore VPS (bridge/relay) | 2 vCPU / 4 GB, non-MX jurisdiction | 12/mo |
| 35 | Backup LTE/5G line | Telcel data SIM | 25/mo |
| | **TOTAL CAPEX** | | **≈ $13,650 USD ≈ MXN 253,000** |
| | **Recurring** | | ≈ $37/mo + power (~$60/mo) |

### 4.2 Other tiers

| Tier | What changes | CAPEX |
|---|---|---|
| **A — Lean** | Single node, 4 × 12 TB RAIDZ1 (~32 TB), one UPS, no LFP, external BD burner only (no tower), skip resin + Flipper + kiosk, used laser printer, Bambu A1 instead of Prusa | ≈ $5,200 |
| **B — Balanced** | As above. Two sites, 60 TB, full production line | **≈ $13,650** |
| **C — Extended** | +GPU node (RTX 3090 24 GB, $750) for local LLM/Whisper · +LTO-7 drive & tapes ($900) · +Epson PP-50 auto disc publisher ($2,400) · +10 kWh LFP + 2 kW solar ($4,500) · +Starlink ($400 + ~$70/mo at MX residential rates) · +third site | ≈ $25,000 |

**Recommendation: Tier B, plus the GPU from Tier C.** The GPU (~$750 for a used 3090) buys the local LLM + Whisper + Piper stack, which is the difference between "I have an archive" and "I have something that answers questions." Skip the disc publisher until disc volume justifies it, and skip LTO below ~50 TB of true cold archive — rotating HDDs plus M-DISC covers it at this scale.

### 4.3 Purchasing rules (non-negotiable)

1. **No cloud-tethered hardware.** If it needs a vendor account to function, it doesn't enter the building. This is why Prusa over Bambu — Bambu's LAN mode works but is a vendor policy, not a property of the device.
2. **Buy the second one now.** Blu-ray drives are being discontinued industry-wide. A cold spare burner bought in 2026 may be unbuyable in 2031. Same logic for the HBA and the PSU.
3. **Prefer perpetual, offline-activatable licences.** Subscription software with a phone-home check is a WAN dependency wearing a costume.
4. **Standardize consumables.** One toner SKU, one filament family, one disc SKU — so stockpiling is cheap and predictable.

---

## 5. The Fleet Offline Edition

This is the piece that turns a personal homelab into a *product*, and it's mostly packaging work.

### 5.1 What it is

A single build artifact containing every `carino.systems` tool, served locally:

- **`carino-offline.iso`** — bootable Ventoy-compatible live image, boots to a browser on the hub
- **`carino-offline/`** — a folder that runs from a USB stick via a bundled static server (or `file://` for the tools that support it)
- **Docker compose bundle** — for anyone who already has a server

Contents: the hub (search-first over `tools.json`), Retina, DICOM-editor, Metadata, Hash, Hardware, Learn, Stocks, Media, Topo, Asobi, Branding, MusicGrid, Quote, Desk, Kanban, Vitae, Compass, Depot, TV — plus Carino-PACS as an optional container.

### 5.2 Why it's nearly free to build

The fleet conventions already did the hard part: no CDN, self-hosted fonts, vendored libraries, client-side only. The remaining work:

- [ ] Audit every repo for a stray absolute URL or external fetch (`grep -rE 'https?://(?!carino)'`) — the fonts convention says this should be clean; verify it
- [ ] Add a **service worker** to each tool for install-to-homescreen + true offline PWA behavior
- [ ] Build a `Makefile` that clones all fleet repos at a pinned commit and emits the ISO
- [ ] Ship `tools.json` with LAN-relative URLs so the hub's search routing works identically offline
- [ ] Verify the **Carino Bridge** handoff (`#carino-bridge`) works over `file://` and over `http://hub.carino.internal` — Media→Metadata and PACS→DICOM-editor are the flows that matter
- [ ] Include the i18n locale sets (es / pt-BR / ja / ru) — offline shouldn't mean English-only
- [ ] Sign the ISO; publish the SHA-256 on the printed card *and* in the git tag

### 5.3 Why it matters commercially

Per the business plan, Carino Systems sells support, hardware, and custom work — not licences. An **appliance** fits that model exactly:

> *"A box that runs your PACS, your imaging tools, your document archive, and your reference library. No internet required. No subscription. It works during the outage. Your patient data never leaves the building."*

For Mexican clinics, "never leaves the building" is a **LFPDPPP / NOM-024-SSA3 story**, not just a resilience story. The offline constraint is the selling point. And Custom-Images + PACS — the two flagships — are precisely the things a clinic can't run in someone else's cloud anyway.

### 5.4 The offline oracle (local LLM)

With the Tier-C GPU: Ollama + an open-weight ~30B model, Whisper for transcription, Piper for TTS, and a RAG index over Kiwix + Paperless + the fleet docs + my own notes. This is what replaces "search the internet" when there is no internet. It's the difference between a library and a librarian, and at ~$750 for a used 3090 it's the best value item in Tier C by a wide margin.

---

## 6. Sneakernet — the layer that survives everything

Physical media moves at 60 km/h with infinite effective bandwidth and zero DPI. It is the actual answer to censorship, and it's the layer most plans skip.

### 6.1 Optical (CD / DVD / BD)

**Standard disc build process** — every disc I press follows this, no exceptions:

| Step | Detail |
|---|---|
| Filesystem | UDF 2.60 for BD; ISO9660 + Joliet + Rock Ridge for DVD/CD (max compat) |
| Payload | Content + `README.txt` (contents, date, build hash, contact) |
| Integrity | `SHA256SUMS` at root |
| Recovery | **PAR2 at 10% redundancy** — recovers from scratches and rot |
| Verify | Read-back verify after burn, `sha256sum -c`, log to the disc registry |
| Label | Printed via EcoTank on printable disc: title, date, **short hash**, QR to the intranet index |
| Registry | Every disc logged in Paperless/Nextcloud: what, when, hash, who has a copy |

**Media choice:**

| Media | Use | Life |
|---|---|---|
| **M-DISC BD-R 100 GB** | Crown jewels: git bundles, key material (encrypted), master ISOs, family/business archive | 100 yr claimed, realistically decades |
| BD-R XL 100 GB (Verbatim) | Bulk library distribution, media sets | 10–20 yr |
| BD-R 25 GB | Fleet Offline Edition ISO, single-title handouts | 10–20 yr |
| DVD-R | Cheap wide distribution — client handouts, manuals, patient studies | 5–15 yr |
| CD-R | Audio, tiny bootables, legacy medical equipment (still real in MX clinics) | 5–15 yr |

**A cold-spare burner, sealed, in the safe.** Media outlives drives.

### 6.2 Print

Paper is the ultimate read-only, no-power, no-DRM format. Print jobs run through a local CUPS server; nothing touches a vendor cloud.

**The artifacts to produce:**

1. **The IP Card** (credit-card size, laminated) — every service's Tier-2 and Tier-3 address, the CA fingerprint, the SSID, the emergency contact. Distributed to every household/staff member. *This is the DNS-is-dead recovery kit.* Reprint on every renumbering.
2. **Quick-start cards** — one per fleet tool, QR to the LAN URL, three-step usage. Ships in the box with hardware.
3. **Manuals** — duplex, saddle-stitched booklets for the appliance and PACS.
4. **Disc inserts & jewel-case art** — EcoTank color.
5. **Asset labels** — QL-820NWB: every device gets a label with hostname, IP, MAC, purchase date, QR to its Topo/inventory record.
6. **Emergency runbook** — printed, in the safe: how to boot node A cold, how to restore from cold HDD, root CA recovery, UPS shutdown order, TOTP backup codes.
7. **Client deliverable packs** — invoice, manual, warranty, disc, all printed in-house.

> **Note:** CFDI 4.0 invoicing requires SAT connectivity. That's a hard external dependency — keep the LTE backup line alive for it, and keep a printed pre-CFDI record of anything invoiced during an outage to reconcile later.

### 6.3 NFC

NFC is the *tap-to-act* layer that makes an intranet feel like a product rather than a set of IP addresses.

| Use | Tag | Payload |
|---|---|---|
| **Tap-to-open a tool** | NTAG215 sticker on desk/wall/kiosk | NDEF URI → `http://hub.carino.internal/#retina` |
| **Tap-to-join Wi-Fi** | NTAG215 card at reception | NDEF Wi-Fi record (SSID + WPA2 key) — no typing, no whiteboard |
| **Asset tags** | NTAG215 sticker on every device | URI → inventory record in Topo |
| **Business / contact cards** | PVC NFC card | vCard + URI, works with no internet on the recipient's phone |
| **Equipment loan tracking** | NTAG216 disc on loaner hardware | Asset ID → check-in/out log |
| **Appliance entitlement token** | PVC card shipped with a Carino Systems box | Signed support-contract ID — a *physical* support token, no licence server |
| **Disc/USB packaging** | Sticker on the sleeve | Contents hash + index URI |

Every NFC deployment gets a **printed QR twin** on the same surface. Not every phone has usable NFC; every phone has a camera. Redundancy is free here.

`ACR122U` + `nfcpy` on the intranet handles bulk encoding; the Flipper Zero is for field diagnostics and reading whatever a client hands me.

### 6.4 3D printing

Not a hobby line item — it's the **spare-parts and packaging supply chain** when imports are slow or blocked. This directly supports the hardware side of the business.

**Setup:** Prusa Core One/MK4S on VLAN 40 (no WAN), driven by **PrusaLink/Klipper + Mainsail** on the LAN. Slicing local (PrusaSlicer/OrcaSlicer). No cloud slicing, no account.

**What it prints:**

- Rack ears, 3.5"→5.25" adapters, drive caddies, blanking plates
- Enclosures for Meshtastic nodes, the GPS-NTP Pi, kiosk mounts, AP mounts
- NFC tag holders, card stands, disc/USB packaging inserts, cable combs
- Signage and wayfinding for the shop
- **Replacement parts for client hardware** — knobs, clips, brackets, feet, connector shrouds. This is the one that pays for the printer.
- Jigs and fixtures for the disc/label production line
- Optional: DICOM-derived anatomical prints — a natural, differentiating extension of Retina + Carino-PACS for surgical planning conversations

**Critical:** mirror the model library. Printables/Thingiverse/GrabCAD are internet services. Every model I actually use gets pulled into a Gitea/Forgejo repo (with LFS) or a Nextcloud folder, **with its licence file**, plus the sliced `.gcode` and the printer profile. A model I can't print during an outage isn't a model I have. Keep filament stock at 3–6 months (PETG and ASA in dry boxes — humidity in MX will ruin an unsealed spool).

---

## 7. Backup — 3-2-1-1-0

| Copy | Where | Medium | Cadence |
|---|---|---|---|
| Production | Node A, ZFS RAIDZ2 | HDD | live + hourly snapshots |
| 2nd copy | Node B, second physical site | HDD | `zfs send` nightly |
| Offsite/cold | 2 × 20 TB external, rotated | HDD | monthly swap, one always off-premises |
| **Offline/immutable** | **M-DISC BD-R** | Optical | quarterly, crown jewels only |
| **Zero errors** | ZFS scrub + `restic check --read-data` + PAR2 verify | — | monthly scrub, annual disc verify |

**Crown jewels** (the set that must survive everything): all fleet git bundles (`git bundle create` — one file per repo, self-contained and clonable), the step-ca root key (encrypted, split), Vaultwarden export, the DNS zone files, business/financial records, family archive, and the current Fleet Offline Edition ISO. This set is small — it fits on 2–3 M-DISC BD-Rs. There is no excuse for not having it on a shelf.

**Encryption:** ZFS native encryption on the pools, LUKS on cold HDDs, `restic` repos encrypted. Keys in Vaultwarden **and** on paper in the fire safe **and** split across two M-DISCs. An offline plan that loses its keys is worse than no plan.

**Test the restore quarterly.** An untested backup is a rumor.

---

## 8. Reaching *out* when you still want to (L3)

Nothing internal depends on this. It exists so I can sync mirrors and keep the public hosting alive under filtering.

- **WireGuard → offshore VPS** (non-MX jurisdiction). Primary path.
- **Obfuscation, in escalation order:** plain WG → WG over TCP/443 → shadowsocks-2022 / Xray-VLESS-REALITY → Hysteria2 (QUIC) → Tor with obfs4/snowflake bridges. Configure all of them *now*, while they're easy to download.
- **Yggdrasil** overlay — gives every node a permanent cryptographic IPv6 address independent of DNS *and* of IP allocation. Print the fleet's Yggdrasil addresses on the IP card. This is the "domain seized" continuity path.
- **Registrar hygiene:** domain at a registrar outside the pressure zone, registrar-lock on, DNSSEC keys held locally, full zone file backed up with the crown jewels, and a documented "move the zone in under an hour" procedure.
- **Multi-WAN:** fiber primary + LTE/5G failover on the MikroTik. Starlink only if Tier C — note it's a *different transit path*, not a *censorship-proof* one; it's registered and blockable too.
- **Publish reachability out-of-band:** IP literals, Yggdrasil address, and the CA fingerprint go on printed cards and NFC tags handed to clients. When DNS is the attack surface, distribute the addresses by hand.

---

## 9. What genuinely doesn't work offline

Honesty here prevents nasty surprises. These need the LTE line or a plan:

| Thing | Mitigation |
|---|---|
| CFDI 4.0 / SAT invoicing | Keep LTE backup; paper record + reconcile later |
| Banking, SPEI | No mitigation. Accept. |
| SMS/phone 2FA to third parties | Migrate everything possible to TOTP; seeds in Vaultwarden + printed |
| Windows activation / KMS | Use Linux; keep a couple of pre-activated VMs snapshotted |
| Subscription CAD/design software | Migrate to perpetual or FOSS (FreeCAD, Blender, Krita, Inkscape) |
| DRM'd games and streaming media | Buy DRM-free (GOG); own the files |
| Vendor firmware updates | Download and archive them *now*, per device model |
| Public CA certs for the *public* site | Only affects the WAN-facing side; intranet uses step-ca |

---

## 10. Rollout

| Phase | Window | Deliverable | Exit criterion |
|---|---|---|---|
| **0 — Escape kit** | Week 1–2 | Zone file backups, git bundles of every fleet repo, registrar lock, crown-jewel M-DISC set, printed emergency runbook | *If the domain vanished tonight, I'd lose nothing permanent* |
| **1 — Core** | Month 1 | Node A + MikroTik + VLANs + Technitium + step-ca + Caddy + GPS-NTP + Homepage hub | Every fleet tool reachable at all three name tiers with a valid cert, WAN unplugged |
| **2 — Fleet Offline Edition** | Month 1–2 | ISO + USB + compose bundle, service workers, signed release | Fresh laptop, no internet, boots the USB, uses every tool |
| **3 — Content** | Month 2–3 | Kiwix, Jellyfin/Navidrome/Immich/Paperless, LANCache, distro mirrors, game servers | A month offline is *comfortable*, not survivable |
| **4 — Sneakernet line** | Month 3–4 | Disc pipeline (burn→PAR2→verify→label→register), print artifacts, NFC tag rollout, 3D print farm + model mirror | 20 discs and 50 NFC tags produced end-to-end without touching the internet |
| **5 — Second site & radio** | Month 4–5 | Node B replication, cold-HDD rotation, Meshtastic mesh, offshore VPS + obfuscated transports | Node A destroyed → back up at site B in < 24 h |
| **6 — Drills** | Ongoing | Quarterly **blackout drill**: WAN physically unplugged for 72 h, no exceptions | Every failure found gets a ticket; the drill is only over when the list is empty |

**Maintenance rhythm:** mirrors refresh monthly · ZFS scrub monthly · restore test quarterly · disc integrity verify annually · IP card reprint on any renumbering · blackout drill quarterly.

---

## 11. Open decisions

- [ ] **Second site location** — this is the biggest unresolved variable. It must be a different building, ideally a different power feed and neighborhood. Everything in Phase 5 blocks on it.
- [ ] Public hosting: keep the current provider as the WAN face, or move the public reverse proxy to the offshore VPS with the origin at home over WireGuard?
- [ ] Appliance productization — is the Carino Offline Box a real SKU (§5.3)? If yes, Phase 2 and 4 get a customer-facing spec and the BOM grows a per-unit build.
- [ ] Storage headroom: is 60 TB usable enough, given §3 sums to roughly 8–12 TB of mirrors/knowledge before any media or games? Probably yes for 3–4 years. Revisit before the pool passes 70%.
- [ ] Ham licence (IFT / XE callsign) — worth the paperwork, or is Meshtastic sufficient?
- [ ] LLM GPU now (Tier C add-on) or after Phase 3? *Leaning: now.* It's the highest-value item not in Tier B.

---

## 12. The one-paragraph version

Build a Proxmox node with ~60 TB of ZFS behind a MikroTik core, running my own DNS, my own CA, and my own GPS-disciplined clock, so every `carino.systems` tool resolves and serves *inside the building* under the exact same URL it uses outside. Fill it with the things that matter — Wikipedia, distro mirrors, the media library, DRM-free games, the medical imaging stack on an air-gapped VLAN. Package the whole fleet as a bootable ISO, because it's already client-side static and nearly free to do. Then build the physical layer underneath it — M-DISC archives with PAR2, printed IP cards and manuals, NFC tags that open local tools with a tap, and a 3D printer that makes the spare parts and enclosures — so the system keeps working when the network doesn't, and keeps *spreading* when the network is hostile. Replicate to a second building, drill it quarterly with the cable pulled, and treat the internet as a nice-to-have sync channel. About MXN 250,000 and five months.

---

*Living document. Update on every phase completion and every blackout drill.*
