/**
 * Batch folder operations for taglib-wasm
 * Provides APIs for scanning directories and processing multiple audio files
 */

import { TagLib } from "./taglib.ts";
import { type Tag, updateTags } from "./simple.ts";
import type { AudioProperties } from "./types.ts";
import { getGlobalWorkerPool, type TagLibWorkerPool } from "./worker-pool.ts";

/**
 * Cross-runtime path utilities
 */
function join(...paths: string[]): string {
  // Simple cross-platform path join
  return paths.filter((p) => p).join("/").replace(/\/+/g, "/");
}

function extname(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1 || lastDot === path.length - 1) return "";
  return path.slice(lastDot);
}

/**
 * Metadata for a single audio file including path information
 */
/**
 * Audio dynamics data (ReplayGain and Apple Sound Check)
 */
export interface AudioDynamics {
  /** ReplayGain track gain in dB (e.g., "-6.54 dB") */
  replayGainTrackGain?: string;
  /** ReplayGain track peak value (0.0-1.0) */
  replayGainTrackPeak?: string;
  /** ReplayGain album gain in dB */
  replayGainAlbumGain?: string;
  /** ReplayGain album peak value (0.0-1.0) */
  replayGainAlbumPeak?: string;
  /** Apple Sound Check normalization data (iTunNORM) */
  appleSoundCheck?: string;
}

export interface AudioFileMetadata {
  /** Absolute or relative path to the audio file */
  path: string;
  /** Basic tag information (title, artist, album, etc.) */
  tags: Tag;
  /** Audio properties (duration, bitrate, sample rate, etc.) */
  properties?: AudioProperties;
  /** Whether the file contains embedded cover art */
  hasCoverArt?: boolean;
  /** Audio dynamics data (ReplayGain and Sound Check) */
  dynamics?: AudioDynamics;
  /** Any errors encountered while reading this file */
  error?: Error;
}

/**
 * Options for scanning folders
 */
export interface FolderScanOptions {
  /** Whether to scan subdirectories recursively (default: true) */
  recursive?: boolean;
  /** File extensions to include (default: common audio formats) */
  extensions?: string[];
  /** Maximum number of files to process (default: unlimited) */
  maxFiles?: number;
  /** Progress callback called after each file is processed */
  onProgress?: (processed: number, total: number, currentFile: string) => void;
  /** Whether to include audio properties (default: true) */
  includeProperties?: boolean;
  /** Whether to continue on errors (default: true) */
  continueOnError?: boolean;
  /** Use worker pool for parallel processing (default: true if available) */
  useWorkerPool?: boolean;
  /** Worker pool instance to use (creates one if not provided) */
  workerPool?: TagLibWorkerPool;
}

/**
 * Result of a folder scan operation
 */
export interface FolderScanResult {
  /** Successfully processed files with metadata */
  files: AudioFileMetadata[];
  /** Files that failed to process */
  errors: Array<{ path: string; error: Error }>;
  /** Total number of audio files found */
  totalFound: number;
  /** Total number of files successfully processed */
  totalProcessed: number;
  /** Time taken in milliseconds */
  duration: number;
}

/**
 * Default audio file extensions to scan
 */
const DEFAULT_AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".mp4",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".wav",
  ".wv",
  ".ape",
  ".mpc",
  ".tta",
  ".wma",
];

/**
 * Process a directory entry
 */
async function* processDirectoryEntry(
  path: string,
  entryName: string,
  isDirectory: boolean,
  isFile: boolean,
  options: FolderScanOptions,
): AsyncGenerator<string> {
  const { recursive = true, extensions = DEFAULT_AUDIO_EXTENSIONS } = options;
  const fullPath = join(path, entryName);

  if (isDirectory && recursive) {
    yield* walkDirectory(fullPath, options);
  } else if (isFile) {
    const ext = extname(entryName).toLowerCase();
    if (extensions.includes(ext)) {
      yield fullPath;
    }
  }
}

/**
 * Get directory reader for current runtime
 */
async function getDirectoryReader() {
  if (typeof Deno !== "undefined") {
    return {
      readDir: async function* (path: string) {
        for await (const entry of Deno.readDir(path)) {
          yield {
            name: entry.name,
            isDirectory: entry.isDirectory,
            isFile: entry.isFile,
          };
        }
      },
    };
  }

  // Node.js or Bun runtime
  const isNode = typeof (globalThis as any).process !== "undefined" &&
    (globalThis as any).process.versions?.node;
  const isBun = typeof (globalThis as any).process !== "undefined" &&
    (globalThis as any).process.versions?.bun;

  if (isNode || isBun) {
    const fs = await import("fs/promises");
    return {
      readDir: async function* (path: string) {
        const entries = await fs.readdir(path, { withFileTypes: true });
        for (const entry of entries) {
          yield {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
          };
        }
      },
    };
  }

  throw new Error("Directory scanning not supported in this runtime");
}

