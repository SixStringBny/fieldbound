// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { resolveAttack } from './damage';
import {
  EMPTY_STATUSES,
  FOCUS_DAMAGE_BONUS,
  WEAKEN_DAMAGE_PENALTY,
  applyStatus,
  applyStatusApplications,
  attackStatusModifier,
  clampStatusStacks,
  clearBattleStatuses,
  clearStatuses,
  consumeAttackStatuses,
  emptyStatuses,
  getStacks,
  hasStatus,
  normalizeStatusCounters,
  resolveStatusTarget,
  tickRegen,
} from './status';
import type { AttackStatusSpend, RegenTick } from './status';
import { REGEN_HEAL, STATUS_CAPS, STATUS_KINDS } from './types';
import type {
  BattleSide,
  BattleSides,
  Side,
  StatusApplication,
  StatusCounters,
  StatusKind,
} from './types';

/** Frozen counters, so any accidental mutation in a helper throws in the test. */
function statuses(focus = 0, weaken = 0, regen = 0): StatusCounters {
  return Object.freeze({ focus, weaken, regen });
}

function side(id: Side, counters: StatusCounters): BattleSide {
  return {
    side: id,
    element: id === 'player' ? 'ember' : 'frost',
    health: 30,
    maxHealth: 40,
    defense: 2,
    energy: 3,
    deck: [],
    hand: [],
    discard: [],
    statuses: counters,
  };
}

function sides(
  playerStatuses: StatusCounters,
  opponentStatuses: StatusCounters,
): BattleSides {
  return Object.freeze({
    player: side('player', playerStatuses),
    opponent: side('opponent', opponentStatuses),
  });
}

/** Total stacks across every status kind; zero means every counter was cleared. */
function totalStacks(counters: StatusCounters): number {
  return STATUS_KINDS.reduce((sum, kind) => sum + counters[kind], 0);
}

