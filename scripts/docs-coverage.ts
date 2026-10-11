#!/usr/bin/env -S pnpm exec tsx
/**
 * docs-coverage.ts — flags public exports not referenced anywhere in the docs.
 *
 * A mechanical first-pass signal for the `/tlw-preflight-docs` skill (taglib-5w2):
 * it enumerates every public export from the entry points and checks whether each
 * NAME appears (word-boundary) in README.md / AGENTS.md / docs/. A hit means the
 * name is mentioned somewhere — it does NOT verify the doc is accurate or that the
 * signature still matches. That accuracy judgment is the skill's job; this script
 * only catches the "shipped an export, never mentioned it" class of drift.
 *
 * Usage:   pnpm run docs:coverage [-- --list-exports]
 * Exit:    0 if every export is documented or allowlisted; 1 otherwise.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import ts from "typescript";

const ENTRY_POINTS = [
  "src/index.ts",
  "src/simple.ts",
  "src/folder.ts",
  "src/disc-folder.ts",
  "src/web.ts",
  "src/rating.ts",
];

const DOC_ROOTS = ["README.md", "AGENTS.md", "docs"];
const SKIP_DIRS = new Set(["node_modules", ".vitepress", "dist", "cache"]);

/**
 * Public exports intentionally absent from the user-facing docs (internal-ish
 * surface like factory functions used only by the runtime loaders). Keep this
 * short and justified — prefer documenting an export over allowlisting it.
 */
const ALLOWLIST = new Set<string>([
  "AudioFileImpl", // impl class behind the public AudioFile interface
  "PICTURE_TYPE_NAMES", // internal id<->name lookup tables
  "PICTURE_TYPE_VALUES",
  "BITRATE_CONTROL_MODE_NAMES",
  "BITRATE_CONTROL_MODE_VALUES",
  "FormatMappings", // internal format/codec mapping table
  // Advanced/internal generic plumbing rarely referenced by name in user docs:
  "ComplexPropertyKey", // keyof helper for the complex-property generic map
  "ComplexPropertyKeyMap", // mapped type backing COMPLEX_PROPERTY_KEY
  "ComplexPropertyValueMap", // module-augmentation point for getComplexProperty
  "FormatPropertyKey", // type-level per-format key narrowing
  "PropertyValue", // conditional type resolving a key's value type
  "TagFormat", // internal tag-system discriminator
  "VariantMap", // Record<string, unknown> escape hatch
  "isNamedAudioInput", // internal NamedAudioInput type guard
]);

/** Group an export declaration kind into a report category. */
function category(kind: string): string {
  if (kind === "function") return "Functions";
  if (kind === "class") return "Classes";
  if (kind === "interface" || kind === "type") return "Types";
  if (kind === "const") return "Constants";
  return "Other";
}

/** Map of public export name -> report category, across all entry points. */
function publicExports(): Map<string, string> {
  const program = ts.createProgram({
    rootNames: ENTRY_POINTS.map((p) => ts.sys.resolvePath(p)),
    options: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  const exports = new Map<string, string>();
  for (const entry of ENTRY_POINTS) {
    const sf = program.getSourceFile(ts.sys.resolvePath(entry));
    if (!sf) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) continue;
    for (const sym of checker.getExportsOfModule(moduleSymbol)) {
      const name = sym.getName();
      if (exports.has(name)) continue;
      exports.set(name, category(tsSymbolKind(sym, checker)));
    }
  }
  return exports;
}

/** Classify an exported symbol into the same kind keywords deno doc used. */
function tsSymbolKind(sym: ts.Symbol, checker: ts.TypeChecker): string {
  const decl =
    sym.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(sym).getDeclarations()?.[0]
      : sym.getDeclarations()?.[0];
  if (!decl) return "unknown";
  if (ts.isFunctionDeclaration(decl)) return "function";
  if (ts.isClassDeclaration(decl)) return "class";
  if (ts.isInterfaceDeclaration(decl)) return "interface";
  if (ts.isTypeAliasDeclaration(decl)) return "type";
  if (ts.isEnumDeclaration(decl)) return "enum";
  if (ts.isModuleDeclaration(decl)) return "namespace";
  if (ts.isVariableDeclaration(decl)) return "const";
  return "unknown";
}

async function collectDocText(path: string, sink: string[]): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return;
  }
  if (info.isFile() && path.endsWith(".md")) {
    sink.push(await readFile(path, "utf8"));
  } else if (info.isDirectory()) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      await collectDocText(`${path}/${entry.name}`, sink);
    }
  }
}

