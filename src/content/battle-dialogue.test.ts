// @vitest-environment node
/**
 * Dialogue content and picker contract (LOG-FR-03, LOG-NF-01, VIS-CON-05).
 *
 * The tests cover four layers:
 *
 *   1. coverage: the narrator has every trigger and each of the four enemies,
 *      including The Hollow Field boss, has every enemy set;
 *   2. copy: bundled English, non-empty and at most 140 characters;
 *   3. determinism: the same `(seed, ordinal, trigger)` always picks the same
 *      line, differing ordinals reach more than one line, and the hash is a
 *      local 32-bit value;
 *   4. isolation: the production modules contain no unseeded randomness, no
 *      engine PRNG access and no network call.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ENEMY_IDS } from './enemies';
import {
  BATTLE_DIALOGUE,
  DIALOGUE_TRIGGERS,
  ENEMY_DIALOGUE_IDS,
  ENEMY_DIALOGUE_TRIGGERS,
  dialogueHash,
  isEnemyDialogueTrigger,
  resolveDialogueLines,
  selectDialogueLine,
} from './battle-dialogue';
import type {
  DialogueCatalog,
  DialogueLineSet,
  DialogueSpeaker,
  DialogueTrigger,
  EnemyDialogueId,
} from './battle-dialogue';

const MAX_LINE_LENGTH = 140;

/** Every authored line with the speaker and trigger it belongs to. */
function authoredLines(): {
  readonly speaker: string;
  readonly trigger: string;
  readonly line: string;
}[] {
  const rows: { speaker: string; trigger: string; line: string }[] = [];

  for (const trigger of DIALOGUE_TRIGGERS) {
    for (const line of BATTLE_DIALOGUE.narrator[trigger]) {
      rows.push({ speaker: 'narrator', trigger, line });
    }
  }

  for (const enemyId of ENEMY_DIALOGUE_IDS) {
    const enemy = BATTLE_DIALOGUE.enemies[enemyId];

    if (enemy === undefined) {
      continue;
    }

    for (const trigger of ENEMY_DIALOGUE_TRIGGERS) {
      for (const line of enemy[trigger]) {
        rows.push({ speaker: enemyId, trigger, line });
      }
    }
  }

  return rows;
}

function allSets(): readonly DialogueLineSet[] {
  const sets: DialogueLineSet[] = [];

  for (const trigger of DIALOGUE_TRIGGERS) {
    sets.push(BATTLE_DIALOGUE.narrator[trigger]);
  }

  for (const enemyId of ENEMY_DIALOGUE_IDS) {
    const enemy = BATTLE_DIALOGUE.enemies[enemyId];

    if (enemy === undefined) {
      continue;
    }

    for (const trigger of ENEMY_DIALOGUE_TRIGGERS) {
      sets.push(enemy[trigger]);
    }
  }

  return sets;
}

