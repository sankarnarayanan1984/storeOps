#!/usr/bin/env node
/**
 * StoreOps harness — automated checks (deterministic half of the Evaluator).
 *
 *   node .harness/scripts/run-checks.mjs --snapshot   record hashes of protected files (orchestrator, on APPROVED)
 *   node .harness/scripts/run-checks.mjs              run every automated rubric check
 *
 * Writes .harness/output/automated-checks.json. Each check is PASS or FAIL with
 * file:line findings. The same working tree always produces the same result.
 * Exit code: 0 when every automated check passed, 1 otherwise.
 */
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = '.harness/output';
const RUBRIC = JSON.parse(readFileSync('.harness/skills/evaluation-criteria/rubric.json', 'utf8'));
const SNAPSHOT = join(OUT, 'protected-snapshot.json');
const MAX_FINDINGS = 25;

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false });
  return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}

const rel = (file) => relative(ROOT, file).split('\\').join('/');
const result = (status, summary, findings = []) => ({ status, summary, findings: findings.slice(0, MAX_FINDINGS), totalFindings: findings.length });

function hashProtected() {
  const hashes = {};
  for (const entry of RUBRIC.protectedPaths) {
    for (const file of walk(entry.replace(/\/$/, ''))) {
      hashes[rel(file)] = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
  }
  return hashes;
}

// --- snapshot mode ---------------------------------------------------------
if (process.argv.includes('--snapshot')) {
  const files = hashProtected();
  writeFileSync(SNAPSHOT, JSON.stringify({ takenAt: new Date().toISOString(), files }, null, 2));
  console.log(`Protected-file snapshot written: ${Object.keys(files).length} files -> ${SNAPSHOT}`);
  process.exit(0);
}

// --- A3: TypeScript --------------------------------------------------------
function checkTsc() {
  const { code, stdout } = run('npx', ['tsc', '--noEmit', '--pretty', 'false']);
  const findings = [...stdout.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)].map((m) => ({
    file: m[1], line: Number(m[2]), message: `${m[3]} ${m[4]}`,
  }));
  return code === 0 ? result('PASS', '0 type errors') : result('FAIL', `${findings.length || 'unknown'} type error(s)`, findings);
}

// --- A2: ESLint ------------------------------------------------------------
function checkEslint() {
  const { stdout } = run('npx', ['eslint', '.', '-f', 'json']);
  let files;
  try {
    files = JSON.parse(stdout);
  } catch {
    return result('FAIL', 'eslint did not produce JSON output (tool failure)');
  }
  const findings = files.flatMap((f) =>
    f.messages.filter((m) => m.severity === 2).map((m) => ({ file: rel(f.filePath), line: m.line ?? 0, message: `${m.ruleId ?? 'parse'}: ${m.message}` })),
  );
  return findings.length === 0 ? result('PASS', '0 lint errors') : result('FAIL', `${findings.length} lint error(s)`, findings);
}

