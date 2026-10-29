/**
 * Battle-log prose renderer (LOG-FR-02, LOG-NF-01).
 *
 * Turns settled `BattleLogEntry` facts into one factual English sentence plus
 * at most one authored dialogue line:
 *
 *   - the factual sentence names the acting side, the played card and every
 *     non-zero effect with its engine-reported remaining/total value;
 *   - a dialogue line is chosen from `src/content/battle-dialogue.ts` by a local
 *     hash of the battle seed, the entry ordinal and a trigger tag.
 *
 * What this module deliberately does not do:
 *
 *   - it never computes damage, healing, defense, draw, status or
 *     affordability. It formats the numbers the derivation already recorded;
 *   - it never reads a hidden hand, deck order or enemy plan;
 *   - it never uses an unseeded random-number API, imports or mutates the
 *     engine's seeded PRNG state, or imports React, a controller or a storage
 *     module. Rendering is a pure function of the entries, seed, names, catalog
 *     and dialogue catalog, so a render cannot change the battle, its PRNG
 *     state or its outcome.
 *
 * Dialogue keying
 * ---------------
 * Each per-event trigger is decided from the entry alone (its own effects and
 * ordinal), never from the entry's position in the array. The picker hashes
 * `(seed, ordinal, trigger)`, so dropping the oldest entries from the capped
 * log cannot change a surviving entry's text.
 */
import { FIELD_BEATS } from '../engine/damage';
import type {
  CardDefinition,
  Element,
  Side,
  StatusKind,
} from '../engine/types';
import {
  ENEMY_DIALOGUE_IDS,
  selectDialogueLine,
} from '../content/battle-dialogue';
import type {
  DialogueCatalog,
  DialogueSpeaker,
  DialogueTrigger,
  EnemyDialogueId,
} from '../content/battle-dialogue';
import type {
  BattleLogActor,
  BattleLogDamageEffect,
  BattleLogEffect,
  BattleLogEntry,
  BattleLogFieldEffect,
  BattleLogStartEffect,
} from './types';

/**
 * Display names for the two sides of a battle.
 *
 * `names.player` labels the viewer's side and `names.opponent` the other side.
 * Solo always views the engine `player` side, so these are `You` and the enemy
 * name. A duel viewer passes its own seat name and the other seat's name and
 * sets `viewerSide`, which keeps a shared public log readable from either seat.
 */
export interface BattleLogNames {
  /** The viewer's side: `You` in solo, `Player 1` / `Player 2` in duel. */
  readonly player: string;
  /** The other side: the enemy name in solo, the other seat in duel. */
  readonly opponent: string;
}

/** Card names are read from the frozen catalog, never derived from prose. */
export type BattleLogCardCatalog = Readonly<Record<string, CardDefinition>>;

/** Everything a render needs. No `BattleState` is accepted or returned. */
export interface BattleLogRenderContext {
  /** 32-bit battle seed; the dialogue hash seed, never read from the PRNG. */
  readonly seed: number;
  readonly names: BattleLogNames;
  readonly catalog: BattleLogCardCatalog;
  readonly dialogue: DialogueCatalog;
  /**
   * The engine side the names are relative to. Defaults to `player`: solo
   * always views the engine player, while a duel viewer sets its own seat so
   * `names.player` labels that side and victory/defeat match the viewer.
   */
  readonly viewerSide?: Side;
  /**
   * The enemy being fought in solo, so the enemy voice can speak. `null` (or
   * omitted) in duel, where the neutral narrator speaks every trigger.
   */
  readonly enemyId?: string | null;
}

/** One rendered entry: a factual sentence and at most one dialogue line. */
export interface BattleLogLine {
  /** Matches `BattleLogEntry.id`. */
  readonly id: string;
  /** The entry ordinal dialogue was keyed on. */
  readonly ordinal: number;
  /** Engine turn number after the transition. */
  readonly turn: number;
  /** The one factual English sentence. */
  readonly factual: string;
  /** At most one authored line; `null` when no trigger applies. */
  readonly dialogue: string | null;
}

