# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Project Context

### Overview

taglib-wasm is a WebAssembly wrapper for TagLib, providing JavaScript/TypeScript APIs for reading and writing audio metadata across multiple formats.

### Architecture Principles

- Maintain ONE Wasm binary for all platforms
- WebAssembly is abbreviated "Wasm", not "WASM"

### Project Structure

- `/src` - TypeScript source code
- `/wasm` - WebAssembly module and bindings
- `/tests` - Test files
- `/docs` - Detailed documentation
- `/bindings` - TagLib binding implementations
- `LLMs.md` - Documentation optimized for LLMs

### Documentation Structure

User-facing "documentation" includes:

- The high-level README
- The full documentation located at `/docs`
- The full documentation for feeding LLMs at `LLMs.md`

When asked to operate on the documentation, please include all three assets.

## 2. Development Workflow

### Before Starting

- Read relevant documentation
- Check existing patterns in the codebase
- Consider the public API surface - avoid breaking changes
- Review similar functionality that may already exist

### During Development

#### Follow Existing Patterns

- Check how similar functionality is implemented in the codebase
- Maintain consistency with existing code style
- Use the same libraries and utilities as the rest of the project

### Before Committing

```bash
# Run all checks before committing
deno task test

# This includes:
# - Format checking (prettier)
# - Linting (eslint)
# - Type checking (tsc)
# - Tests
```

## 3. Code Standards

### Code Complexity

#### SonarQube Metrics

- Maximum cognitive complexity: 15
- Maximum cyclomatic complexity: 10
- Maximum function length: 50 lines
- Maximum file length: 250 lines
- Minimum test coverage: 80%

#### Keep Cognitive Complexity Low

- Break complex functions into smaller, focused functions
- Reduce nesting levels (max 3-4 levels)
- Simplify conditional logic
- Extract complex conditions into well-named variables

#### Remove Redundant Code

- Don't create type aliases for primitive types
- Remove unused variable assignments
- Eliminate dead code

### TypeScript Best Practices

- Generally, avoid enums (numeric enums are not type-safe, they increase bundle size, they're TypeScript only) in favor of things like consts and unions of string literals

### Naming Conventions

- WebAssembly is abbreviated "Wasm", not "WASM" (e.g., `WasmModule`, not `WASMModule`)
- Use consistent casing in all contexts (code, comments, documentation)

## 4. Code Examples

### ✅ Good: Union types

```typescript
type AudioFormat = "mp3" | "flac" | "ogg" | "wav";
```

### ❌ Bad: Enums

```typescript
enum AudioFormat {
  MP3,
  FLAC,
  OGG,
  WAV,
}
```

### ✅ Good: Simple functions

```typescript
function validateBuffer(buffer: ArrayBuffer): void {
  if (!buffer) throw new Error("Buffer is required");
  if (buffer.byteLength < 1024) {
    throw new Error(
      "Invalid audio file format: Buffer too small. Buffer size: " +
        formatSize(buffer.byteLength),
    );
  }
}
```

### ❌ Bad: Complex nested logic

```typescript
function processAudio(buffer) {
  if (buffer) {
    if (buffer.byteLength > 0) {
      if (buffer.byteLength >= 1024) {
        // process...
      } else {
        // error...
      }
    }
  }
}
```

## 5. Error Handling

- Use descriptive error messages following the project's error message style guide (see @.claude/error-style.md)
- Always include context in errors (file paths, buffer sizes, etc.)
- Throw specific error types, not generic Error objects
- Handle WebAssembly-specific errors appropriately

## 6. Testing Guidelines

- Write tests for all new functionality
- Follow existing test patterns in `/tests`
- Test edge cases and error conditions
- Ensure tests are deterministic and don't depend on external resources
- Mock WebAssembly module when appropriate

## 7. WebAssembly Guidelines

### Memory Management

- Always clean up allocated memory after use
- Use try-finally blocks when working with Wasm memory
- Check for module initialization before operations

### Performance

- Minimize data copies between JS and Wasm
- Batch operations when possible
- Use typed arrays for efficient data transfer

### Error Handling

- Always check if Wasm module is loaded
- Handle out-of-memory errors gracefully
- Provide clear error messages for Wasm-specific failures

### Example Pattern

```typescript
try {
  const ptr = module._malloc(buffer.byteLength);
  try {
    // Work with Wasm memory
  } finally {
    module._free(ptr);
  }
} catch (error) {
  throw new Error(`Wasm operation failed: ${error.message}`);
}
```

## 8. Contributing Guidelines

### Before Making Changes

- Check if similar functionality already exists
- Review the public API surface - avoid breaking changes
- Consider backward compatibility

### API Design Principles

- Keep the API surface minimal
- Use clear, descriptive names
- Provide TypeScript types for all exports
- Document all public methods with JSDoc

### Library-Specific Considerations

- This is a library - no application code
- All features must be generally useful
- Avoid dependencies unless absolutely necessary
- Consider bundle size impact
- Ensure tree-shaking compatibility

### Performance Considerations

- Profile before optimizing
- Document performance characteristics in code
- Avoid premature optimization
- Consider memory usage for large audio files

## 9. Frequently Used Commands

### Development

```bash
# Build WebAssembly module
deno task build:wasm

# Run all tests
deno task test

# Run specific test file
deno test tests/specific-test.ts

# Watch tests during development
deno test --watch
```

### Validation

```bash
# Run all checks (format, lint, type-check, tests)
deno task test

# Auto-fix formatting issues
deno task fmt

# Run linter
deno task lint
```

### Debugging

```bash
# Check WebAssembly module status
deno task wasm:check

# View module exports
deno task wasm:exports

# Run tests with verbose output
deno test --allow-all --trace-ops
```

## 10. Tool-Specific Instructions

### Claude Code Tips

- Remember to use the ADR creation command with `EDITOR=true` to prevent timeouts in Claude Code
- Never use `--no-verify` when committing code. This bypasses pre-commit hooks which run important validation checks
- Run `deno task fmt` to format code before committing
- Run `deno task lint` before finalizing any code changes

### External Documentation

- Documentation for sonarqube-web-api-client can be retrieved from <https://raw.githubusercontent.com/sapientpants/sonarqube-web-api-client/refs/heads/main/docs/LLM.md>

## 11. Deployment and CI/CD

### Publishing

- We use GitHub Actions to publish to JSR and NPM
- All releases are automated through CI/CD
- Manual publishing is discouraged

## 12. Detailed Guidelines

### Code Standards

@docs/claude-guidelines/code-standards.md

### Error Message Style Guide

@docs/claude-guidelines/error-style.md

### WebAssembly Patterns

@docs/claude-guidelines/wasm-patterns.md

### Testing Guidelines

@docs/claude-guidelines/testing.md
