# Using TagLib-Wasm with Deno Compile

This comprehensive guide explains how to use TagLib-Wasm in compiled Deno
binaries, with multiple approaches for different use cases.

## Overview

`TagLib.initialize()` **auto-detects Deno compile mode**. A compiled binary
reports `Deno.mainModule` as a `deno-compile://` URL through Deno 2.8 and as a
`file://` URL under a `deno-compile-<name>` temporary directory on Deno 2.9+;
detection accepts both, so it fires on every supported Deno release. When it
fires, initialization switches to Emscripten buffer mode and attempts to load
the embedded Wasm; when the embedded file is absent it falls back to the Wasm
shipped inside the package. `initializeForDenoCompile()` shares the same
detection.

For advanced use cases, explicit helpers are also available:

- `initializeForDenoCompile()` - Explicit initialization with custom Wasm path
- `prepareWasmForEmbedding()` - Copies WASM file for embedding
- `isDenoCompiled()` - Reports whether the process is a compiled Deno binary

## Method 1: Auto-Detection (Recommended)

`TagLib.initialize()` transparently handles compiled binaries:

```typescript
import { TagLib } from "npm:taglib-wasm";

// Works in development, Deno compile, browsers — everywhere
const taglib = await TagLib.initialize();

using file = await taglib.open("audio.mp3");
console.log(file.tag().title);
```

For offline support, embed the Wasm file at compile time:

```bash
# Prepare WASM file
deno run --allow-read --allow-write -e \
  "import { prepareWasmForEmbedding } from 'npm:taglib-wasm'; await prepareWasmForEmbedding();"

# Compile with embedded WASM
deno compile --allow-read --include taglib-web.wasm myapp.ts
```

**How it works:**

