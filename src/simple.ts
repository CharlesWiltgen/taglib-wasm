/**
 * @fileoverview Simplified API for taglib-wasm matching go-taglib's interface
 *
 * This module provides a dead-simple API for reading and writing audio metadata,
 * inspired by go-taglib's excellent developer experience.
 *
 * @example
 * ```typescript
 * import { readTags, applyTags, updateTags, readProperties } from "taglib-wasm/simple";
 *
 * // Read tags
 * const tags = await readTags("song.mp3");
 * console.log(tags.album);
 *
 * // Apply tags (returns modified buffer)
 * const modifiedBuffer = await applyTags("song.mp3", {
 *   album: "New Album",
 *   artist: "New Artist"
 * });
 *
 * // Update tags on disk
 * await updateTags("song.mp3", {
 *   album: "New Album",
 *   artist: "New Artist"
 * });
 *
 * // Read audio properties
 * const props = await readProperties("song.mp3");
 * console.log(`Duration: ${props.length}s, Bitrate: ${props.bitrate}kbps`);
 * ```
 */

import type { TagLib } from "./taglib.ts";
import type { AudioProperties, Picture, Tag } from "./types.ts";
import { PictureType } from "./types.ts";
import {
  FileOperationError,
  InvalidFormatError,
  MetadataError,
} from "./errors.ts";
import type { readFileData } from "./utils/file.ts";
import { writeFileData } from "./utils/write.ts";
import { getGlobalWorkerPool, type TagLibWorkerPool } from "./worker-pool.ts";

// Cached TagLib instance for auto-initialization
let cachedTagLib: TagLib | null = null;

// Worker pool mode flag
let useWorkerPool = false;
let workerPoolInstance: TagLibWorkerPool | null = null;

/**
 * Enable or disable worker pool mode for Simple API operations.
 * When enabled, operations will be processed in parallel using Web Workers.
 *
 * @param enabled - Whether to enable worker pool mode
 * @param pool - Optional worker pool instance to use (creates global pool if not provided)
 *
 * @example
 * ```typescript
 * // Enable worker pool with default settings
 * setWorkerPoolMode(true);
 *
 * // Enable with custom pool
 * const pool = new TagLibWorkerPool({ size: 8 });
 * setWorkerPoolMode(true, pool);
 * ```
 */
export function setWorkerPoolMode(
  enabled: boolean,
  pool?: TagLibWorkerPool,
): void {
  useWorkerPool = enabled;
  if (enabled && pool) {
    workerPoolInstance = pool;
  } else if (enabled && !workerPoolInstance) {
    workerPoolInstance = getGlobalWorkerPool();
  }
}

/**
 * Get or create a TagLib instance with auto-initialization.
 * Uses a cached instance for performance.
 *
 * @internal
 * @returns Promise resolving to TagLib instance
 */
async function getTagLib(): Promise<TagLib> {
  if (!cachedTagLib) {
    // Use the NPM version for compatibility
    const { TagLib } = await import("./taglib.ts");
    cachedTagLib = await TagLib.initialize();
  }
  return cachedTagLib as TagLib;
}

/**
 * Read metadata tags from an audio file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Object containing all metadata tags
 *
 * @example
 * ```typescript
 * const tags = await readTags("song.mp3");
 * console.log(tags.title, tags.artist, tags.album);
 * ```
 */
