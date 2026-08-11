# Robot Combat implementation intent lock

Status: **approved for a reversible local prototype by the owner message on 2026-08-11**

This checkpoint turns the current owner direction into a bounded implementation slice. It does not silently approve production deployment, public catalog exposure, wagering, prizes, or a final game identity.

## Outcome

An independent builder can enter Robot Combat through Skill Gaming World's surface, assemble a personal machine from interchangeable structural and functional parts, inspect the consequences, save named revisions, test privately, fight a local opponent, read what failed, and return to rebuild without losing the last valid revision.

## Primary player and job

The primary player is a builder learning through play. Their job is to design a machine, understand how its physical and tactical choices behave, test it, fight, inspect the failure or success, and revise it.

The workshop and arena are equal halves of the first experience. Starter archetypes are teaching fixtures, not permanent characters and not the main value of the game.

## Included in this slice

- A workshop with replaceable chassis, wheel sets, front assemblies, weapons, batteries, and paint.
- A readable machine preview assembled from the selected parts rather than a fixed character card.
- Live inspection of mass, power, balance, footprint, clearance, connections, and force-path notes.
- Valid and invalid build states with explanations; an invalid draft never overwrites the last valid revision.
- Named local revisions, loadable history, and an explicit return-to-last-valid action.
- A private test bay with driving, contact, weapon use, reset, and a visible consequence report.
- A local 1v1 arena slice that uses the saved personal build and a provisional training opponent.
- A post-match damage/performance report that points to rebuild questions and returns to the workshop.
- Keyboard and readable UI paths for important inspection, combat, damage, and recovery information.
- Free-side prototype boundaries: no wagering, entry fee, cash, prize, payout, ranking, or regulated-play behavior.

## Explicitly outside this slice

- Final title, story, venue canon, progression, social systems, ranked play, matchmaking operations, and public route/catalog integration.
- Production online authority, persistence, deployment, anti-cheat, billing, or legal activation.
- Any claim that a passing local test proves online or production readiness.

## Authority and provenance

| Item | State | Use |
|---|---|---|
| SGW is the surface and Robot Combat is the product being played | Locked by current owner message | Keep the runtime focused on the game, not a marketing landing page |
| Build, test, fight, learn, rebuild | Locked by owner seed and current direction | Primary journey and acceptance bar |
| Workshop and arena are first-class | Design requirement | Must be observable in one end-to-end run |
| Part categories and inspection dimensions | Design requirement | Implemented as prototype rules, still open to tuning |
| Three starter teaching archetypes | Design requirement | Available as dismantleable starting fixtures |
| Godot local prototype | Reversible implementation choice | Use for this proof only; do not infer production architecture |
| Bay 13, character names, exact limits, balance numbers | Provisional prototype content | Label and keep easy to replace |

## Acceptance proof

The slice is not considered proven by a boot screenshot or parser test. Proof requires:

1. A rendered workshop where a player can change parts and see the machine/inspection values change.
2. A rendered invalid build with a specific explanation and an intact last-valid revision.
3. A rendered test-bay run showing movement, contact, reset, and at least one consequence.
4. A rendered arena run using the saved build, readable damage/outcome evidence, and a report-to-rebuild path.
5. Headless assertions covering revision preservation, validation, test reset, combat outcome, and rebuild return.

## Integration boundary

This branch is an isolated prototype checkout. The dirty canonical checkout at `D:\AAATraderCorner\TradeScout\skill-gaming-world` and the configured Render service remain untouched until the local game loop is reviewed and separately authorized for integration.
