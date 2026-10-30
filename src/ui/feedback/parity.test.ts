/**
 * Parity proof for the shared diff (motion-and-feedback section 2.1).
 *
 * The refactor that made the log, the announcement and the cue list read
 * `BattleDeltas` had to be *output-identical*. Two independent proofs live here:
 *
 *   1. a frozen copy of the pre-refactor algorithms (the "legacy" functions
 *      below) is compared against the live consumers over every transition of a
 *      real seeded battle, so no prose, effect or cue can drift;
 *   2. hand-built `BattleDeltas` fixtures are mapped through the same consumers
 *      to the documented output, so the mapping itself is pinned and not just
 *      its agreement with itself.
 *
 * The existing `battle-log/derive.test.ts`, `App.a11y.test.tsx` and
 * `App.battle.test.tsx` are the third proof: they are unchanged and still pass.
 */
import { describe, expect, it } from 'vitest';
import { prepareEnemyTurn } from '../../engine/ai';
import { createBattle, endTurn, playCard } from '../../engine/battle';
import type { CardCatalog } from '../../engine/battle';
import { createRng } from '../../engine/rng';
import type {
  BattleSide,
  BattleState,
  Element,
  Side,
  StatusCounters,
} from '../../engine/types';
import type { BattleLogEffect } from '../../battle-log/types';
import { byId as cardCatalog } from '../../content/cards';
import { enemyById } from '../../content/enemies';
import { deckByElement } from '../../content/decks';
import { deriveBattleLogEntry } from '../../battle-log/derive';
import { describeBattleUpdate } from '../a11y/announcements';
import type { AnnouncedIntent } from '../a11y/announcements';
import type { FieldMatchup } from '../components/FieldBanner';
import { cuesForCardPlay as controllerCues } from '../../state/battle-controller';
import { diffBattleState } from './diff';
import type { BattleDeltas } from './diff';
import { cuesFromDeltas, logEffectsFromDeltas } from './consumers';

/* -------------------------------------------------------------------------- */
/* Frozen pre-refactor algorithms                                             */
/* -------------------------------------------------------------------------- */

/** The effect loop exactly as it stood before it read `BattleDeltas`. */
function legacyEffects(before: BattleState, after: BattleState): BattleLogEffect[] {
  const effects: BattleLogEffect[] = [];
  const actor = before.activeSide;
  const order: readonly Side[] = [actor, actor === 'player' ? 'opponent' : 'player'];

  if (before.field !== after.field) {
    effects.push({ kind: 'field', previous: before.field, next: after.field });
  }

  for (const side of order) {
    const was = before.sides[side];
    const now = after.sides[side];

    if (now.defense > was.defense) {
      effects.push({
        kind: 'defense',
        target: side,
        amount: now.defense - was.defense,
        total: now.defense,
      });
    }
  }

  for (const side of order) {
    const was = before.sides[side];
    const now = after.sides[side];

    if (now.health > was.health) {
      effects.push({
        kind: 'heal',
        target: side,
        amount: now.health - was.health,
        remaining: now.health,
        max: now.maxHealth,
      });
    }
  }

  for (const side of order) {
    const was = before.sides[side];
    const now = after.sides[side];

    if (now.health < was.health) {
      effects.push({
        kind: 'damage',
        target: side,
        amount: was.health - now.health,
        remaining: now.health,
        max: now.maxHealth,
      });
    }
  }

  for (const side of order) {
    const was = before.sides[side];
    const now = after.sides[side];

    for (const status of ['focus', 'weaken', 'regen'] as const) {
      if (now.statuses[status] > was.statuses[status]) {
        effects.push({
          kind: 'status',
          target: side,
          status,
          stacks: now.statuses[status],
        });
      }
    }
  }

  if (before.outcome === 'ongoing' && after.outcome !== 'ongoing') {
    effects.push({ kind: 'outcome', outcome: after.outcome });
  }

  return effects;
}

function elementLabel(element: Element): string {
  return element.charAt(0).toUpperCase() + element.slice(1);
}

