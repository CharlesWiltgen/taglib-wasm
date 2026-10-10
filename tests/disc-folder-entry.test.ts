// Entry contract for the Wasm-free disc-folder subpath (taglib-cd7b): the
// root disc-folder.ts entry must export the pure grammar. The Wasm-free
// property itself is enforced by the CI metafile guard in the bundle job —
// this test defends the export surface.
import { expect, it } from "vite-plus/test";
import { discFolderInfo, groupAlbums } from "../src/disc-folder.ts";

it("disc-folder subpath exports the pure grammar", () => {
  expect(typeof discFolderInfo).toStrictEqual("function");
  expect(typeof groupAlbums).toStrictEqual("function");
  expect(discFolderInfo("CD1")?.number).toStrictEqual(1);
  expect(discFolderInfo("Greatest Hits")).toStrictEqual(undefined);
});
