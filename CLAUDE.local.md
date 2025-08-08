# taglib-wasm Project-Specific Guidelines

## Meta Instructions

- Never credit Claude Code in commits
- Always confirm notable architectural changes  
- BACKLOG.md is private

## Important Reminders

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files
- NEVER proactively create documentation files (*.md) unless explicitly requested

## Project Context

### Overview

taglib-wasm is a WebAssembly wrapper for TagLib, providing JavaScript/TypeScript APIs for reading and writing audio metadata across multiple formats.

### Key Architecture Principles

- **ONE Wasm binary** for all platforms (no platform-specific builds)
- WebAssembly is abbreviated **"Wasm"**, not "WASM" 
- Library-first design (no application code)
- Minimal dependencies
- Tree-shaking compatible

### Project Structure

```
/src           - TypeScript source code
/wasm          - WebAssembly module and bindings  
/tests         - Test files
/docs          - Detailed documentation
/bindings      - TagLib binding implementations
LLMs.md        - Documentation optimized for LLMs
```

### Documentation Scope

When asked to work on "documentation", include ALL of:
1. The main README.md
2. The `/docs` directory
3. The `LLMs.md` file

## Development Standards

### Code Complexity Limits (SonarQube)

- Maximum cognitive complexity: **15**
- Maximum cyclomatic complexity: **10** 
- Maximum function length: **50 lines**
- Maximum file length: **250 lines**
- Minimum test coverage: **80%**

### Current Violations (Must Fix)

- `src/taglib.ts` - 1229 lines (979 over limit)
- `src/types.ts` - 639 lines (389 over limit)
- `src/errors.ts` - 264 lines (14 over limit)

### TypeScript Patterns

#### ✅ Prefer Union Types

```typescript
type AudioFormat = "mp3" | "flac" | "ogg" | "wav";
```

#### ❌ Avoid Enums

```typescript
// DON'T USE - not type-safe, increases bundle size
enum AudioFormat { MP3, FLAC, OGG, WAV }
```

## WebAssembly Patterns

### Memory Management (CRITICAL)

**Always use try-finally for cleanup:**

```typescript
const ptr = module._malloc(buffer.byteLength);
try {
  module.HEAPU8.set(buffer, ptr);
  // Process data
  return result;
} finally {
  module._free(ptr);  // MUST free memory
}
```

### Known Issues

- Missing try-finally blocks in current code (workers.ts, taglib.ts)
- Memory leaks without proper cleanup

## Error Message Style Guide

### Use Colons for Details

```typescript
// ✅ GOOD
throw new Error("Module not initialized: Call init() first.");
throw new Error("Invalid buffer: Size must be at least 1KB. Buffer size: 512 bytes.");

// ❌ BAD  
throw new Error("Module not initialized - Call init() first");
throw new Error("Invalid buffer");  // Missing context
```

### Include Context

- Path: `/path/to/file.mp3`
- Buffer size: `2.0 KB`
- Field: `title`
- Required feature: `filesystem access`

## Testing Requirements

### Test Organization

- Unit tests: Colocate with source files
- Integration tests: `/tests` directory
- Edge cases: Comprehensive coverage required

### Current Test Status

- ✅ 25/25 tests passing in Deno
- ✅ All audio formats working (WAV, MP3, FLAC, OGG, M4A)
- ✅ Unicode support fixed (emoji, CJK, RTL text)

## Commands

### Before Committing

```bash
# Run ALL checks
deno task test

# Includes:
# - Format checking (prettier)
# - Linting (eslint)  
# - Type checking (tsc)
# - All tests
```

### Development

```bash
deno task build:wasm    # Build WebAssembly module
deno task test          # Run all tests
deno test --watch      # Watch mode
deno task fmt           # Auto-fix formatting
deno task lint          # Run linter
```

## Tool-Specific Notes

### Claude Code

- Use `EDITOR=true` for ADR creation (prevents timeouts)
- Never use `--no-verify` when committing
- Run `deno task fmt` before committing
- Run `deno task lint` before finalizing changes

### External Resources

- SonarQube API docs: `https://raw.githubusercontent.com/sapientpants/sonarqube-web-api-client/refs/heads/main/docs/LLM.md`

## CI/CD

- GitHub Actions publishes to JSR and NPM
- All releases automated
- Manual publishing discouraged

## Architectural Decisions (Phases 1-3)

### Phase 1: Foundation & Standards

