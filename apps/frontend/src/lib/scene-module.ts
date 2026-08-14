"use client";

import type { ComponentType } from "react";

/**
 * Load a generated scene module in the browser.
 *
 * The Visualizer writes each scene as React source against
 * `@decode/animation-api` and stores it as text. Something has to turn that
 * text into a component, and this is the only place in the app that does.
 *
 * How it works, and why each part is the way it is:
 *
 *   TypeScript, imported on demand. The compiler is already a dependency, so
 *   this adds none, and `await import("typescript")` keeps ~7MB out of every
 *   bundle but the one that opens a scene. Sucrase does the same job in 200KB
 *   and is the swap to make if the first load is ever slow enough to notice —
 *   not before.
 *
 *   A blob URL and a native `import()`, not `eval` or `new Function`. Real
 *   module semantics, a real module scope, and the import map is an explicit
 *   rewrite rather than a global we hope nothing reaches.
 *
 *   Same origin, for now. The department's static gate already refuses any
 *   import outside `@decode/animation-api` and anything touching eval, fetch,
 *   timers or the network, so a module that gets this far has been checked.
 *   The stronger version is a cross-origin sandboxed iframe, which needs React
 *   and Remotion inside it — worth building before anything renders untrusted
 *   code on a server, and overkill for a preview the creator just generated.
 */

/**
 * Bare specifiers a compiled scene may name, and how to reach the real module.
 *
 * A blob module cannot resolve a bare specifier — there is no import map for
 * blob: URLs — so every one has to be rewritten to a URL. `react/jsx-runtime`
 * is here because it is not the scene's import at all: it is what the compiler
 * emits for JSX, and the first thing that breaks if this map only knows about
 * the specifiers a human would think to write.
 */
const SHIMS: Record<string, () => Promise<Record<string, unknown>>> = {
  "@decode/animation-api": () => import("@decode/animation-api"),
  "react/jsx-runtime": () => import("react/jsx-runtime"),
};

/** Where a shim's real exports live while its blob reads them back out. */
const REGISTRY = "__decodeSceneShims";

const shimUrls = new Map<string, string>();
const cache = new Map<string, Promise<SceneComponent>>();
const urls = new Set<string>();

export type SceneComponent = ComponentType<Record<string, unknown>>;

export class SceneModuleError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "SceneModuleError";
  }
}

/**
 * Publish one shim as a blob module that re-exports the real thing.
 *
 * Built once per specifier and reused, so every scene shares one module
 * instance the way they would share a real package.
 */
async function shimUrl(specifier: string): Promise<string> {
  const existing = shimUrls.get(specifier);
  if (existing) return existing;

  const real = await SHIMS[specifier]();
  const registry = ((globalThis as Record<string, unknown>)[REGISTRY] ??= {}) as Record<
    string,
    unknown
  >;
  registry[specifier] = real;

  // Named re-exports rather than a default, because that is how the compiled
  // scene imports them. Types are erased by then, so every key left here is a
  // real runtime value.
  const names = Object.keys(real).filter((key) => key !== "default");
  const source = [
    `const real = globalThis.${REGISTRY}[${JSON.stringify(specifier)}];`,
    ...names.map((name) => `export const ${name} = real[${JSON.stringify(name)}];`),
    `export default real.default ?? real;`,
  ].join("\n");

  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  shimUrls.set(specifier, url);
  urls.add(url);
  return url;
}

async function transpile(source: string): Promise<string> {
  const ts = await import("typescript");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  const fatal = (result.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (fatal.length > 0) {
    throw new SceneModuleError(
      "This scene could not be compiled.",
      ts.flattenDiagnosticMessageText(fatal[0].messageText, " "),
    );
  }
  return result.outputText;
}

/**
 * Point every bare specifier in compiled output at its shim blob.
 *
 * Anything not in the map is left alone and will fail at import with the
 * browser's own message, which names the specifier — a better error than one
 * invented here, and the department's gate should have refused it upstream.
 */
async function rewriteImports(compiled: string): Promise<string> {
  let output = compiled;
  for (const specifier of Object.keys(SHIMS)) {
    if (!output.includes(specifier)) continue;
    const url = await shimUrl(specifier);
    output = output
      .replaceAll(`"${specifier}"`, `"${url}"`)
      .replaceAll(`'${specifier}'`, `'${url}'`);
  }
  return output;
}

/**
 * Compile and load one scene's source, returning its default export.
 *
 * Keyed on the source text, so the same scene loads once however many times it
 * is rendered, and an edited scene is a different key rather than a stale hit.
 */
export function loadSceneModule(source: string): Promise<SceneComponent> {
  const cached = cache.get(source);
  if (cached) return cached;

  const loading = (async () => {
    const wired = await rewriteImports(await transpile(source));
    const url = URL.createObjectURL(new Blob([wired], { type: "text/javascript" }));
    urls.add(url);
    const loaded = (await import(/* webpackIgnore: true */ /* @vite-ignore */ url)) as {
      default?: SceneComponent;
    };
    if (typeof loaded.default !== "function") {
      throw new SceneModuleError("This scene has no default export.");
    }
    return loaded.default;
  })();

  cache.set(source, loading);
  // A failed load must not be cached, or a fixed scene keeps reporting the old
  // error until the tab is reloaded.
  loading.catch(() => cache.delete(source));
  return loading;
}

/** Release every blob this module made. For teardown in tests and unmount. */
export function releaseSceneModules() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
  shimUrls.clear();
  cache.clear();
}
