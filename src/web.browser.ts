/**
 * @fileoverview Browser entry point for the `taglib-wasm/web` subpath.
 *
 * Same surface as `web.ts`; the difference is the graph it bundles. The
 * redirect plugin used by the browser build swaps the unified loader for the
 * Emscripten-only one and stubs the platform filesystem layer, so a browser
 * build of this entry carries no WASI loader and references `taglib-web.wasm`
 * alone (tests/browser-entry-surface.test.ts walks the graph to prove it).
 *
 * @module taglib-wasm/web/browser
 */

export * from "./web-utils/index.ts";