/**
 * Cross-runtime directory reading
 */
async function* walkDirectory(
  path: string,
  options: FolderScanOptions = {},
): AsyncGenerator<string> {
  const reader = await getDirectoryReader();

  for await (const entry of reader.readDir(path)) {
    yield* processDirectoryEntry(
      path,
      entry.name,
      entry.isDirectory,
      entry.isFile,
      options,
    );
  }
}

/**
 * Process a batch of files with concurrency control
 */
async function processBatch(
  files: string[],
  processor: (path: string) => Promise<AudioFileMetadata>,
  concurrency: number,
): Promise<AudioFileMetadata[]> {
  const results: AudioFileMetadata[] = [];

  // Process files in chunks of size 'concurrency'
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((file) => processor(file)),
    );
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Extract dynamics data from tags
 */
function extractDynamicsData(tags: any): AudioDynamics | undefined {
  const dynamics: AudioDynamics = {};

  if (tags.REPLAYGAIN_TRACK_GAIN) {
    dynamics.replayGainTrackGain = tags.REPLAYGAIN_TRACK_GAIN;
  }
  if (tags.REPLAYGAIN_TRACK_PEAK) {
    dynamics.replayGainTrackPeak = tags.REPLAYGAIN_TRACK_PEAK;
  }
  if (tags.REPLAYGAIN_ALBUM_GAIN) {
    dynamics.replayGainAlbumGain = tags.REPLAYGAIN_ALBUM_GAIN;
  }
  if (tags.REPLAYGAIN_ALBUM_PEAK) {
    dynamics.replayGainAlbumPeak = tags.REPLAYGAIN_ALBUM_PEAK;
  }
  if (tags.ITUNNORM) {
    dynamics.appleSoundCheck = tags.ITUNNORM;
  }

  return Object.keys(dynamics).length > 0 ? dynamics : undefined;
}

/**
 * Process a single file using worker pool
 */
async function processFileWithWorker(
  filePath: string,
  pool: TagLibWorkerPool,
  includeProperties: boolean,
  onProgress?: (processed: number, total: number, currentFile: string) => void,
  processed?: { count: number },
  totalFound?: number,
): Promise<AudioFileMetadata> {
  const [tags, properties, pictures] = await Promise.all([
    pool.readTags(filePath),
    includeProperties ? pool.readProperties(filePath) : Promise.resolve(null),
    pool.readPictures(filePath),
  ]);

  const hasCoverArt = pictures.length > 0;
  const dynamics = extractDynamicsData(tags);

  if (processed && totalFound) {
    processed.count++;
    onProgress?.(processed.count, totalFound, filePath);
  }

  return {
    path: filePath,
    tags,
    properties: properties ?? undefined,
    hasCoverArt,
    dynamics,
  };
}

/**
 * Process a single file using TagLib directly
 */
async function processFileWithTagLib(
  filePath: string,
  taglib: TagLib,
  includeProperties: boolean,
  onProgress?: (processed: number, total: number, currentFile: string) => void,
  processed?: { count: number },
  totalFound?: number,
): Promise<AudioFileMetadata> {
  const audioFile = await taglib.open(filePath);
  try {
    const tags = audioFile.tag();
    let properties: AudioProperties | undefined;

    if (includeProperties) {
      const props = audioFile.audioProperties();
      if (props) {
        properties = props;
      }
    }

    const pictures = audioFile.getPictures();
    const hasCoverArt = pictures.length > 0;

    // Extract dynamics data
    const dynamics: AudioDynamics = {};
    const fields = [
      { key: "REPLAYGAIN_TRACK_GAIN", prop: "replayGainTrackGain" },
      { key: "REPLAYGAIN_TRACK_PEAK", prop: "replayGainTrackPeak" },
      { key: "REPLAYGAIN_ALBUM_GAIN", prop: "replayGainAlbumGain" },
      { key: "REPLAYGAIN_ALBUM_PEAK", prop: "replayGainAlbumPeak" },
    ];

    for (const { key, prop } of fields) {
      const value = audioFile.getProperty(key);
      if (value) {
        (dynamics as any)[prop] = value;
      }
    }

    // Apple Sound Check - check both standard property and MP4-specific atom
    let appleSoundCheck = audioFile.getProperty("ITUNNORM");
    if (!appleSoundCheck && audioFile.isMP4()) {
      appleSoundCheck = audioFile.getMP4Item("----:com.apple.iTunes:iTunNORM");
    }
    if (appleSoundCheck) dynamics.appleSoundCheck = appleSoundCheck;

    if (processed && totalFound) {
      processed.count++;
      onProgress?.(processed.count, totalFound, filePath);
    }

    return {
      path: filePath,
      tags,
      properties,
      hasCoverArt,
      dynamics: Object.keys(dynamics).length > 0 ? dynamics : undefined,
    };
  } finally {
    audioFile.dispose();
  }
}

