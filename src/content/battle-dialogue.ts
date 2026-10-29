/**
 * Authored battle dialogue and the deterministic trigger-to-line picker
 * (LOG-FR-03, LOG-NF-01, VIS-CON-05).
 *
 * This module is bundled English data plus one pure selection function:
 *
 *   - `BATTLE_DIALOGUE` holds the neutral narrator sets and the authored sets
 *     for all four enemies, including The Hollow Field boss. Every set is a
 *     short list of plain strings; there is no fetch, no template and no
 *     localization framework.
 *   - `selectDialogueLine` chooses at most one line from one set using a local
 *     32-bit hash of the battle seed, the entry ordinal and the trigger tag.
 *
 * What this module deliberately does not do:
 *
 *   - it never uses an unseeded random-number API;
 *   - it never imports, reads or writes the engine's seeded PRNG state, so
 *     choosing a line cannot change a shuffle, a reward offer or an enemy plan;
 *   - it contains no damage, draw, status, affordability or victory rule. The
 *     renderer formats the facts the engine already reported.
 *
 * Selection keys on the entry `ordinal`, never on an array index, so dropping
 * the oldest entries from a capped log cannot change a surviving entry's line.
 * The hash covers only `(seed, ordinal, trigger)`; the speaker chooses which
 * authored set is read, not which index inside it.
 */

/* -------------------------------------------------------------------------- */
/* Trigger vocabulary                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every dialogue trigger of the feature. The first four are public events a
 * neutral narrator can always comment on; the enemy-specific triggers, the
 * closing victory/defeat and an enemy-caused field shift prefer the enemy's
 * voice when one is present. The narrator speaks every trigger in duel.
 */
export const DIALOGUE_TRIGGERS = [
  'battle-start',
  'field-shift',
  'first-blood',
  'big-hit',
  'low-health-player',
  'low-health-enemy',
  'victory',
  'defeat',
] as const;

export type DialogueTrigger = (typeof DIALOGUE_TRIGGERS)[number];

/**
 * Triggers an enemy may speak to. LOG-FR-03 names battle start, enemy low
 * health, field shift, victory and defeat, so every enemy has a set for each.
 */
export const ENEMY_DIALOGUE_TRIGGERS = [
  'battle-start',
  'field-shift',
  'low-health-enemy',
  'victory',
  'defeat',
] as const;

export type EnemyDialogueTrigger = (typeof ENEMY_DIALOGUE_TRIGGERS)[number];

/** The four authored enemy ids. The values mirror `enemies.json`. */
export const ENEMY_DIALOGUE_IDS = [
  'enemy-cinder-warden',
  'enemy-rime-sentinel',
  'enemy-storm-herald',
  'enemy-hollow-field',
] as const;

export type EnemyDialogueId = (typeof ENEMY_DIALOGUE_IDS)[number];

/** Narrator plus the four authored enemies. */
export type DialogueSpeaker = 'narrator' | EnemyDialogueId;

export type DialogueLineSet = readonly string[];

/** One authored set per trigger for the neutral narrator. */
export type NarratorDialogue = Readonly<
  Record<DialogueTrigger, DialogueLineSet>
>;

/** One authored set per enemy trigger. */
export type EnemyDialogue = Readonly<
  Record<EnemyDialogueTrigger, DialogueLineSet>
>;

/**
 * The dialogue content a renderer reads.
 *
 * `enemies` is typed so all four authored ids are required, while a lookup by
 * an arbitrary enemy id still works and yields `undefined` for a catalog that
 * has no lines for it (no invented fallback is ever produced).
 */
export interface DialogueCatalog {
  readonly narrator: NarratorDialogue;
  readonly enemies: Readonly<
    Record<EnemyDialogueId, EnemyDialogue> &
      Partial<Record<string, EnemyDialogue>>
  >;
}

/* -------------------------------------------------------------------------- */
/* Authored copy                                                               */
/* -------------------------------------------------------------------------- */

const NARRATOR: NarratorDialogue = {
  'battle-start': [
    'The field is set. Read it before you play: it decides who is empowered.',
    'Two decks, one field. The first card decides the shape of the fight.',
    'The arena settles. Watch the field; it will not stay neutral for long.',
  ],
  'field-shift': [
    'The field turns. Its empowered element strikes harder; its countered element falters.',
    'A new field, a new balance. Re-read your hand before the next strike.',
    'The ground shifts beneath the cards. The matchup has changed.',
  ],
  'first-blood': [
    'First blood. The field has tasted one side of the fight.',
    'The first wound lands. From here, every point of defense matters.',
    'Blood on the field. The fight is properly begun.',
  ],
  'big-hit': [
    'That hit landed hard enough to change the shape of the turn.',
    'A heavy blow. The defense line is thinning.',
    'Six or more through the guard. That will be remembered.',
  ],
  'low-health-player': [
    'You are nearly spent. Ward first; a trade you lose is still a loss.',
    'Your health is in the last quarter. Play for defense, not pride.',
    'One bad turn from defeat. Choose the card that keeps you alive.',
  ],
  'low-health-enemy': [
    'The enemy is in the last quarter. Press the advantage.',
    'Their guard is failing. One clean hit could end this.',
    'The enemy is nearly spent. Do not let the field turn now.',
  ],
  victory: [
    'The field is still. The battle is yours.',
    'Victory. The last card is played and the turn is closed.',
    'The dust settles in your favor. The field keeps no record.',
  ],
  defeat: [
    'The field is still. This battle is lost.',
    'Defeat. The last card falls from your hand.',
    'Your health is gone and the turn is over. The field remains.',
  ],
};

