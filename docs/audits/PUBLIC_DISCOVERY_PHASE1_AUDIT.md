# Public Discovery — Phase 1 Forensic Audit (Skill Gaming World)

**Branch:** `codex/public-discovery-phase1-audit-20260807`  
**Audit window:** 2026-08-07  
**Git root used:** `D:/AAATraderCorner/TradeScout/skill-gaming-world`  
**Note on path:** Requested `d:\AAATraderCorner\skill-gaming-world` is absent; nearest real clone of `https://github.com/infotradescout/skill-gaming-world` is under `TradeScout/skill-gaming-world`. A second clone exists at `TradeScout/canonical/Skill-Gaming-World` (same remote). This packet used the former.  
**Repo HEAD audited (local branch base):** `e5c2497671ae3e454327af53244ea277ce5c3c9a` (`origin/main`)  
**Live deploy observed:** Render service `skill-gaming-world` (`srv-d9kdfie417fc73em8bmg`) live commit `e5c2497671ae3e454327af53244ea277ce5c3c9a`  
**Live origin:** `https://skill-gaming-world.onrender.com`  
**Scope:** Skill Gaming World only. NewsFilter not audited. No TradeScout/MealScout/Sway doctrine copied in.  
**Runtime / schema / deploy changes:** none  
**Push / merge / deploy:** none  

---

## Executive status

| System | Classification | Evidence confidence |
| --- | --- | --- |
| Skill Gaming World (site-wide indexing) | **intentionally private** | **high** |
| Marketing / trust HTML pages | Reachable + SSR facts, but **noindex** by design | **high** |
| Player app `/app/*`, admin `/admin/*`, auth APIs | **intentionally private** | **high** (code); live `/app`/`/admin` returned 500 during probe |
| Search / AI discovery readiness | **not eligible** until a separate authorized public surface exists | **high** |
| Future separate education / public trust surface | **opportunity** (not present; not invented here) | **medium** |

**Phase 3 readiness for this product:** **BLOCK** — product remains intentionally private for indexing. Do not implement public-discovery foundation against this surface until owner authorizes a distinct public education (or similar) surface and explicitly relaxes noindex/block protections for that surface only.

**Preview indexing protections:** Confirmed intact on live HTML responses (`X-Robots-Tag: noindex, nofollow, noarchive` + meta `robots: noindex, nofollow`). This audit did **not** remove or weaken them.

---

## Evidence matrix (parent §F fields)

### 1) Platform / marketing root `/`

| Field | Finding |
| --- | --- |
| Public route | `/` |
| Canonical domain | No approved custom domain. Live operational host: `skill-gaming-world.onrender.com`. GitHub `homepage` null. Trademark/domain clearance still unresolved in `docs/DECISIONS.md` (D-027). |
| Route purpose | Parent Skill Gaming World lobby; Monetaire flagship entry |
| Target visitor | Prospective players / private preview visitors |
| Public entity | Skill Gaming World (parent) + Monetaire (flagship title) |
| Initial HTML availability | **Yes** — SSR HTML with title, description, H1, body facts (~24.7 KB) |
| Browser-rendered availability | Same document as initial HTML (Next App Router SSR); not a blank SPA shell |
| OAI-SearchBot / GPTBot / ChatGPT-User / Googlebot | Manual UA probes: **identical** HTML SHA-256 for `/` across Browser, GPTBot, OAI-SearchBot, ChatGPT-User, Googlebot. Server-shape only; does not prove crawl scheduling or rendering pipelines. |
| Title / description | `Skill Gaming World` / Monetaire competitive-solitaire description |
| H1 / body facts | H1 present (“Play where fair means provable.”); product copy + CTAs in first response |
| Structured data | **None** (`application/ld+json` absent) |
| Canonical URL | **None** in HTML |
| Sitemap inclusion | **No** sitemap (`/sitemap.xml` 404); no sitemap generators in repo |
| Robots treatment | Root metadata `robots: { index:false, follow:false }`; global `X-Robots-Tag: noindex, nofollow, noarchive` via `next.config.ts`; live meta `noindex, nofollow` |
| `llms.txt` | **Absent** (404) — supplemental only; not a gap against intentional privacy |
| Internal links | Lobby → Monetaire, Casino shell, Challenges, Fairness, auth, player hub |
| Discovery-to-conversion path | Register / login / player hub exist as product paths; **not** a public search-discovery funnel |
| Attribution support | **None** for ChatGPT/utm discovery events |
| Private surfaces excluded | Player hub + admin intended private; see live note below |
| Classification | **intentionally private** (index-blocked; preview posture) |
| Evidence confidence | **high** |