describe('status caps', () => {
  it('freezes Focus and Weaken at 3 and Regen at 2', () => {
    expect(STATUS_CAPS).toEqual({ focus: 3, weaken: 3, regen: 2 });
  });

  const clampCases: Array<[StatusKind, number, number]> = [
    ['focus', -1, 0],
    ['focus', 0, 0],
    ['focus', 1, 1],
    ['focus', 3, 3],
    ['focus', 4, 3],
    ['focus', 99, 3],
    ['weaken', -2, 0],
    ['weaken', 2, 2],
    ['weaken', 3, 3],
    ['weaken', 7, 3],
    ['regen', -1, 0],
    ['regen', 1, 1],
    ['regen', 2, 2],
    ['regen', 3, 2],
    ['regen', 50, 2],
  ];

  for (const [kind, input, expected] of clampCases) {
    it(`clamps ${kind} ${input} to ${expected}`, () => {
      expect(clampStatusStacks(kind, input)).toBe(expected);
    });
  }

  it('truncates fractional stacks and rejects non-finite values', () => {
    expect(clampStatusStacks('focus', 2.9)).toBe(2);
    expect(clampStatusStacks('regen', 1.5)).toBe(1);
    expect(clampStatusStacks('focus', Number.NaN)).toBe(0);
    expect(clampStatusStacks('weaken', Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('keeps Focus and Weaken at 3 and Regen at 2 when applied beyond the cap', () => {
    let focus = statuses();
    let weaken = statuses();
    let regen = statuses();
    const application: StatusApplication[] = [
      { kind: 'focus', stacks: 2, target: 'self' },
      { kind: 'focus', stacks: 2, target: 'self' },
      { kind: 'weaken', stacks: 5, target: 'self' },
      { kind: 'regen', stacks: 2, target: 'self' },
      { kind: 'regen', stacks: 2, target: 'self' },
    ];

    for (const { kind, stacks } of application) {
      if (kind === 'focus') {
        focus = applyStatus(focus, kind, stacks);
      } else if (kind === 'weaken') {
        weaken = applyStatus(weaken, kind, stacks);
      } else {
        regen = applyStatus(regen, kind, stacks);
      }
    }

    expect(focus.focus).toBe(3);
    expect(weaken.weaken).toBe(3);
    expect(regen.regen).toBe(2);
  });

  it('stays at the cap no matter how many times a full application repeats', () => {
    let counters = statuses();

    for (let index = 0; index < 10; index += 1) {
      counters = applyStatus(counters, 'focus', 1);
      counters = applyStatus(counters, 'regen', 2);
    }

    expect(counters).toEqual(statuses(3, 0, 2));
  });
});

describe('empty and normalised counters', () => {
  it('starts with every counter at zero', () => {
    expect(emptyStatuses()).toEqual(statuses());
    expect(totalStacks(emptyStatuses())).toBe(0);
  });

  it('normalises over-cap, negative and missing counters', () => {
    expect(
      normalizeStatusCounters({ focus: 9, weaken: -4, regen: 2 }),
    ).toEqual(statuses(3, 0, 2));
    expect(normalizeStatusCounters({})).toEqual(statuses());
    expect(normalizeStatusCounters({ focus: 2 })).toEqual(statuses(2, 0, 0));
  });

  it('reads stacks through the same clamp and reports presence', () => {
    expect(getStacks(statuses(2, 0, 1), 'focus')).toBe(2);
    expect(getStacks(statuses(9, 0, 0), 'weaken')).toBe(0);
    expect(hasStatus(statuses(1, 0, 0), 'focus')).toBe(true);
    expect(hasStatus(statuses(1, 0, 0), 'weaken')).toBe(false);
    expect(hasStatus(statuses(0, 0, 1), 'regen')).toBe(true);
  });

  it('exposes a frozen empty set that callers cannot accidentally change', () => {
    expect(Object.isFrozen(EMPTY_STATUSES)).toBe(true);
  });
});

describe('applyStatus', () => {
  it('adds stacks to the requested kind only', () => {
    const before = statuses(1, 2, 1);
    const after = applyStatus(before, 'focus', 2);

    expect(after).toEqual(statuses(3, 2, 1));
    expect(before).toEqual(statuses(1, 2, 1));
  });

  it('does not mutate its frozen input and returns a new object', () => {
    const before = statuses(2, 1, 1);
    const after = applyStatus(before, 'weaken', 2);

    expect(after).not.toBe(before);
    expect(before).toEqual(statuses(2, 1, 1));
  });

  it('treats zero and negative stacks as no-ops', () => {
    const before = statuses(1, 1, 1);

    expect(applyStatus(before, 'focus', 0)).toEqual(before);
    expect(applyStatus(before, 'focus', -3)).toEqual(before);
    expect(applyStatus(before, 'regen', Number.NaN)).toEqual(before);
  });

  it('applies every declared status in order with the cap enforced', () => {
    const applications: StatusApplication[] = [
      { kind: 'focus', stacks: 2, target: 'self' },
      { kind: 'weaken', stacks: 1, target: 'self' },
      { kind: 'focus', stacks: 2, target: 'self' },
      { kind: 'regen', stacks: 2, target: 'self' },
      { kind: 'regen', stacks: 1, target: 'self' },
    ];

    expect(applyStatusApplications(statuses(), applications)).toEqual(
      statuses(3, 1, 2),
    );
  });

  it('leaves counters unchanged for an empty application list', () => {
    expect(applyStatusApplications(statuses(1, 2, 1), [])).toEqual(
      statuses(1, 2, 1),
    );
  });
});

describe('resolveStatusTarget', () => {
  it('maps self to the acting side and opponent to the other side', () => {
    expect(resolveStatusTarget('player', 'self')).toBe('player');
    expect(resolveStatusTarget('player', 'opponent')).toBe('opponent');
    expect(resolveStatusTarget('opponent', 'self')).toBe('opponent');
    expect(resolveStatusTarget('opponent', 'opponent')).toBe('player');
  });
});

describe('consumeAttackStatuses', () => {
  it('spends one Focus stack for +2 damage', () => {
    const spend = consumeAttackStatuses(statuses(2, 0, 1));

    expect(spend.focusConsumed).toBe(1);
    expect(spend.weakenConsumed).toBe(0);
    expect(spend.modifier).toBe(FOCUS_DAMAGE_BONUS);
    expect(spend.modifier).toBe(2);
    expect(spend.statuses).toEqual(statuses(1, 0, 1));
  });

  it('spends one Weaken stack for -2 damage', () => {
    const spend = consumeAttackStatuses(statuses(0, 2, 0));

    expect(spend.focusConsumed).toBe(0);
    expect(spend.weakenConsumed).toBe(1);
    expect(spend.modifier).toBe(-WEAKEN_DAMAGE_PENALTY);
    expect(spend.modifier).toBe(-2);
    expect(spend.statuses).toEqual(statuses(0, 1, 0));
  });

  it('nets to zero damage change and spends one of each when both are present', () => {
    const spend = consumeAttackStatuses(statuses(3, 3, 2));

    expect(spend.focusConsumed).toBe(1);
    expect(spend.weakenConsumed).toBe(1);
    expect(spend.modifier).toBe(0);
    expect(spend.statuses).toEqual(statuses(2, 2, 2));
  });

  it('spends nothing when no attack status is present', () => {
    const before = statuses(0, 0, 2);
    const spend = consumeAttackStatuses(before);

    expect(spend.focusConsumed).toBe(0);
    expect(spend.weakenConsumed).toBe(0);
    expect(spend.modifier).toBe(0);
    expect(spend.statuses).toEqual(before);
    expect(before).toEqual(statuses(0, 0, 2));
  });

  it('drains one stack per attack and then stops changing the modifier', () => {
    let counters = statuses(3, 0, 0);
    const modifiers: number[] = [];

    for (let attack = 0; attack < 5; attack += 1) {
      const spend: AttackStatusSpend = consumeAttackStatuses(counters);
      modifiers.push(spend.modifier);
      counters = spend.statuses;
    }

    expect(modifiers).toEqual([2, 2, 2, 0, 0]);
    expect(counters).toEqual(statuses());
  });

  it('spends Weaken even when Focus is also draining', () => {
    let counters = statuses(1, 1, 0);
    const first = consumeAttackStatuses(counters);
    counters = first.statuses;
    const second = consumeAttackStatuses(counters);

    expect(first.modifier).toBe(0);
    expect(second.modifier).toBe(0);
    expect(second.statuses).toEqual(statuses());
    expect(second.focusConsumed).toBe(0);
    expect(second.weakenConsumed).toBe(0);
  });

  it('does not mutate its frozen input', () => {
    const before = statuses(2, 2, 1);

    consumeAttackStatuses(before);

    expect(before).toEqual(statuses(2, 2, 1));
  });

  it('reports the upcoming modifier without spending a stack', () => {
    const before = statuses(2, 0, 1);

    expect(attackStatusModifier(before)).toBe(2);
    expect(attackStatusModifier(statuses(0, 2, 1))).toBe(-2);
    expect(attackStatusModifier(statuses(2, 2, 1))).toBe(0);
    expect(attackStatusModifier(statuses())).toBe(0);
    expect(before).toEqual(statuses(2, 0, 1));
  });
});

describe('statuses inside the damage pipeline', () => {
  it('nets +2, -2 and zero through resolveAttack', () => {
    const focusSpend = consumeAttackStatuses(statuses(1, 0, 0));
    const weakenSpend = consumeAttackStatuses(statuses(0, 1, 0));
    const bothSpend = consumeAttackStatuses(statuses(1, 1, 0));

    const base = {
      baseDamage: 5,
      element: 'ember',
      field: 'neutral',
      targetDefense: 0,
    } as const;

    expect(
      resolveAttack({ ...base, statusModifier: focusSpend.modifier }).damage,
    ).toBe(7);
    expect(
      resolveAttack({ ...base, statusModifier: weakenSpend.modifier }).damage,
    ).toBe(3);
    expect(
      resolveAttack({ ...base, statusModifier: bothSpend.modifier }).damage,
    ).toBe(5);
  });

  it('applies Focus before a countered field halves the damage', () => {
    // 5 + 2 = 7, countered ceiling half is 4; field-first would give 3.
    const spend = consumeAttackStatuses(statuses(1, 0, 0));
    const result = resolveAttack({
      baseDamage: 5,
      element: 'frost',
      field: 'ember',
      targetDefense: 0,
      statusModifier: spend.modifier,
    });

    expect(spend.statuses).toEqual(statuses());
    expect(result.rawDamage).toBe(4);
    expect(result.damage).toBe(4);
  });

  it('spends Focus and Weaken even when defense reduces the hit to 0', () => {
    const spend = consumeAttackStatuses(statuses(1, 1, 0));
    const result = resolveAttack({
      baseDamage: 3,
      element: 'ember',
      field: 'neutral',
      targetDefense: 8,
      statusModifier: spend.modifier,
    });

    expect(result.damage).toBe(0);
    expect(spend.statuses).toEqual(statuses());
  });
});

describe('tickRegen', () => {
  it('heals 2 and spends one stack at the owner turn start', () => {
    const tick: RegenTick = tickRegen(statuses(0, 0, 2), 30, 40);

    expect(tick.health).toBe(30 + REGEN_HEAL);
    expect(tick.healed).toBe(2);
    expect(tick.regenConsumed).toBe(1);
    expect(tick.statuses).toEqual(statuses(0, 0, 1));
  });

  it('does not heal past maximum health', () => {
    const tick = tickRegen(statuses(0, 0, 2), 39, 40);

    expect(tick.health).toBe(40);
    expect(tick.healed).toBe(1);
    expect(tick.statuses.regen).toBe(1);
  });

  it('spends the stack but heals nothing at full health', () => {
    const tick = tickRegen(statuses(0, 0, 2), 40, 40);

    expect(tick.health).toBe(40);
    expect(tick.healed).toBe(0);
    expect(tick.regenConsumed).toBe(1);
    expect(tick.statuses.regen).toBe(1);
  });

  it('stops at zero stacks', () => {
    const first = tickRegen(statuses(0, 0, 2), 20, 40);
    const second = tickRegen(first.statuses, first.health, 40);
    const third = tickRegen(second.statuses, second.health, 40);

    expect([first.healed, second.healed, third.healed]).toEqual([2, 2, 0]);
    expect([first.health, second.health, third.health]).toEqual([22, 24, 24]);
    expect(third.regenConsumed).toBe(0);
    expect(third.statuses.regen).toBe(0);
  });

  it('leaves health alone when Regen is absent', () => {
    const tick = tickRegen(statuses(1, 1, 0), 17, 40);

    expect(tick.healed).toBe(0);
    expect(tick.health).toBe(17);
    expect(tick.regenConsumed).toBe(0);
    expect(tick.statuses).toEqual(statuses(1, 1, 0));
  });

  it('never exceeds maximum health across repeated ticks', () => {
    let counters = statuses(0, 0, 2);
    let health = 35;

    for (let turn = 0; turn < 4; turn += 1) {
      const tick = tickRegen(counters, health, 40);
      counters = tick.statuses;
      health = tick.health;
      expect(health).toBeLessThanOrEqual(40);
    }

    expect(health).toBe(39);
    expect(counters.regen).toBe(0);
  });

  it('does not mutate its frozen input', () => {
    const before = statuses(1, 1, 2);

    tickRegen(before, 10, 40);

    expect(before).toEqual(statuses(1, 1, 2));
  });
});

describe('battle-end clearing', () => {
  it('returns every counter to zero', () => {
    const cleared = clearStatuses(statuses(3, 3, 2));

    expect(cleared).toEqual(statuses());
    expect(totalStacks(cleared)).toBe(0);
  });

  it('clears both sides while leaving health, defense and decks untouched', () => {
    const before = sides(statuses(3, 1, 2), statuses(0, 2, 1));
    const cleared = clearBattleStatuses(before);

    expect(cleared.player.statuses).toEqual(statuses());
    expect(cleared.opponent.statuses).toEqual(statuses());
    expect(cleared.player.health).toBe(30);
    expect(cleared.player.defense).toBe(2);
    expect(cleared.opponent.element).toBe('frost');
    expect(cleared.player).not.toBe(before.player);
    expect(cleared.opponent).not.toBe(before.opponent);
  });

  it('does not mutate the sides it clears', () => {
    const before = sides(statuses(2, 0, 1), statuses(0, 1, 0));

    clearBattleStatuses(before);

    expect(before.player.statuses).toEqual(statuses(2, 0, 1));
    expect(before.opponent.statuses).toEqual(statuses(0, 1, 0));
  });

  it('leaves statuses at zero when clearing an already empty side', () => {
    expect(clearBattleStatuses(sides(statuses(), statuses()))).toEqual(
      sides(statuses(), statuses()),
    );
  });
});
