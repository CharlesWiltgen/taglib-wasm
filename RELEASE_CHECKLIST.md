# Release Checklist for TagLib-Wasm

This checklist ensures a smooth and safe release process.

## Pre-Release Checklist

### 1. Code Quality

- [ ] All tests pass (`npx vp test`, plus `npm run test:bun` and `bash tests/cross-runtime/run.sh`)
- [ ] Code is properly formatted (`npx vp fmt --check`)
- [ ] No linting errors (`npx vp lint --type-aware`)
- [ ] Type checking passes (`npx tsc --noEmit -p tsconfig.check.json`)
- [ ] Bundles build (`npm run build:ts`)
- [ ] Wasm build succeeds (`npm run build:wasm`)

### 2. Version Synchronization

- [ ] Version in `package.json` matches `src/version.ts` (`npx tsx scripts/sync-version.ts check`)
- [ ] Version follows semantic versioning (MAJOR.MINOR.PATCH)

### 3. Git Status

- [ ] On `main` branch
- [ ] No uncommitted changes
- [ ] Local branch is up to date with `origin/main`
- [ ] No existing tag for the new version

### 4. Documentation

- [ ] CHANGELOG is updated (if applicable)
- [ ] README is up to date
- [ ] API documentation is current

## Release Process

### Automated Release (Recommended)

Use the safe release script that enforces all checks:

```bash
# Auto-increment patch version (e.g., 3.0.0 → 3.0.1)
npm run release

# Set a specific version (npm drops positional args unless passed after `--`)
npm run release -- 3.1.0

# Or directly:
./scripts/release-safe.sh         # Auto-increment
./scripts/release-safe.sh 3.1.0   # Specific version
```

This script will:

1. Verify you're on the main branch
2. Check for uncommitted changes
3. Ensure local is up to date with remote
4. Run all tests (format, lint, type-check, unit tests)
5. Verify build process works
6. Check version synchronization
7. Update the version in `package.json` and `src/version.ts`
8. Commit and push the version change
9. Wait for CI to pass on that commit
10. Trigger the publish workflow (`finalize` creates the tag and GitHub release on success)

### Manual Release (Not Recommended)

If you must release manually:

1. **Run all checks**:

   ```bash
   npx vp fmt --check
   npx vp lint --type-aware
   npx tsc --noEmit -p tsconfig.check.json
   npx vp test
   npm run build:ts
   npm run build:wasm
   ```

2. **Update versions**:
   - Edit `package.json` version
   - Edit `src/version.ts` version
   - Ensure they match

3. **Commit and tag**:
   ```bash
   git add package.json src/version.ts
   git commit -m "chore: bump version to X.Y.Z"
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

## Post-Release Checklist

### 1. Verify GitHub Actions

- [ ] Check the [Actions page](https://github.com/CharlesWiltgen/TagLib-Wasm/actions)
- [ ] Ensure "Publish to NPM/GitHub" workflow triggered
- [ ] Verify all publish jobs succeeded

### 2. Verify Package Availability

- [ ] Check [NPM](https://www.npmjs.com/package/taglib-wasm)
- [ ] Check GitHub Packages

### 3. Test Installation

```bash
# Test NPM
npm install taglib-wasm@latest
```

### 4. Create GitHub Release

If not done automatically:

1. Go to [Releases](https://github.com/CharlesWiltgen/TagLib-Wasm/releases)
2. Click "Draft a new release"
3. Select the tag you created
4. Add release notes

## Troubleshooting

### Tests Failing

- Fix formatting with `npx vp fmt` and verify with `npx vp fmt --check`
- Fix any linting errors with `npx vp lint --type-aware`
- Ensure all tests pass locally (`npx vp test`) before releasing

### Version Mismatch

- Ensure both `package.json` and `src/version.ts` have the same version
- Use the release script which handles this automatically

### Publish Workflow Fails

- Check the workflow logs for specific errors
- Common issues:
  - Invalid NPM token
  - Network issues

### Tag Already Exists

- Delete the local tag: `git tag -d vX.Y.Z`
- Delete the remote tag: `git push origin :refs/tags/vX.Y.Z`
- Start the release process again

## Best Practices

1. **Always use the release script** - It enforces all checks
2. **Release from main branch** - Ensures consistency
3. **Run tests before tagging** - Prevents broken releases
4. **Monitor the publish workflow** - Catch issues early
5. **Test the published package** - Verify it works for users
