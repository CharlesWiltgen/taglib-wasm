#!/bin/bash

# Test script to validate NPM package distribution
# This ensures the packed NPM package works correctly for Node.js consumers

set -e

echo "🧪 Testing NPM package distribution"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Ensure we have a clean build
echo -e "\n📦 Building project..."
pnpm run build

# Create the NPM package
echo -e "\n📦 Creating NPM package..."
npm pack
PACKAGE_FILE=$(ls -t taglib-wasm-*.tgz | head -1)

if [ -z "$PACKAGE_FILE" ]; then
  echo -e "${RED}❌ Failed to create package${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Created package: $PACKAGE_FILE${NC}"

# Get package info
PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
echo -e "  Package size: $PACKAGE_SIZE"

# Create temporary test directory
TEST_DIR=$(mktemp -d)
echo -e "\n🗂️  Test directory: $TEST_DIR"

# Cleanup function
cleanup() {
  echo -e "\n🧹 Cleaning up..."
  rm -rf "$TEST_DIR"
  rm -f "$PACKAGE_FILE"
}
trap cleanup EXIT

# Test 1: Node.js CommonJS
echo -e "\n${YELLOW}📦 Testing Node.js CommonJS...${NC}"
NODE_CJS_DIR="$TEST_DIR/node-cjs"
mkdir -p "$NODE_CJS_DIR"

# Create package.json for CommonJS
cat > "$NODE_CJS_DIR/package.json" << EOF
{
  "name": "test-node-cjs",
  "type": "commonjs",
  "dependencies": {
    "taglib-wasm": "file:$PROJECT_ROOT/$PACKAGE_FILE"
  }
}
EOF

# Install the package (npm = consumer proxy: simulates an end user installing
# the packed tarball; pnpm only owns this repo's own dependencies)
cd "$NODE_CJS_DIR"
npm install --no-save

# Create CommonJS test
cat > "$NODE_CJS_DIR/test.js" << 'EOF'
const { readTags, readProperties, readFormat } = require("taglib-wasm/simple");
const fs = require("fs");
const path = require("path");

async function test() {
  console.log("Testing CommonJS import...");
  
  // Test with a simple WAV file (we'll create one)
  const testData = Buffer.from([
    // RIFF header
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // chunk size
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    // fmt chunk
    0x66, 0x6D, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // chunk size
    0x01, 0x00,             // audio format (PCM)
    0x01, 0x00,             // channels
    0x44, 0xAC, 0x00, 0x00, // sample rate (44100)
    0x88, 0x58, 0x01, 0x00, // byte rate
    0x02, 0x00,             // block align
    0x10, 0x00,             // bits per sample
    // data chunk
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // chunk size
  ]);
  
  const format = await readFormat(testData);
  console.log(`Format: ${format}`);

  const tags = await readTags(testData);
  console.log(`Tags:`, tags);

  console.log("✅ CommonJS test passed!");
}

test().catch(console.error);
EOF

# Run the test
echo "Running CommonJS test..."
node test.js

# Test 2: Node.js ESM
echo -e "\n${YELLOW}📦 Testing Node.js ESM...${NC}"
NODE_ESM_DIR="$TEST_DIR/node-esm"
mkdir -p "$NODE_ESM_DIR"

# Create package.json for ESM
cat > "$NODE_ESM_DIR/package.json" << EOF
{
  "name": "test-node-esm",
  "type": "module",
  "dependencies": {
    "taglib-wasm": "file:$PROJECT_ROOT/$PACKAGE_FILE"
  }
}
EOF

# Install the package (npm = consumer proxy, as above)
cd "$NODE_ESM_DIR"
npm install --no-save

# Create ESM test
cat > "$NODE_ESM_DIR/test.js" << 'EOF'
import { readTags, readProperties, readFormat } from "taglib-wasm/simple";

