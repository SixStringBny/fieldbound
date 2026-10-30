#!/usr/bin/env node
/**
 * Fieldbound UI review-record validator (acceptance bar section 13.2, AB-E1,
 * AB-E3).
 *
 * One record per route lives at `docs/reviews/ui-overhaul/<route>.json` and is
 * validated against `docs/reviews/ui-overhaul/route-review.schema.json`. The
 * record carries both columns of the bar: the mechanical `AB-*` results owned by
 * `qa-automation-engineer`, and the human `H-*` results that only the project
 * owner signs.
 *
 * Enforced here, on top of the schema:
 *
 *   1. Every key the schema requires is present and no others.
 *   2. The record lists the five mechanical viewports, and the human column
 *      covers 390x844, 768x1024 and 1280x800.
 *   3. `mechanical.summary` matches the check statuses, and `passed + failed`
 *      equals the number of mechanical checks.
 *   4. `decision` is `rejected` when any mechanical or human check failed, and
 *      every failed check appears in `issues` with its measured and expected
 *      values.
 *   5. `reviewer` and `human.owner` are a person, never an agent name.
 *
 * AB-E3 is checked too: there is no pixel-diff baseline anywhere in the
 * repository, because artifacts are evidence and never a pass/fail gate.
 *
 * Usage: `node scripts/check-ui-review.mjs` (or `npm run check:ui-review`).
 * Zero route records is a pass: the records land with the screens, starting at
 * ticket 2.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const recordsDir = path.join(repoRoot, 'docs/reviews/ui-overhaul');
const schemaPath = path.join(recordsDir, 'route-review.schema.json');

const MECHANICAL_VIEWPORTS = ['375x667', '390x844', '768x1024', '1024x768', '1280x800'];
const HUMAN_VIEWPORTS = ['390x844', '768x1024', '1280x800'];
const AGENT_NAMES = ['opencode', 'copilot', 'agent', 'claude', 'gpt'];

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`ok   ${message}`);
}

function note(message) {
  console.log(`note ${message}`);
}

/* -------------------------------------------------------------------------- */
/* A small JSON-Schema draft subset: enough for this schema, no dependency    */
/* -------------------------------------------------------------------------- */

function resolveRef(root, reference) {
  const pointer = reference.replace(/^#\//, '').split('/');

  return pointer.reduce((node, key) => {
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`schema $ref cannot resolve: ${reference}`);
    }

    return node[key];
  }, root);
}

function typeOf(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (Number.isInteger(value)) {
    return 'integer';
  }

  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);

  if (type === 'number') {
    return actual === 'number' || actual === 'integer';
  }

  return actual === type;
}