/**
 * Scan a folder and read metadata from all audio files
 *
 * @param folderPath - Path to the folder to scan
 * @param options - Scanning options
 * @returns Metadata for all audio files found
 *
 * @example
 * ```typescript
 * // Scan a folder recursively
 * const result = await scanFolder("/path/to/music");
 * console.log(`Found ${result.totalFound} audio files`);
 * console.log(`Successfully processed ${result.totalProcessed} files`);
 *
 * // Process results
 * for (const file of result.files) {
 *   console.log(`${file.path}: ${file.tags.artist} - ${file.tags.title}`);
 * }
 *
 * // Scan with options
 * const result2 = await scanFolder("/path/to/music", {
 *   recursive: false,
 *   extensions: [".mp3", ".flac"],
 *   onProgress: (processed, total, file) => {
 *     console.log(`Processing ${processed}/${total}: ${file}`);
 *   }
 * });
 * ```
 */
export async function scanFolder(
  folderPath: string,
  options: FolderScanOptions = {},
): Promise<FolderScanResult> {
  const startTime = Date.now();
  const {
    maxFiles = Infinity,
    includeProperties = true,
    continueOnError = true,
    useWorkerPool = true,
    workerPool,
    onProgress,
  } = options;

  const files: AudioFileMetadata[] = [];
  const errors: Array<{ path: string; error: Error }> = [];
  const filePaths: string[] = [];

  // Collect all file paths first
  let fileCount = 0;
  for await (const filePath of walkDirectory(folderPath, options)) {
    filePaths.push(filePath);
    fileCount++;
    if (fileCount >= maxFiles) break;
  }

  const totalFound = filePaths.length;
  let processed = 0;

  // Determine if we should use worker pool
  const shouldUseWorkerPool = useWorkerPool &&
    (workerPool ?? typeof Worker !== "undefined");
  let pool: TagLibWorkerPool | null = null;

  if (shouldUseWorkerPool) {
    pool = workerPool ?? getGlobalWorkerPool();
  }

  // Initialize TagLib if not using worker pool
  const taglib = shouldUseWorkerPool ? null : await TagLib.initialize();

  try {
    // Process files based on whether we're using worker pool
    if (pool) {
      // Worker pool processing
      const batchSize = Math.min(50, filePaths.length); // Process in reasonable chunks

      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(
          i,
          Math.min(i + batchSize, filePaths.length),
        );

        // Process batch in parallel using worker pool
        const batchPromises = batch.map(async (filePath) => {
          try {
            // Pre-fetch data to warm up the worker pool
            await Promise.all([
              pool!.readTags(filePath),
              includeProperties
                ? pool!.readProperties(filePath)
                : Promise.resolve(null),
              pool!.readPictures(filePath),
            ]);

            return await processFileWithWorker(
              filePath,
              pool!,
              includeProperties,
              onProgress,
              { count: processed },
              totalFound,
            ).then((result) => {
              processed++;
              return result;
            });
          } catch (error) {
            const err = error instanceof Error
              ? error
              : new Error(String(error));

            if (continueOnError) {
              errors.push({ path: filePath, error: err });
              processed++;
              onProgress?.(processed, totalFound, filePath);
              return { path: filePath, tags: {}, error: err };
            } else {
              throw err;
            }
          }
        });

        const batchResults = await Promise.all(batchPromises);
        files.push(...batchResults.filter((r) => !r.error));
      }
    } else {
      // Original non-worker processing
      const processor = async (
        filePath: string,
      ): Promise<AudioFileMetadata> => {
        try {
          // Open file once and read both tags and properties
          const audioFile = await taglib!.open(filePath);
          try {
            // Pre-read data to ensure file is valid
            audioFile.tag();
            if (includeProperties) {
              audioFile.audioProperties();
            }
            // Check if the file has cover art
            audioFile.getPictures();

            return await processFileWithTagLib(
              filePath,
              taglib!,
              includeProperties,
              onProgress,
              { count: processed },
              totalFound,
            ).then((result) => {
              processed++;
              return result;
            });
          } finally {
            audioFile.dispose();
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));

          if (continueOnError) {
            errors.push({ path: filePath, error: err });
            processed++;
            onProgress?.(processed, totalFound, filePath);
            return { path: filePath, tags: {}, error: err };
          } else {
            throw err;
          }
        }
      };

      // Process in batches with concurrency control
      const concurrency = 4; // Default concurrency for non-worker processing
      const batchSize = concurrency * 10; // Process in chunks
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(
          i,
          Math.min(i + batchSize, filePaths.length),
        );
        const batchResults = await processBatch(batch, processor, concurrency);
        files.push(...batchResults.filter((r) => !r.error));
      }
    }
  } finally {
    // Clean up worker pool if we created it
    if (pool && !workerPool) {
      // Don't terminate global pool, only if we created a temporary one
    }
  }

  return {
    files,
    errors,
    totalFound,
    totalProcessed: processed,
    duration: Date.now() - startTime,
  };
}