/** The sentence exactly as it stood before it read `BattleDeltas`. */
function legacySentence(
  before: BattleState,
  after: BattleState,
  intent: AnnouncedIntent,
  matchup: FieldMatchup | null,
  enemyName: string,
): string {
  const parts: string[] = [];

  if (intent === 'end-turn') {
    parts.push('Enemy turn.');
  }

  const sentence = (
    actor: string,
    lost: number,
    remaining: number,
    max: number,
  ): string =>
    `${actor} ${actor === 'You' ? 'take' : 'takes'} ${lost} damage; ${remaining} of ${max} health.`;

  const playerLost = before.sides.player.health - after.sides.player.health;

  if (playerLost > 0) {
    parts.push(
      sentence(
        'You',
        playerLost,
        after.sides.player.health,
        after.sides.player.maxHealth,
      ),
    );
  }

  const enemyLost = before.sides.opponent.health - after.sides.opponent.health;

  if (enemyLost > 0) {
    parts.push(
      sentence(
        enemyName,
        enemyLost,
        after.sides.opponent.health,
        after.sides.opponent.maxHealth,
      ),
    );
  }

  const playerDefense =
    after.sides.player.defense - before.sides.player.defense;

  if (playerDefense > 0) {
    parts.push(`You gain ${playerDefense} defense.`);
  }

  const enemyDefense =
    after.sides.opponent.defense - before.sides.opponent.defense;

  if (enemyDefense > 0) {
    parts.push(`${enemyName} gains ${enemyDefense} defense.`);
  }

  if (before.field !== after.field) {
    if (after.field === 'neutral' || matchup === null) {
      parts.push(
        'Field shifts to Neutral. No element is empowered; no card is countered.',
      );
    } else {
      parts.push(
        `Field shifts to ${elementLabel(after.field)}. ${elementLabel(
          matchup.empowered,
        )} is empowered; ${elementLabel(matchup.countered)} is countered.`,
      );
    }
  }

  if (after.outcome === 'player-victory') {
    parts.push('Victory.');
  } else if (after.outcome === 'opponent-victory') {
    parts.push('Defeat.');
  }

  if (intent === 'end-turn' && after.outcome === 'ongoing') {
    parts.push(`Your turn. Turn ${after.turn}.`);
  }

  if (parts.length === 0) {
    parts.push('Card played.');
  }

  return parts.join(' ');
}

/** The cue loop exactly as it stood before it read `BattleDeltas`. */
function legacyCues(before: BattleState, after: BattleState): readonly string[] {
  const cues: string[] = ['card-play'];

  if (
    after.sides.player.health < before.sides.player.health ||
    after.sides.opponent.health < before.sides.opponent.health
  ) {
    cues.push('damage');
  }

  if (
    after.sides.player.defense > before.sides.player.defense ||
    after.sides.opponent.defense > before.sides.opponent.defense
  ) {
    cues.push('ward');
  }

  if (after.field !== before.field) {
    cues.push('shift');
  }

  if (after.outcome === 'player-victory') {
    cues.push('victory');
  } else if (after.outcome === 'opponent-victory') {
    cues.push('defeat');
  }

  return cues;
}

/* -------------------------------------------------------------------------- */
/* A real seeded battle                                                       */
/* -------------------------------------------------------------------------- */

const EMBER_MATCHUP: FieldMatchup = {
  empowered: 'ember',
  countered: 'frost',
  beatenBy: 'stone',
};

function requiredEnemy() {
  const enemy = enemyById('enemy-cinder-warden');

  if (enemy === undefined) {
    throw new Error('the frozen catalog is missing the first enemy');
  }

  return enemy;
}

function seededBattle(): BattleState {
  const deck = deckByElement('ember');
  const enemy = requiredEnemy();

  if (deck === undefined) {
    throw new Error('the frozen catalog is missing the Ember deck');
  }

  const created = createBattle({
    seed: 11,
    player: { element: deck.element, cards: deck.cards },
    opponent: {
      element: enemy.element,
      cards: enemy.deck,
      maxHealth: enemy.maxHealth,
    },
    catalog: cardCatalog as CardCatalog,
  });

  if (!created.ok) {
    throw new Error(`the seeded battle did not start: ${created.error.message}`);
  }

  return created.value;
}

interface Transition {
  readonly name: string;
  readonly before: BattleState;
  readonly after: BattleState;
  readonly intent: AnnouncedIntent;
  readonly cardId: string | null;
}

/**
 * Drives a scripted battle and captures every settled transition: card plays by
 * both sides until the player has no affordable card, then the enemy plan, then
 * an end turn, for four turns. The script is deterministic (fixed seed, frozen
 * planner), so the fixtures are stable without a snapshot file.
 */