### 2) Monetaire marketing `/monetaire`, `/monetaire/how-it-works`, `/monetaire/play`, `/monetaire/competitions`

| Field | Finding |
| --- | --- |
| Purpose | Title marketing, how-it-works, play entry, competitions info |
| Entity | Monetaire — Competitive Solitaire |
| Initial HTML | SSR with unique titles (e.g. `Monetaire · Skill Gaming World`) and H1; live `/monetaire` confirmed |
| Bot UA variance | No bot-only claims observed; same noindex headers |
| Structured data / canonical / sitemap | Absent |
| Classification | **intentionally private** |
| Confidence | **high** for `/monetaire`; **medium** for sibling paths (same layouts/metadata pattern; not every path re-probed live) |

### 3) Fairness / responsible play / legal trust pages

| Routes | `/fairness`, `/responsible-play`, `/legal/terms`, `/legal/privacy`, `/legal/play-coins` |
| --- | --- |
| Purpose | Trust, fairness contract, legal disclosures |
| Initial HTML | Live `/fairness` SSR confirmed with H1 + noindex |
| Classification | **intentionally private** for indexing today; content is educational-adjacent and is the natural seed for a **future separate public education surface** if/when authorized |
| Opportunity | A later owner-approved public education surface could reuse fairness/responsible-play/legal facts under explicit index eligibility — **not implemented in this audit** |
| Confidence | **high** for `/fairness`; **medium** for other legal routes |

### 4) Casino shell `/casino`

| Field | Finding |
| --- | --- |
| Purpose | Unavailable / hard-hold status shell (`CASINO_WORKING_TITLE` internal) |
| Entity | No publishable casino brand |
| Classification | **intentionally private** (status-only; must not become discovery marketing for casino) |
| Confidence | **high** (code + docs) |

### 5) Auth `/auth/login`, `/auth/register`

