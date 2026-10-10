# Deno Application Setup Guide for TagLib-Wasm

This guide shows the recommended way to set up a Deno application that uses TagLib-Wasm with both Folder API and compiled binary support.

## ✅ Use the npm package

The npm package `taglib-wasm` includes everything you need:

- Folder API (scanFolder, findDuplicates, etc.)
- Deno compile utilities (isDenoCompiled, initializeForDenoCompile)
- Simple API (readTags, applyTags, applyTagsToFile, writeTagsBatch)
- Full API (TagLib class)
- All TypeScript types

Import it with Deno's `npm:` specifier — no JSR package and no import-map
entry are involved, and `@charlesw/taglib-wasm` on JSR is deprecated.

## Project Setup

### 1. Create `deno.json`

```json
{
  "name": "my-audio-app",
  "version": "1.0.0",
  "imports": {
    "@cliffy/table": "jsr:@cliffy/table@^1.0.0-rc.7",
    "@std/path": "jsr:@std/path@^1.0.0"
  },
  "tasks": {
    "dev": "deno run --allow-read --allow-net main.ts",
    "compile": "deno compile --allow-read --allow-net --include taglib-web.wasm main.ts",
    "prepare-offline": "deno run --allow-read --allow-write prepare-offline.ts"
  }
}
```

### 2. Main Application (`main.ts`)

```typescript
import {
  applyTagsToFile,
  type AudioFileMetadata,
  FileOperationError,
  type FolderScanOptions,
  // Deno compile support
  initializeForDenoCompile,
  isDenoCompiled,
  // Simple API
  readTags,
  // Folder API
  scanFolder,
  // Error types
  TagLibError,
} from "npm:taglib-wasm";

import { dirname } from "@std/path";

async function main() {
  // Show runtime environment
  console.log(
    `🚀 Running as: ${
      isDenoCompiled() ? "Compiled Binary" : "Development Mode"
    }`,
  );

  try {
    // Initialize with automatic offline support for compiled binaries
    const taglib = await initializeForDenoCompile();
    console.log("✅ TagLib initialized successfully\n");

    // Example 1: Scan a folder
    await scanFolderExample();

    // Example 2: Process specific files
    await processSpecificFiles(Deno.args);
  } catch (error) {
    if (error instanceof TagLibError) {
      console.error("❌ TagLib Error:", error.message);
      if (isDenoCompiled()) {
        console.error(
          "💡 Tip: Make sure taglib.wasm is included in the binary",
        );
      }
    } else {
      console.error("❌ Unexpected error:", error);
    }
    Deno.exit(1);
  }
}

async function scanFolderExample() {
  console.log("📁 Scanning music folder...\n");

  const result = await scanFolder("./music", {
    recursive: true,
    concurrency: 8,
    includeProperties: true,
    onProgress: (processed, total, currentFile) => {
      // Update progress in place
      Deno.stdout.writeSync(
        new TextEncoder().encode(
          `\rProcessing: ${processed}/${total} files...`,
        ),
      );
    },
  });

  const errors = result.items.filter((i) => i.status === "error");

  console.log("\n\n📊 Scan Results:");
  console.log(`  Total files found: ${result.items.length}`);
  console.log(
    `  Successfully processed: ${
      result.items.filter((i) => i.status === "ok").length
    }`,
  );
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Time taken: ${result.duration}ms`);

  // Group by album
  const albums = groupByAlbum(result.items);
  console.log(`  Albums found: ${albums.size}\n`);
}

async function processSpecificFiles(files: string[]) {
  if (files.length === 0) return;

  console.log(`\n🎵 Processing ${files.length} specific files...\n`);

  // For specific files, we can use scanFolder with directory filtering
  const filesByDir = groupFilesByDirectory(files);

  for (const [dir, dirFiles] of filesByDir) {
    const result = await scanFolder(dir, {
      recursive: false,
      includeProperties: true,
      // Custom filter to only process our specific files
      extensions: getUniqueExtensions(dirFiles),
    });

    // Filter to only our files
    const ourFiles = result.items.filter((f) => dirFiles.includes(f.path));

    for (const file of ourFiles) {
      console.log(`📄 ${file.path}`);
      console.log(`   Title: ${file.tags.title?.[0] || "(none)"}`);
      console.log(`   Artist: ${file.tags.artist?.[0] || "(none)"}`);
      console.log(`   Album: ${file.tags.album?.[0] || "(none)"}`);
      if (file.properties) {
        console.log(`   Duration: ${formatDuration(file.properties.duration)}`);
        console.log(`   Bitrate: ${file.properties.bitrate} kbps`);
      }
      console.log();
    }
  }
}

// Helper functions
function groupByAlbum(
  files: AudioFileMetadata[],
): Map<string, AudioFileMetadata[]> {
  const albums = new Map<string, AudioFileMetadata[]>();
  for (const file of files) {
    const album = file.tags.album?.[0] || "Unknown Album";
    const albumFiles = albums.get(album) || [];
    albumFiles.push(file);
    albums.set(album, albumFiles);
  }
  return albums;
}

