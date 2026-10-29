/**
 * Untrusted battle-log validation and capping (LOG-FR-01, LOG-NF-01).
 *
 * `validateBattleLog` is the single gate between stored or caller-supplied data
 * and a log the UI may render. It is total: it returns a canonical new array or
 * `null`, never throws, and never mutates the supplied value.
 *
 * It enforces the domain invariants the rest of the feature relies on:
 *
 *   - only the three entry kinds and the seven effect kinds exist;
 *   - `id` is non-empty and unique inside the log;
 *   - `ordinal` is a non-negative integer that strictly increases;
 *   - a `card` entry names a non-empty `cardId`, and only a card entry does;
 *   - `battle-start` is the system actor and carries exactly one `start` effect
 *     with the opening opposing maximum health and field;
 *   - every effect carries only engine-possible values: positive deltas,
 *     remaining health within the maximum, defense within the frozen cap,
 *     status stacks within the frozen caps, a real field change and a settled
 *     outcome.
 *
 * Validation runs over the whole input before capping, so one corrupt old entry
 * rejects the log even when it would have been dropped. The cap keeps the newest
 * `BATTLE_LOG_LIMIT` entries and preserves their original ids and ordinals.
 */
import {
  BATTLE_OUTCOMES,
  DEFENSE_CAP,
  ELEMENTS,
  SIDES,
  STATUS_CAPS,
  STATUS_KINDS,
} from '../engine/types';
import {
  BATTLE_LOG_ACTORS,
  BATTLE_LOG_EFFECT_KINDS,
  BATTLE_LOG_ENTRY_KINDS,
  BATTLE_LOG_LIMIT,
} from './types';
import type { BattleLogEffect, BattleLogEntry } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && allowed.some((entry) => entry === value)
  );
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum
  );
}

function isPositiveInteger(value: unknown): value is number {
  return isIntegerAtLeast(value, 1);
}

/**
 * Reads one effect into a canonical plain object, or returns null. Unknown extra
 * keys are discarded, which is what keeps a validated log JSON-safe even when a
 * caller attached a function or an `undefined` value to the input.
 */
function readEffect(value: unknown): BattleLogEffect | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value.kind;

  if (!isOneOf(BATTLE_LOG_EFFECT_KINDS, kind)) {
    return null;
  }

  switch (kind) {
    case 'start': {
      const opposingMaxHealth = value.opposingMaxHealth;
      const field = value.field;

      if (!isPositiveInteger(opposingMaxHealth)) {
        return null;
      }

      if (!isOneOf(ELEMENTS, field)) {
        return null;
      }

      return { kind: 'start', opposingMaxHealth, field };
    }

    case 'damage': {
      const target = value.target;
      const amount = value.amount;
      const remaining = value.remaining;
      const max = value.max;

      if (!isOneOf(SIDES, target)) {
        return null;
      }

      if (!isPositiveInteger(amount)) {
        return null;
      }

      if (!isIntegerAtLeast(remaining, 0)) {
        return null;
      }

      if (!isPositiveInteger(max) || remaining > max) {
        return null;
      }

      return { kind: 'damage', target, amount, remaining, max };
    }

    case 'heal': {
      const target = value.target;
      const amount = value.amount;
      const remaining = value.remaining;
      const max = value.max;

      if (!isOneOf(SIDES, target)) {
        return null;
      }

      if (!isPositiveInteger(amount)) {
        return null;
      }

      if (!isIntegerAtLeast(remaining, 0)) {
        return null;
      }

      if (!isPositiveInteger(max) || remaining > max) {
        return null;
      }

      return { kind: 'heal', target, amount, remaining, max };
    }

    case 'defense': {
      const target = value.target;
      const amount = value.amount;
      const total = value.total;

      if (!isOneOf(SIDES, target)) {
        return null;
      }

      if (!isPositiveInteger(amount)) {
        return null;
      }

      if (!isIntegerAtLeast(total, 0) || total > DEFENSE_CAP) {
        return null;
      }

      return { kind: 'defense', target, amount, total };
    }

    case 'status': {
      const target = value.target;
      const status = value.status;
      const stacks = value.stacks;

      if (!isOneOf(SIDES, target)) {
        return null;
      }

      if (!isOneOf(STATUS_KINDS, status)) {
        return null;
      }

      if (!isPositiveInteger(stacks) || stacks > STATUS_CAPS[status]) {
        return null;
      }

      return { kind: 'status', target, status, stacks };
    }

    case 'field': {
      const previous = value.previous;
      const next = value.next;

      if (!isOneOf(ELEMENTS, previous) || !isOneOf(ELEMENTS, next)) {
        return null;
      }

      // A field fact claims a shift happened, so the two elements must differ.
      if (previous === next) {
        return null;
      }

      return { kind: 'field', previous, next };
    }

    case 'outcome': {
      const outcome = value.outcome;

      if (!isOneOf(BATTLE_OUTCOMES, outcome)) {
        return null;
      }

      // `outcome` records a settlement, never the ongoing state.
      if (outcome === 'ongoing') {
        return null;
      }

      return { kind: 'outcome', outcome };
    }
  }

  return null;
}