function validate(root, schema, value, where) {
  const problems = [];

  if (schema === null || typeof schema !== 'object') {
    return problems;
  }

  if (typeof schema.$ref === 'string') {
    return validate(root, resolveRef(root, schema.$ref), value, where);
  }

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    problems.push(`${where}: expected ${String(schema.type)}, received ${typeOf(value)}`);

    return problems;
  }

  if (schema.const !== undefined && value !== schema.const) {
    problems.push(`${where}: expected exactly ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    problems.push(`${where}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push(`${where}: shorter than ${String(schema.minLength)} characters`);
    }

    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      problems.push(`${where}: does not match ${schema.pattern}`);
    }

    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      problems.push(`${where}: not an ISO 8601 date-time`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    problems.push(`${where}: below the minimum of ${String(schema.minimum)}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push(`${where}: needs at least ${String(schema.minItems)} item(s)`);
    }

    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));

      if (seen.size !== value.length) {
        problems.push(`${where}: items must be unique`);
      }
    }

    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        problems.push(...validate(root, schema.items, item, `${where}[${String(index)}]`));
      });
    }

    if (schema.contains !== undefined && !value.some((item) => validate(root, schema.contains, item, where).length === 0)) {
      problems.push(`${where}: no item matches the required const`);
    }

    for (const branch of schema.allOf ?? []) {
      problems.push(...validate(root, branch, value, where));
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        problems.push(`${where}: missing required key "${key}"`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) {
          problems.push(`${where}: unexpected key "${key}"`);
        }
      }
    }

    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        problems.push(...validate(root, child, value[key], `${where}.${key}`));
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* The five record rules                                                      */
/* -------------------------------------------------------------------------- */

function isAgentName(value) {
  const normalised = String(value).trim().toLowerCase();

  if (AGENT_NAMES.includes(normalised)) {
    return true;
  }

  return /-engineer$/.test(normalised) || /^agent\b/.test(normalised);
}

function checkRecord(record, file) {
  const problems = [];
  const mechanicalChecks = record.mechanical?.checks ?? [];
  const humanChecks = record.human?.checks ?? [];

  for (const viewport of MECHANICAL_VIEWPORTS) {
    if (!(record.viewports ?? []).includes(viewport)) {
      problems.push(`viewports: missing mechanical target ${viewport}`);
    }
  }

  for (const viewport of HUMAN_VIEWPORTS) {
    if (!(record.human?.viewports ?? []).includes(viewport)) {
      problems.push(`human.viewports: missing signed target ${viewport}`);
    }
  }

  const passed = mechanicalChecks.filter((check) => check.status === 'pass').length;
  const failed = mechanicalChecks.filter((check) => check.status === 'fail').length;
  const summary = record.mechanical?.summary ?? {};

  if (summary.passed !== passed || summary.failed !== failed) {
    problems.push(
      `mechanical.summary: reports ${String(summary.passed)} passed / ${String(summary.failed)} failed, checks say ${String(passed)} / ${String(failed)}`,
    );
  }

  if (passed + failed !== mechanicalChecks.length) {
    problems.push('mechanical.summary: passed + failed does not equal the number of checks');
  }

  const failing = [...mechanicalChecks, ...humanChecks].filter((check) => check.status === 'fail');
  const issueChecks = new Set((record.issues ?? []).map((issue) => issue.check));

  if (failing.length > 0 && record.decision !== 'rejected') {
    problems.push(`decision: must be "rejected" while ${String(failing.length)} check(s) fail`);
  }

  if (record.human?.decision === 'approved' && failed > 0) {
    problems.push('human.decision: cannot be "approved" with a failed mechanical check');
  }

  for (const check of failing) {
    if (!issueChecks.has(check.id)) {
      problems.push(`issues: failed check ${check.id} is not recorded with its measurement`);
    }
  }

  if (isAgentName(record.reviewer)) {
    problems.push(`reviewer: "${String(record.reviewer)}" is an agent name; a person signs the record`);
  }

  if (isAgentName(record.human?.owner)) {
    problems.push(`human.owner: "${String(record.human?.owner)}" is an agent name; a person signs the human column`);
  }

  if (problems.length === 0) {
    pass(`${file}: ${record.route} record is valid (${String(passed)} mechanical, ${String(humanChecks.length)} human)`);
    return;
  }

  for (const problem of problems) {
    fail(`${file}: ${problem}`);
  }
}

/* -------------------------------------------------------------------------- */
/* AB-E3: no pixel-diff baseline                                             */
/* -------------------------------------------------------------------------- */

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const BASELINE_DIRECTORIES = new Set(['__snapshots__', '__image_snapshots__', 'screenshots', 'visual-baselines']);

function walk(directory, visit) {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (BASELINE_DIRECTORIES.has(entry.name)) {
        visit(entryPath, entry.name);
      } else {
        walk(entryPath, visit);
      }
      continue;
    }

    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      visit(entryPath, entry.name);
    }
  }
}

function auditNoPixelBaseline() {
  const offenders = [];

  walk(path.join(repoRoot, 'tests'), (entryPath, name) => {
    offenders.push(entryPath);
  });

  walk(recordsDir, (entryPath, name) => {
    if (IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      offenders.push(entryPath);
    }
  });

  if (offenders.length > 0) {
    for (const offender of offenders) {
      fail(`AB-E3 ${path.relative(repoRoot, offender).replaceAll(path.sep, '/')} is a pixel baseline; artifacts are evidence only`);
    }

    return;
  }

  pass('AB-E3 no pixel-diff baseline in tests/ or docs/reviews/ui-overhaul/');
}

/* -------------------------------------------------------------------------- */

function main() {
  console.log('Fieldbound UI review records (acceptance bar section 13.2)');

  let schema;

  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    fail(
      `cannot read route-review.schema.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  let files;

  try {
    files = readdirSync(recordsDir)
      .filter((file) => file.endsWith('.json') && file !== 'route-review.schema.json')
      .sort();
  } catch {
    fail('docs/reviews/ui-overhaul/ is missing');
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    note('no route records yet; records land with the screens from ticket 2 onward');
  }

  const routes = new Set();

  for (const file of files) {
    let record;

    try {
      record = JSON.parse(readFileSync(path.join(recordsDir, file), 'utf8'));
    } catch (error) {
      fail(`${file}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const problems = validate(schema, schema, record, file);

    if (problems.length > 0) {
      for (const problem of problems) {
        fail(problem);
      }
      continue;
    }

    if (routes.has(record.route)) {
      fail(`${file}: a second record for route ${record.route}`);
    }

    routes.add(record.route);
    checkRecord(record, file);
  }

  auditNoPixelBaseline();

  if (failures.length > 0) {
    console.error(`\n${String(failures.length)} review-record finding(s)`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nReview records passed (${String(files.length)} record${files.length === 1 ? '' : 's'}).`,
  );
}

main();