/**
 * Update metadata for multiple files in a folder
 *
 * @param updates - Array of objects containing path and tags to update
 * @param options - Update options
 * @returns Results of the update operation
 *
 * @example
 * ```typescript
 * // Update multiple files
 * const updates = [
 *   { path: "/music/song1.mp3", tags: { artist: "New Artist" } },
 *   { path: "/music/song2.mp3", tags: { album: "New Album" } }
 * ];
 *
 * const result = await updateFolderTags(updates);
 * console.log(`Updated ${result.successful} files`);
 * ```
 */
export async function updateFolderTags(
  updates: Array<{ path: string; tags: Partial<Tag> }>,
  options: { continueOnError?: boolean; concurrency?: number } = {},
): Promise<{
  successful: number;
  failed: Array<{ path: string; error: Error }>;
  duration: number;
}> {
  const startTime = Date.now();
  const { continueOnError = true, concurrency = 4 } = options;

  let successful = 0;
  const failed: Array<{ path: string; error: Error }> = [];

  const processor = async (update: { path: string; tags: Partial<Tag> }) => {
    try {
      await updateTags(update.path, update.tags);
      successful++;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (continueOnError) {
        failed.push({ path: update.path, error: err });
      } else {
        throw err;
      }
    }
  };

  // Process in batches
  const batchSize = concurrency * 10;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, Math.min(i + batchSize, updates.length));
    await processBatch(
      batch.map((u) => u.path),
      async (path) => {
        const update = batch.find((u) => u.path === path)!;
        await processor(update);
        return { path, tags: {} }; // Dummy return for type compatibility
      },
      concurrency,
    );
  }

  return {
    successful,
    failed,
    duration: Date.now() - startTime,
  };
}

/**
 * Find duplicate audio files based on metadata
 *
 * @param folderPath - Path to scan for duplicates
 * @param criteria - Which fields to compare (default: artist and title)
 * @returns Groups of potential duplicate files
 */
export async function findDuplicates(
  folderPath: string,
  criteria: Array<keyof Tag> = ["artist", "title"],
): Promise<Map<string, AudioFileMetadata[]>> {
  const result = await scanFolder(folderPath);
  const duplicates = new Map<string, AudioFileMetadata[]>();

  // Group by composite key
  for (const file of result.files) {
    const key = criteria
      .map((field) => file.tags[field] ?? "")
      .filter((v) => v !== "")
      .join("|");

    if (key) {
      const group = duplicates.get(key) ?? [];
      group.push(file);
      duplicates.set(key, group);
    }
  }

  // Filter out non-duplicates
  for (const [key, files] of duplicates.entries()) {
    if (files.length < 2) {
      duplicates.delete(key);
    }
  }

  return duplicates;
}

/**
 * Export metadata from a folder to JSON
 *
 * @param folderPath - Path to scan
 * @param outputPath - Where to save the JSON file
 * @param options - Scan options
 */
export async function exportFolderMetadata(
  folderPath: string,
  outputPath: string,
  options?: FolderScanOptions,
): Promise<void> {
  const result = await scanFolder(folderPath, options);

  const data = {
    folder: folderPath,
    scanDate: new Date().toISOString(),
    summary: {
      totalFiles: result.totalFound,
      processedFiles: result.totalProcessed,
      errors: result.errors.length,
      duration: result.duration,
    },
    files: result.files,
    errors: result.errors,
  };

  // Runtime-specific file writing
  if (typeof Deno !== "undefined") {
    await Deno.writeTextFile(outputPath, JSON.stringify(data, null, 2));
  } else if (typeof (globalThis as any).process !== "undefined") {
    const fs = await import("fs/promises");
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  }
}
