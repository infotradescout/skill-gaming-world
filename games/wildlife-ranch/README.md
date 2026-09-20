# Wildlife Ranch — full-game direction and simulation foundation

Working label, not a final game title. Original first-person hunting game with
built-in GrindZone capabilities; the existing multi-game companion remains intact.

**Start with [PRODUCT_CONTRACT.md](PRODUCT_CONTRACT.md).** The owner's target is
COTW-scale complexity and production quality, WMA-like reserve management and an
integrated companion, not a browser management dashboard. That contract separates
required outcomes, recommendations and implemented evidence. This documentation
update does not add a native runtime or claim a playable build.

## Owner's game contract

Inherit and manage a WMA-scale private wildlife reserve. Final acreage and region
remain unresolved; 10,000 acres was the initial premise and 100,000 acres was an
assistant sizing proposal, not an approved final map. Manage birds, deer, foxes,
fish, other predators, prey and habitat, with births, growth, permanent deaths
and an NPC hunt-leasing business. There are no replacement respawns. An animal
watched for eight hunting seasons can still be killed by an existing predator
or a vehicle. Names, trophy desirability, attachment and bookings must not grant
immunity or trigger an artificial tragedy. Hunting seasons are not biological
age units. Age is measured in days; calendar and hunting seasons will be separate.

GrindZone's maps, journal, tracking, statistics and sharing are intended to be
available inside the game, using native committed events rather than requiring
a second companion process or save scanner. No runtime integration is claimed yet.

## What the implemented core actually does

This is a small, headless JavaScript foundation, not a playable game or a
calibrated ecological simulation. Run from this directory:

```sh
node --test test/core.test.mjs
```

No package installation or network access is needed for these tests. The earlier
execution receipt records Node 22.16.0 on Linux for the initial core snapshot.
The product-contract/README update does not constitute new test execution.
No parent-app build, deployment, native engine or production integration has
been performed by this work.

- Age-dependent competing mortality hazards, optional sex-specific profiles,
  region matching, exact age-band integration, and one death cause per animal.
- Exponential life clocks retained across time subdivisions and saves. A year
  advanced at once and the same year in daily steps preserve background death
  time and cause for unchanged profiles. No hard-coded expiry birthday.
- Persistent founder IDs, cause-of-death records, seeded randomness, population
  accounting, JSON save/load, idempotent commands and transactional rollback.
- A predation encounter between two existing, nearby animals, using an explicit
  diet filter and externally supplied attack and kill probabilities.
- Separate kill, feeding and carcass-loss events; allocated edible mass cannot
  be consumed twice. Feeding currently transfers biomass, not metabolic energy.
- A finite straight-road crossing adapter. No actual crossing means no road
  risk roll; zero traffic means zero collision risk for that crossing. Collision
  can cause injury rather than death. This is a provisional Poisson-arrival
  hypothesis, not an empirically fitted vehicle-collision model.
- Provisional background profiles require explicit opt-in. A species/region
  completeness check records missing empirical calibration categories.

All probabilities in the test fixtures are SYNTHETIC. Some are deliberately
zero or one to test boundaries. They are not estimates of deer survival,
predator hunting success or vehicle lethality.

## Scientific contract

### Lifespan is an outcome, not an expiry date

Use age/sex-specific survival distributions for the chosen population, not a
single 'average lifespan' copied from a species page. Survival from birth and
remaining life conditional on reaching adulthood are different quantities.
Captive longevity is not a wild mortality profile. The final open age band
allows senescence risk; it does not make elderly animals immortal.

MSU's age-structured account supports age, condition, density and habitat
interactions, but is not a complete numeric survival table. We have not inferred
an eight-year survival probability from it. [MSU-AGE]

For piecewise constant instantaneous cause-specific rates:

    S(t) = exp(-integral(sum(lambda_cause(t)), dt))

The core integrates these rates across age boundaries. In the current split,
predation, vehicle collisions and harvest are reserved for explicit event
adapters and are rejected in background mortality profiles. Observed all-cause
survival is a combined-model calibration target, not another independent
'natural death' roll. Do not convert a cumulative cause-of-death proportion
into a net cause-specific hazard without an appropriate survival model.

