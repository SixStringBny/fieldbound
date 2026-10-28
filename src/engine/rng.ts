/**
 * The single randomness source for Fieldbound (VIS-NFR-04, ENG-FR-05).
 *
 * A pure, serializable 32-bit generator: mulberry32. The algorithm is frozen
 * for v1 because every saved battle, reward offer and duel round depends on
 * its sequence; changing it requires a snapshot schema version bump.
 *
 * Every random call takes the current state and returns the next state with
 * its result, so nothing is hidden and the host random source is never used.
 * State is always stored as an unsigned 32-bit integer (`>>> 0`) so a JSON
 * round-trip continues the exact sequence.
 */

/** Unsigned 32-bit internal generator state. Plain JSON, no functions. */
export interface RngState {
  readonly state: number;
}

/** Result of one draw: the value plus the state to pass to the next call. */
export interface RngDraw {
  readonly state: RngState;
  readonly value: number;
}

/** Result of a shuffle: a fresh permuted array plus the advanced state. */
export interface RngShuffle<T> {
  readonly state: RngState;
  readonly items: readonly T[];
}

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = 0xffff_ffff;
const SEED_INCREMENT = 0x6d2b_79f5;

/**
 * Runtime guard used by snapshot and save validation before a state is
 * trusted. Accepts only integers in `[0, 4294967295]`.
 */
export function isValidRngState(value: unknown): value is RngState {
  if (typeof value !== 'object' || value === null || !('state' in value)) {
    return false;
  }

  const state: unknown = value.state;

  return (
    typeof state === 'number' &&
    Number.isInteger(state) &&
    state >= 0 &&
    state <= UINT32_MAX
  );
}

/**
 * Creates the initial state for a 32-bit seed. Seeds are validated here so an
 * out-of-range value can never silently produce a different sequence; parsing
 * `?seed=` and generating a seed when absent belongs to the persistence layer.
 */
export function createRng(seed: number): RngState {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(
      `seed must be an unsigned 32-bit integer, received ${String(seed)}`,
    );
  }

  return { state: seed >>> 0 };
}

/**
 * Draws one unsigned 32-bit value and advances the state. One call consumes
 * exactly one state transition, which is what keeps draw counts fixed.
 */
export function nextUint32(state: RngState): RngDraw {
  const next = (state.state + SEED_INCREMENT) >>> 0;

  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)) ^ mixed;

  return {
    state: { state: next },
    value: (mixed ^ (mixed >>> 14)) >>> 0,
  };
}

/**
 * Fisher-Yates shuffle over a copy of `items`.
 *
 * Consumes exactly `items.length - 1` draws in index order, one per position,
 * so a shuffle's PRNG footprint never depends on the values drawn. Each draw is
 * scaled by the remaining span (`value * span / 2^32`); the residual modulo bias
 * is below `span / 2^32` and irrelevant for deck-sized arrays.
 *
 * The input array is never mutated, and the result is a permutation: no entry
 * is duplicated, dropped or invented.
 */
export function shuffle<T>(items: readonly T[], state: RngState): RngShuffle<T> {
  const result = [...items];
  let current = state;

  for (let index = result.length - 1; index > 0; index -= 1) {
    const draw = nextUint32(current);
    current = draw.state;

    const swapIndex = Math.floor((draw.value * (index + 1)) / UINT32_RANGE);
    swapInPlace(result, index, swapIndex);
  }

  return { state: current, items: result };
}

/**
 * Returns a plain JSON-safe copy of the state. Kept explicit so callers never
 * serialize a live object by reference.
 */
export function serializeRng(state: RngState): RngState {
  return { state: state.state >>> 0 };
}

/**
 * Restores a serialized state. Takes `unknown` because the input normally comes
 * from JSON: the shape is validated before any state is returned, so a corrupt
 * save can never resume a different sequence. The stored state is assigned
 * directly - it never reseeds from the seed, time or crypto - so the next draw
 * matches the uninterrupted run.
 *
 * Snapshot and save validation call `isValidRngState` first and map a failure to
 * a typed engine error; the `RangeError` is the last line of defence for direct
 * callers.
 */
export function restoreRng(state: unknown): RngState {
  if (!isValidRngState(state)) {
    throw new RangeError(
      'rng state must contain an unsigned 32-bit integer in `state`',
    );
  }

  return { state: state.state >>> 0 };
}

/**
 * In-place swap of two indices the caller has already bounded to
 * `[0, values.length)`, so the assertion below only restates that contract for
 * `noUncheckedIndexedAccess`.
 *
 * The assertion matters: an `undefined` *value* is a legal element here
 * (a caller may shuffle any array), so testing the read for `undefined` would
 * silently skip a swap and break the permutation guarantee.
 */
function swapInPlace<T>(values: T[], left: number, right: number): void {
  const leftValue = values[left] as T;
  const rightValue = values[right] as T;

  values[left] = rightValue;
  values[right] = leftValue;
}
