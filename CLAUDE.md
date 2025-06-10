# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**✅ STATUS: FULLY FUNCTIONAL** - This is a complete WebAssembly port of TagLib v2.1 with TypeScript bindings for universal audio metadata handling across browsers, Node.js, and Deno. The project successfully compiles the C++ TagLib library to WASM and provides a modern TypeScript API wrapper.

**🎯 All major functionality is working:**
- ✅ File loading from memory buffers (5/5 formats)
- ✅ Audio properties reading
- ✅ Tag reading/writing
- ✅ Memory management
- ✅ Multi-runtime support (Deno 2, Node.js, browsers)

## Architecture

- **lib/taglib/**: Git subtree containing TagLib v2.1 C++ source code
- **src/**: Complete TypeScript wrapper and API definitions (✅ IMPLEMENTED)
  - `mod.ts` - Main module exports
  - `taglib.ts` - Core TagLib and AudioFile classes
  - `types.ts` - TypeScript type definitions
  - `wasm.ts` - WASM module interface and utilities
- **build/**: WASM compilation scripts and C++ wrapper (✅ WORKING)
  - `build-wasm.sh` - Complete build script with C++ wrapper implementation
  - `taglib.js` - Generated Emscripten JavaScript module
  - `taglib.wasm` - Compiled WebAssembly binary
- **test-files/**: Sample audio files for testing (WAV, MP3, FLAC, OGG, M4A)
- **tests/**: Comprehensive test suite (✅ ALL PASSING)

The project uses Emscripten to compile TagLib C++ to WebAssembly with a custom C++ wrapper that bridges TagLib's object-oriented API to C functions suitable for WASM exports. The TypeScript wrapper provides a modern async API that works across all JavaScript runtimes.

## Development Commands

### Deno 2 (Primary)

- `deno task build:wasm` - Compile TagLib C++ to WebAssembly using Emscripten
- `deno task build:ts` - Compile TypeScript wrapper to JavaScript
- `deno task build` - Full build (WASM + TypeScript)
- `deno task test` - Run tests with Deno
- `deno task dev` - Development mode with file watching
- `deno task fmt` - Format code with Deno formatter
- `deno task lint` - Lint code with Deno linter
- `deno task check` - Type check the project

### Node.js (Compatibility)

- `npm run build:wasm` - Compile TagLib C++ to WebAssembly using Emscripten
- `npm run build:ts` - Compile TypeScript wrapper to JavaScript
- `npm run build` - Full build (WASM + TypeScript)
- `npm test` - Run Jest test suite

### TagLib Management

- `./scripts/update-taglib.sh [version]` - Update TagLib subtree to new version (defaults to v2.1)

## Key Technical Details

- Uses git subtree to manage TagLib dependency at `lib/taglib/`
- Targets ES2020 with ESNext modules for broad compatibility
- Requires Emscripten SDK for WASM compilation
- Uses mise for Node.js/Deno version management
- Supports all TagLib audio formats: MP3 (ID3v1/v2), MP4/M4A, FLAC, Ogg Vorbis, Opus, etc.

## Development Environment

The project uses mise.toml for runtime management. Ensure you have:

- Node.js (latest)
- Deno (latest)
- Emscripten SDK (for WASM builds)

## Critical Implementation Details

### ✅ Memory Management Solution
The most critical discovery was that **manual memory copying with `HEAPU8.set()` causes data corruption**. The solution is to use **Emscripten's `allocate()` function**:

```typescript
// ❌ WRONG - causes data corruption
const ptr = module._malloc(buffer.length);
module.HEAPU8.set(buffer, ptr);

// ✅ CORRECT - reliable data transfer
const ptr = module.allocate(buffer, module.ALLOC_NORMAL);
```

This applies to:
- File buffer loading in `TagLib.openFile()`
- String conversion in `jsToCString()`

### ✅ C++ Wrapper Architecture
TagLib's C++ API is bridged through custom C functions that:
- Use `TagLib::ByteVectorStream` for in-memory file processing
- Manage C++ objects via integer IDs for memory safety
- Handle UTF-8 string conversion automatically
- Support all major audio formats through format detection

### ✅ Build System
The `build-wasm.sh` script:
- Compiles TagLib with all format support enabled
- Includes a complete C++ wrapper implementation
- Exports all necessary functions via Emscripten
- Generates optimized WASM + JavaScript modules

## Current Status

**✅ PRODUCTION READY** - All major functionality is implemented and tested:
- 5/5 audio formats working (WAV, MP3, FLAC, OGG, M4A)
- Complete TypeScript API
- Comprehensive test suite
- Documentation complete
