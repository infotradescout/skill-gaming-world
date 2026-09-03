/**
 * Additional Concept Rescue proof cases — diverse artifact types beyond Steady Paws.
 *
 * Both fixtures below are entirely synthetic (invented for this test only). They are
 * NOT scrapes of real companies, products, people, or datasets. No real demand,
 * credentials, testimonials, or metrics are implied by using them.
 *
 * Case 2 — raw idea / pitch-deck-style input ("NovaDesk")
 * Case 3 — repository / technical artifact ("QueueForge" README)
 *
 * Spec: .selective-intelligence/concept-rescue-package.md
 * Evidence: .selective-intelligence/concept-rescue-additional-cases-evidence.md
 */

// ---------------------------------------------------------------------------
// Case 2 — raw idea / pitch-deck-style artifact
// ---------------------------------------------------------------------------

export const CASE2_USER_TEXT = `I found this NovaDesk pitch deck online while researching AI co-founder tools. I am not the founder — I want to help whoever is behind it think it through, and I also want Platynum to learn a reusable concept-rescue workflow from a deck-style artifact. I do not own this concept, brand, claims, or testimonials.`;

export const CASE2_DECK_ARTIFACT = `
FIXTURE ONLY — synthetic pitch-deck-style raw idea artifact for Concept Rescue additional-case
testing. NovaDesk is an invented name; no real company, product, or person is described.

NovaDesk — "Your AI Co-Founder" (concept deck bullets)

Problem: Solo founders drown in busywork instead of building.
Solution: NovaDesk is an AI co-founder that plans, drafts, and ships your roadmap for you.

Founder pilot cohort pricing:
- 3-month founder pilot: $180/seat
- 6-month founder pilot: $120/seat (better value!)
Roadmap: Month 1 onboarding, Month 2 automation, Month 3 investor-ready deck — then Month 4
growth playbook unlocks for pilot members.

[ Insert TAM/SAM/SOM chart here ]

Founded by our CEO, a former Google engineer. Backed by leading angels (unnamed).
Beta results: beta 92% of founders shipped faster.

"NovaDesk replaced my entire ops team." — EarlyUser

You get: AI planning portal + weekly coaching calls + private founder community and more!
Everything you need to launch.

Subscribe today — cancel anytime (auto-renews monthly, terms not yet published).

SOC2-adjacent security posture claimed; compliance documentation is planned, not completed.
`.trim();

// ---------------------------------------------------------------------------
// Case 3 — repository / technical artifact
// ---------------------------------------------------------------------------

export const CASE3_USER_TEXT = `I found this QueueForge repository README on GitHub. I don't maintain it — I want to help the maintainer see what's overclaimed before anyone relies on it, and I also want Platynum to learn how concept-rescue applies to a technical/repo artifact instead of a marketing page. I do not own this project or its claims.`;

export const CASE3_REPO_ARTIFACT = `
FIXTURE ONLY — synthetic repository README artifact for Concept Rescue additional-case testing.
QueueForge is an invented project name; no real repository, maintainer, or company is described.

# QueueForge

Production-ready distributed task queue. Fortune 500 companies rely on QueueForge for
mission-critical workloads.

## Status
- Version: v1.0.0 (stable)
- package.json declares "version": "0.0.1-alpha"
- CI badge: passing (no CI workflow file present in this fixture)
- 99.99% uptime SLA for the hosted tier

## Pricing
- Free tier: unlimited (self-hosted)
- Team tier, 3-month contract: $180/mo
- Team tier, 6-month contract: $120/mo (better value!)

## Roadmap
- Month 1: core queue
- Month 2: dashboard
- Month 3: alerting — then Month 4 enterprise SSO unlocks

## Testimonials
"QueueForge cut our infra costs in half." — anonymous DevOps lead

## TODO
- [ ] write tests
- [ ] finish docs
- [ ] insert benchmark chart here

Built by our founder, a former Staff Engineer. SOC2 Type II compliant (audit report not linked).
`.trim();