const CINDER_WARDEN: EnemyDialogue = {
  'battle-start': [
    'Ash on the wind already. You will not outlast the burn.',
    'I am the Cinder Warden. Everything you bring, I will burn.',
    'Step into the heat. The field will do the rest.',
  ],
  'field-shift': [
    'The field answers me. Exactly as it should be.',
    'Feel that? The air itself is on my side now.',
    'A shift in the wind, and the fight turns.',
  ],
  'low-health-enemy': [
    'My flame gutters. It does not go out.',
    'You have burned me low. Come closer and finish it.',
    'Ash and ember. I am not finished yet.',
  ],
  victory: [
    'The cinders cool. A good fight, and a clean end.',
    'You burned brighter. I will remember this field.',
    'Ash to ash. The next one will not be so kind.',
  ],
  defeat: [
    'The fire holds. You were fuel, nothing more.',
    'Warmth fades. The field belongs to the burn.',
    'I told you: the heat always wins.',
  ],
};

const RIME_SENTINEL: EnemyDialogue = {
  'battle-start': [
    'Stand still. The cold will do the rest.',
    'I am the Rime Sentinel. Winter keeps what it takes.',
    'Breathe in. That is the last warm air you will taste here.',
  ],
  'field-shift': [
    'The field turns. Patience, then pressure.',
    'A new field. Your footing is already slipping.',
    'Let the ground choose. I will adapt.',
  ],
  'low-health-enemy': [
    'The ice cracks. Curious. It has never done that before.',
    'You have worn me down. The winter is not ended.',
    'A fracture in the frost. Do not mistake it for a thaw.',
  ],
  victory: [
    'The thaw comes for me. Well fought, warm one.',
    'I melt. The field keeps the cold I left behind.',
    'You broke the winter. Few ever do.',
  ],
  defeat: [
    'Frozen through. The field will keep you now.',
    'Winter is patient. You were not.',
    'Stand still, I said. Now you will.',
  ],
};

const STORM_HERALD: EnemyDialogue = {
  'battle-start': [
    'The wind has already chosen. You are merely arriving.',
    'I am the Storm Herald. Every turn begins with my weather.',
    'Hold your cards loosely. The gale will take them.',
  ],
  'field-shift': [
    'The field turns. Everything moves faster now.',
    'Feel the pressure drop? That is your footing leaving.',
    'A new field, and the wind reads it before you do.',
  ],
  'low-health-enemy': [
    'The storm thins. You found the eye of it.',
    'You have scattered me. The wind is not done.',
    'My gale is failing. Enjoy the calm while it lasts.',
  ],
  victory: [
    'The wind falls. A fine squall, well answered.',
    'Scattered. I will gather somewhere else.',
    'You outran the storm. Barely.',
  ],
  defeat: [
    'The gale holds. You were blown off the field.',
    'Still air now. The storm keeps what it took.',
    'Every storm ends. Yours ended first.',
  ],
};

const HOLLOW_FIELD: EnemyDialogue = {
  'battle-start': [
    'There is no element here. Only the space between them.',
    'I am the Hollow Field. Every card you play feeds the empty.',
    'You brought elements to a place that has none. Begin.',
  ],
  'field-shift': [
    'That element is borrowed. Everything here returns to hollow.',
    'The field turns. I remain the space it turns inside.',
    'Choose an element. I will wear it like a mask.',
  ],
  'low-health-enemy': [
    'Hollow, but not empty. You have not won yet.',
    'You have cut deeply into the void. It closes behind you.',
    'I am thinning. The field is still mine.',
  ],
  victory: [
    'The void closes. You filled it, briefly.',
    'Hollow at last. You were more than I measured.',
    'The field empties. Yours was the stronger element.',
  ],
  defeat: [
    'The hollow remains. You are part of it now.',
    'Every element fades into the empty field.',
    'You filled the field, and the field took you.',
  ],
};

/**
 * The frozen dialogue catalog. Every line is bundled English, one sentence or
 * less, and at most 140 characters (`battle-dialogue.test.ts` enforces both).
 */
