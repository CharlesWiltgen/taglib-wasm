#!/usr/bin/env -S pnpm exec tsx

/**
 * @fileoverview Synchronize the package version across the repo.
 *
 * Propagates a version to package.json, jsr.json and src/version.ts, and
 * checks that all three agree.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-version.ts patch
 *   pnpm exec tsx scripts/sync-version.ts minor
 *   pnpm exec tsx scripts/sync-version.ts major
 *   pnpm exec tsx scripts/sync-version.ts set 1.2.3
 *   pnpm exec tsx scripts/sync-version.ts check
 */

import { readFile, writeFile } from "node:fs/promises";

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

const PACKAGE_JSON_PATH = "./package.json";
const JSR_MANIFEST_PATH = "./jsr.json";
const VERSION_TS_PATH = "./src/version.ts";

/**
 * Read and parse JSON file
 */
async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

/**
 * Write JSON file with proper formatting
 */
async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2) + "\n";
  await writeFile(path, content);
}

/**
 * Parse semantic version string
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
} {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/);
  if (!match) {
    throw new Error(
      `Invalid version format: ${version}. Expected: major.minor.patch[-prerelease]`,
    );
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Increment version based on type
 */
function incrementVersion(
  version: string,
  type: "major" | "minor" | "patch",
): string {
  const { major, minor, patch } = parseVersion(version);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }
}

/**
 * Check if versions match
 */
async function checkVersions(): Promise<boolean> {
  const packageJson = await readJsonFile<PackageJson>(PACKAGE_JSON_PATH);

  const versionTsVersion = await readVersionTs();

  let jsrVersion: string | null = null;
  try {
    const jsr = await readJsonFile<PackageJson>(JSR_MANIFEST_PATH);
    jsrVersion = jsr.version;
  } catch {
    // jsr.json not found
  }

  const allMatch =
    (!versionTsVersion || versionTsVersion === packageJson.version) &&
    (!jsrVersion || jsrVersion === packageJson.version);

  console.log(`package.json version:           ${packageJson.version}`);
  if (versionTsVersion) {
    console.log(`src/version.ts:                 ${versionTsVersion}`);
  }
  if (jsrVersion) {
    console.log(`jsr.json:                       ${jsrVersion}`);
  }
  console.log(
    `Status: ${allMatch ? "✅ Versions match" : "❌ Versions differ"}`,
  );

  return allMatch;
}

async function updateVersionTs(newVersion: string): Promise<void> {
  const content = `export const VERSION = "${newVersion}";\n`;
  await writeFile(VERSION_TS_PATH, content);
}

async function readVersionTs(): Promise<string | null> {
  try {
    const content = await readFile(VERSION_TS_PATH, "utf8");
    const match = content.match(/^export const VERSION = "(.+)";$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Update the JSR package manifest (jsr.json) when present. The manifest is
 * published verbatim, so its version must match package.json.
 *
 * Replacing the version value in the text beats re-serializing the JSON:
 * JSON.stringify expands the manifest's short arrays (compilerOptions.lib),
 * while the formatter collapses them — so a re-serialized file fails the
 * release's post-bump `vp fmt --check` (it aborted the first 2.3.2 attempt).
 */
async function updateJsrManifest(newVersion: string): Promise<boolean> {
  try {
    const content = await readFile(JSR_MANIFEST_PATH, "utf8");
    const next = content.replace(
      /^(\s*"version":\s*")[^"]*(")/m,
      `$1${newVersion}$2`,
    );
    if (next === content) return false;
    await writeFile(JSR_MANIFEST_PATH, next);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update version in all files
 */
async function updateVersion(newVersion: string): Promise<void> {
  // Validate version format
  parseVersion(newVersion);

  // Read the package manifest for the current version
  const packageJson = await readJsonFile<PackageJson>(PACKAGE_JSON_PATH);

  const oldVersion = packageJson.version;

  // Update versions
  packageJson.version = newVersion;

  // Write JSON files
  await writeJsonFile(PACKAGE_JSON_PATH, packageJson);

  // Update src/version.ts
  await updateVersionTs(newVersion);

  // Update jsr.json (the JSR package manifest)
  const updatedJsr = await updateJsrManifest(newVersion);

  console.log(`✅ Updated version: ${oldVersion} → ${newVersion}`);
  console.log(`   Updated: package.json`);
  console.log(`   Updated: src/version.ts`);
  if (updatedJsr) console.log(`   Updated: jsr.json`);
}

/**
 * Main function
 */
async function main() {
  const [command, arg] = process.argv.slice(2);

  if (!command) {
    console.error("Usage: sync-version.ts <command> [argument]");
    console.error("Commands:");
    console.error("  patch     - Increment patch version (0.0.x)");
    console.error("  minor     - Increment minor version (0.x.0)");
    console.error("  major     - Increment major version (x.0.0)");
    console.error("  set <ver> - Set specific version");
    console.error("  check     - Check if versions match");
    process.exit(1);
  }

  try {
    switch (command) {
      case "check": {
        const match = await checkVersions();
        process.exit(match ? 0 : 1);
        break;
      }

      case "patch":
      case "minor":
      case "major": {
        const packageJson = await readJsonFile<PackageJson>(PACKAGE_JSON_PATH);
        const newVersion = incrementVersion(packageJson.version, command);
        await updateVersion(newVersion);
        break;
      }

      case "set": {
        if (!arg) {
          console.error("Error: Version number required for 'set' command");
          console.error("Usage: sync-version.ts set <version>");
          process.exit(1);
        }
        await updateVersion(arg);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

await main();