/** Reads one entry into a canonical plain object, or returns null. */
function readEntry(value: unknown): BattleLogEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const ordinal = value.ordinal;
  const turn = value.turn;
  const kind = value.kind;
  const actor = value.actor;
  const rawCardId = value.cardId;
  const rawEffects = value.effects;

  if (typeof id !== 'string' || id.trim().length === 0) {
    return null;
  }

  if (!isIntegerAtLeast(ordinal, 0)) {
    return null;
  }

  if (!isIntegerAtLeast(turn, 1)) {
    return null;
  }

  if (!isOneOf(BATTLE_LOG_ENTRY_KINDS, kind)) {
    return null;
  }

  if (!isOneOf(BATTLE_LOG_ACTORS, actor)) {
    return null;
  }

  if (!Array.isArray(rawEffects)) {
    return null;
  }

  const effects: BattleLogEffect[] = [];
  const inputEffects: readonly unknown[] = rawEffects;

  for (const rawEffect of inputEffects) {
    const effect = readEffect(rawEffect);

    if (effect === null) {
      return null;
    }

    effects.push(effect);
  }

  if (kind === 'battle-start') {
    if (actor !== 'system') {
      return null;
    }

    if (rawCardId !== undefined) {
      return null;
    }

    const [only] = effects;

    // The opening entry must carry the opening opposing maximum health and
    // field, and nothing else: no later entry can reconstruct them honestly.
    if (effects.length !== 1 || only === undefined || only.kind !== 'start') {
      return null;
    }

    return { id, ordinal, turn, kind, actor, effects };
  }

  if (actor === 'system') {
    return null;
  }

  if (effects.some((effect) => effect.kind === 'start')) {
    return null;
  }

  if (kind === 'card') {
    if (typeof rawCardId !== 'string' || rawCardId.length === 0) {
      return null;
    }

    return { id, ordinal, turn, kind, actor, cardId: rawCardId, effects };
  }

  if (rawCardId !== undefined) {
    return null;
  }

  return { id, ordinal, turn, kind, actor, effects };
}

/**
 * Validates an untrusted value as a battle log.
 *
 * Returns a canonical new array (same order, newest `BATTLE_LOG_LIMIT` entries)
 * or `null` when any entry, effect, id, ordinal or kind is invalid. A duplicate
 * id, a non-increasing ordinal or an unknown effect rejects the whole log; the
 * supplied value is never mutated.
 */
export function validateBattleLog(input: unknown): BattleLogEntry[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  const rows: readonly unknown[] = input;
  const entries: BattleLogEntry[] = [];
  const seenIds = new Set<string>();
  let previousOrdinal: number | null = null;

  for (const row of rows) {
    const entry = readEntry(row);

    if (entry === null) {
      return null;
    }

    if (seenIds.has(entry.id)) {
      return null;
    }

    if (previousOrdinal !== null && entry.ordinal <= previousOrdinal) {
      return null;
    }

    seenIds.add(entry.id);
    previousOrdinal = entry.ordinal;
    entries.push(entry);
  }

  return entries.length <= BATTLE_LOG_LIMIT
    ? entries
    : entries.slice(entries.length - BATTLE_LOG_LIMIT);
}