export const BATTLE_DIALOGUE: DialogueCatalog = Object.freeze({
  narrator: Object.freeze({
    'battle-start': Object.freeze([...NARRATOR['battle-start']]),
    'field-shift': Object.freeze([...NARRATOR['field-shift']]),
    'first-blood': Object.freeze([...NARRATOR['first-blood']]),
    'big-hit': Object.freeze([...NARRATOR['big-hit']]),
    'low-health-player': Object.freeze([
      ...NARRATOR['low-health-player'],
    ]),
    'low-health-enemy': Object.freeze([...NARRATOR['low-health-enemy']]),
    victory: Object.freeze([...NARRATOR.victory]),
    defeat: Object.freeze([...NARRATOR.defeat]),
  }),
  enemies: Object.freeze({
    'enemy-cinder-warden': Object.freeze({
      'battle-start': Object.freeze([...CINDER_WARDEN['battle-start']]),
      'field-shift': Object.freeze([...CINDER_WARDEN['field-shift']]),
      'low-health-enemy': Object.freeze([
        ...CINDER_WARDEN['low-health-enemy'],
      ]),
      victory: Object.freeze([...CINDER_WARDEN.victory]),
      defeat: Object.freeze([...CINDER_WARDEN.defeat]),
    }),
    'enemy-rime-sentinel': Object.freeze({
      'battle-start': Object.freeze([...RIME_SENTINEL['battle-start']]),
      'field-shift': Object.freeze([...RIME_SENTINEL['field-shift']]),
      'low-health-enemy': Object.freeze([
        ...RIME_SENTINEL['low-health-enemy'],
      ]),
      victory: Object.freeze([...RIME_SENTINEL.victory]),
      defeat: Object.freeze([...RIME_SENTINEL.defeat]),
    }),
    'enemy-storm-herald': Object.freeze({
      'battle-start': Object.freeze([...STORM_HERALD['battle-start']]),
      'field-shift': Object.freeze([...STORM_HERALD['field-shift']]),
      'low-health-enemy': Object.freeze([
        ...STORM_HERALD['low-health-enemy'],
      ]),
      victory: Object.freeze([...STORM_HERALD.victory]),
      defeat: Object.freeze([...STORM_HERALD.defeat]),
    }),
    'enemy-hollow-field': Object.freeze({
      'battle-start': Object.freeze([...HOLLOW_FIELD['battle-start']]),
      'field-shift': Object.freeze([...HOLLOW_FIELD['field-shift']]),
      'low-health-enemy': Object.freeze([
        ...HOLLOW_FIELD['low-health-enemy'],
      ]),
      victory: Object.freeze([...HOLLOW_FIELD.victory]),
      defeat: Object.freeze([...HOLLOW_FIELD.defeat]),
    }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Deterministic picker                                                        */
/* -------------------------------------------------------------------------- */

/** FNV-1a 32-bit offset basis and prime. Local to dialogue selection only. */
const HASH_OFFSET = 0x811c_9dc5;
const HASH_PRIME = 0x0100_0193;

function mix(hash: number, value: number): number {
  return Math.imul(hash ^ (value >>> 0), HASH_PRIME) >>> 0;
}

/**
 * The local 32-bit hash of `(seed, ordinal, trigger)`. It is deliberately not
 * the engine PRNG: it has no state, consumes nothing and cannot affect a
 * shuffle, reward offer or enemy plan.
 */
export function dialogueHash(
  seed: number,
  ordinal: number,
  trigger: DialogueTrigger,
): number {
  let hash = HASH_OFFSET;

  hash = mix(hash, seed);
  hash = mix(hash, ordinal);

  for (let index = 0; index < trigger.length; index += 1) {
    hash = mix(hash, trigger.charCodeAt(index));
  }

  return hash >>> 0;
}

/** True when a trigger has an authored enemy set as well as a narrator set. */
export function isEnemyDialogueTrigger(
  trigger: DialogueTrigger,
): trigger is EnemyDialogueTrigger {
  return (ENEMY_DIALOGUE_TRIGGERS as readonly DialogueTrigger[]).includes(
    trigger,
  );
}

/**
 * The authored set for one speaker and trigger, or `undefined` when that
 * speaker has no set for the trigger. The narrator has all eight triggers.
 */
export function resolveDialogueLines(
  speaker: DialogueSpeaker,
  trigger: DialogueTrigger,
  catalog: DialogueCatalog = BATTLE_DIALOGUE,
): DialogueLineSet | undefined {
  if (speaker === 'narrator') {
    return catalog.narrator[trigger];
  }

  if (!isEnemyDialogueTrigger(trigger)) {
    return undefined;
  }

  return catalog.enemies[speaker]?.[trigger];
}

/**
 * Picks at most one authored line.
 *
 * Pure in exactly `(seed, ordinal, trigger)` for the chosen set: repeated calls
 * return the same string, and the same entry ordinal yields the same line for
 * every render, including after the log is capped. An empty or missing set
 * returns `null`; no fallback line is invented at runtime.
 */
export function selectDialogueLine(
  seed: number,
  ordinal: number,
  trigger: DialogueTrigger,
  speaker: DialogueSpeaker = 'narrator',
  catalog: DialogueCatalog = BATTLE_DIALOGUE,
): string | null {
  const lines = resolveDialogueLines(speaker, trigger, catalog);

  if (lines === undefined || lines.length === 0) {
    return null;
  }

  const index = dialogueHash(seed, ordinal, trigger) % lines.length;
  const line = lines[index];

  return line ?? null;
}
