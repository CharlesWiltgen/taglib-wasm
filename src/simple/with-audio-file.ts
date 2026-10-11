import type { AudioFile } from "../taglib/audio-file-interface.ts";
import type { AudioFileInput, OpenOptions } from "../types.ts";
import { FileOperationError, InvalidFormatError } from "../errors.ts";
import { readFileData } from "../utils/file.ts";
import { getTagLib } from "./config.ts";

export async function withAudioFile<T>(
  file: AudioFileInput,
  fn: (audioFile: AudioFile) => T | Promise<T>,
  options?: OpenOptions,
): Promise<T> {
  const taglib = await getTagLib();
  const audioFile = await taglib.open(file, options);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }
    return await fn(audioFile);
  } finally {
    audioFile.dispose();
  }
}

export async function withAudioFileSave(
  file: AudioFileInput,
  fn: (audioFile: AudioFile) => void,
): Promise<Uint8Array> {
  // A path is an input here, never a write target (taglib-chrs): these writers
  // promise the modified buffer and nothing else, while a path-mode handle
  // makes save() reach writeTagsToWasmPath and rewrite the caller's file. The
  // disk surfaces are applyTagsToFile and the batch writers.
  const input = typeof file === "string" ? await readFileData(file) : file;
  return withAudioFile(
    input,
    (audioFile) => {
      fn(audioFile);
      if (!audioFile.save()) {
        throw new FileOperationError(
          "save",
          "Failed to save metadata changes. The file may be read-only or corrupted.",
        );
      }
      return audioFile.getFileBuffer();
    },
    { partial: false },
  );
}

export async function withAudioFileSaveToFile(
  file: string,
  fn: (audioFile: AudioFile) => void,
): Promise<void> {
  return withAudioFile(file, async (audioFile) => {
    fn(audioFile);
    await audioFile.saveToFile(file);
  });
}
