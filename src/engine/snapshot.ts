/**
 * Versioned battle snapshots: serialization and validation (ENG-FR-08,
 * VIS-NFR-06).
 *
 * A `BattleSnapshot` is the plain-JSON form of `BattleState`: every mutable
 * field (seed, PRNG state, decks, hands, discards, energy, health, defense,
 * field, statuses, turn, phase, outcome and the enemy telegraph) plus a
 * `schemaVersion`. It is what save/resume and duel round resets persist, so it
 * deliberately contains no functions, no class instances and no references into
 * the live battle state.
 *
 * Division of responsibility:
 *
 *   - `serializeSnapshot` copies a state into the contract shape. It is total:
 *     callers may serialize any state, including one built by a test.
 *   - `restoreSnapshot` is the validator. Nothing is returned until every check
 *     has passed; a rejected snapshot produces a typed `SnapshotErrorCode`
 *     failure and never a partial state. Card ids are resolved against the
 *     catalog the caller supplies, so this module never imports `src/content`.
 *
 * This module does not read or write browser storage (or any other host API).
 * The persistence layer owns storage keys and JSON text; the engine owns the
 * shape and the rules about what counts as a resumable battle.
 *
 * Validation runs in a fixed order so a corrupt save reports the most specific
 * defect: schema version first, then the PRNG state, then structure, card ids,
 * duplicate instance ids and impossible counts.
 */
import type { CardCatalog } from './battle';
import { isValidRngState, serializeRng } from './rng';
import {
  BATTLE_OUTCOMES,
  BATTLE_PHASES,
  BATTLE_SCHEMA_VERSION,
  DEFENSE_CAP,
  ELEMENTS,
  FIELD_ELEMENTS,
  HAND_SIZE,
  SIDES,
  STATUS_CAPS,
  STATUS_KINDS,
  STATUS_TARGETS,
} from './types';
import type {
  BattleOutcome,
  BattlePhase,
  BattleSide,
  BattleSides,
  BattleSnapshot,
  BattleState,
  CardInstance,
  EnemyPlan,
  PlanStatusChange,
  PlanStep,
  Side,
  SnapshotErrorCode,
  SnapshotRestoreResult,
  StatusCounters,
} from './types';

/* -------------------------------------------------------------------------- */
/* Frozen bounds                                                               */
/* -------------------------------------------------------------------------- */

const UINT32_MAX = 0xffff_ffff;
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * A rejected snapshot. Thrown only inside this module and caught by
 * `restoreSnapshot`, so callers always receive a typed result and never an
 * exception. `code` is the public `SnapshotErrorCode`.
 */
class SnapshotRejection extends Error {
  readonly code: SnapshotErrorCode;

  constructor(code: SnapshotErrorCode, message: string) {
    super(message);
    this.name = 'SnapshotRejection';
    this.code = code;
  }
}

function reject(code: SnapshotErrorCode, message: string): never {
  throw new SnapshotRejection(code, message);
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Copies one side into plain JSON. Every nested array and object is rebuilt, so
 * the snapshot can never alias the battle state it came from and a later
 * `JSON.stringify` cannot invent a function or a shared reference.
 */
function serializeSide(side: BattleSide): BattleSide {
  return {
    side: side.side,
    element: side.element,
    health: side.health,
    maxHealth: side.maxHealth,
    defense: side.defense,
    energy: side.energy,
    deck: serializeInstances(side.deck),
    hand: serializeInstances(side.hand),
    discard: serializeInstances(side.discard),
    statuses: serializeStatuses(side.statuses),
  };
}

function serializeInstances(
  instances: readonly CardInstance[],
): readonly CardInstance[] {
  return instances.map((instance) => ({
    instanceId: instance.instanceId,
    cardId: instance.cardId,
  }));
}

function serializeStatuses(statuses: StatusCounters): StatusCounters {
  return {
    focus: statuses.focus,
    weaken: statuses.weaken,
    regen: statuses.regen,
  };
}

/** Copies one plan step, including its status descriptors, by value. */
function serializePlanStep(step: PlanStep): PlanStep {
  return {
    cardId: step.cardId,
    instanceId: step.instanceId,
    cost: step.cost,
    damage: step.damage,
    defense: step.defense,
    statuses: step.statuses.map(
      (status): PlanStatusChange => ({
        kind: status.kind,
        stacks: status.stacks,
        target: status.target,
      }),
    ),
    shiftTo: step.shiftTo,
    energyAfter: step.energyAfter,
  };
}

function serializePlan(plan: EnemyPlan): EnemyPlan {
  return {
    side: plan.side,
    turn: plan.turn,
    steps: plan.steps.map(serializePlanStep),
    totalDamage: plan.totalDamage,
    totalDefense: plan.totalDefense,
    lethal: plan.lethal,
    remainingEnergy: plan.remainingEnergy,
  };
}

/**
 * Returns the versioned, plain-JSON snapshot of a battle.
 *
 * The copy is explicit field by field rather than a spread, which is what keeps
 * functions out of a snapshot even if a caller attaches one to state at runtime:
 * only contract values are read. The PRNG state is normalized through
 * `serializeRng` so a resumed battle continues on an unsigned 32-bit counter.
 */
export function serializeSnapshot(state: BattleState): BattleSnapshot {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    seed: state.seed,
    rngState: serializeRng(state.rngState),
    turn: state.turn,
    activeSide: state.activeSide,
    phase: state.phase,
    field: state.field,
    outcome: state.outcome,
    sides: {
      player: serializeSide(state.sides.player),
      opponent: serializeSide(state.sides.opponent),
    },
    enemyPlan: state.enemyPlan === null ? null : serializePlan(state.enemyPlan),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation primitives                                                       */
/* -------------------------------------------------------------------------- */

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    reject('invalid-snapshot', `${path} must be an object`);
  }

  return value;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    reject('invalid-snapshot', `${path} must be an array`);
  }

  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    reject('invalid-snapshot', `${path} must be a non-empty string`);
  }

  return value;
}

function readInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  code: SnapshotErrorCode = 'invalid-snapshot',
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    reject(
      code,
      `${path} must be an integer between ${String(minimum)} and ${String(maximum)}`,
    );
  }

  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    reject('invalid-snapshot', `${path} must be a boolean`);
  }

  return value;
}

/** Narrows a JSON value to one member of a frozen string union. */
function readEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  ) {
    reject(
      'invalid-snapshot',
      `${path} must be one of ${allowed.join(', ')}, received ${String(value)}`,
    );
  }

  return value as Value;
}

/* -------------------------------------------------------------------------- */
/* Instance and zone validation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses one deck/hand/discard pile. `seen` is shared by all six piles for the
 * whole snapshot, so an instance id repeated anywhere - even across sides -
 * fails: one physical card may exist in exactly one zone.
 */
function parseInstances(
  value: unknown,
  path: string,
  catalog: CardCatalog,
  seen: Set<string>,
): CardInstance[] {
  const entries = readArray(value, path);

  return entries.map((entry, index) => {
    const entryPath = `${path}[${String(index)}]`;
    const record = readRecord(entry, entryPath);
    const instanceId = readString(
      record['instanceId'],
      `${entryPath}.instanceId`,
    );
    const cardId = readString(record['cardId'], `${entryPath}.cardId`);

    if (seen.has(instanceId)) {
      reject(
        'duplicate-instance-id',
        `${entryPath}.instanceId "${instanceId}" appears more than once in the snapshot`,
      );
    }

    seen.add(instanceId);

    if (catalog[cardId] === undefined) {
      reject(
        'unknown-card',
        `${entryPath}.cardId "${cardId}" is not in the catalog`,
      );
    }

    return { instanceId, cardId };
  });
}

/** Parses and bounds one counter set; exceeding a documented cap is impossible. */
function parseStatuses(value: unknown, path: string): StatusCounters {
  const record = readRecord(value, path);

  return {
    focus: readInteger(
      record['focus'],
      `${path}.focus`,
      0,
      STATUS_CAPS.focus,
      'impossible-count',
    ),
    weaken: readInteger(
      record['weaken'],
      `${path}.weaken`,
      0,
      STATUS_CAPS.weaken,
      'impossible-count',
    ),
    regen: readInteger(
      record['regen'],
      `${path}.regen`,
      0,
      STATUS_CAPS.regen,
      'impossible-count',
    ),
  };
}

/**
 * Parses one side. Health may be 0 only when the battle has settled, which the
 * top-level outcome check enforces. Defense above the cap and a hand above five
 * are reported as impossible counts rather than shape errors.
 */