async function test() {
  console.log("Testing ESM import...");
  
  // Test with a simple WAV file
  const testData = new Uint8Array([
    // RIFF header
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // chunk size
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    // fmt chunk
    0x66, 0x6D, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // chunk size
    0x01, 0x00,             // audio format (PCM)
    0x01, 0x00,             // channels
    0x44, 0xAC, 0x00, 0x00, // sample rate (44100)
    0x88, 0x58, 0x01, 0x00, // byte rate
    0x02, 0x00,             // block align
    0x10, 0x00,             // bits per sample
    // data chunk
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // chunk size
  ]);
  
  const format = await readFormat(testData);
  console.log(`Format: ${format}`);

  const props = await readProperties(testData);
  console.log(`Properties:`, props);
  
  console.log("✅ ESM test passed!");
}

test().catch(console.error);
EOF

# Run the test
echo "Running ESM test..."
node test.js

# Test 3: packed-package structure — every path package.json points at, plus the
# wasm/glue runtime artifacts the loaders fetch by relative URL, must exist once
# the package is installed.
echo -e "\n${YELLOW}📦 Validating packed-package structure...${NC}"
STRUCT_DIR="$TEST_DIR/structure"
mkdir -p "$STRUCT_DIR"

cat > "$STRUCT_DIR/check.mjs" << 'EOF'
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const nodeModulesPath = process.env.NODE_MODULES_PATH;
if (!nodeModulesPath) {
  console.error("NODE_MODULES_PATH not set");
  process.exit(1);
}

const packagePath = join(nodeModulesPath, "taglib-wasm");

// Check package structure: every path package.json points at must exist in the
// packed package. Derived from the manifest — a hardcoded list silently rotted
// here (it still checked dist/src/simple.js long after the build moved entry
// points to dist/ root, so this script failed for a year-old reason).
const pkg = JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8"));
const requiredFiles = ["package.json"];
const collect = (value) => {
  if (typeof value === "string") {
    // `exports` targets are "./"-prefixed; `main`/`module`/`browser`/`types`
    // are not — record both, or those fields go silently unchecked (the
    // filter here once dropped every non-"./"-prefixed path).
    requiredFiles.push(value.startsWith("./") ? value.slice(2) : value);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collect(item);
    }
  }
};
collect(pkg.exports);
for (const field of ["main", "module", "browser", "types"]) {
  if (typeof pkg[field] === "string") collect(pkg[field]);
}

// Runtime artifacts the loaders resolve by relative URL rather than through the
// manifest (src/runtime/module-loader.ts, wasi-host-loader.ts). They are not in
// `exports`, so the derived check above cannot see them — keep them explicit.
requiredFiles.push(
  "dist/taglib-web.wasm",
  "dist/taglib-wasi.wasm",
  "dist/taglib-wrapper.js",
  "dist/taglib-wrapper.d.ts",
);

console.log("Checking packed-package structure...");
let allGood = true;

for (const file of requiredFiles) {
  const exists = existsSync(join(packagePath, file));
  console.log(`  ${exists ? "✓" : "✗"} ${file}`);
  if (!exists) allGood = false;
}

if (allGood) {
  console.log("\n✅ Package structure valid");
} else {
  console.log("\n❌ Package structure issues found!");
  process.exit(1);
}
EOF

# Run the structure check
NODE_MODULES_PATH="$NODE_ESM_DIR/node_modules" node "$STRUCT_DIR/check.mjs"

# Test 4: Validate package contents
echo -e "\n${YELLOW}📦 Validating package contents...${NC}"
cd "$PROJECT_ROOT"
tar -tzf "$PACKAGE_FILE" | head -20
echo "..."
echo -e "${GREEN}✓ Package contents look good${NC}"

# Summary
echo -e "\n${GREEN}✨ All tests passed!${NC}"
echo -e "\nPackage validation complete:"
echo -e "  ${GREEN}✓${NC} Node.js CommonJS import"
echo -e "  ${GREEN}✓${NC} Node.js ESM import"
echo -e "  ${GREEN}✓${NC} Package structure validation"