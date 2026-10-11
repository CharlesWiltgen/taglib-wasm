#!/usr/bin/env -S deno run --allow-read

/**
 * Enhanced Property Constants Usage Example
 *
 * This example demonstrates the new PROPERTIES system with rich metadata
 * and type-safe property access with full IDE autocomplete support.
 */

import {
  getAllPropertyKeys,
  getPropertiesByFormat,
  getPropertyMetadata,
  isValidProperty,
  PROPERTIES,
  PropertyKey,
  TagLib,
} from "../../src/index.ts";
import { isMainModule } from "./is-main.ts";

async function demonstrateEnhancedProperties() {
  console.log("🎵 TagLib-Wasm - Enhanced Property System Example");
  console.log("=".repeat(50));

  try {
    // Initialize TagLib
    const taglib = await TagLib.initialize();

    // Load a test file
    const file = await taglib.open("./tests/test-files/mp3/kiss-snippet.mp3");

    if (!file.isValid()) {
      throw new Error("Failed to load audio file");
    }

    console.log("\n🎯 Type-Safe Property Access with PROPERTIES:");
    console.log("=".repeat(50));

    // NEW: Using typed property methods with PROPERTIES constants
    console.log(`Title: ${file.getProperty("title")?.[0] || "(none)"}`);
    console.log(`Artist: ${file.getProperty("artist")?.[0] || "(none)"}`);
    console.log(`Album: ${file.getProperty("album")?.[0] || "(none)"}`);
    console.log(
      `Album Artist: ${file.getProperty("albumArtist")?.[0] || "(none)"}`,
    );
    console.log(`Composer: ${file.getProperty("composer")?.[0] || "(none)"}`);

    console.log("\n📊 Rich Property Metadata:");
    console.log("=".repeat(50));

    // NEW: Access rich metadata for properties
    const titleMeta = getPropertyMetadata("title");
    if (titleMeta) {
      console.log(`Title Property:`);
      console.log(`  Description: ${titleMeta.description}`);
      console.log(`  Type: ${titleMeta.type}`);
      console.log(
        `  Supported Formats: ${titleMeta.supportedFormats.join(", ")}`,
      );
      const id3v2 = titleMeta.mappings.id3v2;
      console.log(
        `  ID3v2 Frame: ${typeof id3v2 === "object" ? id3v2?.frame : id3v2}`,
      );
      console.log(`  MP4 Atom: ${titleMeta.mappings.mp4}`);
    }

    const mbidMeta = getPropertyMetadata("musicbrainzTrackId");
    if (mbidMeta) {
      console.log(`\nMusicBrainz Track ID Property:`);
      console.log(`  Description: ${mbidMeta.description}`);
      console.log(`  Type: ${mbidMeta.type}`);
      console.log(
        `  Supported Formats: ${mbidMeta.supportedFormats.join(", ")}`,
      );
    }

    console.log("\n✏️  Type-Safe Property Setting:");
    console.log("=".repeat(50));

    // NEW: Type-safe property setting with PROPERTIES constants
    file.setProperty("title", "Enhanced Title Example");
    file.setProperty("artist", "Enhanced Artist");
    file.setProperty("albumArtist", "Enhanced Album Artist");
    file.setProperty(
      "musicbrainzTrackId",
      "123e4567-e89b-12d3-a456-426614174000",
    );
    file.setProperty("replayGainTrackGain", "-6.54 dB");

    // Verify the changes with typed access
    console.log(`Updated Title: ${file.getProperty("title")?.[0]}`);
    console.log(`Updated Artist: ${file.getProperty("artist")?.[0]}`);
    console.log(
      `Updated Album Artist: ${file.getProperty("albumArtist")?.[0]}`,
    );
    console.log(
      `Updated MusicBrainz ID: ${file.getProperty("musicbrainzTrackId")?.[0]}`,
    );
    console.log(
      `Updated ReplayGain: ${file.getProperty("replayGainTrackGain")?.[0]}`,
    );

    console.log("\n🔍 Property Validation and Discovery:");
    console.log("=".repeat(50));

    // NEW: Enhanced property validation
    const validProperty: PropertyKey = "title";
    const invalidProperty = "INVALID_PROPERTY_NAME";

    console.log(
      `Is "${validProperty}" a valid property? ${isValidProperty(
        validProperty,
      )}`,
    );
    console.log(
      `Is "${invalidProperty}" a valid property? ${isValidProperty(
        invalidProperty,
      )}`,
    );

    // NEW: Format-specific property filtering
    console.log("\n📋 Properties by Format:");
    console.log("=".repeat(50));

    const id3v2Props = getPropertiesByFormat("ID3v2");
    const mp4Props = getPropertiesByFormat("MP4");
    const vorbisProps = getPropertiesByFormat("Vorbis");

    console.log(`ID3v2 supported properties: ${id3v2Props.length}`);
    console.log(`MP4 supported properties: ${mp4Props.length}`);
    console.log(`Vorbis supported properties: ${vorbisProps.length}`);

    console.log(
      `\nFirst 5 ID3v2 properties: ${id3v2Props.slice(0, 5).join(", ")}`,
    );

    // NEW: Property discovery
    console.log("\n📑 Property System Overview:");
    console.log("=".repeat(50));
    const allPropertyKeys = getAllPropertyKeys();
    console.log(`Total properties available: ${allPropertyKeys.length}`);
    console.log("Sample properties with metadata:");

    // Show a few properties with their metadata
    const sampleProps: PropertyKey[] = [
      "title",
      "albumArtist",
      "musicbrainzTrackId",
      "replayGainTrackGain",
    ];
    for (const prop of sampleProps) {
      const meta = PROPERTIES[prop];
      console.log(`  ${prop}: ${meta.description} (${meta.type})`);
    }

    console.log("\n🔄 Property Keys and Wire Names:");
    console.log("=".repeat(50));

    // Each PROPERTIES entry carries both spellings: the camelCase key you
    // index `properties()` with, and `.key`, TagLib's ALL_CAPS wire name.
    const vocabulary: PropertyKey[] = [
      "title",
      "albumArtist",
      "musicbrainzTrackId",
    ];
    for (const prop of vocabulary) {
      console.log(`  ${prop} → "${PROPERTIES[prop].key}"`);
    }

    // The property APIs normalize either spelling, so both reads agree.
    const byCamelKey = JSON.stringify(file.getProperty("title"));
    const byWireName = JSON.stringify(file.getProperty(PROPERTIES.title.key));
    console.log(
      `getProperty("title") === getProperty("${PROPERTIES.title.key}"): ${
        byCamelKey === byWireName
      }`,
    );

    // Clean up
    file.dispose();
    console.log(
      "\n✅ Enhanced property system example completed successfully!",
    );
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Run the example
if (isMainModule(import.meta)) {
  await demonstrateEnhancedProperties();
}
