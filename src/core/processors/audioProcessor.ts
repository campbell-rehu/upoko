import path from "path";
import NodeID3 from "node-id3";
import { run } from "../../util.js";
import { AudioMetadata } from "./metadataBuilder.js";

/**
 * Add tags to an MP3 file
 * @param tags The metadata tags to add
 * @param mp3file The file path or buffer
 */
export function addTags(tags: any, mp3file: any): void {
  const taggedBuffer = NodeID3.write(tags, mp3file);
  if (!taggedBuffer) {
    throw new Error("Failed to write tags to the MP3 file");
  }
  console.log("Tags added successfully");
}

/**
 * Remove existing tags from an MP3 file
 * @param mp3file The file path or buffer
 * @returns The buffer with tags removed
 */
export function removeTags(mp3file: any): void {
  const removedBuffer = NodeID3.removeTags(mp3file);
  if (!removedBuffer) {
    throw new Error("Failed to remove tags from the MP3 file");
  }
  console.log("Tags removed successfully");
}

/**
 * Process audio file with metadata
 * @param dryRunMode Whether to run in dry mode (no actual changes)
 * @param filePath Path to the audio file
 * @param metadata The metadata to apply
 */
export function processAudioFile(
  dryRunMode: boolean,
  filePath: string,
  metadata: any,
): void {
  console.log("Removing any existing tags...");
  run(dryRunMode, removeTags, filePath);

  console.log("Adding new tags...");
  run(dryRunMode, addTags, metadata, filePath);
}

/**
 * Convert filename to search keywords
 * @param filename The filename to process
 * @returns The processed keywords
 */
export function filenameToKeywords(filename: string): string {
  // Remove file extension
  const nameWithoutExt = path.parse(filename).name;

  // Replace underscores, dashes, and dots with spaces
  let keywords = nameWithoutExt.replace(/[_\-.]+/g, " ");

  // Remove common audiobook markers that might be in filenames
  keywords = keywords.replace(
    /\b(unabridged|audiobook|mp3|m4b|aax|audio)\b/gi,
    "",
  );

  // Clean up extra spaces
  keywords = keywords.replace(/\s+/g, " ").trim();

  return keywords;
}