function groupFilesByDirectory(files: string[]): Map<string, string[]> {
  const dirs = new Map<string, string[]>();
  for (const file of files) {
    const dir = dirname(file);
    const dirFiles = dirs.get(dir) || [];
    dirFiles.push(file);
    dirs.set(dir, dirFiles);
  }
  return dirs;
}

function getUniqueExtensions(files: string[]): string[] {
  const extensions = new Set<string>();
  for (const file of files) {
    const ext = file.substring(file.lastIndexOf("."));
    if (ext) extensions.add(ext);
  }
  return Array.from(extensions);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Run the application
if (import.meta.main) {
  await main();
}
```

### 3. Prepare for Offline Support (`prepare-offline.ts`)

```typescript
import { prepareWasmForEmbedding } from "npm:taglib-wasm";

console.log("📦 Preparing WASM for offline support...");

try {
  await prepareWasmForEmbedding("./taglib-web.wasm");
  console.log("✅ WASM file ready for embedding");
  console.log("\nNext step: Compile with:");
  console.log("  deno compile --allow-read --include taglib-web.wasm main.ts");
} catch (error) {
  console.error("❌ Failed to prepare WASM:", error);
  Deno.exit(1);
}
```

### 4. Advanced Example with Extended Metadata

```typescript
import {
  type AudioFileMetadata,
  initializeForDenoCompile,
  scanFolder,
  TagLib,
} from "npm:taglib-wasm";

async function getExtendedMetadata(files: AudioFileMetadata[]) {
  const taglib = await TagLib.initialize();

  for (const file of files) {
    try {
      const audioFile = await taglib.open(file.path);
      try {
        const propertyMap = audioFile.propertyMap();
        const properties = propertyMap.properties();

        // Check for ReplayGain
        const replayGain = {
          trackGain: properties["REPLAYGAIN_TRACK_GAIN"]?.[0],
          trackPeak: properties["REPLAYGAIN_TRACK_PEAK"]?.[0],
          albumGain: properties["REPLAYGAIN_ALBUM_GAIN"]?.[0],
          albumPeak: properties["REPLAYGAIN_ALBUM_PEAK"]?.[0],
        };

        // Check for AcoustID
        const acoustId = {
          id: properties["ACOUSTID_ID"]?.[0],
          fingerprint: properties["ACOUSTID_FINGERPRINT"]?.[0],
        };

        // Check for MusicBrainz
        const musicBrainz = {
          trackId: properties["MUSICBRAINZ_TRACKID"]?.[0],
          albumId: properties["MUSICBRAINZ_ALBUMID"]?.[0],
          artistId: properties["MUSICBRAINZ_ARTISTID"]?.[0],
        };

        console.log(`Extended metadata for ${file.path}:`, {
          replayGain,
          acoustId,
          musicBrainz,
        });
      } finally {
        audioFile.dispose();
      }
    } catch (error) {
      console.error(`Error reading extended metadata: ${error}`);
    }
  }
}
```

## Development Workflow

### 1. Development Mode

```bash
deno task dev ./music
```

### 2. Prepare for Offline (Optional)

```bash
deno task prepare-offline
```

### 3. Compile Binary

```bash
# With offline support
deno task compile

# Without offline support (uses CDN)
deno compile --allow-read --allow-net main.ts
```

### 4. Run Compiled Binary

```bash
./my-audio-app ./music
```

## Key Advantages of the npm Setup

1. **Single Source of Truth** - All imports from one package, the same one every
   other runtime uses
2. **Better Type Safety** - TypeScript types work automatically
3. **Deno-First Consumption** - `npm:taglib-wasm` needs no import-map entry
4. **No JSR Drift** - the deprecated `@charlesw/taglib-wasm` JSR package stops
   at 0.4.x, so the npm specifier is the only way to get current releases

## Common Patterns

### Pattern 1: Hybrid Online/Offline

```typescript
const taglib = await initializeForDenoCompile();
// Works online in dev, offline in compiled binary
```

### Pattern 2: Always Online (Simpler)

```typescript
const taglib = await TagLib.initialize({
  wasmUrl:
    "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib-web.wasm",
});
```

### Pattern 3: Force Offline

```typescript
const wasmBinary = await Deno.readFile("./taglib.wasm");
const taglib = await TagLib.initialize({ wasmBinary });
```

## Migrating off the deprecated JSR package

If you were importing from JSR, change:

```typescript
// ❌ Old way (deprecated JSR package, stops at 0.4.x)
import { isDenoCompiled, scanFolder } from "@charlesw/taglib-wasm";

// ✅ Current way (npm, all supported versions)
import { isDenoCompiled, scanFolder } from "npm:taglib-wasm";
```

That's it — everything is available from the npm package, and no import-map
entry is needed.
