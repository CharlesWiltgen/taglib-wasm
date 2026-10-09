import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { TagLib } from "../src/taglib.ts";
import type { TypedAudioProperties } from "../src/types/audio-formats.ts";

// Compile-time: the OPUS branch of TypedAudioProperties carries
// `outputGainDb: number` (required after narrowing, not `number | undefined`).
const _typecheck: TypedAudioProperties<"OPUS">["outputGainDb"] = 0;
void _typecheck;

const OPUS_DIR = join("tests", "test-files", "opus");
const BACKENDS = ["wasi", "emscripten"] as const;

async function audioProps(backend: typeof BACKENDS[number], file: string) {
  const taglib = await TagLib.initialize({ forceWasmType: backend });
  const buffer = new Uint8Array(await readFile(join(OPUS_DIR, file)));
  const f = await taglib.open(buffer);
  try {
    return f.audioProperties() as Record<string, unknown> | undefined;
  } finally {
    f.dispose();
  }
}

for (const backend of BACKENDS) {
  // kiss-snippet-gain.opus is kiss-snippet.opus with the OpusHead output-gain
  // field patched to raw Q7.8 -1280 == -5.0 dB (see make-gain-fixture.py).
  it(`[${backend}] Opus outputGainDb reflects OpusHead gain (-5 dB)`, async () => {
    const p = await audioProps(backend, "kiss-snippet-gain.opus");
    expect(p?.outputGainDb).toStrictEqual(-5);
  });

  // The unmodified snippet has the usual zero gain — proves the field is
  // present and parsed for real-world Opus files, not just patched ones.
  it(`[${backend}] Opus outputGainDb is 0 for a normal Opus file`, async () => {
    const p = await audioProps(backend, "kiss-snippet.opus");
    expect(p?.outputGainDb).toStrictEqual(0);
  });

  // Non-Opus files must not carry the field at all.
  it(`[${backend}] non-Opus file has no outputGainDb`, async () => {
    const taglib = await TagLib.initialize({ forceWasmType: backend });
    const buffer = new Uint8Array(
      await readFile(join("tests", "test-files", "flac", "kiss-snippet.flac")),
    );
    const f = await taglib.open(buffer);
    try {
      const p = f.audioProperties() as Record<string, unknown> | undefined;
      expect("outputGainDb" in (p ?? {})).toStrictEqual(false);
    } finally {
      f.dispose();
    }
  });

  // The field is OpusHead gain — an Ogg-Opus structure. An MP4 carrying an
  // Opus track reports codec "Opus" but has no OpusHead, so the key must stay
  // absent (the Emscripten adapter used to fabricate 0 for any codec=="Opus"
  // file once the MP4 codec enum was mapped; WASI never did).
  it(`[${backend}] MP4 with an Opus track has no outputGainDb`, async () => {
    const taglib = await TagLib.initialize({ forceWasmType: backend });
    const buffer = new Uint8Array(
      await readFile(join("tests", "test-files", "mp4", "opus.m4a")),
    );
    const f = await taglib.open(buffer);
    try {
      const p = f.audioProperties() as Record<string, unknown> | undefined;
      expect(p?.codec).toStrictEqual("Opus");
      expect(p?.containerFormat).toStrictEqual("MP4");
      expect("outputGainDb" in (p ?? {})).toStrictEqual(false);
    } finally {
      f.dispose();
    }
  });
}