describe('dialogue coverage', () => {
  it('gives the narrator every trigger', () => {
    const triggers = Object.keys(BATTLE_DIALOGUE.narrator).sort();

    expect(triggers).toStrictEqual([...DIALOGUE_TRIGGERS].sort());

    for (const trigger of DIALOGUE_TRIGGERS) {
      expect(BATTLE_DIALOGUE.narrator[trigger].length).toBeGreaterThanOrEqual(
        2,
      );
    }
  });

  it('authors the same four enemy ids as the frozen enemy catalog', () => {
    expect([...ENEMY_DIALOGUE_IDS]).toStrictEqual([...ENEMY_IDS]);
    expect(ENEMY_DIALOGUE_IDS).toContain('enemy-hollow-field');
  });

  it('gives every enemy, including the boss, battle-start, field-shift, low-health, victory and defeat', () => {
    for (const enemyId of ENEMY_DIALOGUE_IDS) {
      const enemy = BATTLE_DIALOGUE.enemies[enemyId];

      expect(enemy, `${enemyId} has no authored dialogue`).toBeDefined();

      if (enemy === undefined) {
        continue;
      }

      const triggers = Object.keys(enemy).sort();

      expect(triggers, `${enemyId} trigger sets`).toStrictEqual(
        [...ENEMY_DIALOGUE_TRIGGERS].sort(),
      );

      for (const trigger of ENEMY_DIALOGUE_TRIGGERS) {
        expect(
          enemy[trigger].length,
          `${enemyId} ${trigger} line count`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('records the five enemy trigger tags as enemy-only', () => {
    for (const trigger of DIALOGUE_TRIGGERS) {
      const expected = (ENEMY_DIALOGUE_TRIGGERS as readonly string[]).includes(
        trigger,
      );

      expect(isEnemyDialogueTrigger(trigger)).toBe(expected);
    }
  });

  it('never authors an empty set', () => {
    for (const lines of allSets()) {
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it('freezes the catalog and every set', () => {
    expect(Object.isFrozen(BATTLE_DIALOGUE)).toBe(true);
    expect(Object.isFrozen(BATTLE_DIALOGUE.narrator)).toBe(true);
    expect(Object.isFrozen(BATTLE_DIALOGUE.enemies)).toBe(true);

    for (const lines of allSets()) {
      expect(Object.isFrozen(lines)).toBe(true);
    }
  });
});

describe('dialogue copy', () => {
  it('keeps every line bundled English at or below 140 characters', () => {
    const rows = authoredLines();

    expect(rows.length).toBeGreaterThan(0);

    for (const { speaker, trigger, line } of rows) {
      expect(line.trim(), `${speaker}/${trigger} is blank`).not.toBe('');
      expect(line, `${speaker}/${trigger} is too long`).not.toMatch(/\r|\n/);
      expect(
        line.length,
        `${speaker}/${trigger} is ${String(line.length)} characters`,
      ).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    }
  });

  it('uses no unfilled template, URL or remote reference', () => {
    for (const { speaker, trigger, line } of authoredLines()) {
      expect(line, `${speaker}/${trigger} has a template`).not.toMatch(/[{}]/);
      expect(line, `${speaker}/${trigger} has a URL`).not.toMatch(
        /https?:|www\.|\.svg|\.png/i,
      );
    }
  });

  it('writes distinct lines inside every set', () => {
    for (const lines of allSets()) {
      expect(new Set(lines).size).toBe(lines.length);
    }
  });
});

describe('deterministic picker', () => {
  it('returns the same line for the same seed, ordinal and trigger', () => {
    for (const trigger of DIALOGUE_TRIGGERS) {
      const first = selectDialogueLine(0x1234_5678, 7, trigger);

      expect(first).not.toBeNull();

      for (let repeat = 0; repeat < 5; repeat += 1) {
        expect(selectDialogueLine(0x1234_5678, 7, trigger)).toBe(first);
      }
    }
  });

  it('selects from the authored set for the requested speaker', () => {
    for (const enemyId of ENEMY_DIALOGUE_IDS) {
      for (const trigger of ENEMY_DIALOGUE_TRIGGERS) {
        const lines = resolveDialogueLines(enemyId, trigger);
        const line = selectDialogueLine(4242, 3, trigger, enemyId);

        expect(lines).toBeDefined();
        expect(line).not.toBeNull();
        expect(lines).toContain(line);
      }
    }

    for (const trigger of DIALOGUE_TRIGGERS) {
      const line = selectDialogueLine(4242, 3, trigger, 'narrator');

      expect(BATTLE_DIALOGUE.narrator[trigger]).toContain(line);
    }
  });

  it('returns null when the speaker has no set for the trigger', () => {
    expect(resolveDialogueLines('enemy-cinder-warden', 'big-hit')).toBeUndefined();
    expect(
      selectDialogueLine(1, 1, 'first-blood', 'enemy-cinder-warden'),
    ).toBeNull();
  });

  it('returns null for an empty set instead of inventing a line', () => {
    const empty: DialogueCatalog = {
      narrator: {
        'battle-start': [],
        'field-shift': [],
        'first-blood': [],
        'big-hit': [],
        'low-health-player': [],
        'low-health-enemy': [],
        victory: [],
        defeat: [],
      },
      enemies: BATTLE_DIALOGUE.enemies,
    };

    expect(selectDialogueLine(7, 0, 'big-hit', 'narrator', empty)).toBeNull();
  });

  it('reaches at least two lines across ordinals inside every set', () => {
    for (const trigger of DIALOGUE_TRIGGERS) {
      const picked = new Set(
        Array.from({ length: 12 }, (_, ordinal) =>
          selectDialogueLine(99, ordinal, trigger, 'narrator'),
        ),
      );

      expect(picked.size, `narrator/${trigger}`).toBeGreaterThanOrEqual(2);
    }

    for (const enemyId of ENEMY_DIALOGUE_IDS) {
      for (const trigger of ENEMY_DIALOGUE_TRIGGERS) {
        const picked = new Set(
          Array.from({ length: 12 }, (_, ordinal) =>
            selectDialogueLine(99, ordinal, trigger, enemyId),
          ),
        );

        expect(picked.size, `${enemyId}/${trigger}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('hashes seed, ordinal and trigger into an unsigned 32-bit value', () => {
    const hash = dialogueHash(0xdead_beef, 17, 'field-shift');

    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffff_ffff);
    expect(dialogueHash(0xdead_beef, 17, 'field-shift')).toBe(hash);
    expect(dialogueHash(0xdead_beef, 18, 'field-shift')).not.toBe(hash);
    expect(dialogueHash(0xdead_beee, 17, 'field-shift')).not.toBe(hash);
    expect(dialogueHash(0xdead_beef, 17, 'victory')).not.toBe(hash);
  });

  it('is not the engine PRNG: no state is kept between calls', () => {
    const first = selectDialogueLine(11, 2, 'big-hit', 'narrator');
    const other = selectDialogueLine(12, 2, 'big-hit', 'narrator');

    expect(selectDialogueLine(11, 2, 'big-hit', 'narrator')).toBe(first);
    expect(selectDialogueLine(12, 2, 'big-hit', 'narrator')).toBe(other);
  });
});

describe('module isolation', () => {
  const source = readFileSync(
    new URL('./battle-dialogue.ts', import.meta.url),
    'utf8',
  );

  // Built from fragments so this guard's own source never contains the token a
  // repository grep looks for.
  const forbidden = [
    'Math' + '.random',
    'rng' + 'State',
    'next' + 'Uint32',
    'create' + 'Rng',
    'fe' + 'tch(',
  ];

  it('never reaches for unseeded randomness, the engine PRNG or the network', () => {
    for (const token of forbidden) {
      expect(source, `found ${token}`).not.toContain(token);
    }
  });

  it('imports no React, storage or network module', () => {
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/from ['"]node:/);
  });
});

describe('speaker typing', () => {
  it('accepts only the narrator and the four authored enemies', () => {
    const speakers: readonly DialogueSpeaker[] = [
      'narrator',
      ...ENEMY_DIALOGUE_IDS,
    ];
    const triggers: readonly DialogueTrigger[] = [...DIALOGUE_TRIGGERS];

    for (const speaker of speakers) {
      for (const trigger of triggers) {
        const resolved = resolveDialogueLines(speaker, trigger);

        if (speaker === 'narrator' || isEnemyDialogueTrigger(trigger)) {
          expect(resolved, `${speaker}/${trigger}`).toBeDefined();
        } else {
          expect(resolved, `${speaker}/${trigger}`).toBeUndefined();
        }
      }
    }

    const known: readonly EnemyDialogueId[] = [...ENEMY_DIALOGUE_IDS];

    expect(known).toHaveLength(4);
  });
});
