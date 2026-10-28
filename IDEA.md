# Project Idea

A turn-based card battler where a shared **elemental field** changes what your cards
are worth. Solo players run three escalating encounters plus a boss, growing a small
deck between fights; two people can also play the same duel locally on one device.

Sharpened by a grilling session on 2026-10-28. This file records decisions, not
requirements — it is the input to `forge-build-prd`, not a PRD.

## Original idea

> A simple turn based card game battler with graphics and mechanics such as health,
> defense, attack and an energy/field system. it should be playable on mobile as well
> as on desktop.

## What the game is

One human deck versus one opponent deck. Each turn you spend energy playing cards
from a hand of five, while a single shared field element determines which cards hit
harder, which punch through defense, and which get countered. Shifting the field and
then dumping matching cards is the signature play.

## Platform and delivery

- Responsive web app: React + TypeScript + Vite, built to static files.
- Portrait-first layout designed at ~390px wide; desktop widens to a centered
  max-width board with larger cards. No separate landscape arrangement.
- Installable PWA is a possible later step, not part of v1.
- No native mobile apps and no desktop wrapper.

## Modes

**Solo run**
- Choose one of four elemental starter decks at run start.
- Three normal encounters plus a final boss.
- After each victory, pick one of three rewards: a card, or occasionally a heal.
- Health carries across the whole run; death ends the run.
- Target session length ~10–15 minutes.

**Local duel (same device)**
- Pass-and-play on one device with a full-screen privacy interstitial between turns
  ("Pass to Player 2 — tap when ready") so hands stay hidden.
- Single standalone duel, no run structure.
- Each player picks one of the four starter decks.
- Same battle engine as solo; only the action source differs.

## Combat rules

- **Energy:** 3 per turn, no growth. Play any number of cards until energy is spent.
- **Cards:** draw to a hand of 5 at turn start; discard the remainder at end of turn;
  reshuffle the discard pile when the draw pile empties. Cards cost 0–3.
- **Health:** player starts at 40. Enemies start at 30 / 35 / 40, boss at 60.
- **Defense:** flat damage reduction subtracted from every attack, capped at 8.
  Starting defense is 0. No block pool that expires.
- **Piercing:** some attacks ignore defense entirely.
- **Field:** exactly one active element at a time — Ember, Frost, Gale, Stone, or
  Neutral. Displayed as a shared banner and it repaints the board palette.
  - Attack matching the field: empowered (+2 damage or +2 defense) **and** pierces
    defense.
  - Attack of the element the field beats: countered — damage halved (minimum 1),
    cannot pierce.
  - All other elements: normal behavior.
  - The field changes only when a Shift card says so. No automatic rotation.
- **Element cycle:** Ember → Frost → Gale → Stone → Ember (each element beats exactly
  one and is beaten by exactly one; Neutral sits outside the cycle).
- **Between encounters (solo):** health carries over with a ~30% heal after each
  victory.

## Content scope

- **~32 cards** in four types:
  - **Attack** — deals damage; some are piercing.
  - **Ward** — grants flat defense.
  - **Shift** — changes the active field element.
  - **Utility** — draw, gain energy, or apply a simple status.
- Roughly 5 cards per element (20), ~8 neutral, ~4 shift cards.
- Every element has at least one attack, one ward, one piercing attack, and one card
  that only pays off under its own field.
- Neutral carries the shift cards and generic draw/energy so every deck can interact
  with the field.
- Four ~10-card starter decks, one per element, mixing in neutral cards.
- No upgrades, no rarity tiers. Keywords limited to piercing and the field bonus.
- **Four enemies:** one themed per element as the three normal encounters, plus a
  Neutral boss that shifts the field aggressively. Fixed difficulty ramp in v1.

## AI

- Deck-driven: each enemy has its own small deck, drawn with a seeded shuffle.
- Simple heuristic play (block when threatened, attack when it can kill, prefer
  field-matching cards) using the same rules engine as the player.
- Next intent is always telegraphed so the fight is a read, not a guess.

## Presentation

- Generated art assets with a swap contract:
  - v1 ships procedural placeholders — element-tinted frames, generated portraits,
    icons.
  - `assets.manifest.json` maps every card, enemy, and field id to a file path, with a
    documented spec (dimensions, format, safe area).
  - The engine reads only the manifest, so real generated art replaces files later
    with no code change.
- Motion: card draw/play/hover, damage numbers, field-shift repaint transition.
- Audio: short synthesized sounds via WebAudio (no audio files), with a mute toggle.
- Reduced-motion setting.
- No music, no voice acting, no heavy particle VFX.

## Persistence

- `localStorage` only. No accounts, no cloud saves.
- Run state autosaved after every settled action; "Continue run" offered on load.
- Minimal settings (audio, reduced motion) and one local best-run stat.

## Success signals — v1 is done when

- A full solo run can be started and completed on a phone-sized viewport and on
  desktop.
- Local pass-and-play duel is playable end to end.
- Rules-engine unit tests cover damage, the defense cap, field matchup, piercing, and
  countered-damage rounding.
- One end-to-end test plays a full run through to the boss.
- Save/resume is verified across a page reload.
- A clean production build deploys as a static site.

## Non-goals for v1

- Online multiplayer, matchmaking, accounts, cloud saves.
- Native mobile apps or desktop packaging.
- Open-information hotseat (local play hides hands behind an interstitial).
- Deck-editing screen or pre-fight deck construction.
- Card upgrades, rarity tiers, meta-progression, unlockables.
- Music, voice, or particle-heavy VFX.
- A balance-tuning pass (see Open Questions).

## Open Questions

- **Static host.** Any static host works and no vendor-specific code will be written,
  so the choice is reversible and can wait until deploy time.
- **Final art direction and card readability.** Cannot be settled by discussion —
  needs a playable prototype to judge whether cards read clearly at 390px.
- **Balance numbers.** The values above (health, enemy health, heal percentage, field
  bonus) are starting points recorded for a first build, expected to move once the
  game is playable. Tuning is an explicit follow-up, not a v1 deliverable.
- **Local rematch flow.** Whether a single duel should become best-of-three or offer a
  rematch button depends on how a duel actually feels in play.