#### Function Complexity Enforcement
- **50-line maximum** per function (SonarQube compliance)
- **Extraction strategy**: Create focused helper functions rather than complex implementations
- **Exception handling**: Functions may exceed limit for error handling only

#### Error Architecture
- **Branded error types** with `readonly code` properties for type safety
- **Context inclusion**: Always include operation details, buffer sizes, file paths
- **Colon formatting**: `"Operation failed: specific reason. Context: details"`

#### Testing Organization  
- **Colocated unit tests** in same directory as source files
- **Integration tests** in `/tests` directory only
- **Clear naming**: Descriptive test names without unnecessary `describe()` blocks

### Phase 2: Memory Management Revolution

#### RAII Pattern Implementation
- **Symbol.dispose** for automatic resource cleanup
- **`using` statements** for scope-based memory management
- **WasmAlloc class** for single allocations with automatic cleanup
- **WasmArena class** for bulk allocations with collective cleanup

```typescript
// Established Pattern
export class WasmAlloc {
  [Symbol.dispose](): void {
    if (this.#ptr !== 0) {
      this.#wasm.free(this.#ptr);
      this.#ptr = 0;
    }
  }
}

// Usage Pattern
using alloc = new WasmAlloc(wasm, size);
// Automatic cleanup on scope exit
```

#### Memory Safety Architecture
- **Exception safety**: Cleanup guaranteed even with thrown exceptions
- **Double disposal protection**: Safe to call dispose multiple times
- **Bounds checking**: All read/write operations validate allocation boundaries
- **Heap view utilities**: Unified access to WASM memory through typed arrays

### Phase 3: WASI Integration & Advanced Testing

#### WASI Architecture Patterns
- **@wasmer/sdk integration** for WASI runtime support
- **Unified loader** with automatic fallback (WASI → Emscripten)
- **WasiToTagLibAdapter** for interface compatibility
- **MessagePack serialization** for performance-optimized data transfer

```typescript
// Established Pattern
async function readTagsWithWasi(
  audioBuffer: Uint8Array,
  wasiModule: WasiModule
): Promise<Uint8Array> {
  using arena = new WasmArena(wasiModule as WasmExports);
  
  const inputBuf = arena.allocBuffer(audioBuffer);
  const outSizePtr = arena.allocUint32();
  
  // WASI operations with automatic cleanup
  return new Uint8Array(outputBuf.read().slice());
}
```

#### Property-Based Testing Strategy
- **fast-check library** for property-based testing
- **Graduated run counts**: 1000/500/100/10 based on operation complexity
- **Invariant testing**: Focus on mathematical properties rather than hardcoded cases
- **Test rationale documentation**: Explain why specific run counts are chosen

```typescript
// Established Pattern
fc.assert(
  fc.property(
    fc.uint8Array({ minLength: 1, maxLength: 1000 }),
    (data) => {
      // Property: roundtrip encoding should preserve data
      const encoded = encode(data);
      const decoded = decode(encoded);
      return data.every((byte, i) => byte === decoded[i]);
    }
  ),
  { numRuns: 1000 } // High runs for data integrity
);
```

#### Code Organization Principles
- **Unified loader architecture** with runtime detection and automatic fallback
- **Modular separation**: Complex adapters in separate files to maintain function size limits
- **Interface consistency**: WASI and Emscripten modules expose identical APIs
- **Error propagation**: Consistent error handling across all loader implementations

### Key Architectural Achievements

1. **Memory Safety**: 100% automatic cleanup with RAII pattern
2. **Runtime Flexibility**: Seamless WASI/Emscripten switching
3. **Code Quality**: All functions under 50 lines, 100% test coverage  
4. **Performance**: MessagePack serialization, property-based validation
5. **Type Safety**: Branded error types, consistent interfaces

### Future Architecture Constraints

- **Maintain RAII**: All new WASM memory operations must use `using` statements
- **50-line limit**: Extract helpers rather than create complex functions
- **Property-based tests**: New features require invariant-based testing
- **Error branding**: All custom errors must have branded `code` properties
- **Interface consistency**: WASI and Emscripten implementations must remain compatible

## Detailed Guidelines

See these files for comprehensive patterns:

- `@docs/claude-guidelines/code-standards.md` - Naming, organization, JSDoc
- `@docs/claude-guidelines/error-style.md` - Error message formatting
- `@docs/claude-guidelines/wasm-patterns.md` - Memory management, performance
- `@docs/claude-guidelines/testing.md` - Test structure, patterns
