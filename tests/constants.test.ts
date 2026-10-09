/**
 * @fileoverview Tests for constants.ts utility functions and type definitions
 */

import { describe, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import type { PropertyMap } from "../src/types/tags.ts";
import {
  fromTagLibKey,
  getAllProperties,
  getAllPropertyKeys,
  getPropertiesByFormat,
  getPropertyMetadata,
  isValidProperty,
  PROPERTIES,
  type PropertyKey,
  type PropertyMetadata,
  propertyValue,
  propertyValues,
  toTagLibKey,
} from "../src/constants.ts";

describe("constants", () => {
  it("isValidProperty - validates property keys correctly", () => {
    // Valid properties (camelCase)
    expect(isValidProperty("title")).toStrictEqual(true);
    expect(isValidProperty("artist")).toStrictEqual(true);
    expect(isValidProperty("album")).toStrictEqual(true);
    expect(isValidProperty("musicbrainzTrackId")).toStrictEqual(true);
    expect(isValidProperty("replayGainTrackGain")).toStrictEqual(true);

    // Invalid properties
    expect(isValidProperty("INVALID_PROPERTY")).toStrictEqual(false);
    expect(isValidProperty("TITLE")).toStrictEqual(false); // ALL_CAPS no longer valid
    expect(isValidProperty("")).toStrictEqual(false);
    expect(isValidProperty("123")).toStrictEqual(false);
  });

  it("getPropertyMetadata - returns correct metadata for properties", () => {
    // Test basic property
    const titleMeta = getPropertyMetadata("title");
    if (titleMeta) {
      expect(titleMeta.key).toStrictEqual("TITLE");
      expect(titleMeta.description).toStrictEqual("The title of the track");
      expect(titleMeta.type).toStrictEqual("string");
      expect(titleMeta.supportedFormats).toStrictEqual([
        "ID3v2",
        "MP4",
        "Vorbis",
        "WAV",
      ]);
      expectDefined(titleMeta.mappings);
      const id3v2Mapping = titleMeta.mappings.id3v2;
      if (typeof id3v2Mapping === "object") {
        expect(id3v2Mapping.frame).toStrictEqual("TIT2");
      }
      expect(titleMeta.mappings.mp4).toStrictEqual("©nam");
    }

    // Test extended property
    const mbTrackId = getPropertyMetadata("musicbrainzTrackId");
    if (mbTrackId) {
      expect(mbTrackId.key).toStrictEqual("MUSICBRAINZ_TRACKID");
      expect(mbTrackId.description).toStrictEqual(
        "MusicBrainz Recording ID (UUID)",
      );
      const id3v2Mapping = mbTrackId.mappings.id3v2;
      if (typeof id3v2Mapping === "object") {
        expect(id3v2Mapping.frame).toStrictEqual("UFID");
        expect(id3v2Mapping.description).toStrictEqual(
          "http://musicbrainz.org",
        );
      }
    }

    // Test ReplayGain property
    const rgTrackGain = getPropertyMetadata("replayGainTrackGain");
    if (rgTrackGain) {
      expect(rgTrackGain.description).toStrictEqual(
        "ReplayGain track gain in dB (e.g., '-6.54 dB')",
      );
      const id3v2Mapping = rgTrackGain.mappings.id3v2;
      if (typeof id3v2Mapping === "object") {
        expect(id3v2Mapping.frame).toStrictEqual("TXXX");
        expect(id3v2Mapping.description).toStrictEqual("ReplayGain_Track_Gain");
      }
    }
  });

  it("getAllPropertyKeys - returns all property keys", () => {
    const keys = getAllPropertyKeys();

    // Check it's an array with expected properties
    expect(Array.isArray(keys)).toStrictEqual(true);
    expect(keys.length > 35).toStrictEqual(true); // Should have many properties

    // Check some expected keys exist (camelCase)
    expect(keys.includes("title")).toStrictEqual(true);
    expect(keys.includes("artist")).toStrictEqual(true);
    expect(keys.includes("musicbrainzTrackId")).toStrictEqual(true);
    expect(keys.includes("replayGainTrackGain")).toStrictEqual(true);
    expect(keys.includes("acoustidFingerprint")).toStrictEqual(true);

    // Verify all keys are valid
    for (const key of keys) {
      expect(isValidProperty(key)).toStrictEqual(true);
    }
  });

  it("getAllProperties - returns property key-metadata pairs", () => {
    const properties = getAllProperties();

    // Check structure
    expect(Array.isArray(properties)).toStrictEqual(true);
    expect(properties.length > 35).toStrictEqual(true);

    // Check first few entries have correct structure
    for (const [key, metadata] of properties.slice(0, 5)) {
      expect(typeof key).toStrictEqual("string");
      expect(isValidProperty(key)).toStrictEqual(true);
      expectDefined(metadata.key);
      expectDefined(metadata.description);
      expectDefined(metadata.type);
      expectDefined(metadata.supportedFormats);
      // key field is the TagLib ALL_CAPS wire name, not the camelCase object key
      expect(metadata.key).toStrictEqual(toTagLibKey(key));
    }
  });

  it("getPropertiesByFormat - filters properties by format support", () => {
    // Test ID3v2 format
    const id3v2Props = getPropertiesByFormat("ID3v2");
    expect(Array.isArray(id3v2Props)).toStrictEqual(true);
    expect(id3v2Props.includes("title")).toStrictEqual(true);
    expect(id3v2Props.includes("artist")).toStrictEqual(true);
    expect(id3v2Props.includes("musicbrainzTrackId")).toStrictEqual(true);

    // Verify all returned properties support ID3v2
    for (const prop of id3v2Props) {
      const metadata = getPropertyMetadata(prop as PropertyKey);
      if (metadata) {
        expect(metadata.supportedFormats.includes("ID3v2")).toStrictEqual(true);
      }
    }

    // Test Vorbis format
    const vorbisProps = getPropertiesByFormat("Vorbis");
    expect(vorbisProps.includes("copyright")).toStrictEqual(true);
    expect(vorbisProps.includes("lyricist")).toStrictEqual(true);
    expect(vorbisProps.includes("conductor")).toStrictEqual(true);

    // Test WAV format (should have fewer properties)
    const wavProps = getPropertiesByFormat("WAV");
    expect(wavProps.length < id3v2Props.length).toStrictEqual(true);
    expect(wavProps.includes("title")).toStrictEqual(true);
    expect(wavProps.includes("artist")).toStrictEqual(true);

    // WAV shouldn't include MusicBrainz properties
    expect(wavProps.includes("musicbrainzTrackId")).toStrictEqual(false);
  });

  it("should include totalTracks, totalDiscs, and compilation", () => {
    expect(PROPERTIES.totalTracks.key).toStrictEqual("TRACKTOTAL");
    expect(PROPERTIES.totalDiscs.key).toStrictEqual("DISCTOTAL");
    expect(PROPERTIES.compilation.key).toStrictEqual("COMPILATION");
  });

  it("PROPERTIES constant structure - validates all properties have required fields", () => {
    const propertyEntries = Object.entries(PROPERTIES) as [
      PropertyKey,
      (typeof PROPERTIES)[PropertyKey],
    ][];

    for (const [key, prop] of propertyEntries) {
      // key field is the TagLib ALL_CAPS wire name
      expect(prop.key).toStrictEqual(toTagLibKey(key));

      // All required fields should exist
      expectDefined(prop.description, `${key} should have description`);
      expectDefined(prop.type, `${key} should have type`);
      expectDefined(
        prop.supportedFormats,
        `${key} should have supportedFormats`,
      );
      expect(
        Array.isArray(prop.supportedFormats),
        `${key} supportedFormats should be array`,
      ).toStrictEqual(true);

      // Type should be valid
      expect(
        ["string", "number", "boolean"].includes(prop.type),
        `${key} has invalid type`,
      ).toStrictEqual(true);

      // Description should be meaningful
      expect(
        prop.description.length > 5,
        `${key} description too short`,
      ).toStrictEqual(true);

      // If mappings exist, validate structure
      if (prop.mappings) {
        const mappings = prop.mappings as PropertyMetadata["mappings"];

        // Check format-specific mappings
        if (mappings.id3v2) {
          const id3v2 = mappings.id3v2;
          expectDefined(
            typeof id3v2 === "object" ? id3v2.frame : undefined,
            `${key} ID3v2 mapping should have frame`,
          );
        }
        if (mappings.vorbis) {
          expect(
            typeof mappings.vorbis,
            `${key} Vorbis mapping should be string`,
          ).toStrictEqual("string");
        }
        if (mappings.mp4) {
          expect(
            typeof mappings.mp4,
            `${key} MP4 mapping should be string`,
          ).toStrictEqual("string");
        }
        if (mappings.wav) {
          expect(
            typeof mappings.wav,
            `${key} WAV mapping should be string`,
          ).toStrictEqual("string");
        }
      }
    }
  });

  it("Property format support consistency", () => {
    // Properties that claim ID3v2 support should have ID3v2 mappings
    const id3v2Props = getPropertiesByFormat("ID3v2");
    for (const propKey of id3v2Props) {
      const prop = PROPERTIES[propKey as PropertyKey];
      if (prop.mappings && "id3v2" in prop.mappings) {
        expectDefined(
          prop.mappings.id3v2,
          `${propKey} claims ID3v2 support but has no mapping`,
        );
      }
    }

    // Properties that claim Vorbis support should have Vorbis mappings
    const vorbisProps = getPropertiesByFormat("Vorbis");
    for (const propKey of vorbisProps) {
      const prop = PROPERTIES[propKey as PropertyKey];
      if (prop.mappings && "vorbis" in prop.mappings) {
        expectDefined(
          prop.mappings.vorbis,
          `${propKey} claims Vorbis support but has no mapping`,
        );
      }
    }
  });

  it("Special property formats - validates complex mappings", () => {
    // Test TXXX frame properties (ID3v2 user-defined text)
    const txxx_props = [
      "musicbrainzArtistId",
      "replayGainTrackGain",
      "acoustidFingerprint",
    ];

    for (const propKey of txxx_props) {
      const prop = PROPERTIES[propKey as PropertyKey];
      const mappings = prop.mappings as PropertyMetadata["mappings"];
      if (mappings.id3v2) {
        const id3v2 = mappings.id3v2;
        expect(
          typeof id3v2 === "object" ? id3v2.frame : undefined,
          `${propKey} should use TXXX frame`,
        ).toStrictEqual("TXXX");
        expectDefined(
          typeof id3v2 === "object" ? id3v2.description : undefined,
          `${propKey} TXXX should have description`,
        );
      }
    }

    // Test iTunes-specific MP4 atoms
    const itunesProps = [
      "musicbrainzArtistId",
      "replayGainTrackGain",
      "acoustidId",
    ];

    for (const propKey of itunesProps) {
      const prop = PROPERTIES[propKey as PropertyKey];
      const mappings = prop.mappings as PropertyMetadata["mappings"];
      if (mappings.mp4) {
        const mp4 = mappings.mp4;
        expect(
          typeof mp4 === "string" && mp4.startsWith("----:com.apple.iTunes:"),
          `${propKey} MP4 mapping should be iTunes atom`,
        ).toStrictEqual(true);
      }
    }
  });
});

describe("Property key translation", () => {
  it("toTagLibKey translates known camelCase keys to ALL_CAPS", () => {
    expect(toTagLibKey("title")).toStrictEqual("TITLE");
    expect(toTagLibKey("musicbrainzTrackId")).toStrictEqual(
      "MUSICBRAINZ_TRACKID",
    );
    expect(toTagLibKey("replayGainTrackGain")).toStrictEqual(
      "REPLAYGAIN_TRACK_GAIN",
    );
    expect(toTagLibKey("appleSoundCheck")).toStrictEqual("ITUNNORM");
    expect(toTagLibKey("musicbrainzReleaseId")).toStrictEqual(
      "MUSICBRAINZ_ALBUMID",
    );
  });

  it("should translate totalTracks, totalDiscs, compilation via toTagLibKey", () => {
    expect(toTagLibKey("totalTracks")).toStrictEqual("TRACKTOTAL");
    expect(toTagLibKey("totalDiscs")).toStrictEqual("DISCTOTAL");
    expect(toTagLibKey("compilation")).toStrictEqual("COMPILATION");
  });

  it("fromTagLibKey translates ALL_CAPS to camelCase", () => {
    expect(fromTagLibKey("TITLE")).toStrictEqual("title");
    expect(fromTagLibKey("MUSICBRAINZ_TRACKID")).toStrictEqual(
      "musicbrainzTrackId",
    );
    expect(fromTagLibKey("REPLAYGAIN_TRACK_GAIN")).toStrictEqual(
      "replayGainTrackGain",
    );
    expect(fromTagLibKey("ITUNNORM")).toStrictEqual("appleSoundCheck");
    expect(fromTagLibKey("MUSICBRAINZ_ALBUMID")).toStrictEqual(
      "musicbrainzReleaseId",
    );
  });

  it("should reverse-translate TRACKTOTAL, DISCTOTAL, COMPILATION via fromTagLibKey", () => {
    expect(fromTagLibKey("TRACKTOTAL")).toStrictEqual("totalTracks");
    expect(fromTagLibKey("DISCTOTAL")).toStrictEqual("totalDiscs");
    expect(fromTagLibKey("COMPILATION")).toStrictEqual("compilation");
  });

  it("should translate year to DATE via toTagLibKey (forward alias)", () => {
    expect(toTagLibKey("year")).toStrictEqual("DATE");
  });

  it("should translate track to TRACKNUMBER via toTagLibKey (forward alias)", () => {
    expect(toTagLibKey("track")).toStrictEqual("TRACKNUMBER");
  });

  it("should still translate date to DATE via toTagLibKey (canonical)", () => {
    expect(toTagLibKey("date")).toStrictEqual("DATE");
  });

  it("should still reverse DATE to date via fromTagLibKey (canonical stays)", () => {
    expect(fromTagLibKey("DATE")).toStrictEqual("date");
  });

  it("translates additional properties (formerly ALL_CAPS pass-through)", () => {
    // Sorting
    expect(toTagLibKey("albumArtistSort")).toStrictEqual("ALBUMARTISTSORT");
    expect(toTagLibKey("composerSort")).toStrictEqual("COMPOSERSORT");
    expect(fromTagLibKey("ALBUMARTISTSORT")).toStrictEqual("albumArtistSort");
    expect(fromTagLibKey("COMPOSERSORT")).toStrictEqual("composerSort");

    // Identifiers
    expect(toTagLibKey("asin")).toStrictEqual("ASIN");
    expect(toTagLibKey("musicbrainzReleaseArtistId")).toStrictEqual(
      "MUSICBRAINZ_ALBUMARTISTID",
    );
    expect(toTagLibKey("musicbrainzWorkId")).toStrictEqual(
      "MUSICBRAINZ_WORKID",
    );
    expect(toTagLibKey("musicbrainzReleaseTrackId")).toStrictEqual(
      "MUSICBRAINZ_RELEASETRACKID",
    );
    expect(fromTagLibKey("MUSICBRAINZ_ALBUMARTISTID")).toStrictEqual(
      "musicbrainzReleaseArtistId",
    );

    // Miscellaneous
    expect(toTagLibKey("label")).toStrictEqual("LABEL");
    expect(toTagLibKey("subtitle")).toStrictEqual("SUBTITLE");
    expect(toTagLibKey("producer")).toStrictEqual("PRODUCER");
    expect(toTagLibKey("originalDate")).toStrictEqual("ORIGINALDATE");
    expect(toTagLibKey("involvedPeople")).toStrictEqual("INVOLVEDPEOPLE");
    expect(toTagLibKey("encoding")).toStrictEqual("ENCODING");
    expect(fromTagLibKey("ENCODING")).toStrictEqual("encoding");
    expect(fromTagLibKey("INVOLVEDPEOPLE")).toStrictEqual("involvedPeople");

    // Corrected wire name (was REMIXEDBY, now REMIXER)
    expect(toTagLibKey("remixedBy")).toStrictEqual("REMIXER");
    expect(fromTagLibKey("REMIXER")).toStrictEqual("remixedBy");
  });

  it("unknown keys pass through untranslated", () => {
    expect(toTagLibKey("MY_CUSTOM_TAG")).toStrictEqual("MY_CUSTOM_TAG");
    expect(fromTagLibKey("MY_CUSTOM_TAG")).toStrictEqual("MY_CUSTOM_TAG");
  });

  it("PROPERTIES keys are camelCase", () => {
    for (const key of Object.keys(PROPERTIES)) {
      expect(key[0], `Key "${key}" should start lowercase`).toStrictEqual(
        key[0].toLowerCase(),
      );
      expect(
        key.includes("_"),
        `Key "${key}" should not contain underscores`,
      ).toStrictEqual(false);
    }
  });

  it("every PROPERTIES entry has a key field with ALL_CAPS TagLib wire name", () => {
    for (const [camelKey, meta] of Object.entries(PROPERTIES)) {
      expectDefined(meta.key, `${camelKey} missing key field`);
      expect(meta.key, `${camelKey}.key should be ALL_CAPS`).toStrictEqual(
        meta.key.toUpperCase(),
      );
    }
  });
});

it("propertyValues / propertyValue accessors (taglib-lk8u)", () => {
  const props: PropertyMap = { title: ["Kiss"], artist: [] };
  expect(propertyValues(props, "title")).toStrictEqual(["Kiss"]);
  expect(propertyValues(props, "absent")).toStrictEqual([]);
  expect(propertyValue(props, "title")).toStrictEqual("Kiss");
  expect(propertyValue(props, "artist")).toStrictEqual(undefined);
  expect(propertyValue(props, "absent")).toStrictEqual(undefined);
});