function battleTransitions(): readonly Transition[] {
  const transitions: Transition[] = [];
  const enemy = requiredEnemy();
  let state = prepareEnemyTurn(
    seededBattle(),
    cardCatalog as CardCatalog,
    enemy,
    'opponent',
  );

  for (let turn = 0; turn < 4; turn += 1) {
    for (;;) {
      const hand = state.sides.player.hand;
      const playable = hand.find((instance) => {
        const card = cardCatalog[instance.cardId];

        return card !== undefined && card.cost <= state.sides.player.energy;
      });

      if (playable === undefined) {
        break;
      }

      const played = playCard(
        state,
        { type: 'play-card', side: 'player', instanceId: playable.instanceId },
        cardCatalog as CardCatalog,
      );

      if (!played.ok) {
        break;
      }

      transitions.push({
        name: `turn ${String(state.turn)} play ${playable.cardId}`,
        before: state,
        after: played.value,
        intent: 'play-card',
        cardId: playable.cardId,
      });
      state = played.value;

      if (state.outcome !== 'ongoing') {
        return transitions;
      }
    }

    // The stored telegraph is cleared by the engine when the player's turn ends.
    const plan = state.enemyPlan;
    const handedOff = endTurn(state, { type: 'end-turn', side: 'player' });

    if (!handedOff.ok) {
      break;
    }

    transitions.push({
      name: `turn ${String(state.turn)} player handoff`,
      before: state,
      after: handedOff.value,
      intent: 'end-turn',
      cardId: null,
    });
    state = handedOff.value;

    // The enemy's whole plan, step by step.
    for (const step of plan?.steps ?? []) {
      const played = playCard(
        state,
        { type: 'play-card', side: 'opponent', instanceId: step.instanceId },
        cardCatalog as CardCatalog,
      );

      if (!played.ok) {
        break;
      }

      transitions.push({
        name: `turn ${String(state.turn)} enemy ${step.cardId}`,
        before: state,
        after: played.value,
        intent: 'play-card',
        cardId: step.cardId,
      });
      state = played.value;

      if (state.outcome !== 'ongoing') {
        return transitions;
      }
    }

    const closed = endTurn(state, { type: 'end-turn', side: 'opponent' });

    if (!closed.ok) {
      break;
    }

    transitions.push({
      name: `turn ${String(state.turn)} enemy handoff`,
      before: state,
      after: closed.value,
      intent: 'end-turn',
      cardId: null,
    });
    state = prepareEnemyTurn(
      closed.value,
      cardCatalog as CardCatalog,
      enemy,
      'opponent',
    );
  }

  return transitions;
}

const TRANSITIONS = battleTransitions();

/* -------------------------------------------------------------------------- */