/**
 * Names imported from the taglib-wasm package in doc code blocks (the
 * REVERSE check, taglib-gmq5): the forward pass only verifies "every public
 * export is mentioned somewhere" — it cannot see a doc claiming an export
 * that does not exist (the Tags object documented as public for a year while
 * unexported). Parsing import statements catches that class: a name that
 * resolves against nothing in the exports map is a doc lie.
 */
function docImportedNames(docs: string[]): Set<string> {
  const names = new Set<string>();
  // Accept every documented specifier form for this package: the bare npm
  // name, its subpaths, Deno's `npm:`/`jsr:` prefixes (the documented install
  // form since the JSR channel returned), scoped names
  // (`@charlesw/taglib-wasm` on JSR, `@charleswiltgen/taglib-wasm` on GitHub
  // Packages), and versioned specifiers (`jsr:@charlesw/taglib-wasm@1.2.3`).
  // The bare pattern used to miss all prefixed forms, so a doc importing a
  // nonexistent name through one passed the reverse check silently
  // (taglib-ccd8).
  const importRe =
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](?:npm:|jsr:)?(?:@[\w.-]+\/)?taglib-wasm(?:@[^/"']+)?(?:\/[^"']*)?["']/g;
  for (const text of docs) {
    for (const m of text.matchAll(importRe)) {
      for (const part of m[1].split(",")) {
        const cleaned = part.trim().replace(/^type\s+/, "");
        const name = cleaned.split(/\s+as\s+/)[0].trim();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CATEGORY_ORDER = ["Functions", "Classes", "Types", "Constants", "Other"];

async function main(): Promise<void> {
  const exports = await publicExports();
  const docs: string[] = [];
  for (const root of DOC_ROOTS) await collectDocText(root, docs);
  const haystack = docs.join("\n");

  const undocumented = new Map<string, string[]>(); // category -> names
  for (const [name, cat] of [...exports].sort()) {
    if (ALLOWLIST.has(name)) continue;
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(haystack)) continue;
    (undocumented.get(cat) ?? undocumented.set(cat, []).get(cat)!).push(name);
  }

  const missing = [...undocumented.values()].reduce((n, a) => n + a.length, 0);
  const documented = exports.size - missing - ALLOWLIST.size;
  console.log(
    `📄 Docs coverage: ${documented}/${exports.size} public exports referenced ` +
      `(${ALLOWLIST.size} allowlisted, ${missing} undocumented)`,
  );

  if (missing > 0) {
    for (const cat of CATEGORY_ORDER) {
      const names = undocumented.get(cat);
      if (!names?.length) continue;
      console.log(`\n❌ ${cat} not referenced in docs (${names.length}):`);
      for (const name of names) console.log(`   - ${name}`);
    }
    console.log(
      "\nDocument each in README.md / AGENTS.md / docs, or add to ALLOWLIST " +
        "(with justification) in scripts/docs-coverage.ts.",
    );
    process.exit(1);
  }
  console.log("✅ Every public export is referenced in the docs.");

  // Reverse check (taglib-gmq5): every name the docs import from the package
  // must resolve against the actual exports map.
  const imported = docImportedNames(docs);
  const stale = [...imported].filter((n) => !exports.has(n)).sort();
  if (stale.length > 0) {
    console.log(
      `\n❌ ${stale.length} doc-imported name(s) do not exist in the public exports ` +
        "(documented-but-unshipped):",
    );
    for (const name of stale) console.log(`   - ${name}`);
    console.log(
      "\nFix the docs to import a real export, or export the name if it should be public.",
    );
    process.exit(1);
  }
  console.log(
    "✅ Every doc-imported name resolves against the public exports.",
  );
  // State the blind spot on the success path. This is a name-mention check:
  // it cannot tell whether the surrounding prose is true. Two real cases it
  // passed while wrong (both fixed in c041af0d): property-map.md described a
  // shipped feature as "In Progress", and complex-properties.ts JSDoc told
  // users to call file.getComplexProperty(), a method that does not exist.
  // Without this line, "Docs coverage ✅" reads as "docs verified".
  console.log(
    "ℹ️  Reference check only: verifies each export is mentioned somewhere, " +
      "NOT that the surrounding documentation is accurate or current.",
  );
}

if (process.argv.includes("--list-exports")) {
  console.log([...publicExports().keys()].sort().join("\n"));
} else {
  await main();
}
