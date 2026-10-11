// Writes the BWF test fixtures using taglib-wasm's OWN write path (WASI backend)
// for the v2 bext chunk + iXML. Invoked by make-bwf-fixtures.sh --regen.
// Args: <wavSrc> <flacSrc> <wavOut> <flacOut>
import { readFile, writeFile } from "node:fs/promises";
import { TagLib } from "../../../src/taglib.ts";

const [wavSrc, flacSrc, wavOut, flacOut] = process.argv.slice(2);
if (!wavSrc || !flacSrc || !wavOut || !flacOut) {
  console.error(
    "usage: pnpm exec tsx tests/test-files/_gen/make-bwf-fixtures.ts <wavSrc> <flacSrc> <wavOut> <flacOut>",
  );
  process.exit(1);
}
const taglib = await TagLib.initialize({ forceWasmType: "wasi" });

const bext = {
  description: "Test BWF",
  originator: "taglib-wasm",
  originatorReference: "REF-001",
  originationDate: "2026-05-12",
  originationTime: "12:00:00",
  timeReferenceSamples: 0n,
  version: 2,
  umid: "00".repeat(64),
  loudnessValueDb: -14,
  loudnessRangeDb: 7,
  maxTruePeakLevelDbtp: -1,
  maxMomentaryLoudnessDb: -12,
  maxShortTermLoudnessDb: -13,
  codingHistory: "A=PCM,F=44100,W=16,M=mono\r\n",
};
const ixml =
  "<BWFXML><IXML_VERSION>2.10</IXML_VERSION><PROJECT>taglib-wasm</PROJECT></BWFXML>";

for (const [src, dst] of [
  [wavSrc, wavOut],
  [flacSrc, flacOut],
] as const) {
  const f = await taglib.open(await readFile(src));
  f.setBext(bext);
  f.setIxml(ixml);
  f.save();
  await writeFile(dst, f.getFileBuffer());
  f.dispose();
}
console.log("Wrote", wavOut, "and", flacOut);