| Field | Finding |
| --- | --- |
| Purpose | Account access |
| Robots | Auth layout metadata `index:false, follow:false` + global header |
| Live | `/auth/login` 200 SSR + noindex |
| Classification | **intentionally private** |
| Note | Free-play registration was opened on main (`Open free play registration` / #7). That widens **user** access vs older owner-only preview, but does **not** authorize search indexing. Indexing protections remain. |
| Confidence | **high** |

### 6) Player app `/app/*` and admin `/admin/*`

| Field | Finding |
| --- | --- |
| Purpose | Authenticated player hub; least-privilege admin |
| Robots | Layout metadata noindex; global header |
| Access | `/app` redirects unauthenticated users to login (code); admin privileged |
| Live probe | `/app` and `/admin` returned **HTTP 500** during 2026-08-07 probes (runtime not healthy; see health) — still not an indexable public surface |
| Classification | **intentionally private** |
| Confidence | **high** (intent); live error is operational, not discovery |

### 7) APIs / health

| Field | Finding |
| --- | --- |
| `/api/health` live | **503** during probes (empty error body in client); indicates configured runtime **not ready** |
| Repo contract | Health returns structured readiness JSON; operations keep prize/casino/payments false |
| Classification | Private operational endpoint; not a discovery page |
| Confidence | **high** that service is unhealthy; exact dependency failure not decoded without healthy response body |

### 8) Crawler policy artifacts

| Artifact | Live | Repo |
| --- | --- | --- |
| `/robots.txt` | **404** | No `robots.txt` / App Router robots file |
| `/sitemap.xml` / sitemap index | **404** | None |
| `/llms.txt` | **404** | None |

Interpretation: Absence of sitemap/`llms.txt` is consistent with intentional non-discovery. Missing `robots.txt` is a **minor crawler-guidance gap** but does **not** override live `X-Robots-Tag` + meta noindex on HTML 200s. Do **not** “fix” this by opening indexing.

---

## Live probe table (2026-08-07)

Origin: `https://skill-gaming-world.onrender.com`  
UA tests are **server response shape only**.

| URL | Browser | GPTBot | OAI-SearchBot | ChatGPT-User | Googlebot |
| --- | --- | --- | --- | --- | --- |
| `/` | 200; H1; meta noindex; `X-Robots-Tag: noindex, nofollow, noarchive`; body hash shared | same | same | same | same |
| `/monetaire` | 200; same header/meta pattern | same | same | same | same |
| `/fairness` | 200; same header/meta pattern | same | same | same | same |
| `/auth/login` | 200; noindex | (same pattern on successful HTML probes) | | | |
| `/api/health` | 503 | 503 | 503 | 503 | 503 |
| `/robots.txt` | 404 | 404 | 404 | 404 | 404 |
| `/sitemap.xml` | 404 | 404 | 404 | 404 | 404 |
| `/llms.txt` | 404 | 404 | 404 | 404 | 404 |
| `/app` | 500 | 500 | 500 | (not re-listed) | 500 |
| `/admin` | 500 | 500 | 500 | | 500 |

`/` body SHA-256 (all five UAs identical):  
`e1e6efcf0c030b440185b6fbd4918e5f27cad2c4e1055d03b8690e167e33b016`

---

## Repo evidence for indexing blocks (must preserve)

1. `src/app/layout.tsx` — root `metadata.robots = { index: false, follow: false }`
2. `next.config.ts` — global header `X-Robots-Tag: noindex, nofollow, noarchive` for `/:path*`
3. `src/app/app/layout.tsx`, `src/app/admin/layout.tsx`, `src/app/(auth)/auth/layout.tsx` — additional noindex metadata
4. `docs/PRIVATE_PREVIEW_VERIFICATION.md` + `tests/configured-preview/private-preview.spec.ts` — require live `X-Robots-Tag: noindex, nofollow, noarchive`
5. `render.yaml` — Blueprint documents private configured preview posture (`DEMO_MODE=false`, held feature flags). **Drift note (read-only):** live Render service currently shows `autoDeployTrigger: commit` / free plan / Virginia, while committed `render.yaml` states `autoDeployTrigger: "off"` and Ohio starter — do not “fix” deploy posture in this audit lane.

---

## Privacy / private-surface review

Correctly treated as non-public discovery:

- Authenticated player surfaces (`/app/*`)
- Admin (`/admin/*`) and admin APIs
- Wallet, ledger, self-exclusion, appeals, session/move APIs
- Prize / social-casino / real-money / production-payment operations (held false)
- Casino execution (shell only)

Do not weaken noindex/header blocks to “improve discovery.”

---

## Attribution review

| Required discovery event (contract language) | SGW today |
| --- | --- |
| discovery_landing | Absent |
| discovery_entity_view | Absent |
| discovery_primary_action | Product CTAs only; not discovery ledger |
| discovery_phone_click | N/A |
| discovery_request_started/sent | N/A (not TradeScout request model) |
| ChatGPT referral attribution | Absent |
| Offline “How did you find us?” | Absent |

---

## Proven / likely / unknowns

### Proven

1. Live marketing HTML is index-blocked by meta + `X-Robots-Tag`.
2. Bot UAs receive the **same** public facts as a browser UA for `/` (no bot-only enrichment).
3. No sitemap / `llms.txt` / JSON-LD / canonical URL program exists.
4. Live deploy SHA matches `origin/main` (`e5c2497…`).
5. Live `/api/health` is not ready (503).

### Likely

1. Site is a **private / non-indexed preview** that still serves meaningful marketing HTML to any HTTP client that ignores robots directives.
2. GitHub repo visibility is **public** (source discoverable) while the product site is noindex — separate from HTML indexing policy.

### Unknowns

1. Exact dependency failure behind live 503 health (DB/schema/jurisdiction/env) — not required to classify discovery.
2. Whether any search engine has historically indexed the onrender host despite noindex.
3. Whether an owner-approved **separate** public education domain/surface will be authorized later.

---

## What this audit deliberately did not do

- No runtime, schema, robots, header, or deploy changes
- No inventing a public education surface in code
- No push, merge, or deploy
- No NewsFilter audit
- No weakening of private-preview protections

---

## Phase 3 readiness (Skill Gaming World lane)

**Verdict: BLOCK**

Entry conditions for SGW public-discovery implementation are **not** met:

- Product is classified **intentionally private** for indexing
- No authorized public/indexable surface or canonical public domain
- Preview noindex/block protections must remain until owner GO on a separate public surface
- Cross-brand Phase 3 work on TradeScout must not pull SGW into shared indexable implementation

If Phase 3 proceeds elsewhere, SGW should remain listed as **intentionally private** until a future authorized education (or equivalent) surface is scoped on its own branch with explicit indexing eligibility.