function parseSide(
  value: unknown,
  expected: Side,
  catalog: CardCatalog,
  seen: Set<string>,
): BattleSide {
  const path = `snapshot.sides.${expected}`;
  const record = readRecord(value, path);
  const side = readEnum(record['side'], SIDES, `${path}.side`);

  if (side !== expected) {
    reject(
      'invalid-snapshot',
      `${path}.side is "${side}" but the key says "${expected}"`,
    );
  }

  const element = readEnum(record['element'], ELEMENTS, `${path}.element`);
  const maxHealth = readInteger(
    record['maxHealth'],
    `${path}.maxHealth`,
    1,
    MAX_INTEGER,
  );
  const health = readInteger(record['health'], `${path}.health`, 0, maxHealth);
  const defense = readInteger(
    record['defense'],
    `${path}.defense`,
    0,
    DEFENSE_CAP,
    'impossible-count',
  );
  const energy = readInteger(
    record['energy'],
    `${path}.energy`,
    0,
    MAX_INTEGER,
  );
  const statuses = parseStatuses(record['statuses'], `${path}.statuses`);
  const deck = parseInstances(record['deck'], `${path}.deck`, catalog, seen);
  const hand = parseInstances(record['hand'], `${path}.hand`, catalog, seen);
  const discard = parseInstances(
    record['discard'],
    `${path}.discard`,
    catalog,
    seen,
  );

  if (hand.length > HAND_SIZE) {
    reject(
      'impossible-count',
      `${path}.hand holds ${String(hand.length)} cards, more than the ${String(HAND_SIZE)}-card maximum`,
    );
  }

  return {
    side,
    element,
    health,
    maxHealth,
    defense,
    energy,
    deck,
    hand,
    discard,
    statuses,
  };
}

/* -------------------------------------------------------------------------- */
/* Enemy plan validation                                                       */
/* -------------------------------------------------------------------------- */

function parsePlanStatus(
  value: unknown,
  path: string,
): PlanStatusChange {
  const record = readRecord(value, path);

  return {
    kind: readEnum(record['kind'], STATUS_KINDS, `${path}.kind`),
    stacks: readInteger(record['stacks'], `${path}.stacks`, 0, MAX_INTEGER),
    target: readEnum(record['target'], STATUS_TARGETS, `${path}.target`),
  };
}

function parsePlanStep(
  value: unknown,
  path: string,
  catalog: CardCatalog,
  seenSteps: Set<string>,
): PlanStep {
  const record = readRecord(value, path);
  const cardId = readString(record['cardId'], `${path}.cardId`);
  const instanceId = readString(record['instanceId'], `${path}.instanceId`);

  if (seenSteps.has(instanceId)) {
    reject(
      'duplicate-instance-id',
      `${path}.instanceId "${instanceId}" is planned more than once`,
    );
  }

  seenSteps.add(instanceId);

  if (catalog[cardId] === undefined) {
    reject(
      'unknown-card',
      `${path}.cardId "${cardId}" is not in the catalog`,
    );
  }

  const statuses = readArray(record['statuses'], `${path}.statuses`).map(
    (status, index) =>
      parsePlanStatus(status, `${path}.statuses[${String(index)}]`),
  );
  const shiftToValue = record['shiftTo'];
  let shiftTo: PlanStep['shiftTo'] = null;

  if (shiftToValue !== null) {
    shiftTo = readEnum(shiftToValue, FIELD_ELEMENTS, `${path}.shiftTo`);
  }

  return {
    cardId,
    instanceId,
    cost: readInteger(record['cost'], `${path}.cost`, 0, MAX_INTEGER),
    damage: readInteger(record['damage'], `${path}.damage`, 0, MAX_INTEGER),
    defense: readInteger(record['defense'], `${path}.defense`, 0, MAX_INTEGER),
    statuses,
    shiftTo,
    energyAfter: readInteger(
      record['energyAfter'],
      `${path}.energyAfter`,
      0,
      MAX_INTEGER,
    ),
  };
}

/**
 * Parses the stored telegraph. A snapshot always carries the field, so `null`
 * is legal but a missing value is not: resuming without the plan would silently
 * change the player's information.
 */