describe('shared-diff parity with the pre-refactor consumers', () => {
  it('captured a real battle with damage, defense, a shift and a handoff', () => {
    const effects = TRANSITIONS.flatMap((transition) =>
      legacyEffects(transition.before, transition.after),
    );
    const kinds = new Set(effects.map((effect) => effect.kind));

    expect(TRANSITIONS.length).toBeGreaterThan(4);
    expect(kinds.has('damage')).toBe(true);
    expect(kinds.has('defense')).toBe(true);
    expect(kinds.has('field')).toBe(true);
  });

  it('derives the same log effects for every settled transition', () => {
    for (const transition of TRANSITIONS) {
      const { before, after } = transition;
      const deltas = diffBattleState(before, after);
      const entry = deriveBattleLogEntry(before, after, {
        kind: 'card',
        ordinal: 1,
        cardId: transition.cardId ?? 'ember-cinder-jab',
      });

      expect(entry.effects, transition.name).toEqual(
        legacyEffects(before, after),
      );
      expect(entry.effects, transition.name).toEqual(
        logEffectsFromDeltas(deltas, after, {
          actor: before.activeSide,
          settled:
            before.outcome === 'ongoing' && after.outcome !== 'ongoing',
        }),
      );
    }
  });

  it('composes the same sentence for every settled transition', () => {
    for (const transition of TRANSITIONS) {
      const { before, after, intent } = transition;
      const matchup = after.field === 'ember' ? EMBER_MATCHUP : null;

      expect(
        describeBattleUpdate({
          deltas: diffBattleState(before, after),
          next: after,
          intent,
          fieldMatchup: matchup,
          enemyName: 'Cinder Warden',
        }),
        transition.name,
      ).toBe(legacySentence(before, after, intent, matchup, 'Cinder Warden'));
    }
  });

  it('emits the same cue list for every resolved card', () => {
    for (const transition of TRANSITIONS) {
      const { before, after } = transition;

      expect(controllerCues(before, after), transition.name).toEqual(
        legacyCues(before, after),
      );
      expect(
        controllerCues(before, after),
        transition.name,
      ).toEqual([
        'card-play',
        ...cuesFromDeltas(diffBattleState(before, after)),
      ]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Deltas fixtures map to the documented output                               */
/* -------------------------------------------------------------------------- */

function statuses(overrides: Partial<StatusCounters> = {}): StatusCounters {
  return { focus: 0, weaken: 0, regen: 0, ...overrides };
}

function side(overrides: Partial<BattleSide> = {}): BattleSide {
  return {
    side: 'player',
    element: 'ember',
    health: 40,
    maxHealth: 40,
    defense: 0,
    energy: 3,
    deck: [],
    hand: [],
    discard: [],
    statuses: statuses(),
    ...overrides,
  };
}

const AFTER: BattleState = {
  seed: 1,
  rngState: createRng(1),
  turn: 4,
  activeSide: 'player',
  phase: 'action',
  field: 'frost',
  outcome: 'ongoing',
  sides: {
    player: side({ health: 34, defense: 3 }),
    opponent: side({ side: 'opponent', health: 27 }),
  },
  enemyPlan: null,
};

const FIXTURE: BattleDeltas = {
  health: { player: -6, opponent: -3 },
  defense: { player: 2, opponent: 0 },
  statuses: [{ side: 'opponent', status: 'weaken', stacks: 2 }],
  field: { previous: 'neutral', next: 'frost' },
  outcome: 'ongoing',
  turnChanged: true,
  turn: 4,
};

describe('BattleDeltas fixtures', () => {
  it('maps to the log effects the entry records', () => {
    expect(
      logEffectsFromDeltas(FIXTURE, AFTER, {
        actor: 'player',
        settled: false,
      }),
    ).toEqual([
      { kind: 'field', previous: 'neutral', next: 'frost' },
      { kind: 'defense', target: 'player', amount: 2, total: 3 },
      { kind: 'damage', target: 'player', amount: 6, remaining: 34, max: 40 },
      { kind: 'damage', target: 'opponent', amount: 3, remaining: 27, max: 40 },
      { kind: 'status', target: 'opponent', status: 'weaken', stacks: 2 },
    ]);
  });

  it('maps to the cue list a resolved card emits', () => {
    expect(cuesFromDeltas(FIXTURE)).toEqual(['damage', 'ward', 'shift']);
    expect(cuesFromDeltas({ ...FIXTURE, outcome: 'player-victory' })).toEqual([
      'damage',
      'ward',
      'shift',
      'victory',
    ]);
    expect(
      cuesFromDeltas({
        health: { player: 0, opponent: 0 },
        defense: { player: 0, opponent: 0 },
        statuses: [],
        field: null,
        outcome: 'opponent-victory',
        turnChanged: false,
        turn: 4,
      }),
    ).toEqual(['defeat']);
  });

  it('omits zero and decreasing deltas instead of inventing +0 facts', () => {
    const quiet: BattleDeltas = {
      health: { player: 0, opponent: 0 },
      defense: { player: 0, opponent: 0 },
      statuses: [],
      field: null,
      outcome: 'ongoing',
      turnChanged: false,
      turn: 4,
    };

    expect(
      logEffectsFromDeltas(quiet, AFTER, { actor: 'player', settled: false }),
    ).toEqual([]);
    expect(cuesFromDeltas(quiet)).toEqual([]);
  });

  it('adds the outcome effect only when the transition settled the battle', () => {
    const settled: BattleDeltas = { ...FIXTURE, outcome: 'player-victory' };

    expect(
      logEffectsFromDeltas(settled, AFTER, { actor: 'player', settled: true }),
    ).toContainEqual({ kind: 'outcome', outcome: 'player-victory' });
    expect(
      logEffectsFromDeltas(settled, AFTER, { actor: 'player', settled: false }),
    ).not.toContainEqual({ kind: 'outcome', outcome: 'player-victory' });
  });
});
