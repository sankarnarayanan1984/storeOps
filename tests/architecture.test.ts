import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Enforces module boundary rules at test time (ESLint enforces them at lint time):
 *  - no circular imports anywhere in src
 *  - modules import other modules only via the type-only staff reader
 *  - src/shared never imports a module
 *  - no raw `throw new Error` outside the error hierarchy
 */
const SRC = resolve(__dirname, '..', 'src');
const MODULES = join(SRC, 'modules');
const ALLOWED_CROSS_MODULE = join(MODULES, 'staff', 'staff.reader.ts');

interface ImportRef {
  target: string;
  typeOnly: boolean;
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function importsOf(file: string): ImportRef[] {
  const source = readFileSync(file, 'utf8');
  const pattern = /^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm;
  const refs: ImportRef[] = [];
  for (const match of source.matchAll(pattern)) {
    const target = resolveImport(file, match[3]!);
    if (target) refs.push({ target, typeOnly: Boolean(match[2]) });
  }
  return refs;
}

const moduleOf = (file: string): string | undefined =>
  file.startsWith(MODULES + sep) ? relative(MODULES, file).split(sep)[0] : undefined;

const files = listTsFiles(SRC);
const graph = new Map(files.map((f) => [f, importsOf(f)]));

describe('architecture', () => {
  it('has no circular imports', () => {
    const cycles: string[] = [];
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (file: string, path: string[]): void => {
      if (state.get(file) === 'done') return;
      if (state.get(file) === 'visiting') {
        cycles.push([...path.slice(path.indexOf(file)), file].map((f) => relative(SRC, f)).join(' -> '));
        return;
      }
      state.set(file, 'visiting');
      for (const ref of graph.get(file) ?? []) visit(ref.target, [...path, file]);
      state.set(file, 'done');
    };
    files.forEach((f) => visit(f, []));
    expect(cycles).toEqual([]);
  });

  it('only crosses module boundaries via the type-only staff reader', () => {
    const violations = files.flatMap((file) =>
      (graph.get(file) ?? [])
        .filter((ref) => {
          const owner = moduleOf(file);
          const target = moduleOf(ref.target);
          if (!owner || !target || owner === target) return false;
          return ref.target !== ALLOWED_CROSS_MODULE || !ref.typeOnly;
        })
        .map((ref) => `${relative(SRC, file)} -> ${relative(SRC, ref.target)}`),
    );
    expect(violations).toEqual([]);
  });

  it('keeps src/shared independent of modules', () => {
    const violations = files
      .filter((f) => f.startsWith(join(SRC, 'shared') + sep))
      .flatMap((f) => (graph.get(f) ?? []).filter((ref) => moduleOf(ref.target)).map((ref) => relative(SRC, ref.target)));
    expect(violations).toEqual([]);
  });

  it('never throws raw Error instances', () => {
    const offenders = files.filter((f) => /throw\s+(new\s+)?Error\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('gives every module a routes, service and repository layer', () => {
    for (const name of ['activities', 'programmes', 'staff', 'alerts', 'reports']) {
      for (const layer of ['routes', 'service', 'repository']) {
        expect(statSync(join(MODULES, name, `${name}.${layer}.ts`)).isFile()).toBe(true);
      }
    }
  });
});
