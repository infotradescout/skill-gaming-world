/**
 * Synthetic Concept Rescue fixture for local vertical proof.
 *
 * This is NOT a scrape of a live brand site and MUST NOT be used as a commercial
 * Steady Paws rebuild. It encodes unfinished-PoC failure patterns the workflow
 * must detect when present in supplied content.
 */

export const CONCEPT_RESCUE_REQUIRED_INPUT = `I found this Steady Paws proof of concept online. I am trying to help the creator improve or validate it. I also want Platynum to learn a reusable concept-rescue workflow from the case. I do not own the original concept, brand, claims, testimonials, or assets.`;

export const CONCEPT_RESCUE_AMBIGUOUS_INPUT = `Create a better version.`;

export const CONCEPT_RESCUE_CORRECTION_INPUT = `I do not own this. I am helping the creator, and I also want to test Platynum’s diagnosis workflow. Do not build another sales page.`;

/**
 * Unfinished subscription-style PoC text with planted contradictions.
 * Generic labels only — no real testimonials, credentials, or assets copied.
 */
export const CONCEPT_RESCUE_FIXTURE_ARTIFACT = `
FIXTURE ONLY — unfinished proof of concept text for Concept Rescue detection tests.

Offer name: Mobility Comfort Club (generic fixture label)

Join our 3-month senior dog mobility subscription for confidence at home.
Roadmap: Month 1 intake, Month 2 coaching, Month 3 community — then Month 4 bonus module unlocks.

Pricing:
- 3-month plan: $180
- 6-month plan: $120 (best value!)

[ Graph here ]

Our founder is a veterinary expert. Vet-approved joint support supplements included.
Beta results: beta 87% of dogs improved mobility.

"This changed everything for my dog." — HappyOwner

Physical kit + digital portal + community and more! Everything you need.

Subscribe today for automatic renewal.
(No cancellation, refund, shipping, or fulfillment terms specified in this fixture.)

Clinical arthritis treatment language appears beside consumer subscription copy.
`.trim();

