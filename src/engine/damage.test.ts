// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  COUNTERED_DAMAGE_MINIMUM,
  FIELD_ATTACK_BONUS,
  FIELD_WARD_BONUS,
  clampDefense,
  resolveAttack,
  resolveMatchup,
  resolveWard,
} from './damage';
import type {
  AttackInput,
  MatchupKind,
  WardInput,
  WardResolution,
} from './damage';
import { DEFENSE_CAP, ELEMENTS } from './types';
import type { Element } from './types';

/**
 * The frozen matchup matrix: all 25 field/attack-element pairs, including the
 * Neutral field and the Neutral attack element. Written as an explicit table so
 * a missing or wrong pair is a data error rather than a formula coincidence.
 */
const MATRIX: Array<[Element, Element, MatchupKind]> = [
  ['ember', 'ember', 'empowered'],
  ['ember', 'frost', 'countered'],
  ['ember', 'gale', 'neutral'],
  ['ember', 'stone', 'neutral'],
  ['ember', 'neutral', 'neutral'],
  ['frost', 'ember', 'neutral'],
  ['frost', 'frost', 'empowered'],
  ['frost', 'gale', 'countered'],
  ['frost', 'stone', 'neutral'],
  ['frost', 'neutral', 'neutral'],
  ['gale', 'ember', 'neutral'],
  ['gale', 'frost', 'neutral'],
  ['gale', 'gale', 'empowered'],
  ['gale', 'stone', 'countered'],
  ['gale', 'neutral', 'neutral'],
  ['stone', 'ember', 'countered'],
  ['stone', 'frost', 'neutral'],
  ['stone', 'gale', 'neutral'],
  ['stone', 'stone', 'empowered'],
  ['stone', 'neutral', 'neutral'],
  ['neutral', 'ember', 'neutral'],
  ['neutral', 'frost', 'neutral'],
  ['neutral', 'gale', 'neutral'],
  ['neutral', 'stone', 'neutral'],
  ['neutral', 'neutral', 'neutral'],
];

/** Attack resolution with only the common inputs; special cases pass literals. */
function attack(
  field: Element,
  element: Element,
  targetDefense = 0,
  baseDamage = 5,
) {
  return resolveAttack({ field, element, targetDefense, baseDamage });
}

/** Ward resolution with an optional card field bonus (0 means unused). */
function ward(
  currentDefense: number,
  baseDefense: number,
  element: Element,
  field: Element,
  fieldBonusDefense = 0,
): WardResolution {
  return resolveWard({
    currentDefense,
    baseDefense,
    element,
    field,
    fieldBonusDefense,
  });
}

describe('resolveMatchup', () => {
  it('covers every field and attack element pair exactly once', () => {
    const pairs = new Set(
      MATRIX.map(([field, element]) => `${field}.${element}`),
    );

    expect(MATRIX).toHaveLength(ELEMENTS.length * ELEMENTS.length);
    expect(pairs.size).toBe(ELEMENTS.length * ELEMENTS.length);
  });

  for (const [field, element, expected] of MATRIX) {
    it(`${field} field versus ${element} attack is ${expected}`, () => {
      expect(resolveMatchup(field, element)).toBe(expected);
    });
  }

  it('empowers the matching element, counters only the beaten element', () => {
    expect(resolveMatchup('ember', 'ember')).toBe('empowered');
    expect(resolveMatchup('ember', 'frost')).toBe('countered');
    expect(resolveMatchup('ember', 'gale')).toBe('neutral');
    expect(resolveMatchup('ember', 'stone')).toBe('neutral');
  });

  it('never empowers or counters anything on a Neutral field', () => {
    for (const element of ELEMENTS) {
      expect(resolveMatchup('neutral', element)).toBe('neutral');
    }
  });

  it('keeps a Neutral attack outside the cycle under every field', () => {
    for (const field of ELEMENTS) {
      expect(resolveMatchup(field, 'neutral')).toBe('neutral');
    }
  });
});