// --- A1: dependency-cruiser ------------------------------------------------
function checkDepcruise() {
  const { stdout } = run('npx', ['depcruise', 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json']);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return result('FAIL', 'dependency-cruiser did not produce JSON output (tool failure)');
  }
  const findings = report.summary.violations
    .filter((v) => v.rule.severity === 'error')
    .map((v) => ({ file: v.from, line: 0, message: `${v.rule.name}: imports ${v.to}` }));
  return findings.length === 0
    ? result('PASS', `0 violations (${report.summary.totalCruised} modules cruised)`)
    : result('FAIL', `${findings.length} boundary violation(s)`, findings);
}

// --- B1 + B2: Jest and coverage --------------------------------------------
function checkJest() {
  const jsonFile = join(OUT, 'jest-results.json');
  const { code, stderr, stdout } = run('npx', [
    'jest', '--coverage', '--json', `--outputFile=${jsonFile}`, '--coverageReporters=json-summary',
  ]);
  if (!existsSync(jsonFile)) {
    const failed = result('FAIL', 'jest produced no results (tool failure)', [{ file: '', line: 0, message: stderr.slice(0, 500) }]);
    return { tests: failed, coverage: failed };
  }
  const report = JSON.parse(readFileSync(jsonFile, 'utf8'));
  const testFindings = report.testResults.flatMap((suite) =>
    suite.assertionResults
      .filter((a) => a.status === 'failed')
      .map((a) => ({ file: rel(suite.name), line: a.location?.line ?? 0, message: `${a.fullName}: ${(a.failureMessages[0] ?? '').split('\n')[0]}` })),
  );
  const tests = report.numFailedTests === 0 && report.numFailedTestSuites === 0 && report.numTotalTests > 0
    ? result('PASS', `${report.numPassedTests}/${report.numTotalTests} tests passed`)
    : result('FAIL', `${report.numFailedTests} failing test(s), ${report.numFailedTestSuites} failing suite(s)`, testFindings);

  const thresholdLines = `${stdout}\n${stderr}`.split('\n').filter((l) => /coverage threshold .* not met/i.test(l));
  const thresholdFindings = thresholdLines.map((l) => {
    const file = /for (?:lines|statements|branches|functions)?.*?:?\s*(\S+\.ts)/.exec(l)?.[1] ?? 'coverage';
    return { file: file.replace(`${ROOT}/`, ''), line: 0, message: l.trim().replace(/^Jest:\s*/, '') };
  });
  let total = 'n/a';
  const summaryFile = 'coverage/coverage-summary.json';
  if (existsSync(summaryFile)) total = `${JSON.parse(readFileSync(summaryFile, 'utf8')).total.lines.pct}% lines overall`;
  // Jest exits non-zero on unmet thresholds even when every test passes.
  const coverageFailed = thresholdFindings.length > 0 || (code !== 0 && tests.status === 'PASS');
  const coverage = coverageFailed
    ? result('FAIL', `coverage thresholds not met (${total})`, thresholdFindings.length ? thresholdFindings : [{ file: 'coverage', line: 0, message: 'jest exited non-zero with all tests passing' }])
    : result('PASS', `thresholds met (${total})`);
  return { tests, coverage };
}

// --- C1: protected files ---------------------------------------------------
function checkProtected() {
  if (!existsSync(SNAPSHOT)) {
    return result('FAIL', 'no protected-file snapshot: the orchestrator must run `run-checks.mjs --snapshot` when the spec is APPROVED');
  }
  const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8')).files;
  const now = hashProtected();
  const findings = [];
  for (const [file, hash] of Object.entries(before)) {
    if (!(file in now)) findings.push({ file, line: 0, message: 'protected file deleted' });
    else if (now[file] !== hash) findings.push({ file, line: 0, message: 'protected file modified' });
  }
  for (const file of Object.keys(now)) if (!(file in before)) findings.push({ file, line: 0, message: 'file added under a protected path' });
  return findings.length === 0 ? result('PASS', `${Object.keys(before).length} protected files unchanged`) : result('FAIL', `${findings.length} protected file change(s)`, findings);
}

// --- C5: hygiene -----------------------------------------------------------
function checkHygiene() {
  const findings = [];
  const scan = (files, pattern, message) => {
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        if (pattern.test(text)) findings.push({ file: rel(file), line: i + 1, message });
      });
    }
  };
  scan(walk('src').filter((f) => f.endsWith('.ts') && rel(f) !== 'src/server.ts'), /\bconsole\.log\(/, 'console.log in source');
  scan(walk('tests').filter((f) => f.endsWith('.ts')), /\b(it|test|describe)\.(only|skip)\(/, 'focused/skipped test');
  return findings.length === 0 ? result('PASS', 'no console.log in src, no .only/.skip in tests') : result('FAIL', `${findings.length} hygiene finding(s)`, findings);
}

// --- changed files (input for C3, not a check) -----------------------------
function changedFiles() {
  let base = 'HEAD';
  const statePath = join(OUT, 'run-state.json');
  if (existsSync(statePath)) base = JSON.parse(readFileSync(statePath, 'utf8')).baseRef ?? base;
  try {
    const diff = execSync(`git diff --name-only ${base}`, { encoding: 'utf8' }).split('\n');
    const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split('\n');
    // Harness, deployment and submission documents are never sprint output, committed or not.
    const NOT_SPRINT_OUTPUT = [...RUBRIC.protectedPaths, '.harness/', 'infra/', 'docs/', 'prompts/',
      'PROMPT.md', 'DESIGN_BRIEF.md', 'DEPLOYMENT.md', 'REFLECTION.md', 'JOURNAL.md',
      'Dockerfile', 'docker-compose.yml', '.dockerignore'];
    const files = [...new Set([...diff, ...untracked])].filter(
      (f) => f && !NOT_SPRINT_OUTPUT.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)),
    );
    return { base, files: files.sort() };
  } catch {
    return { base, files: [], note: 'git unavailable; changed-file list empty' };
  }
}

// --- main ------------------------------------------------------------------
const started = Date.now();
const jest = checkJest();
const results = {
  A1: checkDepcruise(),
  A2: checkEslint(),
  A3: checkTsc(),
  B1: jest.tests,
  B2: jest.coverage,
  C1: checkProtected(),
  C5: checkHygiene(),
};
const output = {
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  results,
  changed: changedFiles(),
};
writeFileSync(join(OUT, 'automated-checks.json'), JSON.stringify(output, null, 2));

for (const [id, r] of Object.entries(results)) {
  console.log(`${r.status === 'PASS' ? 'PASS' : 'FAIL'}  ${id}  ${r.summary}`);
  for (const f of r.findings.slice(0, 5)) console.log(`        ${f.file}${f.line ? `:${f.line}` : ''}  ${f.message}`);
}
console.log(`\nWritten: ${join(OUT, 'automated-checks.json')}`);
process.exit(Object.values(results).every((r) => r.status === 'PASS') ? 0 : 1);
