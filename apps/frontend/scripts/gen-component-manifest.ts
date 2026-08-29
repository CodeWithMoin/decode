/**
 * Generate the AI-facing component contract from the TypeScript source of truth.
 *
 * Reads the Decode visual components (taste.tsx + animation-api.tsx) with the TS
 * compiler API — NOT regex — and emits a deterministic JSON manifest of every
 * exported component's props: name, required/optional, resolved type, and any
 * allowed literal values. This manifest is the single source for:
 *   - the prompt signatures the model sees (prompt.py renders from it),
 *   - generated-scene prop validation (later),
 * so a prop can never again live only in a hand-written docstring and drift.
 *
 * Run:  npx tsx scripts/gen-component-manifest.ts
 * CI:   the same, then `git diff --exit-code` on the manifest (see test).
 */
import * as ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";

const ROOT = path.resolve(__dirname, "..");
const SOURCES = ["src/decode/taste.tsx", "src/decode/animation-api.tsx"];
// Default writes the committed manifest; the drift test overrides it to a temp
// file via MANIFEST_OUT so it can regenerate and diff without clobbering.
const OUT = process.env.MANIFEST_OUT
  ? path.resolve(process.env.MANIFEST_OUT)
  : path.resolve(ROOT, "../backend/decode/agents/renderer/component_manifest.json");

type PropManifest = {
  name: string;
  optional: boolean;
  type: string;
  values?: (string | number)[];
};
type ComponentManifest = { file: string; props: PropManifest[] };

function loadProgram(): ts.Program {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  const rootFiles = SOURCES.map((s) => path.resolve(ROOT, s));
  return ts.createProgram(rootFiles, { ...parsed.options, noEmit: true });
}

// Resolve a (possibly union / aliased) type down to its allowed literal values.
// keyof typeof / union aliases (ConceptColor, PlaceRegion) resolve here even
// though typeToString prints the alias name.
function literalsOf(type: ts.Type, checker: ts.TypeChecker): (string | number)[] | undefined {
  const parts = type.isUnion() ? type.types : [type];
  const out: (string | number)[] = [];
  for (const p of parts) {
    if (p.flags & ts.TypeFlags.Undefined) continue; // optional wrapper
    if (p.isStringLiteral() || p.isNumberLiteral()) out.push(p.value);
    else return undefined; // a non-literal member => not an enum of literals
  }
  return out.length ? out : undefined;
}

// typeToString leaks machine-specific `import("/abs/path/to/node_modules/...").X`
// for re-exported lib types (csstype) — non-deterministic across machines, which
// would break the CI drift check. Reduce to the qualified name. Also drop the
// redundant `| undefined` on optionals (the `optional` flag already says it).
function cleanType(s: string, optional: boolean): string {
  s = s.replace(/import\([^)]*\)\./g, "");
  if (optional) s = s.replace(/\s*\|\s*undefined\b/g, "");
  return s.trim();
}

function propsOf(param: ts.ParameterDeclaration | undefined, checker: ts.TypeChecker): PropManifest[] {
  if (!param) return [];
  const type = checker.getTypeAtLocation(param);
  const props = checker.getPropertiesOfType(type);
  const manifest = props.map((sym): PropManifest & { _pos: number } => {
    const propType = checker.getTypeOfSymbolAtLocation(sym, param);
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    const optional = (sym.flags & ts.SymbolFlags.Optional) !== 0;
    return {
      name: sym.name,
      optional,
      type: cleanType(checker.typeToString(propType, param, ts.TypeFormatFlags.NoTruncation), optional),
      values: literalsOf(propType, checker),
      _pos: decl ? decl.getStart() : 0, // declaration order → stable, readable signatures
    };
  });
  manifest.sort((a, b) => a._pos - b._pos);
  return manifest.map(({ _pos, values, ...rest }) => (values ? { ...rest, values } : rest));
}

function main() {
  const program = loadProgram();
  const checker = program.getTypeChecker();
  const components: Record<string, ComponentManifest> = {};

  for (const rel of SOURCES) {
    const abs = path.resolve(ROOT, rel);
    const sf = program.getSourceFile(abs);
    if (!sf) throw new Error(`source not in program: ${rel}`);
    for (const stmt of sf.statements) {
      if (!ts.isFunctionDeclaration(stmt) || !stmt.name) continue;
      const exported = ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export;
      const name = stmt.name.text;
      if (!exported || !/^[A-Z]/.test(name)) continue; // components are Capitalized exports
      components[name] = { file: rel, props: propsOf(stmt.parameters[0], checker) };
    }
  }

  const sorted = Object.fromEntries(Object.keys(components).sort().map((k) => [k, components[k]]));
  const manifest = {
    $generated: "DO NOT EDIT — run `npx tsx scripts/gen-component-manifest.ts`",
    generatedFrom: SOURCES,
    components: sorted,
  };
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${Object.keys(sorted).length} components -> ${path.relative(ROOT, OUT)}`);
}

main();
