// @vitest-environment node
/**
 * Battle-log prose renderer contract (LOG-FR-02, LOG-FR-03, LOG-NF-01).
 *
 * The suite covers:
 *
 *   1. factual prose: actor, card, and every non-zero effect with its
 *      engine-reported remaining/maximum or total value;
 *   2. omission: zero-value effects and an ongoing outcome are never printed;
 *   3. dialogue: at most one authored line per entry, keyed on the ordinal,
 *      with the enemy speaking its own moments and the narrator in duel;
 *   4. determinism and isolation: rendering twice is identical and rendering
 *      leaves a real `BattleState` (including its PRNG state and outcome)
 *      byte-for-byte unchanged.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BATTLE_DIALOGUE, ENEMY_DIALOGUE_IDS } from '../content/battle-dialogue';
import type {
  DialogueCatalog,
  EnemyDialogue,
  EnemyDialogueId,
} from '../content/battle-dialogue';
import { byId } from '../content/cards';
import { deckByElement } from '../content/decks';
import { enemyById } from '../content/enemies';
import { createBattle, endTurn, playCard } from '../engine/battle';
import { deriveBattleLogEntry, deriveBattleStartEntry } from './derive';
import {
  BATTLE_LOG_LINE_MAX,
  dialogueTriggerFor,
  renderBattleLog,
  renderBattleLogEntry,
  renderBattleLogFact,
} from './text';
import type {
  BattleLogNames,
  BattleLogRenderContext,
} from './text';
import type {
  BattleLogActor,
  BattleLogDamageEffect,
  BattleLogDefenseEffect,
  BattleLogEffect,
  BattleLogEntry,
  BattleLogEntryKind,
  BattleLogHealEffect,
  BattleLogOutcomeEffect,
  BattleLogStatusEffect,
} from './types';
import type {
  BattleOutcome,
  BattleState,
  EnemyDefinition,
  Side,
  StatusKind,
} from '../engine/types';

const ENEMY_ID: EnemyDialogueId = 'enemy-cinder-warden';
const NAMES: BattleLogNames = { player: 'You', opponent: 'Cinder Warden' };

const CONTEXT: BattleLogRenderContext = {
  seed: 0x1234_5678,
  names: NAMES,
  catalog: byId,
  dialogue: BATTLE_DIALOGUE,
  enemyId: ENEMY_ID,
};

function enemyDialogue(id: EnemyDialogueId): EnemyDialogue {
  const set = BATTLE_DIALOGUE.enemies[id];

  if (set === undefined) {
    throw new Error(`missing dialogue for ${id}`);
  }

  return set;
}

const WARDEN = enemyDialogue(ENEMY_ID);

interface EntryInit {
  readonly ordinal: number;
  readonly turn?: number;
  readonly kind: BattleLogEntryKind;
  readonly actor: BattleLogActor;
  readonly cardId?: string;
  readonly effects: readonly BattleLogEffect[];
}

function makeEntry(init: EntryInit): BattleLogEntry {
  const turn = init.turn ?? 1;

  return {
    id: `t${turn}-e${init.ordinal}`,
    ordinal: init.ordinal,
    turn,
    kind: init.kind,
    actor: init.actor,
    ...(init.cardId === undefined ? {} : { cardId: init.cardId }),
    effects: init.effects,
  };
}

function damage(
  target: Side,
  amount: number,
  remaining: number,
  max: number,
): BattleLogDamageEffect {
  return { kind: 'damage', target, amount, remaining, max };
}

function heal(
  target: Side,
  amount: number,
  remaining: number,
  max: number,
): BattleLogHealEffect {
  return { kind: 'heal', target, amount, remaining, max };
}

function defense(
  target: Side,
  amount: number,
  total: number,
): BattleLogDefenseEffect {
  return { kind: 'defense', target, amount, total };
}

function status(
  target: Side,
  kind: StatusKind,
  stacks: number,
): BattleLogStatusEffect {
  return { kind: 'status', target, status: kind, stacks };
}

function outcome(value: BattleOutcome): BattleLogOutcomeEffect {
  return { kind: 'outcome', outcome: value };
}

const START: BattleLogEntry = makeEntry({
  ordinal: 0,
  kind: 'battle-start',
  actor: 'system',
  effects: [{ kind: 'start', opposingMaxHealth: 30, field: 'neutral' }],
});

/* -------------------------------------------------------------------------- */
/* Factual prose                                                               */
/* -------------------------------------------------------------------------- */

