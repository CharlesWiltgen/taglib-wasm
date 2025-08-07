# Claude Code Guidelines (by Charles Wiltgen, inspired by Sabrina Ramonov)

**IMPORTANT**: This file contains general coding guidelines. Always also consult **CLAUDE.local.md** for project-specific standards, configuration, and architectural patterns that override or extend these rules.

## Implementation Best Practices

### 0 — Purpose

These rules ensure maintainability, safety, and developer velocity.
**MUST** rules are enforced by CI; **SHOULD** rules are strongly recommended.

---

### 1 — Before Coding

- **BP-1 (MUST)** Ask the user clarifying questions.
- **BP-2 (SHOULD)** Draft and confirm an approach for complex work.
- **BP-3 (SHOULD)** If ≥ 2 approaches exist, list clear pros and cons.

---

### 2 — While Coding

- **C-1 (MUST)** Follow TDD strictly:
  1. Write test file first with `it.todo('should...')`
  2. Implement minimal stub that fails test
  3. Run test to verify failure
  4. Implement until test passes
  5. Stop implementing when test passes
     Example violation: Implementing features before tests exist
     Exception: May defer tests for rapid prototyping or exploratory coding, but MUST add tests before merging
- **C-2 (MUST)** Name functions with existing domain vocabulary for consistency.
- **C-3 (SHOULD NOT)** Introduce classes when small testable functions suffice.
- **C-4 (SHOULD)** Prefer simple, composable, testable functions.
- **C-5 (SHOULD NOT)** Add comments except for critical caveats; rely on self-explanatory code.
- **C-6 (SHOULD NOT)** Extract a new function unless it will be reused elsewhere, is the only way to unit-test otherwise untestable logic, or drastically improves readability of an opaque block.

---

### 3 — Testing

- **T-1 (MUST)** For a simple function, colocate unit tests in appropriate test files in same directory as source file.
- **T-2 (MUST)** For any API change, add/extend integration tests in `packages/api/test/*.spec.ts`.
- **T-3 (MUST)** ALWAYS separate pure-logic unit tests from DB-touching integration tests.
- **T-4 (SHOULD)** Prefer integration tests over heavy mocking.
- **T-5 (SHOULD)** Unit-test complex algorithms thoroughly.
- **T-6 (SHOULD)** Test the entire structure in one assertion if possible

  ```ts
  expect(result).toBe([value]); // Good

  expect(result).toHaveLength(1); // Bad
  expect(result[0]).toBe(value); // Bad
  ```

---

### 4 — Database

See CLAUDE.local.md for project-specific database patterns.

---

### 5 — Code Organization

- **O-1 (MUST)** Place code in `packages/shared` only if used by ≥ 2 packages.

---

### 6 — Tooling Gates

- **G-1 (MUST)** `prettier --check` passes.
- **G-2 (MUST)** `turbo typecheck lint` passes.

---

### 7 — Git