export async function readTags(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<Tag> {
  // Use worker pool if enabled and file is string or Uint8Array
  if (
    useWorkerPool && workerPoolInstance &&
    (typeof file === "string" || file instanceof Uint8Array)
  ) {
    return workerPoolInstance.readTags(file);
  }

  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    return audioFile.tag();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Apply metadata tags to an audio file and return the modified buffer
 *
 * This function loads the file, applies the tag changes, and returns
 * the modified file as a buffer. The original file is not modified.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @param tags - Object containing tags to apply (undefined values are ignored)
 * @param options - Write options (currently unused, for go-taglib compatibility)
 * @returns Modified file buffer with new tags applied
 *
 * @example
 * ```typescript
 * const modifiedBuffer = await applyTags("song.mp3", {
 *   title: "New Title",
 *   artist: "New Artist",
 *   album: "New Album",
 *   year: 2025
 * });
 * // Save modifiedBuffer to file or use as needed
 * ```
 */
export async function applyTags(
  file: string | Uint8Array | ArrayBuffer | File,
  tags: Partial<Tag>,
  options?: number,
): Promise<Uint8Array> {
  // Use worker pool if enabled and file is string or Uint8Array
  if (
    useWorkerPool && workerPoolInstance &&
    (typeof file === "string" || file instanceof Uint8Array)
  ) {
    return workerPoolInstance.applyTags(file, tags);
  }

  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    // Get the tag object and write each tag if defined
    const tag = audioFile.tag();
    if (tags.title !== undefined) tag.setTitle(tags.title);
    if (tags.artist !== undefined) tag.setArtist(tags.artist);
    if (tags.album !== undefined) tag.setAlbum(tags.album);
    if (tags.comment !== undefined) tag.setComment(tags.comment);
    if (tags.genre !== undefined) tag.setGenre(tags.genre);
    if (tags.year !== undefined) tag.setYear(tags.year);
    if (tags.track !== undefined) tag.setTrack(tags.track);

    // Save changes to in-memory buffer
    if (!audioFile.save()) {
      throw new FileOperationError(
        "save",
        "Failed to save metadata changes. The file may be read-only or corrupted.",
      );
    }

    // Get the modified buffer after saving
    return audioFile.getFileBuffer();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Update metadata tags in an audio file and save to disk
 *
 * This function modifies the file on disk by applying the specified tags
 * and writing the changes back to the original file path.
 *
 * @param file - File path as a string (required for disk operations)
 * @param tags - Object containing tags to write (undefined values are ignored)
 * @param options - Write options (currently unused, for go-taglib compatibility)
 * @throws {InvalidInputError} If file is not a string
 * @throws {FileOperationError} If file write fails
 * @returns Promise that resolves when the file has been updated on disk
 *
 * @example
 * ```typescript
 * // Update tags and save to disk
 * await updateTags("song.mp3", {
 *   title: "New Title",
 *   artist: "New Artist"
 * });
 * // File on disk now has updated tags
 * ```
 *
 * @see applyTags - For getting a modified buffer without writing to disk
 */
export async function updateTags(
  file: string,
  tags: Partial<Tag>,
  options?: number,
): Promise<void> {
  if (typeof file !== "string") {
    throw new Error("updateTags requires a file path string to save changes");
  }

  // Use worker pool if enabled
  if (useWorkerPool && workerPoolInstance) {
    return workerPoolInstance.updateTags(file, tags);
  }

  // Get the modified buffer
  const modifiedBuffer = await applyTags(file, tags, options);

  // Write the buffer back to the file
  await writeFileData(file, modifiedBuffer);
}

/**
 * Read audio properties from a file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Audio properties including duration, bitrate, sample rate, etc.
 *
 * @example
 * ```typescript
 * const props = await readProperties("song.mp3");
 * console.log(`Duration: ${props.length} seconds`);
 * console.log(`Bitrate: ${props.bitrate} kbps`);
 * console.log(`Sample rate: ${props.sampleRate} Hz`);
 * ```
 */
export async function readProperties(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<AudioProperties> {
  // Use worker pool if enabled and file is string or Uint8Array
  if (
    useWorkerPool && workerPoolInstance &&
    (typeof file === "string" || file instanceof Uint8Array)
  ) {
    const props = await workerPoolInstance.readProperties(file);
    if (!props) {
      throw new MetadataError(
        "read",
        "File may not contain valid audio data",
        "audioProperties",
      );
    }
    return props;
  }

  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    const props = audioFile.audioProperties();
    if (!props) {
      throw new MetadataError(
        "read",
        "File may not contain valid audio data",
        "audioProperties",
      );
    }
    return props;
  } finally {
    audioFile.dispose();
  }
}

/**
 * Tag field constants for go-taglib compatibility.
 * These match the constants used in go-taglib for consistent API.
 *
 * @example
 * ```typescript
 * import { Title, Artist, Album } from "taglib-wasm/simple";
 *
 * const tags = await readTags("song.mp3");
 * console.log(tags[Title]);  // Same as tags.title
 * console.log(tags[Artist]); // Same as tags.artist
 * ```
 */
export const Title = "title";
export const Artist = "artist";
export const Album = "album";
export const Comment = "comment";
export const Genre = "genre";
export const Year = "year";
export const Track = "track";
export const AlbumArtist = "albumartist";
export const Composer = "composer";
export const DiscNumber = "discnumber";

// Additional convenience functions

/**
 * Check if a file is a valid audio file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns true if the file is a valid audio file
 *
 * @example
 * ```typescript
 * if (await isValidAudioFile("maybe-audio.bin")) {
 *   const tags = await readTags("maybe-audio.bin");
 * }
 * ```
 */
export async function isValidAudioFile(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<boolean> {
  try {
    const taglib = await getTagLib();
    const audioFile = await taglib.open(file);
    const valid = audioFile.isValid();
    audioFile.dispose();

    return valid;
  } catch {
    return false;
  }
}

/**
 * Get the audio format of a file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Audio format string (e.g., "MP3", "FLAC", "OGG") or undefined
 *
 * @example
 * ```typescript
 * const format = await getFormat("song.mp3");
 * console.log(`File format: ${format}`); // "MP3"
 * ```
 */
export async function getFormat(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<string | undefined> {
  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      return undefined;
    }

    return audioFile.getFormat();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Clear all tags from a file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Modified file buffer with tags removed
 *
 * @example
 * ```typescript
 * const cleanBuffer = await clearTags("song.mp3");
 * // Save cleanBuffer to remove all metadata
 * ```
 */
export async function clearTags(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<Uint8Array> {
  return applyTags(file, {
    title: "",
    artist: "",
    album: "",
    comment: "",
    genre: "",
    year: 0,
    track: 0,
  });
}

/**
 * Read cover art/pictures from an audio file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Array of Picture objects containing cover art
 *
 * @example
 * ```typescript
 * const pictures = await readPictures("song.mp3");
 * for (const pic of pictures) {
 *   console.log(`Type: ${pic.type}, MIME: ${pic.mimeType}, Size: ${pic.data.length}`);
 * }
 * ```
 */
export async function readPictures(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<Picture[]> {
  // Use worker pool if enabled and file is string or Uint8Array
  if (
    useWorkerPool && workerPoolInstance &&
    (typeof file === "string" || file instanceof Uint8Array)
  ) {
    return workerPoolInstance.readPictures(file);
  }

  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    return audioFile.getPictures();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Apply pictures/cover art to an audio file and return the modified buffer
 *
 * This function loads the file, replaces all existing pictures with the new ones,
 * and returns the modified file as a buffer. The original file is not modified.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @param pictures - Array of Picture objects to set (replaces all existing)
 * @returns Modified file buffer with new pictures applied
 *
 * @example
 * ```typescript
 * const coverArt = {
 *   mimeType: "image/jpeg",
 *   data: jpegData, // Uint8Array
 *   type: PictureType.FrontCover,
 *   description: "Album cover"
 * };
 * const modifiedBuffer = await applyPictures("song.mp3", [coverArt]);
 * ```
 */
export async function applyPictures(
  file: string | Uint8Array | ArrayBuffer | File,
  pictures: Picture[],
): Promise<Uint8Array> {
  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    // Set the pictures
    audioFile.setPictures(pictures);

    // Save changes to in-memory buffer
    if (!audioFile.save()) {
      throw new FileOperationError(
        "save",
        "Failed to save picture changes. The file may be read-only or corrupted.",
      );
    }

    // Get the modified buffer after saving
    return audioFile.getFileBuffer();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Add a single picture to an audio file and return the modified buffer
 *
 * This function loads the file, adds the picture to existing ones,
 * and returns the modified file as a buffer. The original file is not modified.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @param picture - Picture object to add
 * @returns Modified file buffer with picture added
 *
 * @example
 * ```typescript
 * const backCover = {
 *   mimeType: "image/png",
 *   data: pngData, // Uint8Array
 *   type: PictureType.BackCover,
 *   description: "Back cover"
 * };
 * const modifiedBuffer = await addPicture("song.mp3", backCover);
 * ```
 */
export async function addPicture(
  file: string | Uint8Array | ArrayBuffer | File,
  picture: Picture,
): Promise<Uint8Array> {
  const taglib = await getTagLib();
  const audioFile = await taglib.open(file);
  try {
    if (!audioFile.isValid()) {
      throw new InvalidFormatError(
        "File may be corrupted or in an unsupported format",
      );
    }

    // Add the picture
    audioFile.addPicture(picture);

    // Save changes to in-memory buffer
    if (!audioFile.save()) {
      throw new FileOperationError(
        "save",
        "Failed to save picture changes. The file may be read-only or corrupted.",
      );
    }

    // Get the modified buffer after saving
    return audioFile.getFileBuffer();
  } finally {
    audioFile.dispose();
  }
}

/**
 * Clear all pictures from a file
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Modified file buffer with pictures removed
 *
 * @example
 * ```typescript
 * const cleanBuffer = await clearPictures("song.mp3");
 * // Save cleanBuffer to remove all cover art
 * ```
 */
export async function clearPictures(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<Uint8Array> {
  return applyPictures(file, []);
}

/**
 * Get the primary cover art from an audio file
 *
 * Returns the front cover if available, otherwise the first picture found.
 * Returns null if no pictures are present.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Primary cover art data or null
 *
 * @example
 * ```typescript
 * const coverArt = await getCoverArt("song.mp3");
 * if (coverArt) {
 *   console.log(`Cover art size: ${coverArt.length} bytes`);
 * }
 * ```
 */
export async function getCoverArt(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<Uint8Array | null> {
  const pictures = await readPictures(file);
  if (pictures.length === 0) {
    return null;
  }

  // Try to find front cover first
  const frontCover = pictures.find((pic) =>
    pic.type === PictureType.FrontCover
  );
  if (frontCover) {
    return frontCover.data;
  }

  // Return first picture if no front cover
  return pictures[0].data;
}

/**
 * Set the primary cover art for an audio file
 *
 * Replaces all existing pictures with a single front cover image.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @param imageData - Image data as Uint8Array
 * @param mimeType - MIME type of the image (e.g., "image/jpeg", "image/png")
 * @returns Modified file buffer with cover art set
 *
 * @example
 * ```typescript
 * const jpegData = await Deno.readFile("cover.jpg");
 * const modifiedBuffer = await setCoverArt("song.mp3", jpegData, "image/jpeg");
 * ```
 */
export async function setCoverArt(
  file: string | Uint8Array | ArrayBuffer | File,
  imageData: Uint8Array,
  mimeType: string,
): Promise<Uint8Array> {
  // Use worker pool if enabled and file is string or Uint8Array
  if (
    useWorkerPool && workerPoolInstance &&
    (typeof file === "string" || file instanceof Uint8Array)
  ) {
    return workerPoolInstance.setCoverArt(file, imageData, mimeType);
  }

  const picture: Picture = {
    mimeType,
    data: imageData,
    type: PictureType.FrontCover,
    description: "Front Cover",
  };
  return applyPictures(file, [picture]);
}

/**
 * Find a picture by its type
 *
 * @param pictures - Array of pictures to search
 * @param type - Picture type to find
 * @returns Picture matching the type or null
 *
 * @example
 * ```typescript
 * const pictures = await readPictures("song.mp3");
 * const backCover = findPictureByType(pictures, PictureType.BackCover);
 * if (backCover) {
 *   console.log("Found back cover art");
 * }
 * ```
 */
export function findPictureByType(
  pictures: Picture[],
  type: PictureType,
): Picture | null {
  return pictures.find((pic) => pic.type === type) || null;
}

/**
 * Replace or add a picture of a specific type
 *
 * If a picture of the given type already exists, it will be replaced.
 * Otherwise, the new picture will be added to the existing ones.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @param newPicture - Picture to add or replace
 * @returns Modified file buffer with picture updated
 *
 * @example
 * ```typescript
 * const backCover: Picture = {
 *   mimeType: "image/png",
 *   data: pngData,
 *   type: PictureType.BackCover,
 *   description: "Back cover"
 * };
 * const modifiedBuffer = await replacePictureByType("song.mp3", backCover);
 * ```
 */
export async function replacePictureByType(
  file: string | Uint8Array | ArrayBuffer | File,
  newPicture: Picture,
): Promise<Uint8Array> {
  const pictures = await readPictures(file);

  // Remove any existing picture of the same type
  const filteredPictures = pictures.filter((pic) =>
    pic.type !== newPicture.type
  );

  // Add the new picture
  filteredPictures.push(newPicture);

  return applyPictures(file, filteredPictures);
}

/**
 * Get picture metadata without the actual image data
 *
 * Useful for checking what pictures are present without loading
 * potentially large image data into memory.
 *
 * @param file - File path, Uint8Array buffer, ArrayBuffer, or File object
 * @returns Array of picture metadata (type, mimeType, description, size)
 *
 * @example
 * ```typescript
 * const metadata = await getPictureMetadata("song.mp3");
 * for (const info of metadata) {
 *   console.log(`${info.description}: ${info.mimeType}, ${info.size} bytes`);
 * }
 * ```
 */
export async function getPictureMetadata(
  file: string | Uint8Array | ArrayBuffer | File,
): Promise<
  Array<{
    type: PictureType;
    mimeType: string;
    description?: string;
    size: number;
  }>
> {
  const pictures = await readPictures(file);
  return pictures.map((pic) => ({
    type: pic.type,
    mimeType: pic.mimeType,
    description: pic.description,
    size: pic.data.length,
  }));
}

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /** Number of files to process concurrently (default: 4) */
  concurrency?: number;
  /** Continue processing on errors (default: true) */
  continueOnError?: boolean;
  /** Progress callback */
  onProgress?: (processed: number, total: number, currentFile: string) => void;
}

/**
 * Result from a batch operation
 */
export interface BatchResult<T> {
  /** Successful results */
  results: Array<{ file: string; data: T }>;
  /** Errors encountered */
  errors: Array<{ file: string; error: Error }>;
  /** Total processing time in milliseconds */
  duration: number;
}

/**
 * Read tags from multiple files efficiently
 *
 * This method is optimized for batch processing and reuses a single TagLib
 * instance across all files, significantly improving performance compared
 * to calling readTags() multiple times.
 *
 * @param files - Array of file paths or buffers to process
 * @param options - Batch processing options
 * @returns Batch result with tags and any errors
 *
 * @example
 * ```typescript
 * const files = ["song1.mp3", "song2.mp3", "song3.mp3"];
 * const result = await readTagsBatch(files, {
 *   concurrency: 8,
 *   onProgress: (processed, total) => {
 *     console.log(`${processed}/${total} files processed`);
 *   }
 * });
 *
 * for (const { file, data } of result.results) {
 *   console.log(`${file}: ${data.artist} - ${data.title}`);
 * }
 * ```
 */
export async function readTagsBatch(
  files: Array<string | Uint8Array | ArrayBuffer | File>,
  options: BatchOptions = {},
): Promise<BatchResult<Tag>> {
  const startTime = Date.now();
  const {
    concurrency = 4,
    continueOnError = true,
    onProgress,
  } = options;

  const results: Array<{ file: string; data: Tag }> = [];
  const errors: Array<{ file: string; error: Error }> = [];

  // Initialize TagLib once for all operations
  const taglib = await getTagLib();

  let processed = 0;
  const total = files.length;

  // Process files in chunks for memory efficiency
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (file, idx) => {
      const fileIndex = i + idx;
      const fileName = typeof file === "string" ? file : `file-${fileIndex}`;

      try {
        const audioFile = await taglib.open(file);
        try {
          if (!audioFile.isValid()) {
            throw new InvalidFormatError(
              "File may be corrupted or in an unsupported format",
            );
          }
          const tags = audioFile.tag();
          results.push({ file: fileName, data: tags });
        } finally {
          audioFile.dispose();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ file: fileName, error: err });
        if (!continueOnError) {
          throw err;
        }
      }

      processed++;
      onProgress?.(processed, total, fileName);
    });

    await Promise.all(chunkPromises);
  }

  return {
    results,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Read audio properties from multiple files efficiently
 *
 * @param files - Array of file paths or buffers to process
 * @param options - Batch processing options
 * @returns Batch result with audio properties and any errors
 *
 * @example
 * ```typescript
 * const files = ["song1.mp3", "song2.mp3", "song3.mp3"];
 * const result = await readPropertiesBatch(files);
 *
 * for (const { file, data } of result.results) {
 *   console.log(`${file}: ${data.length}s, ${data.bitrate}kbps`);
 * }
 * ```
 */
export async function readPropertiesBatch(
  files: Array<string | Uint8Array | ArrayBuffer | File>,
  options: BatchOptions = {},
): Promise<BatchResult<AudioProperties | null>> {
  const startTime = Date.now();
  const {
    concurrency = 4,
    continueOnError = true,
    onProgress,
  } = options;

  const results: Array<{ file: string; data: AudioProperties | null }> = [];
  const errors: Array<{ file: string; error: Error }> = [];

  // Initialize TagLib once for all operations
  const taglib = await getTagLib();

  let processed = 0;
  const total = files.length;

  // Process files in chunks for memory efficiency
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (file, idx) => {
      const fileIndex = i + idx;
      const fileName = typeof file === "string" ? file : `file-${fileIndex}`;

      try {
        const audioFile = await taglib.open(file);
        try {
          if (!audioFile.isValid()) {
            throw new InvalidFormatError(
              "File may be corrupted or in an unsupported format",
            );
          }
          const properties = audioFile.audioProperties();
          results.push({ file: fileName, data: properties });
        } finally {
          audioFile.dispose();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ file: fileName, error: err });
        if (!continueOnError) {
          throw err;
        }
      }

      processed++;
      onProgress?.(processed, total, fileName);
    });

    await Promise.all(chunkPromises);
  }

  return {
    results,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Read both tags and properties from multiple files efficiently
 *
 * This is the most efficient way to get complete metadata from multiple files,
 * as it reads both tags and properties in a single file open operation.
 *
 * @param files - Array of file paths or buffers to process
 * @param options - Batch processing options
 * @returns Batch result with complete metadata and any errors
 *
 * @example
 * ```typescript
 * const files = ["song1.mp3", "song2.mp3", "song3.mp3"];
 * const result = await readMetadataBatch(files, {
 *   concurrency: 8,
 *   onProgress: (processed, total, file) => {
 *     console.log(`Processing ${file}: ${processed}/${total}`);
 *   }
 * });
 *
 * for (const { file, data } of result.results) {
 *   console.log(`${file}:`);
 *   console.log(`  Artist: ${data.tags.artist}`);
 *   console.log(`  Title: ${data.tags.title}`);
 *   console.log(`  Duration: ${data.properties?.length}s`);
 *   console.log(`  Bitrate: ${data.properties?.bitrate}kbps`);
 *   console.log(`  Has cover art: ${data.hasCoverArt}`);
 *
 *   if (data.dynamics?.replayGainTrackGain) {
 *     console.log(`  ReplayGain: ${data.dynamics.replayGainTrackGain}`);
 *   }
 *   if (data.dynamics?.appleSoundCheck) {
 *     console.log(`  Sound Check: detected`);
 *   }
 * }
 * ```
 */
export async function readMetadataBatch(
  files: Array<string | Uint8Array | ArrayBuffer | File>,
  options: BatchOptions = {},
): Promise<
  BatchResult<{
    tags: Tag;
    properties: AudioProperties | null;
    hasCoverArt: boolean;
    dynamics?: {
      replayGainTrackGain?: string;
      replayGainTrackPeak?: string;
      replayGainAlbumGain?: string;
      replayGainAlbumPeak?: string;
      appleSoundCheck?: string;
    };
  }>
> {
  const startTime = Date.now();
  const {
    concurrency = 4,
    continueOnError = true,
    onProgress,
  } = options;

  const results: Array<{
    file: string;
    data: {
      tags: Tag;
      properties: AudioProperties | null;
      hasCoverArt: boolean;
      dynamics?: {
        replayGainTrackGain?: string;
        replayGainTrackPeak?: string;
        replayGainAlbumGain?: string;
        replayGainAlbumPeak?: string;
        appleSoundCheck?: string;
      };
    };
  }> = [];
  const errors: Array<{ file: string; error: Error }> = [];

  // Initialize TagLib once for all operations
  const taglib = await getTagLib();

  let processed = 0;
  const total = files.length;

  // Process files in chunks for memory efficiency
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (file, idx) => {
      const fileIndex = i + idx;
      const fileName = typeof file === "string" ? file : `file-${fileIndex}`;

      try {
        const audioFile = await taglib.open(file);
        try {
          if (!audioFile.isValid()) {
            throw new InvalidFormatError(
              "File may be corrupted or in an unsupported format",
            );
          }
          const tags = audioFile.tag();
          const properties = audioFile.audioProperties();

          // Check for cover art
          const pictures = audioFile.getPictures();
          const hasCoverArt = pictures.length > 0;

          // Extract dynamics data
          const dynamics: any = {};

          const replayGainTrackGain = audioFile.getProperty(
            "REPLAYGAIN_TRACK_GAIN",
          );
          if (replayGainTrackGain) {
            dynamics.replayGainTrackGain = replayGainTrackGain;
          }

          const replayGainTrackPeak = audioFile.getProperty(
            "REPLAYGAIN_TRACK_PEAK",
          );
          if (replayGainTrackPeak) {
            dynamics.replayGainTrackPeak = replayGainTrackPeak;
          }

          const replayGainAlbumGain = audioFile.getProperty(
            "REPLAYGAIN_ALBUM_GAIN",
          );
          if (replayGainAlbumGain) {
            dynamics.replayGainAlbumGain = replayGainAlbumGain;
          }

          const replayGainAlbumPeak = audioFile.getProperty(
            "REPLAYGAIN_ALBUM_PEAK",
          );
          if (replayGainAlbumPeak) {
            dynamics.replayGainAlbumPeak = replayGainAlbumPeak;
          }

          // Apple Sound Check - check both standard property and MP4-specific atom
          let appleSoundCheck = audioFile.getProperty("ITUNNORM");
          if (!appleSoundCheck && audioFile.isMP4()) {
            appleSoundCheck = audioFile.getMP4Item(
              "----:com.apple.iTunes:iTunNORM",
            );
          }
          if (appleSoundCheck) dynamics.appleSoundCheck = appleSoundCheck;

          results.push({
            file: fileName,
            data: {
              tags,
              properties,
              hasCoverArt,
              dynamics: Object.keys(dynamics).length > 0 ? dynamics : undefined,
            },
          });
        } finally {
          audioFile.dispose();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ file: fileName, error: err });
        if (!continueOnError) {
          throw err;
        }
      }

      processed++;
      onProgress?.(processed, total, fileName);
    });

    await Promise.all(chunkPromises);
  }

  return {
    results,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Re-export commonly used types for convenience.
 * These types define the structure of metadata and audio properties.
 */
export type { AudioProperties, Picture, Tag } from "./types.ts";
export { PictureType } from "./types.ts";
