# Installation

## Package Managers

::: code-tabs @tab Deno

From JSR (recommended):

```typescript
import { TagLib } from "@charlesw/taglib-wasm";
```

From NPM:

```typescript
import { TagLib } from "npm:taglib-wasm";
```

@tab Node.js

```bash
npm install taglib-wasm
```

**Requirements:** Node.js v22.6.0 or higher

#### TypeScript Usage

```typescript
// Option 1: Node's experimental TypeScript support (v22.6.0+)
node --experimental-strip-types your-script.ts

// Option 2: TypeScript loader (recommended)
npm install --save-dev tsx
npx tsx your-script.ts
```

#### JavaScript Usage

```javascript
// The NPM package includes pre-compiled JavaScript
import { TagLib } from "taglib-wasm";
import { applyTags, readTags } from "taglib-wasm/simple";

// Works the same as TypeScript
const taglib = await TagLib.initialize();
const tags = await readTags("song.mp3");
```

@tab Bun

```bash
bun add taglib-wasm
```

@tab Browsers

```html
<!-- Use a bundler like Vite, Webpack, or Parcel -->
<script type="module">
  import { TagLib } from "taglib-wasm";
</script>
```

:::

## Runtime Requirements

### Memory Requirements

TagLib-Wasm requires WebAssembly support with sufficient memory:

- **Default**: 16MB initial, 256MB maximum
- **Cloudflare Workers**: 8MB recommended initial size
- **Large files**: May need increased maximum memory

### Browser Compatibility

Requires modern browser with:

- WebAssembly support
- ES2020 features
- `async`/`await` support

Tested on:

- Chrome 90+
- Firefox 89+
- Safari 14.1+
- Edge 90+

## TypeScript Configuration

For TypeScript projects, TagLib-Wasm includes complete type definitions:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"]
  }
}
```

## Verification

Verify your installation:

```typescript
import { TagLib } from "taglib-wasm";

const taglib = await TagLib.initialize();
console.log("TagLib-Wasm initialized successfully!");
```

## Next Steps

- Continue to [Quick Start](./quick-start.md) to write your first code
- See [Runtime Compatibility](/Runtime-Compatibility.md) for platform-specific
  details
