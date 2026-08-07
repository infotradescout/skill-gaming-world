# SGW Robot Combat — Game Foundation Specification

**Version:** 0.1  
**Date:** August 7, 2026  
**Status:** Asset generator delivered; gameplay runtime not yet claimed

## Part 1 — The big real-world problem

Most robot-combat games force players to choose from fixed machines. That removes the strongest part of the idea: inventing a machine, testing whether it works, and discovering what happens when it hits another player’s design.

The opposite extreme is also broken. Allowing unrestricted model or script uploads would let players hide collision shapes, lie about weight, inject executable behavior, create impossible weapons, overload devices with extreme geometry, or crash a match.

The game therefore needs two things at once:

1. wide creative freedom for honest players;
2. one server-controlled physical truth for every fight.

Blender alone is not the online game runtime. It is the scripted asset factory. The game engine receives those assets and handles physics, controls, construction, networking, and presentation.

## Part 2 — How it actually works

### 2.1 Product position

**Platform:** Skill Gaming World  
**Side at first release:** Free  
**Working title:** SGW Robot Combat  
**Category:** 3D skill-based robot construction and combat  
**Initial formats:** practice, local testing, private online matches, free ranked matches after verification

This game is another title inside Skill Gaming World. It is not a third top-level platform side.

### 2.2 Blender asset pipeline

The included Blender script produces a complete repeatable source scene rather than a one-off manually assembled file.

Every build creates the same named collections, objects, sockets, metadata fields, exports, and manifest. That makes later changes reviewable and allows the arena or bot library to be regenerated instead of repaired by hand.

Blender outputs GLB because glTF 2.0 carries object hierarchy, transforms, PBR materials, cameras, lights, and custom object properties in a form designed for game engines.

### 2.3 Arena v1

The first arena contains:

- 24 meter × 16 meter internal fighting floor;
- 3.4 meter safety enclosure;
- high-friction steel floor;
- lower steel kick rails;
- transparent upper safety walls;
- structural posts and top rails;
- overhead lighting truss;
- overview and runtime camera anchors;
- three starting circles;
- center identity marking;
- four clearly tagged but inactive hazard bays;
- external apron and original venue backdrop.

No active arena hazard exists in v0.1. A floor marker does not become a working hazard until the server owns its state, timing, collision behavior, damage, match logging, and replay evidence.

### 2.4 Three starter robots

#### Rammer

A fast four-wheel pusher with a low wedge. It teaches steering, positioning, wall control, and flipping leverage without an active weapon.

#### Ripper

A four-wheel vertical spinner with side guards and two front forks. It teaches weapon spin-up, approach timing, recoil, and weapon exposure.

#### Maul

A four-wheel hammer robot with a front wedge. It teaches controlled striking, target selection, attack timing, and recovery after a missed swing.

The robots are original generic designs. They must not be renamed, textured, or shaped to imitate a protected television robot without written permission.

### 2.5 Player construction model

The construction system uses approved modular pieces with free combination.

Initial categories:

- chassis;
- wheels;
- drive motors;
- batteries;
- flat armor;
- wedges and forks;
- vertical spinner;
- hammer;
- structural connectors;
- visual paint and decals.

Initial standard class:

- maximum mass: 120 kilograms;
- maximum bounding size: 3.8 × 3.8 × 2.4 meters;
- maximum part count: 64;
- minimum powered wheels: 2;
- maximum active weapons: 2;
- at least one valid battery;
- complete attachment path from every external part to a chassis;
- no illegal overlap of solid collision bodies;
- no part outside the maximum spawn envelope.

These are game rules, not claimed copies of any real competition’s rules.

### 2.6 Blueprint format

A player blueprint should contain data, not executable instructions:

- blueprint ID and version;
- owner ID;
- name and visual choices;
- selected chassis;
- placed part IDs;
- local position and rotation of each part;
- attachment socket relationships;
- optional mirrored state;
- declared control bindings;
- client-calculated estimate for display only;
- server-calculated legal result;
- server-calculated mass, power, center of mass, dimensions, and collision summary;
- content moderation state for names and decals;
- immutable blueprint hash used by the match record.