1. Detects a compiled binary — Deno's own `Deno.build.standalone` flag when
   it is exposed, otherwise both `Deno.mainModule` forms (the
   `deno-compile://` scheme through Deno 2.8, the `file://` URL under a
   `deno-compile-<name>` path on 2.9+); see [Detection of Compiled
   Binaries](#1-detection-of-compiled-binaries)
2. Automatically sets `forceWasmType: "emscripten"` (Emscripten, not WASI)
3. Tries to load embedded Wasm using the multi-strategy fallback (see
   [Path Resolution](#3-path-resolution))
4. Falls back to the Wasm resolved from the package when the embedded file is
   not found — `deno compile` embeds the whole package tree, so the fallback
   works inside a compiled binary too (see Best Practice 3)

## Method 2: CDN Loading

For online-only tools, use a CDN URL:

```typescript
import { TagLib } from "npm:taglib-wasm";

const taglib = await TagLib.initialize({
  wasmUrl:
    "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib-web.wasm",
});

using file = await taglib.open("audio.mp3");
console.log(file.tag().title);
```

**Compile command:**

```bash
deno compile --allow-read --allow-net myapp.ts
```

**Pros:**

- Small binary size
- Always gets latest WASM optimizations

**Cons:**

- Requires internet connection on first run

## Method 3: Explicit Helper (Custom Wasm Path)

Use `initializeForDenoCompile()` when you need a custom embedded Wasm path:

```typescript
import { initializeForDenoCompile } from "npm:taglib-wasm";
import { readTags } from "npm:taglib-wasm/simple";

async function main() {
  // Custom embedded path
  const taglib = await initializeForDenoCompile("./assets/taglib-web.wasm");

  for (const filePath of Deno.args) {
    const tags = await readTags(filePath);
    console.log(`${filePath}:`, tags);
  }
}

if (import.meta.main) {
  await main();
}
```

### Build Process

**Step 1: Prepare WASM file (run once during build)**

```typescript
// prepare-offline.ts
import { prepareWasmForEmbedding } from "npm:taglib-wasm";

await prepareWasmForEmbedding("./taglib-web.wasm");
```

```bash
deno run --allow-read --allow-write prepare-offline.ts
```

**Step 2: Compile with embedded WASM**

```bash
deno compile --allow-read --include taglib-web.wasm myapp.ts
```

**Step 3: Run offline**

```bash
./myapp audio.mp3
```

### How It Works

The `initializeForDenoCompile()` function:

1. Detects if running as a compiled binary using `Deno.mainModule` (both
   compiled-binary URL forms — see the Overview)
2. Attempts to load embedded WASM from `./taglib-web.wasm`
3. Falls back to the Wasm shipped in this package (`dist/taglib-web.wasm`,
   resolved relative to the module). That fallback is why a compiled binary
   works without `--include` too: `deno compile` embeds the whole npm package
   tree, so the file is present. Embedding your own copy pins the version you
   tested rather than repairing a missing file; use Method 2 (`wasmUrl`) if a
   runtime fetch is wanted

## Method 4: Manual Control (Advanced)

For full control over the loading strategy:

```typescript
import { TagLib } from "npm:taglib-wasm";

async function initializeTagLib(): Promise<TagLib> {
  // A hand-rolled check of both compiled-binary mainModule forms; the
  // library's isDenoCompiled() prefers Deno.build.standalone when the runtime
  // exposes it and only falls back to these.
  const isCompiled =
    Deno.mainModule.includes("deno-compile://") ||
    Deno.mainModule.includes("/deno-compile-");

  if (isCompiled) {
    // Try multiple resolution strategies
    const strategies = [
      () => Deno.readFile(new URL("./taglib-web.wasm", Deno.mainModule)),
      () => Deno.readFile(new URL("./taglib-web.wasm", import.meta.url)),
      () => Deno.readFile("taglib-web.wasm"),
    ];
    for (const strategy of strategies) {
      try {
        const wasmBinary = await strategy();
        return await TagLib.initialize({ wasmBinary });
      } catch {
        // Try next strategy
      }
    }
    console.warn("Embedded WASM not found, falling back to CDN");
  }

  // Development or fallback
  return await TagLib.initialize({
    wasmUrl:
      "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib-web.wasm",
  });
}

// Usage
const taglib = await initializeTagLib();
```

> **Note:** supplying `wasmBinary` selects the Emscripten backend, which is why
> these strategies embed `taglib-web.wasm`. The WASI backend loads from a
> filesystem path or URL (`wasmUrl`); combining `wasmBinary` with
> `forceWasmType: "wasi"` throws.

## Complete Production Example

Here's a production-ready implementation with error handling:

```typescript
#!/usr/bin/env -S deno run --allow-read --allow-net

import { initializeForDenoCompile } from "npm:taglib-wasm";
import { applyTagsToFile, readTags } from "npm:taglib-wasm/simple";

async function processAudioFile(filePath: string) {
  try {
    // Read existing tags
    const tags = await readTags(filePath);
    console.log(`\n📄 File: ${filePath}`);
    console.log(`  Title: ${tags.title?.[0] || "(none)"}`);
    console.log(`  Artist: ${tags.artist?.[0] || "(none)"}`);
    console.log(`  Album: ${tags.album?.[0] || "(none)"}`);

    // Modify tags if needed
    if (!tags.comment?.[0]?.includes("Processed")) {
      await applyTagsToFile(filePath, {
        ...tags,
        comment: `${tags.comment?.[0] || ""} - Processed by TagLib-Wasm`,
      });
      console.log("  ✅ Updated comment tag");
    }
  } catch (error) {
    console.error(
      `  ❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  if (Deno.args.length === 0) {
    console.log("Usage: audio-processor <files...>");
    console.log("Example: audio-processor *.mp3");
    Deno.exit(1);
  }

  console.log("🎵 Audio Metadata Processor");
  console.log("Initializing TagLib-Wasm...");

  try {
    // Initialize with automatic offline support
    const taglib = await initializeForDenoCompile();
    console.log("✅ Ready to process files\n");

    // Process all files
    for (const filePath of Deno.args) {
      await processAudioFile(filePath);
    }

    console.log("\n✅ All files processed!");
  } catch (error) {
    console.error(
      "Fatal error:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
```

## Key Implementation Details

### 1. Detection of Compiled Binaries

The `isDenoCompiled()` helper prefers `Deno.build.standalone` — true inside a
compiled binary, false under `deno run` — and falls back to the two
`Deno.mainModule` forms when the flag is not exposed:

```typescript
import { isDenoCompiled } from "npm:taglib-wasm";

const isCompiled = isDenoCompiled();
```

- Deno through 2.8 marks a compiled binary with the `deno-compile://` scheme.
- Deno 2.9+ reports a `file://` URL under a `deno-compile-<name>` temporary
  directory (measured on 2.9.6:
  `file:///var/folders/…/T/deno-compile-probe/probe.ts`).

Either signal fires the automatic embedded-Wasm search and makes
`initializeForDenoCompile()`'s explicit strategies reachable:

```typescript
const taglib = await initializeForDenoCompile("./taglib-web.wasm");
```

### 2. Embedding WASM Files

Use the `--include` flag when compiling:

```bash
deno compile --allow-read --include taglib-web.wasm myapp.ts
```

### 3. Path Resolution

Embedded Wasm is resolved using a multi-strategy fallback:

1. **`Deno.mainModule`** – Relative to the user's entry point (where `--include`
   embeds files)
2. **`import.meta.url`** – Relative to the library module (fallback)
3. **Bare path** – Virtual root / CWD

This ensures the Wasm file is found regardless of whether the compiled binary
resolves paths relative to the entry point or the library module.

### 4. Environment Configuration

Support runtime configuration:

```typescript
const WASM_URL =
  Deno.env.get("TAGLIB_WASM_URL") ||
  "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib-web.wasm";
```

## Comparison Table

One row per method, in the order they appear above:

| Method                                            | Offline Support  | Binary Size | Complexity | Best For                     |
| ------------------------------------------------- | ---------------- | ----------- | ---------- | ---------------------------- |
| 1. Auto-Detection (`TagLib.initialize()`)         | ✅ when embedded | +500KB      | Simple     | Deno compiled binaries       |
| 2. CDN Loading (`wasmUrl`)                        | ❌               | Small       | Simple     | Online tools, web services   |
| 3. Explicit Helper (`initializeForDenoCompile()`) | ✅ when embedded | +500KB      | Medium     | A custom embedded Wasm path  |
| 4. Manual Control (`wasmBinary`)                  | ✅ when embedded | +500KB      | Complex    | A custom resolution strategy |

Methods 1 and 3 both load an embedded Wasm when one is present — they differ
only in whether you call `TagLib.initialize()` or
`initializeForDenoCompile()` with your own path — and both fall back to the Wasm
inside the npm package that `deno compile` embeds when it is not. Method 4 is
for a resolution strategy of your own.

## Best Practices

1. **Embed the Wasm for offline support** – Compile with
   `--include taglib-web.wasm`, or run `prepareWasmForEmbedding()` in a build
   step. A compiled binary initializes from the Wasm inside the npm package
   `deno compile` embeds anyway, so `--include` is not what makes it work — it
   pins the copy you tested. Use Method 2 (`wasmUrl`) if it should fetch the
   Wasm at runtime instead.
2. **Resolve the embedded file relative to `Deno.mainModule`** – Inside a
   compiled binary that URL points into the binary's filesystem (on Deno 2.9.6 a
   `file://` path under `deno-compile-<name>`), so resolve the Wasm relative to
   it (see [Path Resolution](#3-path-resolution)) rather than to your source
   tree.
3. **Expect the package fallback** – `initializeForDenoCompile()` falls back to
   the Wasm resolved from this package, and `deno compile` embeds that package,
   so a build that forgot `--include` still initializes. What it loses is the
   guarantee that the binary/version you tested is the one being loaded.
4. **Handle an unreachable CDN** – A CDN-only binary that runs offline fails at
   initialization. Surface that error; the library stays uninitialized.

## Common Issues and Solutions

### Issue: "Module not found" in compiled binary

**Solution**: Ensure you used `--include taglib-web.wasm` when compiling

### Issue: Large binary size

**Solution**: Use CDN loading if offline support isn't required

### Issue: Slow initialization

**Solution**: Use CDN with streaming compilation for faster startup

### Issue: Network errors

**Solution**: Implement retry logic or provide offline fallback

## Example Projects

Complete working examples are available in the repository:

- `examples/deno-compile/simple-app.ts` - CDN loading example
- `examples/deno-compile/app.ts` - Advanced embedding example
- `examples/deno/offline-compile.ts` - Using helper functions

## Tips for Production

- **Cache WASM locally**: For frequently used tools, cache the WASM file locally
- **Use your own CDN**: Host the WASM file on your infrastructure for
  reliability
- **Version pinning**: Use specific versions instead of `@latest` for stability