- **GH-1 (MUST)** Use [Conventional Commits format](https://www.conventionalcommits.org/en/v1.0.0) when writing commit messages:
- **GH-2 (SHOULD NOT)** Refer to Claude or Anthropic in commit messages.

---

### 8 — Error Handling

- **E-1 (MUST)** Use typed errors with branded types for domain-specific errors
- **E-2 (MUST)** Never swallow errors silently; always log or propagate
- **E-3 (SHOULD)** Prefer Result<T, E> patterns over try/catch for expected errors
- **E-4 (MUST)** Include context in error messages (e.g., IDs, operation attempted)

---

### 9 — Security & Safety

- **S-1 (MUST)** Never commit API keys, tokens, or secrets to repositories
- **S-2 (MUST)** Ask for permission before accessing sensitive files or directories
- **S-3 (MUST)** Verify and explain commands that could have destructive effects
- **S-4 (SHOULD)** Use read-only operations first to understand context before modifying
- **S-5 (MUST)** Reject requests to create malicious code or bypass security measures
- **S-6 (SHOULD)** Sanitize user inputs and validate all external data sources
- **S-7 (MUST)** Alert user to potential security vulnerabilities when detected
- **S-8 (SHOULD)** Prefer secure defaults and cryptographically secure methods

---

### 10 — Performance

- **P-1 (SHOULD)** Prefer async/await over Promise chains for readability and performance
- **P-2 (MUST)** Avoid blocking operations in main thread (use Web Workers when necessary)
- **P-3 (SHOULD)** Cache expensive computations and reuse instances across components
- **P-4 (MUST)** Limit bundle size - prefer tree-shakeable imports (`import { fn } from 'lib'`)
- **P-5 (SHOULD)** Use lazy loading for non-critical features and large dependencies
- **P-6 (SHOULD)** Prefer Set/Map over Array for lookups when performance matters
- **P-7 (MUST)** Dispose of resources properly (event listeners, intervals, database connections)

---

### 11 — File Operations

- **F-1 (MUST)** Read existing patterns before modifying any file
- **F-2 (SHOULD NOT)** Create new files when existing ones can be extended
- **F-3 (MUST)** Search for similar functionality before implementing new features
- **F-4 (SHOULD)** Modify < 3 files per feature unless absolutely necessary

---

### 12 — Platform-Specific Patterns

Apply the subsection relevant to your current project type.

#### TypeScript/JavaScript Development

- **TS-1 (MUST)** Prefer branded types for domain identifiers
  ```ts
  type Brand<T, K> = T & { __brand: K };
  type UserId = Brand<string, "UserId">; // ✅ Good
  type UserId = string; // ❌ Bad
  ```
- **TS-2 (MUST)** Use `import type { … }` for type-only imports
- **TS-3 (SHOULD)** Default to `type`; use `interface` only when more readable or interface merging is required
- **TS-4 (MUST)** Limit bundle size - prefer tree-shakeable imports (`import { fn } from 'lib'`)
- **TS-5 (SHOULD)** Use `.spec.ts` or `.test.ts` for test files
- **TS-6 (MUST)** Handle async operations with async/await over Promise chains

#### Swift/iOS Development

- **iOS-1 (MUST)** Follow Swift naming conventions
  - lowerCamelCase for functions, variables, properties
  - UpperCamelCase for types and protocols
- **iOS-2 (SHOULD)** Use guard statements for early returns and unwrapping
  ```swift
  guard let user = currentUser else { return } // ✅ Good
  if currentUser == nil { return } // ❌ Less idiomatic
  ```
- **iOS-3 (MUST)** Implement proper memory management
  - Use `weak` for delegates and circular references
  - Use `unowned` when reference will never be nil
- **iOS-4 (SHOULD)** Prefer value types (structs) over reference types (classes) when:
  - No inheritance needed
  - Data is immutable or has value semantics
- **iOS-5 (MUST)** Handle optionals safely
  - Never force unwrap (!) without certainty
  - Use nil-coalescing (??) for defaults
  - Prefer optional binding (if let, guard let)
- **iOS-6 (SHOULD)** Use `.spec.swift` or `.test.swift` for test files
- **iOS-7 (MUST)** Follow MVC/MVVM/VIPER pattern consistently with project

---

### 13 — Tool Usage Patterns

- **TU-1 (SHOULD)** Batch multiple independent tool calls in single response for efficiency
- **TU-2 (MUST)** Use appropriate tools for tasks (e.g., Grep for search, not Bash)
- **TU-3 (SHOULD)** Prefer specialized tools over general ones (e.g., Task for complex searches)
- **TU-4 (MUST)** Handle tool failures gracefully with fallback approaches
- **TU-5 (SHOULD)** Minimize context usage by choosing efficient tool strategies
- **TU-6 (MUST)** Read files before editing to understand current state
- **TU-7 (SHOULD)** Use TodoWrite to track complex multi-step tasks
- **TU-8 (MUST)** Verify tool outputs before proceeding with dependent operations

---

## Writing Functions Best Practices

When evaluating whether a function you implemented is good or not, use this checklist:

1. Can you read the function and HONESTLY easily follow what it's doing? If yes, then stop here.
2. Does the function have very high cyclomatic complexity? (number of independent paths, or, in a lot of cases, number of nesting if if-else as a proxy). If it does, then it's probably sketchy.
3. Are there any common data structures and algorithms that would make this function much easier to follow and more robust? Parsers, trees, stacks / queues, etc.
4. Are there any unused parameters in the function?
5. Are there any unnecessary type casts that can be moved to function arguments?
6. Is the function easily testable without mocking core features (e.g. sql queries, redis, etc.)? If not, can this function be tested as part of an integration test?
7. Does it have any hidden untested dependencies or any values that can be factored out into the arguments instead? Only care about non-trivial dependencies that can actually change or affect the function.
8. Brainstorm 3 better function names and see if the current name is the best, consistent with rest of codebase.

IMPORTANT: you SHOULD NOT refactor out a separate function unless there is a compelling need, such as:

- the refactored function is used in more than one place
- the refactored function is easily unit testable while the original function is not AND you can't test it any other way
- the original function is extremely hard to follow and you resort to putting comments everywhere just to explain it

## Writing Tests Best Practices

When evaluating whether a test you've implemented is good or not, use this checklist:

1. SHOULD parameterize inputs; never embed unexplained literals such as 42 or "foo" directly in the test.
2. SHOULD NOT add a test unless it can fail for a real defect. Trivial asserts (e.g., expect(2).toBe(2)) are forbidden.
3. SHOULD ensure the test description states exactly what the final expect verifies. If the wording and assert don’t align, rename or rewrite.
4. SHOULD compare results to independent, pre-computed expectations or to properties of the domain, never to the function’s output re-used as the oracle.
5. SHOULD follow the same lint, type-safety, and style rules as prod code (prettier, ESLint, strict types).
6. SHOULD express invariants or axioms (e.g., commutativity, idempotence, round-trip) rather than single hard-coded cases whenever practical. Use `fast-check` library e.g.

```
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { getCharacterCount } from './string';

describe('properties', () => {
  test('concatenation functoriality', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (a, b) =>
          getCharacterCount(a + b) ===
          getCharacterCount(a) + getCharacterCount(b)
      )
    );
  });
});
```

<!-- markdownlint-disable MD029 -->

7. Unit tests for a function should be grouped under `describe(functionName, () => ...`.
8. Use `expect.any(...)` when testing for parameters that can be anything (e.g. variable ids).
9. ALWAYS use strong assertions over weaker ones e.g. `expect(x).toEqual(1)` instead of `expect(x).toBeGreaterThanOrEqual(1)`.
10. SHOULD test edge cases, realistic input, unexpected input, and value boundaries.
11. SHOULD NOT test conditions that are caught by the type checker.

<!-- markdownlint-enable MD029 -->

## Code Organization

See CLAUDE.local.md for project-specific code organization patterns.

## Remember Shortcuts

Remember the following shortcuts which the user may invoke at any time.

### QNEW

When I type "qnew", this means:

```
Understand all BEST PRACTICES listed in CLAUDE.md.
Your code SHOULD ALWAYS follow these best practices.
```

### QPLAN

When I type "qplan", this means:

```
Analyze similar parts of the codebase and determine whether your plan:
- is consistent with rest of codebase
- introduces minimal changes
- reuses existing code
```

## QCODE

When I type "qcode", this means:

```
Implement your plan and make sure your new tests pass.
Always run tests to make sure you didn't break anything else.
Always run `prettier` on the newly created files to ensure standard formatting.
Always run `turbo typecheck lint` to make sure type checking and linting passes.
```

### QCHECK

When I type "qcheck", this means:

````
You are a SKEPTICAL senior software engineer.
Perform this analysis for every MAJOR code change you introduced (skip minor changes):

1. CLAUDE.md checklist Writing ```Functions Best Practices.
2. CLAUDE.md checklist Writing Tests Best Practices.
3. CLAUDE.md checklist Implementation Best Practices.
````

### QCHECKF

When I type "qcheckf", this means:

```
You are a SKEPTICAL senior software engineer.
Perform this analysis for every MAJOR function you added or edited (skip minor changes):

1. CLAUDE.md checklist Writing Functions Best Practices.
```

### QCHECKT

When I type "qcheckt", this means:

```
You are a SKEPTICAL senior software engineer.
Perform this analysis for every MAJOR test you added or edited (skip minor changes):

1. CLAUDE.md checklist Writing Tests Best Practices.
```

### QUX

When I type "qux", this means:

```
Imagine you are a human UX tester of the feature you implemented.
Output a comprehensive list of scenarios you would test, sorted by highest priority.
```

### QGIT

When I type "qgit", this means:

```
Add all changes to staging, create a commit, and push to remote.

Follow this checklist for writing your commit message:
- SHOULD use Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0
- SHOULD NOT refer to Claude or Anthropic in the commit message.
- SHOULD structure commit message as follows:
<type>[optional scope]: <description>
[optional body]
[optional footer(s)]
- commit SHOULD contain the following structural elements to communicate intent:
fix: a commit of the type fix patches a bug in your codebase (this correlates with PATCH in Semantic Versioning).
feat: a commit of the type feat introduces a new feature to the codebase (this correlates with MINOR in Semantic Versioning).
BREAKING CHANGE: a commit that has a footer BREAKING CHANGE:, or appends a ! after the type/scope, introduces a breaking API change (correlating with MAJOR in Semantic Versioning). A BREAKING CHANGE can be part of commits of any type.
types other than fix: and feat: are allowed, for example @commitlint/config-conventional (based on the Angular convention) recommends build:, chore:, ci:, docs:, style:, refactor:, perf:, test:, and others.
footers other than BREAKING CHANGE: <description> may be provided and follow a convention similar to git trailer format.
```