The server rebuilds the robot from the approved catalog. It never trusts a client-supplied mass, force, damage, durability, socket, or collision value.

### 2.7 Combat simulation

The first playable physics model should use one rigid body per robot assembly with separately simulated active weapon bodies where necessary.

The server controls:

- chassis forces and steering torque;
- traction and floor contact;
- active weapon speed and position;
- collision impulses;
- part durability;
- damage events;
- detachment events;
- immobilization timer;
- arena boundaries and hazards;
- match clock;
- winner and reason;
- replay event stream.

Clients send time-ordered control intent. They do not report that they moved, struck another robot, dealt damage, won, or remained inside the arena.

### 2.8 Initial match rules

- standard match length: 180 seconds;
- possible results: knockout, immobilization, arena-out, judges’ decision, draw, no-contest;
- initial hazards: disabled;
- disconnect behavior: the bot coasts to a stop and enters server safe mode;
- reconnect grace period: defined by the later match service, not invented in the asset package;
- scoring: held until the damage and control measurements are proven stable.

### 2.9 Online architecture

The target online path is:

1. Browser or desktop client logs into Skill Gaming World.
2. Player selects a server-approved blueprint.
3. Match service places players into one exact arena and rules version.
4. A headless Godot match server reconstructs each robot from the approved blueprint and part catalog.
5. Clients connect through secure WebSocket multiplayer for browser compatibility.
6. Clients send control input with sequence numbers and timestamps.
7. Server simulates physics and publishes state snapshots.
8. Clients interpolate remote robots and correct local prediction against server state.
9. Server writes the final match record, blueprint hashes, rules version, result, disconnects, and replay events.

The first network test should be two players. The arena can later support free-for-all formats, teams, tournaments, spectators, and private rooms without changing the authority model.

## Part 3 — Why it is safe and honest

### 3.1 Creative freedom without executable uploads

Players can build strange and original machines from a broad approved catalog. They cannot upload Python, native code, arbitrary shaders, hidden colliders, or unbounded geometry into a public match.

Custom visual shells can come later, but they must be processed into safe limits and must never change the verified physical collision model.

### 3.2 Server authority

The match server is the only source of truth for movement, collision, damage, weapon state, scoring, and results. A modified client can request an impossible action, but the server rejects it or limits it to the approved robot capabilities.

### 3.3 Blueprint equality

Every player’s approved blueprint receives a version and hash before the match. The exact server-built configuration becomes part of the match record. A robot cannot quietly gain more armor, mass, power, or weapon force after matchmaking.

### 3.4 Free-side boundary

The first release is a Free title. It has:

- no paid entry;
- no wager;
- no cash prize;
- no item redeemable for money or value;
- no purchased stat advantage;
- no bridge from entertainment units into Legal Play;
- no claim that the game has passed legal skill-prize approval.

Cosmetic sales, subscriptions, or other business models can be evaluated separately. They must not alter fight physics or matchmaking power.

### 3.5 Brand boundary

“BattleBots” is not used as the public title, logo, metadata, store keyword, domain, or implied affiliation. The game remains an original robot-combat property unless a real license is obtained.

## Part 4 — The bottom line for humans

A player should be able to start with Rammer, Ripper, or Maul, understand the controls quickly, and enter the arena.

After that, the player should be able to open the garage, choose a chassis, place wheels, install power, shape the front, add armor, choose a weapon, paint the machine, test it, and receive plain-English reasons when the design is too heavy, too large, disconnected, underpowered, or unsafe.

The player gets genuine invention instead of a fixed character selection. The opponent gets a fair fight against the exact robot the server approved. Skill Gaming World gets a reusable 3D game pipeline in which Blender generates the world and parts while the runtime enforces honest online competition.