function parseEnemyPlan(
  value: unknown,
  catalog: CardCatalog,
): EnemyPlan | null {
  if (value === null) {
    return null;
  }

  const path = 'snapshot.enemyPlan';
  const record = readRecord(value, path);
  const seenSteps = new Set<string>();
  const steps = readArray(record['steps'], `${path}.steps`).map(
    (step, index) =>
      parsePlanStep(step, `${path}.steps[${String(index)}]`, catalog, seenSteps),
  );

  return {
    side: readEnum(record['side'], SIDES, `${path}.side`),
    turn: readInteger(record['turn'], `${path}.turn`, 1, MAX_INTEGER),
    steps,
    totalDamage: readInteger(
      record['totalDamage'],
      `${path}.totalDamage`,
      0,
      MAX_INTEGER,
    ),
    totalDefense: readInteger(
      record['totalDefense'],
      `${path}.totalDefense`,
      0,
      MAX_INTEGER,
    ),
    lethal: readBoolean(record['lethal'], `${path}.lethal`),
    remainingEnergy: readInteger(
      record['remainingEnergy'],
      `${path}.remainingEnergy`,
      0,
      MAX_INTEGER,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* State-level validation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Phase and outcome must agree, and health must agree with the outcome. A
 * battle only settles through `playCard`, which clears statuses and sets the
 * phase, so a disagreement here means the snapshot was not produced by the
 * engine (or was edited).
 */
function checkOutcome(
  phase: BattlePhase,
  outcome: BattleOutcome,
  sides: BattleSides,
): void {
  if (outcome === 'ongoing') {
    if (phase === 'ended') {
      reject(
        'invalid-snapshot',
        'snapshot.phase is "ended" but the outcome is still ongoing',
      );
    }

    if (sides.player.health <= 0 || sides.opponent.health <= 0) {
      reject(
        'invalid-snapshot',
        'an ongoing battle has a side at 0 health',
      );
    }

    return;
  }

  if (phase !== 'ended') {
    reject(
      'invalid-snapshot',
      `snapshot.outcome is "${outcome}" but the phase is "${phase}"`,
    );
  }

  if (outcome === 'player-victory' && sides.opponent.health !== 0) {
    reject(
      'invalid-snapshot',
      'snapshot.outcome is player-victory but the opponent is above 0 health',
    );
  }

  if (outcome === 'opponent-victory' && sides.player.health !== 0) {
    reject(
      'invalid-snapshot',
      'snapshot.outcome is opponent-victory but the player is above 0 health',
    );
  }
}

/**
 * Validates an unknown value and reconstructs a `BattleState`. Every nested
 * object returned here is new, so the caller's snapshot is never aliased or
 * mutated. Order is deliberate: schema version, PRNG, structure, cards,
 * duplicates, counts and finally phase/outcome consistency.
 */
function parseSnapshot(input: unknown, catalog: CardCatalog): BattleState {
  const record = readRecord(input, 'snapshot');

  if (record['schemaVersion'] !== BATTLE_SCHEMA_VERSION) {
    reject(
      'unknown-schema-version',
      `snapshot.schemaVersion ${String(record['schemaVersion'])} is not supported; expected ${String(BATTLE_SCHEMA_VERSION)}`,
    );
  }

  const rngValue = record['rngState'];

  if (!isValidRngState(rngValue)) {
    reject(
      'invalid-rng-state',
      'snapshot.rngState must hold an unsigned 32-bit integer in `state`',
    );
  }

  const seed = readInteger(
    record['seed'],
    'snapshot.seed',
    0,
    UINT32_MAX,
  );
  const turn = readInteger(record['turn'], 'snapshot.turn', 1, MAX_INTEGER);
  const activeSide = readEnum(
    record['activeSide'],
    SIDES,
    'snapshot.activeSide',
  );
  const phase = readEnum(record['phase'], BATTLE_PHASES, 'snapshot.phase');
  const field = readEnum(
    record['field'],
    ELEMENTS,
    'snapshot.field',
  );
  const outcome = readEnum(
    record['outcome'],
    BATTLE_OUTCOMES,
    'snapshot.outcome',
  );

  const sidesRecord = readRecord(record['sides'], 'snapshot.sides');
  const seen = new Set<string>();
  const sides: BattleSides = {
    player: parseSide(sidesRecord['player'], 'player', catalog, seen),
    opponent: parseSide(sidesRecord['opponent'], 'opponent', catalog, seen),
  };

  if (record['enemyPlan'] === undefined) {
    reject(
      'invalid-snapshot',
      'snapshot.enemyPlan must be null or a plan object',
    );
  }

  const enemyPlan = parseEnemyPlan(record['enemyPlan'], catalog);

  checkOutcome(phase, outcome, sides);

  return {
    seed,
    rngState: serializeRng(rngValue),
    turn,
    activeSide,
    phase,
    field,
    outcome,
    sides,
    enemyPlan,
  };
}

/* -------------------------------------------------------------------------- */
/* Public restore                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates a snapshot against the supplied card catalog and returns the battle
 * state it describes.
 *
 * Accepts `unknown` because the value normally arrives from a parsed save
 * string: nothing is trusted until it has been checked, and no state is
 * returned on failure. Every rejection is a typed `SnapshotErrorCode`, so the
 * persistence layer can discard only the affected save and tell the user
 * nothing more than "that save could not be resumed".
 */
export function restoreSnapshot(
  input: unknown,
  catalog: CardCatalog,
): SnapshotRestoreResult {
  if (!isRecord(catalog)) {
    return {
      ok: false,
      error: {
        code: 'invalid-snapshot',
        message: 'the card catalog must be an object keyed by card id',
      },
    };
  }

  try {
    return { ok: true, value: parseSnapshot(input, catalog) };
  } catch (error) {
    if (error instanceof SnapshotRejection) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }

    // Last line of defence: a validator bug must still surface as a typed
    // rejection rather than resume a half-checked battle.
    return {
      ok: false,
      error: {
        code: 'invalid-snapshot',
        message: 'the snapshot could not be validated',
      },
    };
  }
}