describe('resolveAttack', () => {
  it('adds 2 and pierces for an empowered attack', () => {
    const result = attack('ember', 'ember', 8);

    expect(result.matchup).toBe('empowered');
    expect(result.matchBonus).toBe(FIELD_ATTACK_BONUS);
    expect(result.rawDamage).toBe(7);
    expect(result.piercing).toBe(true);
    expect(result.defenseApplied).toBe(0);
    expect(result.damage).toBe(7);
  });

  it('rounds a countered odd damage total up', () => {
    const result = attack('ember', 'frost');

    expect(result.matchup).toBe('countered');
    expect(result.rawDamage).toBe(3);
    expect(result.damage).toBe(3);
  });

  it('subtracts persistent defense after the countered floor', () => {
    expect(attack('ember', 'frost', 2).damage).toBe(1);
    expect(attack('ember', 'frost', 3).damage).toBe(0);
  });

  it('floors a countered attack at 1 before defense, even from a zero base', () => {
    expect(attack('ember', 'frost', 0, 1).rawDamage).toBe(
      COUNTERED_DAMAGE_MINIMUM,
    );
    expect(attack('ember', 'frost', 0, 0).rawDamage).toBe(
      COUNTERED_DAMAGE_MINIMUM,
    );
    expect(attack('ember', 'frost', 1, 0).damage).toBe(0);
  });

  it('does not let a countered attack pierce, even with the keyword', () => {
    const result = resolveAttack({
      field: 'ember',
      element: 'frost',
      baseDamage: 5,
      piercing: true,
      targetDefense: 8,
    });

    expect(result.rawDamage).toBe(3);
    expect(result.piercing).toBe(false);
    expect(result.defenseApplied).toBe(3);
    expect(result.damage).toBe(0);
  });

  it('keeps the printed piercing keyword on a neutral matchup', () => {
    const result = resolveAttack({
      field: 'neutral',
      element: 'ember',
      baseDamage: 5,
      piercing: true,
      targetDefense: 8,
    });

    expect(result.matchup).toBe('neutral');
    expect(result.piercing).toBe(true);
    expect(result.damage).toBe(5);
  });

  it('subtracts persistent defense when the attack does not pierce', () => {
    const result = attack('neutral', 'ember', 3);

    expect(result.piercing).toBe(false);
    expect(result.defenseApplied).toBe(3);
    expect(result.damage).toBe(2);
  });

  it('clamps defense at the cap inside the pipeline', () => {
    expect(attack('neutral', 'ember', 12, 9).defenseApplied).toBe(DEFENSE_CAP);
    expect(attack('neutral', 'ember', 12, 9).damage).toBe(1);
    expect(attack('neutral', 'ember', 8, 9).damage).toBe(1);
  });

  it('treats negative defense as zero', () => {
    expect(attack('neutral', 'ember', -4, 5).damage).toBe(5);
  });

  it('applies Focus and Weaken before the field step', () => {
    // 5 - 2 = 3, counter halving rounds 1.5 up to 2. Field first would give 1.
    const result = resolveAttack({
      field: 'ember',
      element: 'frost',
      baseDamage: 5,
      statusModifier: -2,
      targetDefense: 0,
    });

    expect(result.statusModifier).toBe(-2);
    expect(result.rawDamage).toBe(2);
    expect(result.damage).toBe(2);
  });

  it('floors status-modified damage at zero before the field step', () => {
    const neutral = resolveAttack({
      field: 'neutral',
      element: 'ember',
      baseDamage: 1,
      statusModifier: -2,
      targetDefense: 0,
    });
    const empowered = resolveAttack({
      field: 'ember',
      element: 'ember',
      baseDamage: 1,
      statusModifier: -2,
      targetDefense: 0,
    });

    expect(neutral.rawDamage).toBe(0);
    expect(neutral.damage).toBe(0);
    expect(empowered.rawDamage).toBe(FIELD_ATTACK_BONUS);
    expect(empowered.damage).toBe(FIELD_ATTACK_BONUS);
  });

  it('still applies the countered floor after statuses reach zero', () => {
    const result = resolveAttack({
      field: 'ember',
      element: 'frost',
      baseDamage: 1,
      statusModifier: -2,
      targetDefense: 0,
    });

    expect(result.rawDamage).toBe(1);
    expect(result.damage).toBe(1);
  });

  it('adds the card field bonus only while the attack matches the field', () => {
    const matching = resolveAttack({
      field: 'ember',
      element: 'ember',
      baseDamage: 3,
      fieldBonusDamage: 2,
      targetDefense: 0,
    });
    const unmatched = resolveAttack({
      field: 'frost',
      element: 'ember',
      baseDamage: 3,
      fieldBonusDamage: 2,
      targetDefense: 0,
    });

    expect(matching.cardBonus).toBe(2);
    expect(matching.rawDamage).toBe(7);
    expect(unmatched.matchup).toBe('neutral');
    expect(unmatched.cardBonus).toBe(0);
    expect(unmatched.rawDamage).toBe(3);
  });

  it('adds the card field bonus to the base before statuses', () => {
    // Shatter-style: 2 damage, +4 while Frost; one Weaken nets 6 - 2 + 2.
    const result = resolveAttack({
      field: 'frost',
      element: 'frost',
      baseDamage: 2,
      fieldBonusDamage: 4,
      statusModifier: -2,
      targetDefense: 0,
    });

    expect(result.rawDamage).toBe(6);
    expect(result.damage).toBe(6);
  });

  it('does not mutate its input and resolves identically twice', () => {
    const input: AttackInput = Object.freeze({
      baseDamage: 5,
      element: 'ember',
      field: 'ember',
      targetDefense: 2,
      piercing: false,
      statusModifier: 2,
      fieldBonusDamage: 1,
    });
    const before = { ...input };

    const first = resolveAttack(input);
    const second = resolveAttack(input);

    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });
});