/** Hard upper bound for any rendered line (see `text.test.ts`). */
export const BATTLE_LOG_LINE_MAX = 140;

/* -------------------------------------------------------------------------- */
/* Display words                                                               */
/* -------------------------------------------------------------------------- */

const ELEMENT_NAMES: Readonly<Record<Element, string>> = Object.freeze({
  ember: 'Ember',
  frost: 'Frost',
  gale: 'Gale',
  stone: 'Stone',
  neutral: 'Neutral',
});

const STATUS_NAMES: Readonly<Record<StatusKind, string>> = Object.freeze({
  focus: 'Focus',
  weaken: 'Weaken',
  regen: 'Regen',
});

/** `You` keeps its second-person verb; every other name is third person. */
function isSecondPerson(name: string): boolean {
  return name.trim().toLowerCase() === 'you';
}

function actorPhrase(
  name: string,
  secondPersonVerb: string,
  thirdPersonVerb: string,
): string {
  return `${name} ${isSecondPerson(name) ? secondPersonVerb : thirdPersonVerb}`;
}

/** Lower-case `you` when it appears inside a sentence rather than at its head. */
function targetLabel(name: string): string {
  return isSecondPerson(name) ? 'you' : name;
}

function otherSide(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player';
}

/** Labels a side relative to the viewer; solo always views the engine player. */
function labelFor(
  side: Side,
  context: BattleLogRenderContext,
): string {
  const viewer = context.viewerSide ?? 'player';

  return side === viewer ? context.names.player : context.names.opponent;
}

function actorLabel(
  actor: BattleLogActor,
  context: BattleLogRenderContext,
): string {
  return labelFor(actor === 'player' ? 'player' : 'opponent', context);
}

function cardName(
  catalogue: BattleLogCardCatalog,
  cardId: string | undefined,
): string {
  if (cardId === undefined) {
    return 'a card';
  }

  return catalogue[cardId]?.name ?? cardId;
}

/* -------------------------------------------------------------------------- */
/* Field matchup words                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The frozen cycle stated in words. `FIELD_BEATS` is the engine's own frozen
 * constant, so the prose cannot drift from the rules; no matchup arithmetic is
 * performed here.
 */
function fieldSummary(field: Element): string {
  if (field === 'neutral') {
    return 'Neutral (nothing is empowered or countered)';
  }

  const countered = FIELD_BEATS[field];

  return `${ELEMENT_NAMES[field]} (${ELEMENT_NAMES[field]} is empowered, ${ELEMENT_NAMES[countered]} is countered)`;
}

function fieldShiftSummary(previous: Element, next: Element): string {
  if (previous === next) {
    return '';
  }

  return `the field shifts from ${ELEMENT_NAMES[previous]} to ${fieldSummary(next)}`;
}

/* -------------------------------------------------------------------------- */
/* Effect formatting                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Formats one effect, or returns `null` when the effect carries no visible
 * value. Zero-value effects are omitted rather than printed as "+0".
 */
function formatEffect(
  effect: BattleLogEffect,
  context: BattleLogRenderContext,
): string | null {
  switch (effect.kind) {
    case 'start':
      return null;

    case 'damage': {
      if (effect.amount <= 0) {
        return null;
      }

      const target = targetLabel(labelFor(effect.target, context));

      return `${effect.amount} damage to ${target} (${effect.remaining}/${effect.max})`;
    }

    case 'heal': {
      if (effect.amount <= 0) {
        return null;
      }

      const target = targetLabel(labelFor(effect.target, context));

      return `${effect.amount} health restored to ${target} (${effect.remaining}/${effect.max})`;
    }

    case 'defense': {
      if (effect.amount <= 0) {
        return null;
      }

      return `${effect.amount} defense (total ${effect.total})`;
    }

    case 'status': {
      if (effect.stacks <= 0) {
        return null;
      }

      const target = targetLabel(labelFor(effect.target, context));
      const stacks = effect.stacks === 1 ? 'stack' : 'stacks';

      return `${STATUS_NAMES[effect.status]} on ${target} (${effect.stacks} ${stacks})`;
    }

    case 'field':
      return fieldShiftSummary(effect.previous, effect.next) || null;

    case 'outcome': {
      if (effect.outcome === 'ongoing') {
        return null;
      }

      const winner: Side =
        effect.outcome === 'player-victory' ? 'player' : 'opponent';
      const viewer = context.viewerSide ?? 'player';

      return winner === viewer
        ? `victory (${labelFor(otherSide(winner), context)} is defeated)`
        : `defeat (${labelFor(winner, context)} wins)`;
    }
  }
}

