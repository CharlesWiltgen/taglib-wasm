# taglib-wasm-ts

TagLib compiled to WebAssembly with TypeScript bindings for universal audio
metadata handling.

## 🎯 Features

- **Universal compatibility** - Works in browsers, Node.js, and Deno
- **Full TagLib support** - All audio formats supported by TagLib v2.1
- **TypeScript first** - Complete type definitions and modern API
- **Zero dependencies** - Self-contained WASM bundle
- **Memory efficient** - Optimized for web usage

## 📦 Installation

```bash
npm install taglib-wasm-ts

🚀 Quick Start

import { TagLib } from 'taglib-wasm-ts';

const taglib = await TagLib.initialize();
const file = await taglib.openFile(audioBuffer);

// Read metadata
const tags = file.audioProperties();
console.log(`Title: ${tags.title}`);
console.log(`Artist: ${tags.artist}`);

// Write metadata
file.setTitle("New Title");
file.setArtist("New Artist");
file.save();

🏗️ Development Status

🚧 Work in Progress - This project is in active development.

- Repository structure
- TagLib v2.1 integration
- WASM compilation setup
- TypeScript wrapper API
- Browser/Node.js/Deno examples
- Test suite
- Documentation

📋 Supported Formats

- MP3 (ID3v1, ID3v2)
- MP4/M4A (iTunes-style atoms)
- FLAC (Vorbis comments)
- Ogg Vorbis
- Opus
- And more...

🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.

📄 License

MIT License - see LICENSE for details.

TagLib is licensed under LGPL/MPL - see lib/taglib/COPYING.LGPL for details.