describe('resolveAttack matrix', () => {
  for (const [field, element, kind] of MATRIX) {
    it(`${field} field versus ${element} attack resolves ${kind} damage`, () => {
      const result = attack(field, element, 0, 4);
      const expected =
        kind === 'empowered'
          ? 4 + FIELD_ATTACK_BONUS
          : kind === 'countered'
            ? 2
            : 4;

      expect(result.damage).toBe(expected);
      expect(result.piercing).toBe(kind === 'empowered');
    });
  }
});

describe('clampDefense', () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [4, 4],
    [8, 8],
    [9, 8],
    [100, 8],
    [-3, 0],
  ];

  for (const [input, expected] of cases) {
    it(`clamps defense ${input} to ${expected}`, () => {
      expect(clampDefense(input)).toBe(expected);
    });
  }

  it('treats a corrupt defense value as zero', () => {
    expect(clampDefense(Number.NaN)).toBe(0);
  });
});

describe('resolveWard', () => {
  it('adds 2 defense to a matching Ward', () => {
    const result = ward(0, 2, 'ember', 'ember');

    expect(result.matchup).toBe('empowered');
    expect(result.matchBonus).toBe(FIELD_WARD_BONUS);
    expect(result.cardBonus).toBe(0);
    expect(result.gained).toBe(4);
    expect(result.defense).toBe(4);
  });

  it('applies the matching Ward bonus before the cap', () => {
    const emptyBase = ward(7, 0, 'ember', 'ember');
    const smallBase = ward(7, 1, 'frost', 'frost');

    expect(emptyBase.defense).toBe(8);
    expect(emptyBase.gained).toBe(1);
    expect(smallBase.defense).toBe(8);
    expect(smallBase.gained).toBe(1);
  });

  it('clamps a 9-point defense request at 8', () => {
    const result = ward(0, 9, 'ember', 'neutral');

    expect(result.matchBonus).toBe(0);
    expect(result.defense).toBe(8);
    expect(result.gained).toBe(8);
  });

  it('adds the card field bonus of a matching Ward before the cap', () => {
    // Resonance-style: 1 defense, +2 while the field is Stone, plus the
    // automatic matching Ward bonus.
    const result = ward(0, 1, 'stone', 'stone', 2);

    expect(result.matchBonus).toBe(FIELD_WARD_BONUS);
    expect(result.cardBonus).toBe(2);
    expect(result.gained).toBe(5);
    expect(result.defense).toBe(5);
  });

  it('gives no bonus when the Ward does not match the field', () => {
    const result = ward(2, 2, 'frost', 'ember', 2);

    expect(result.matchup).toBe('countered');
    expect(result.matchBonus).toBe(0);
    expect(result.cardBonus).toBe(0);
    expect(result.defense).toBe(4);
  });

  it('gives no bonus on a Neutral field', () => {
    const result = ward(0, 2, 'neutral', 'neutral', 2);

    expect(result.matchup).toBe('neutral');
    expect(result.matchBonus).toBe(0);
    expect(result.defense).toBe(2);
  });

  it('never reduces defense when already at the cap', () => {
    const result = ward(8, 3, 'ember', 'ember');

    expect(result.defense).toBe(8);
    expect(result.gained).toBe(0);
  });

  it('does not mutate its input', () => {
    const input: WardInput = Object.freeze({
      currentDefense: 3,
      baseDefense: 2,
      element: 'ember',
      field: 'ember',
      fieldBonusDefense: 1,
    });
    const before = { ...input };

    resolveWard(input);

    expect(input).toEqual(before);
  });
});