describe('factual prose', () => {
  it('opens with the opponent health and the field in words', () => {
    const line = renderBattleLogEntry(START, CONTEXT);

    expect(line.factual).toContain('Cinder Warden has 30 health');
    expect(line.factual).toContain(
      'the field is Neutral (nothing is empowered or countered)',
    );
    expect(line.dialogue).not.toBeNull();
    expect(WARDEN['battle-start']).toContain(line.dialogue);
  });

  it('names the actor, the card and the damage with remaining health', () => {
    const entry = makeEntry({
      ordinal: 1,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-cinder-jab',
      effects: [damage('opponent', 3, 27, 30)],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('You play Cinder Jab');
    expect(line.factual).toContain('3 damage to Cinder Warden (27/30)');
    expect(BATTLE_DIALOGUE.narrator['first-blood']).toContain(line.dialogue);
  });

  it('uses third-person verbs for a named side', () => {
    const entry = makeEntry({
      ordinal: 2,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-cinder-jab',
      effects: [damage('player', 3, 37, 40)],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('Cinder Warden plays Cinder Jab');
    expect(line.factual).toContain('3 damage to you (37/40)');
  });

  it('states healing, defense and status stacks with their totals', () => {
    const entry = makeEntry({
      ordinal: 3,
      kind: 'card',
      actor: 'player',
      cardId: 'neutral-second-wind',
      effects: [
        defense('player', 2, 2),
        heal('player', 2, 38, 40),
        status('player', 'regen', 2),
        status('opponent', 'weaken', 2),
      ],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('2 defense (total 2)');
    expect(line.factual).toContain('2 health restored to you (38/40)');
    expect(line.factual).toContain('Regen on you (2 stacks)');
    expect(line.factual).toContain('Weaken on Cinder Warden (2 stacks)');
  });

  it('omits zero-value effects instead of printing a synthetic zero', () => {
    const entry = makeEntry({
      ordinal: 4,
      kind: 'card',
      actor: 'player',
      cardId: 'neutral-probe',
      effects: [
        damage('opponent', 0, 30, 30),
        defense('player', 0, 4),
        status('player', 'focus', 0),
        outcome('ongoing'),
      ],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toBe('You play Probe.');
    expect(line.factual).not.toContain('0 damage');
    expect(line.dialogue).toBeNull();
  });

  it('names the empowered and countered elements on a field shift', () => {
    const entry = makeEntry({
      ordinal: 5,
      kind: 'card',
      actor: 'player',
      cardId: 'shift-ember',
      effects: [{ kind: 'field', previous: 'neutral', next: 'ember' }],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('the field shifts from Neutral to Ember');
    expect(line.factual).toContain('Ember is empowered, Frost is countered');
    expect(BATTLE_DIALOGUE.narrator['field-shift']).toContain(line.dialogue);
  });

  it('lets the enemy voice react to a shift it caused', () => {
    const entry = makeEntry({
      ordinal: 6,
      kind: 'card',
      actor: 'opponent',
      cardId: 'shift-frost',
      effects: [{ kind: 'field', previous: 'neutral', next: 'frost' }],
    });

    expect(WARDEN['field-shift']).toContain(
      renderBattleLogEntry(entry, CONTEXT).dialogue,
    );
  });

  it('states a Neutral field with nothing empowered or countered', () => {
    const entry = makeEntry({
      ordinal: 7,
      kind: 'card',
      actor: 'player',
      cardId: 'shift-stone',
      effects: [{ kind: 'field', previous: 'stone', next: 'neutral' }],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain(
      'the field shifts from Stone to Neutral (nothing is empowered or countered)',
    );
  });

  it('closes a winning entry with victory', () => {
    const entry = makeEntry({
      ordinal: 8,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-inferno',
      effects: [damage('opponent', 7, 0, 30), outcome('player-victory')],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('7 damage to Cinder Warden (0/30)');
    expect(line.factual).toContain('victory (Cinder Warden is defeated)');
    expect(WARDEN.victory).toContain(line.dialogue);
  });

  it('closes a losing entry with defeat', () => {
    const entry = makeEntry({
      ordinal: 9,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-cinder-jab',
      effects: [damage('player', 5, 0, 40), outcome('opponent-victory')],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toContain('5 damage to you (0/40)');
    expect(line.factual).toContain('defeat (Cinder Warden wins)');
    expect(WARDEN.defeat).toContain(line.dialogue);
  });

  it('renders a turn entry with its end-of-turn healing', () => {
    const entry = makeEntry({
      ordinal: 10,
      kind: 'turn',
      actor: 'opponent',
      effects: [heal('player', 2, 38, 40)],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.factual).toBe(
      'Cinder Warden ends the turn: 2 health restored to you (38/40).',
    );
  });

  it('renders an empty turn in the second person for the player', () => {
    const entry = makeEntry({
      ordinal: 11,
      kind: 'turn',
      actor: 'player',
      effects: [],
    });

    expect(renderBattleLogFact(entry, CONTEXT)).toBe('You end the turn.');
  });

  it('falls back to the card id when the catalog has no entry', () => {
    const entry = makeEntry({
      ordinal: 12,
      kind: 'card',
      actor: 'player',
      cardId: 'unknown-card',
      effects: [],
    });

    expect(renderBattleLogFact(entry, CONTEXT)).toBe(
      'You play unknown-card.',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Triggers                                                                    */
/* -------------------------------------------------------------------------- */

describe('dialogue triggers', () => {
  it('maps each public event to its trigger tag', () => {
    expect(dialogueTriggerFor(START)).toBe('battle-start');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 1,
          kind: 'card',
          actor: 'player',
          cardId: 'shift-gale',
          effects: [{ kind: 'field', previous: 'frost', next: 'gale' }],
        }),
      ),
    ).toBe('field-shift');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 2,
          kind: 'card',
          actor: 'player',
          cardId: 'ember-cinder-jab',
          effects: [damage('opponent', 3, 27, 30)],
        }),
      ),
    ).toBe('first-blood');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 3,
          kind: 'card',
          actor: 'player',
          cardId: 'ember-inferno',
          effects: [damage('opponent', 6, 12, 30)],
        }),
      ),
    ).toBe('big-hit');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 4,
          kind: 'card',
          actor: 'opponent',
          cardId: 'ember-inferno',
          effects: [damage('player', 31, 9, 40)],
        }),
      ),
    ).toBe('low-health-player');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 5,
          kind: 'card',
          actor: 'player',
          cardId: 'ember-inferno',
          effects: [damage('opponent', 23, 7, 30)],
        }),
      ),
    ).toBe('low-health-enemy');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 6,
          kind: 'card',
          actor: 'player',
          cardId: 'ember-inferno',
          effects: [damage('opponent', 7, 0, 30), outcome('player-victory')],
        }),
      ),
    ).toBe('victory');

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 7,
          kind: 'card',
          actor: 'opponent',
          cardId: 'ember-cinder-jab',
          effects: [damage('player', 5, 0, 40), outcome('opponent-victory')],
        }),
      ),
    ).toBe('defeat');
  });

  it('returns null for an entry with no notable event', () => {
    const entry = makeEntry({
      ordinal: 1,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-ash-guard',
      effects: [defense('player', 2, 2)],
    });

    expect(dialogueTriggerFor(entry)).toBeNull();
    expect(renderBattleLogEntry(entry, CONTEXT).dialogue).toBeNull();
  });

  it('picks one line when several triggers collide, and the outcome wins', () => {
    const entry = makeEntry({
      ordinal: 12,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-inferno',
      effects: [
        damage('opponent', 7, 0, 30),
        outcome('player-victory'),
      ],
    });
    const line = renderBattleLogEntry(entry, CONTEXT);

    expect(line.dialogue).not.toBeNull();
    expect(WARDEN.victory).toContain(line.dialogue);
    expect(BATTLE_DIALOGUE.narrator['big-hit']).not.toContain(line.dialogue);
    expect(BATTLE_DIALOGUE.narrator['first-blood']).not.toContain(
      line.dialogue,
    );
  });

  it('keys on the entry ordinal, not its array position', () => {
    const entries: BattleLogEntry[] = [
      START,
      makeEntry({
        ordinal: 1,
        kind: 'card',
        actor: 'player',
        cardId: 'shift-ember',
        effects: [{ kind: 'field', previous: 'neutral', next: 'ember' }],
      }),
      makeEntry({
        ordinal: 2,
        kind: 'card',
        actor: 'player',
        cardId: 'ember-cinder-jab',
        effects: [damage('opponent', 3, 27, 30)],
      }),
      makeEntry({
        ordinal: 3,
        kind: 'card',
        actor: 'opponent',
        cardId: 'ember-inferno',
        effects: [damage('player', 31, 9, 40)],
      }),
      makeEntry({
        ordinal: 4,
        kind: 'card',
        actor: 'player',
        cardId: 'ember-inferno',
        effects: [damage('opponent', 7, 0, 30), outcome('player-victory')],
      }),
    ];

    const full = renderBattleLog(entries, CONTEXT);
    const capped = renderBattleLog(entries.slice(-3), CONTEXT);

    for (const survivor of capped) {
      const original = full.find((line) => line.ordinal === survivor.ordinal);

      expect(original).toBeDefined();
      expect(survivor).toStrictEqual(original);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Mode names                                                                  */
/* -------------------------------------------------------------------------- */

describe('render context', () => {
  it('uses player names and the narrator in duel', () => {
    const duelContext: BattleLogRenderContext = {
      seed: 77,
      names: { player: 'Player 1', opponent: 'Player 2' },
      catalog: byId,
      dialogue: BATTLE_DIALOGUE,
      enemyId: null,
    };
    const entry = makeEntry({
      ordinal: 1,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-cinder-jab',
      effects: [damage('opponent', 3, 27, 30)],
    });
    const line = renderBattleLogEntry(entry, duelContext);

    expect(line.factual).toContain('Player 1 plays Cinder Jab');
    expect(line.factual).toContain('3 damage to Player 2 (27/30)');
    expect(BATTLE_DIALOGUE.narrator['first-blood']).toContain(line.dialogue);
    expect(BATTLE_DIALOGUE.narrator['battle-start']).toContain(
      renderBattleLogEntry(START, duelContext).dialogue,
    );
  });

  it('renders a duel entry from the opponent seat perspective', () => {
    const context: BattleLogRenderContext = {
      seed: 77,
      names: { player: 'Player 2', opponent: 'Player 1' },
      viewerSide: 'opponent',
      catalog: byId,
      dialogue: BATTLE_DIALOGUE,
      enemyId: null,
    };
    const play = makeEntry({
      ordinal: 1,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-cinder-jab',
      effects: [damage('player', 3, 37, 40)],
    });
    const played = renderBattleLogEntry(play, context);

    expect(played.factual).toContain('Player 2 plays Cinder Jab');
    expect(played.factual).toContain('3 damage to Player 1 (37/40)');
    expect(BATTLE_DIALOGUE.narrator['first-blood']).toContain(
      played.dialogue,
    );

    const win = renderBattleLogEntry(
      makeEntry({
        ordinal: 2,
        kind: 'card',
        actor: 'opponent',
        cardId: 'ember-inferno',
        effects: [damage('player', 5, 0, 40), outcome('opponent-victory')],
      }),
      context,
    );

    expect(win.factual).toContain('victory (Player 1 is defeated)');
    expect(BATTLE_DIALOGUE.narrator.victory).toContain(win.dialogue);

    const loss = renderBattleLogEntry(
      makeEntry({
        ordinal: 3,
        kind: 'card',
        actor: 'player',
        cardId: 'ember-inferno',
        effects: [damage('opponent', 5, 0, 40), outcome('player-victory')],
      }),
      context,
    );

    expect(loss.factual).toContain('defeat (Player 1 wins)');
    expect(BATTLE_DIALOGUE.narrator.defeat).toContain(loss.dialogue);

    expect(
      dialogueTriggerFor(
        makeEntry({
          ordinal: 4,
          kind: 'card',
          actor: 'player',
          cardId: 'ember-inferno',
          effects: [damage('player', 31, 9, 40)],
        }),
        'opponent',
      ),
    ).toBe('low-health-enemy');
  });

  it('returns null rather than inventing a line for an unset trigger', () => {
    const silent: DialogueCatalog = {
      narrator: {
        ...BATTLE_DIALOGUE.narrator,
        'low-health-player': [],
      },
      enemies: BATTLE_DIALOGUE.enemies,
    };
    const entry = makeEntry({
      ordinal: 5,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-inferno',
      effects: [damage('player', 31, 9, 40)],
    });
    const line = renderBattleLogEntry(entry, {
      ...CONTEXT,
      dialogue: silent,
    });

    expect(line.dialogue).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Module isolation                                                            */
/* -------------------------------------------------------------------------- */

describe('module isolation', () => {
  const source = readFileSync(new URL('./text.ts', import.meta.url), 'utf8');

  // Built from fragments so this guard's own source never contains the token a
  // repository grep looks for.
  const forbidden = [
    'Math' + '.random',
    'rng' + 'State',
    'next' + 'Uint32',
    'create' + 'Rng',
    'fe' + 'tch(',
  ];

  it('never uses unseeded randomness, the engine PRNG or the network', () => {
    for (const token of forbidden) {
      expect(source, `found ${token}`).not.toContain(token);
    }
  });

  it('imports no React, controller or storage module', () => {
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/battle-controller|run-controller/);
  });
});

/* -------------------------------------------------------------------------- */
/* Real battle: determinism and state isolation                                */
/* -------------------------------------------------------------------------- */

interface Playout {
  readonly state: BattleState;
  readonly entries: readonly BattleLogEntry[];
}

/**
 * Drives a real seeded battle with playable cards and the engine's own
 * end-turn, deriving one entry per settled transition. It never invents a
 * number: every fact comes from `deriveBattleLogEntry`.
 */
function playout(
  seed: number,
  deck: readonly string[],
  enemy: EnemyDefinition,
): Playout {
  const created = createBattle({
    seed,
    player: { element: 'ember', cards: deck },
    opponent: {
      element: enemy.element,
      cards: enemy.deck,
      maxHealth: enemy.maxHealth,
    },
    catalog: byId,
    startingSide: 'player',
  });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  let state = created.value;
  const entries: BattleLogEntry[] = [deriveBattleStartEntry(state, 0)];
  let ordinal = 1;

  for (let step = 0; step < 12 && state.phase !== 'ended'; step += 1) {
    const side = state.activeSide;

    for (const instance of state.sides[side].hand) {
      const before = state;
      const played = playCard(
        state,
        { type: 'play-card', side, instanceId: instance.instanceId },
        byId,
      );

      if (played.ok) {
        entries.push(
          deriveBattleLogEntry(before, played.value, {
            kind: 'card',
            ordinal,
            cardId: instance.cardId,
          }),
        );
        ordinal += 1;
        state = played.value;
        break;
      }
    }

    if (state.phase === 'ended') {
      break;
    }

    const before = state;
    const ended = endTurn(state, { type: 'end-turn', side });

    if (!ended.ok) {
      break;
    }

    entries.push(
      deriveBattleLogEntry(before, ended.value, { kind: 'turn', ordinal }),
    );
    ordinal += 1;
    state = ended.value;
  }

  return { state, entries };
}

describe('real battle rendering', () => {
  it('is deterministic, bounded, and leaves the battle state untouched', () => {
    const deck = deckByElement('ember');
    const enemy = enemyById(ENEMY_ID);

    if (deck === undefined || enemy === undefined) {
      throw new Error('missing frozen starter content');
    }

    const { state: settled, entries } = playout(0x00c0_ffee, deck.cards, enemy);
    const beforeRender = JSON.stringify(settled);
    const rendered = renderBattleLog(entries, CONTEXT);
    const afterRender = JSON.stringify(settled);

    expect(afterRender).toBe(beforeRender);
    expect(settled.rngState).toStrictEqual(
      (JSON.parse(beforeRender) as typeof settled).rngState,
    );
    expect(settled.outcome).toBe(
      (JSON.parse(beforeRender) as typeof settled).outcome,
    );

    expect(renderBattleLog(entries, CONTEXT)).toStrictEqual(rendered);
    expect(rendered).toHaveLength(entries.length);

    for (const line of rendered) {
      expect(line.factual.length).toBeLessThanOrEqual(BATTLE_LOG_LINE_MAX);
      expect(line.factual).not.toMatch(/\n|\r/);

      if (line.dialogue !== null) {
        expect(line.dialogue.length).toBeLessThanOrEqual(BATTLE_LOG_LINE_MAX);
        expect(line.dialogue).not.toMatch(/\n|\r/);
      }
    }

    expect(rendered[0]?.factual).toContain('The battle begins');
    expect(rendered.some((line) => line.factual.includes('play'))).toBe(true);
  });

  it('renders all four enemies, including the boss, within the bound', () => {
    const deck = deckByElement('ember');

    if (deck === undefined) {
      throw new Error('missing frozen Ember starter deck');
    }

    for (const [index, enemyId] of ENEMY_DIALOGUE_IDS.entries()) {
      const enemy = enemyById(enemyId);

      if (enemy === undefined) {
        throw new Error(`missing frozen enemy ${enemyId}`);
      }

      const seed = 1000 + index;
      const { entries } = playout(seed, deck.cards, enemy);
      const lines = renderBattleLog(entries, {
        ...CONTEXT,
        seed,
        names: { player: 'You', opponent: enemy.name },
        enemyId,
      });

      expect(lines.length).toBe(entries.length);
      expect(enemyDialogue(enemyId)['battle-start']).toContain(
        lines[0]?.dialogue,
      );

      for (const line of lines) {
        expect(line.factual.length).toBeLessThanOrEqual(BATTLE_LOG_LINE_MAX);
        expect(line.dialogue?.length ?? 0).toBeLessThanOrEqual(
          BATTLE_LOG_LINE_MAX,
        );
      }
    }
  });


  it('renders every card and effect family under the 140-character bound', () => {
    const samples: BattleLogEntry[] = [
      START,
      makeEntry({
        ordinal: 1,
        kind: 'card',
        actor: 'player',
        cardId: 'ember-inferno',
        effects: [
          damage('opponent', 7, 0, 30),
          status('opponent', 'weaken', 2),
          outcome('player-victory'),
        ],
      }),
      makeEntry({
        ordinal: 2,
        kind: 'card',
        actor: 'opponent',
        cardId: 'neutral-second-wind',
        effects: [
          defense('opponent', 2, 2),
          heal('opponent', 2, 30, 30),
          status('opponent', 'regen', 2),
        ],
      }),
      makeEntry({
        ordinal: 3,
        kind: 'card',
        actor: 'player',
        cardId: 'shift-ember',
        effects: [{ kind: 'field', previous: 'stone', next: 'ember' }],
      }),
    ];

    for (const line of renderBattleLog(samples, CONTEXT)) {
      expect(line.factual.length).toBeLessThanOrEqual(BATTLE_LOG_LINE_MAX);
      expect(line.dialogue?.length ?? 0).toBeLessThanOrEqual(
        BATTLE_LOG_LINE_MAX,
      );
    }
  });
});