### Killing is not eating

Puma field research found that energetic models alone underestimated kills;
consumption, carcass abandonment and kill rates must be distinguished.
[ELBROCH-2014] The next autonomous model needs energy reserves, actual prey
encounters, failed hunts, reproductive status, carcass access and scavenging.
It must not impose 'one kill every seven days' or 'must finish every carcass'.

NPS's Santa Monica Mountains summary describes about one deer per week and
local typical home ranges of 150 square miles for males and 50 for females.
These are scoped references, not universal scheduler constants. [NPS-SAMO]
The former 10,000-acre concept was 15.625 square miles, not a biologically
closed world. Whatever playable acreage is selected, surrounding habitat must
be considered rather than forcing every predator's entire life inside the
ownership boundary. Regional presence remains a design choice.

### Accidents require exposure

FHWA's 2008 report identifies temporal, traffic, species and landscape factors
in wildlife collisions. It does not supply a per-animal percentage suitable
for this ranch. [FHWA-2008] National driver insurance odds must not be assigned
to individual deer. The current straight-crossing adapter is only a mechanism
prototype; vehicle speed, visibility, avoidance and traffic dependence require
local calibration and more detailed movement/road behavior.

### Evidence is not omniscience

The simulation's known death cause must eventually be separated from what a
player has discovered. A camera absence is not a confirmed death. Player
observation, tracks, carcass discovery and uncertain reports are not implemented.
See the product contract for proposed knowledge views and native companion data.

## Explicit limitations / next dependencies

There is no selected ecoregion or validated biological rate pack. There is no
breeding, gestation, egg/fry cohort model, autonomous feeding or territory AI,
vegetation model, disease transmission, energy reserve, seasonal weather,
immigration, NPC lease workflow, hunting controls, 3D scene or UI yet. The
birth counter is reserved for the future birth adapter; no birth API exists.
There is no native GrindZone event bridge or embedded companion runtime yet.

`advanceLife` advances background life clocks only. It is NOT a full-world
'advance year' command: a future chronological scheduler must interleave
movement, predation, traffic, breeding and management events before that
claim can be made. An injury flag does not yet change later physiology.
Background/road deaths currently allocate zero edible mass unless their
adapter is extended with a carcass profile. Carcass-loss labels record removal
from available biomass; they do not simulate actual scavenger individuals.

Profiles with `calibrated` status require source and receipt metadata, but this
is not scientific review or a cryptographic trust boundary. `requireCalibration`
is a checklist helper, not an integrated release/deployment gate. Save checks
catch structural inconsistencies; they are not tamper-proof multiplayer security.

## Resume here

Original core: `f39f561c3d12bd35a5e6c45edaeac4fa542fb0e9`, based on
`infotradescout/skill-gaming-world` at
`74e0ce7859a6cd70f9e8048ee1e9b940e1f38969`.
Continue the existing `feature/wildlife-ranch-realism-core-20260920` branch /
PR #43. Current product requirements are in `PRODUCT_CONTRACT.md`.
Scope: only `games/wildlife-ranch/`; existing games, payments, authentication,
the standalone companion, shared services and deployment configuration remain
untouched by these changes.

Next player-facing delivery: a native playable hunting-to-GrindZone path in a
representative district. Develop ecological calibration and presentation alongside
that path, not another backend-only substitute for the game. Unreal Engine 5 is
currently a recommendation, not a selected/installed version or delivered runtime.

Obtain compatible regional age/sex survival and cause-of-death datasets; integrate
chronological movement, reproduction, energy, predation and management using the
existing identity/event rules. Do not replace unknown rates with plausible-looking
percentages. Evaluate survival, age structure, causes of death, predator kills AND
consumed biomass across seeds against independent field observations. Synthetic
Monte Carlo agreement proves sampling math, not wildlife accuracy.

Source provenance and unresolved calibration categories are in
`research/source-registry.json`. `verification.json` is the earlier execution
receipt for the initial core snapshot; its README fingerprint predates this
product-scope documentation update and must not be represented as covering it.