function visibleClauses(
  effects: readonly BattleLogEffect[],
  context: BattleLogRenderContext,
): string[] {
  const clauses: string[] = [];

  for (const effect of effects) {
    const clause = formatEffect(effect, context);

    if (clause !== null) {
      clauses.push(clause);
    }
  }

  return clauses;
}

/* -------------------------------------------------------------------------- */
/* Factual sentences                                                           */
/* -------------------------------------------------------------------------- */

function startEffect(
  entry: BattleLogEntry,
): BattleLogStartEffect | undefined {
  return entry.effects.find(
    (effect): effect is BattleLogStartEffect => effect.kind === 'start',
  );
}

function factualStart(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): string {
  const start = startEffect(entry);
  const opponent = labelFor('opponent', context);

  if (start === undefined) {
    return `The battle begins against ${opponent}.`;
  }

  return `The battle begins: ${opponent} has ${start.opposingMaxHealth} health; the field is ${fieldSummary(start.field)}.`;
}

function factualCard(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): string {
  const opening = actorPhrase(actorLabel(entry.actor, context), 'play', 'plays');
  const name = cardName(context.catalog, entry.cardId);
  const clauses = visibleClauses(entry.effects, context);

  return clauses.length === 0
    ? `${opening} ${name}.`
    : `${opening} ${name}: ${clauses.join('; ')}.`;
}

function factualTurn(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): string {
  const opening = actorPhrase(actorLabel(entry.actor, context), 'end', 'ends');
  const clauses = visibleClauses(entry.effects, context);

  return clauses.length === 0
    ? `${opening} the turn.`
    : `${opening} the turn: ${clauses.join('; ')}.`;
}

/** The one factual sentence for an entry. */
export function renderBattleLogFact(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): string {
  switch (entry.kind) {
    case 'battle-start':
      return factualStart(entry, context);
    case 'card':
      return factualCard(entry, context);
    case 'turn':
      return factualTurn(entry, context);
  }
}

/* -------------------------------------------------------------------------- */
/* Dialogue triggers                                                           */
/* -------------------------------------------------------------------------- */

function isDamage(
  effect: BattleLogEffect,
): effect is BattleLogDamageEffect {
  return effect.kind === 'damage';
}

function isFieldShift(
  effect: BattleLogEffect,
): effect is BattleLogFieldEffect {
  return effect.kind === 'field' && effect.previous !== effect.next;
}

/**
 * True when this single damage effect takes a side from above 25% health to at
 * or below it. Both before and after are read from the reported effect, so no
 * earlier entry is required and truncation cannot change the answer.
 */
function crossesLowHealth(effect: BattleLogDamageEffect): boolean {
  if (effect.amount <= 0 || effect.max <= 0) {
    return false;
  }

  const before = effect.remaining + effect.amount;

  return before * 4 > effect.max && effect.remaining * 4 <= effect.max;
}

/**
 * First blood is the first hit that lands on a full-health other side. That is
 * visible from the effect alone (`remaining + amount === max`), so the trigger
 * is stable even when the oldest entries have been dropped. The caller checks
 * that the target is the viewer's opponent.
 */
function isFirstBlood(effect: BattleLogDamageEffect): boolean {
  return effect.amount > 0 && effect.remaining + effect.amount === effect.max;
}

/**
 * Chooses at most one trigger per entry. A collision resolves in this order:
 * a settled outcome always closes the entry, then the battle start, a field
 * shift, a low-health crossing, first blood and finally a big hit. One entry
 * therefore produces one dialogue line, never a narrator line plus an enemy
 * line.
 *
 * `viewerSide` makes the player-facing triggers viewer-relative in a duel:
 * damage to the viewer's side is `low-health-player`, damage to the other side
 * is `low-health-enemy`, and victory/defeat follow the viewer. It defaults to
 * the engine player, which is the solo perspective.
 */
