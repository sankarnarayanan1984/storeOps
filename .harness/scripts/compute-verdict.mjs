#!/usr/bin/env node
/**
 * StoreOps harness — deterministic verdict.
 *
 *   node .harness/scripts/compute-verdict.mjs --sprint 1 --iteration 2
 *
 * Inputs (all in .harness/output/):
 *   automated-checks.json          from run-checks.mjs (A1 A2 A3 B1 B2 C1 C5)
 *   sprint-<N>-llm-checks.json     from the Evaluator: { "results": { "A4": { "status": "PASS"|"FAIL", "evidence": "..." }, ... } }
 * Rubric: .harness/skills/evaluation-criteria/rubric.json
 *
 * Output: sprint-<N>-verdict.json and a Markdown block (stdout) that the
 * Evaluator pastes at the top of evaluator-feedback.md. The verdict is a pure
 * function of the per-check PASS/FAIL results: same results, same verdict.
 * A missing or malformed result counts as FAIL (no evidence, no pass).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.harness/output';
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const sprint = arg('sprint');
const iteration = Number(arg('iteration') ?? 1);
if (!sprint) {
  console.error('Usage: compute-verdict.mjs --sprint <N> --iteration <K>');
  process.exit(2);
}

const rubric = JSON.parse(readFileSync('.harness/skills/evaluation-criteria/rubric.json', 'utf8'));
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);
const automated = readJson(join(OUT, 'automated-checks.json'))?.results ?? {};
const llm = readJson(join(OUT, `sprint-${sprint}-llm-checks.json`))?.results ?? {};

const checks = [];
const dimensions = rubric.dimensions.map((dim) => {
  let passed = 0;
  for (const check of dim.checks) {
    const source = check.type === 'automated' ? automated : llm;
    const raw = source[check.id];
    const status = raw?.status === 'PASS' || raw?.status === 'FAIL' ? raw.status : rubric.verdictRules.missingResult;
    const note = raw ? (raw.summary ?? raw.evidence ?? '') : 'no result recorded -> FAIL';
    if (status === 'PASS') passed += 1;
    checks.push({ id: check.id, dimension: dim.id, type: check.type, hardGate: check.hardGate, title: check.title, status, note });
  }
  const score = Math.round((dim.weight * passed * 10) / dim.checks.length) / 10;
  return { id: dim.id, name: dim.name, weight: dim.weight, passed, total: dim.checks.length, score };
});

const { passScore, conditionalScore, minDimensionRatio } = rubric.verdictRules;
const score = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) * 10) / 10;
const hardGatesFailed = checks.filter((c) => c.hardGate && c.status === 'FAIL').map((c) => c.id);
const weakDimensions = dimensions.filter((d) => d.score < d.weight * minDimensionRatio).map((d) => d.id);

let verdict;
let reason;
if (hardGatesFailed.length) [verdict, reason] = ['FAIL', `hard gate(s) failed: ${hardGatesFailed.join(', ')}`];
else if (weakDimensions.length) [verdict, reason] = ['FAIL', `dimension(s) below ${minDimensionRatio * 100}% of weight: ${weakDimensions.join(', ')}`];
else if (score >= passScore) [verdict, reason] = ['PASS', `score ${score} >= ${passScore}, no hard-gate failures`];
else if (score >= conditionalScore) [verdict, reason] = ['CONDITIONAL PASS', `score ${score} in [${conditionalScore}, ${passScore}), no hard-gate failures`];
else [verdict, reason] = ['FAIL', `score ${score} < ${conditionalScore}`];

const record = { sprint: Number(sprint), iteration, verdict, score, reason, hardGatesFailed, dimensions, checks, computedAt: new Date().toISOString() };
writeFileSync(join(OUT, `sprint-${sprint}-verdict.json`), JSON.stringify(record, null, 2));

const lines = [
  `VERDICT: ${verdict}`,
  `SCORE: ${score}`,
  `HARD_GATES_FAILED: ${hardGatesFailed.length ? hardGatesFailed.join(', ') : 'none'}`,
  `SPRINT: ${sprint}`,
  `ITERATION: ${iteration}`,
  '',
  `Rule applied: ${reason}.`,
  '',
  '| Dimension | Weight | Checks passed | Score |',
  '|---|---|---|---|',
  ...dimensions.map((d) => `| ${d.id} — ${d.name} | ${d.weight} | ${d.passed}/${d.total} | ${d.score} |`),
  `| **Total** | 100 | | **${score}** |`,
  '',
  '| Check | Gate | Type | Result | Note |',
  '|---|---|---|---|---|',
  ...checks.map((c) => `| ${c.id} | ${c.hardGate ? 'HARD' : 'soft'} | ${c.type} | ${c.status} | ${String(c.note).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
];
console.log(lines.join('\n'));