export function dialogueTriggerFor(
  entry: BattleLogEntry,
  viewerSide: Side = 'player',
): DialogueTrigger | null {
  for (const effect of entry.effects) {
    if (effect.kind === 'outcome' && effect.outcome !== 'ongoing') {
      const winner: Side =
        effect.outcome === 'player-victory' ? 'player' : 'opponent';

      return winner === viewerSide ? 'victory' : 'defeat';
    }
  }

  if (entry.kind === 'battle-start') {
    return 'battle-start';
  }

  if (entry.effects.some(isFieldShift)) {
    return 'field-shift';
  }

  if (
    entry.effects.some(
      (effect) =>
        isDamage(effect) &&
        effect.target === viewerSide &&
        crossesLowHealth(effect),
    )
  ) {
    return 'low-health-player';
  }

  if (
    entry.effects.some(
      (effect) =>
        isDamage(effect) &&
        effect.target === otherSide(viewerSide) &&
        crossesLowHealth(effect),
    )
  ) {
    return 'low-health-enemy';
  }

  if (
    entry.effects.some(
      (effect) =>
        isDamage(effect) &&
        effect.target === otherSide(viewerSide) &&
        isFirstBlood(effect),
    )
  ) {
    return 'first-blood';
  }

  if (
    entry.effects.some(
      (effect) => isDamage(effect) && effect.amount >= 6,
    )
  ) {
    return 'big-hit';
  }

  return null;
}

function isEnemyDialogueId(value: string): value is EnemyDialogueId {
  return (ENEMY_DIALOGUE_IDS as readonly string[]).includes(value);
}

/**
 * Who speaks this trigger. The enemy answers its own introduction, a shift it
 * caused, its own low health, and the closing entry; the narrator handles every
 * public event in duel (no enemy id) and the player's own moments.
 */
function speakerFor(
  trigger: DialogueTrigger,
  entry: BattleLogEntry,
  enemyId: string | null,
): DialogueSpeaker {
  if (enemyId === null || !isEnemyDialogueId(enemyId)) {
    return 'narrator';
  }

  switch (trigger) {
    case 'battle-start':
    case 'low-health-enemy':
    case 'victory':
    case 'defeat':
      return enemyId;

    case 'field-shift':
      return entry.actor === 'opponent' ? enemyId : 'narrator';

    default:
      return 'narrator';
  }
}

/** The dialogue line for one entry, or `null` for "no trigger / no set". */
export function renderBattleLogDialogue(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): string | null {
  const viewer = context.viewerSide ?? 'player';
  const trigger = dialogueTriggerFor(entry, viewer);

  if (trigger === null) {
    return null;
  }

  const speaker = speakerFor(trigger, entry, context.enemyId ?? null);

  return selectDialogueLine(
    context.seed,
    entry.ordinal,
    trigger,
    speaker,
    context.dialogue,
  );
}

/* -------------------------------------------------------------------------- */
/* Public renderer                                                             */
/* -------------------------------------------------------------------------- */

/** Renders one entry as its factual sentence plus at most one dialogue line. */
export function renderBattleLogEntry(
  entry: BattleLogEntry,
  context: BattleLogRenderContext,
): BattleLogLine {
  return {
    id: entry.id,
    ordinal: entry.ordinal,
    turn: entry.turn,
    factual: renderBattleLogFact(entry, context),
    dialogue: renderBattleLogDialogue(entry, context),
  };
}

/**
 * Renders a chronological log in order. Each input entry produces exactly one
 * output line; the factual string is first and `dialogue` is `null` or exactly
 * one authored line. The function is pure and never mutates its inputs.
 */
export function renderBattleLog(
  entries: readonly BattleLogEntry[],
  context: BattleLogRenderContext,
): BattleLogLine[] {
  return entries.map((entry) => renderBattleLogEntry(entry, context));
}
