import { ChapterInfo } from "../models/types.js";
import {
  validateChapters,
  validateChapterSequence,
  validateChapterTiming,
  normalizeChapterTitles,
  detectChapterGaps,
  sortChaptersByStartTime
} from "./chapterValidator.js";

/**
 * Example usage of the chapter validation functions
 * This file demonstrates how to use the validation functions in practice
 */

// Example chapter data with various validation scenarios
const sampleChapters: ChapterInfo[] = [
  {
    title: "Introduction: Welcome to the Story",
    lengthMs: 120000, // 2 minutes
    startOffsetMs: 0
  },
  {
    title: "Chapter 1: The Beginning",
    lengthMs: 1800000, // 30 minutes
    startOffsetMs: 120000 // 2 minutes
  },
  {
    title: "Chapter 2: The Adventure Continues...",
    lengthMs: 2100000, // 35 minutes
    startOffsetMs: 1920000 // 32 minutes (start at end of previous chapter)
  },
  {
    title: "Chapter 3: The <Forbidden> Characters/Test",
    lengthMs: 1680000, // 28 minutes
    startOffsetMs: 4080000 // 68 minutes (with a 60-second gap)
  }
];

// Example with problems
const problematicChapters: ChapterInfo[] = [
  {
    title: "Chapter 1",
    lengthMs: 1800000,
    startOffsetMs: 0
  },
  {
    title: "Chapter 2",
    lengthMs: 1200000,
    startOffsetMs: 1500000 // Overlaps with previous chapter
  },
  {
    title: "Chapter 3",
    lengthMs: -100000, // Negative length
    startOffsetMs: 2700000
  }
];

/**
 * Demonstrates comprehensive chapter validation
 */
export function demonstrateValidation(): void {
  console.log("=== Chapter Validation Demo ===\n");

  // Test with sample chapters
  console.log("1. Testing well-formed chapters:");
  const validationResult = validateChapters(sampleChapters, 7000000); // 7000 seconds total
  console.log(`Valid: ${validationResult.isValid}`);
  console.log(`Errors: ${validationResult.errors.length}`);
  console.log(`Warnings: ${validationResult.warnings.length}`);
  
  if (validationResult.errors.length > 0) {
    console.log("Errors:");
    validationResult.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (validationResult.warnings.length > 0) {
    console.log("Warnings:");
    validationResult.warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  console.log("\n2. Testing problematic chapters:");
  const problematicResult = validateChapters(problematicChapters);
  console.log(`Valid: ${problematicResult.isValid}`);
  console.log("Errors:");
  problematicResult.errors.forEach(error => console.log(`  - ${error}`));

  // Test title normalization
  console.log("\n3. Testing title normalization:");
  const normalizedChapters = normalizeChapterTitles(sampleChapters);
  normalizedChapters.forEach((chapter, index) => {
    if (chapter.title !== sampleChapters[index].title) {
      console.log(`  Original: "${sampleChapters[index].title}"`);
      console.log(`  Normalized: "${chapter.title}"`);
    }
  });

  // Test gap detection
  console.log("\n4. Testing gap detection:");
  const gapResult = detectChapterGaps(sampleChapters);
  if (gapResult.hasGaps) {
    console.log(`Found ${gapResult.gaps.length} gaps:`);
    gapResult.gaps.forEach(gap => {
      console.log(`  - ${gap.description}`);
    });
    console.log(`Total gap duration: ${Math.round(gapResult.totalGapDurationMs / 1000)}s`);
  } else {
    console.log("No gaps found between chapters");
  }

  // Test sorting
  console.log("\n5. Testing chapter sorting:");
  const unsortedChapters: ChapterInfo[] = [
    { title: "Chapter 3", lengthMs: 1000000, startOffsetMs: 3000000 },
    { title: "Chapter 1", lengthMs: 1000000, startOffsetMs: 0 },
    { title: "Chapter 2", lengthMs: 1000000, startOffsetMs: 1500000 }
  ];
  
  console.log("Before sorting:");
  unsortedChapters.forEach(chapter => {
    console.log(`  ${chapter.title} - starts at ${Math.round(chapter.startOffsetMs / 1000)}s`);
  });

  const sortedChapters = sortChaptersByStartTime(unsortedChapters);
  console.log("After sorting:");
  sortedChapters.forEach(chapter => {
    console.log(`  ${chapter.title} - starts at ${Math.round(chapter.startOffsetMs / 1000)}s`);
  });
}

/**
 * Validates chapters and returns a summary for integration into processing workflows
 */
export function validateAndReport(chapters: ChapterInfo[], totalDurationMs?: number): {
  canProceed: boolean;
  summary: string;
  normalizedChapters: ChapterInfo[];
} {
  const validation = validateChapters(chapters, totalDurationMs);
  const normalized = normalizeChapterTitles(chapters);
  const sorted = sortChaptersByStartTime(normalized);
  
  let summary = `Validation Results:\n`;
  summary += `- ${chapters.length} chapters found\n`;
  summary += `- ${validation.errors.length} errors\n`;
  summary += `- ${validation.warnings.length} warnings\n`;
  
  if (validation.errors.length > 0) {
    summary += `\nErrors:\n`;
    validation.errors.forEach(error => {
      summary += `  • ${error}\n`;
    });
  }
  
  if (validation.warnings.length > 0) {
    summary += `\nWarnings:\n`;
    validation.warnings.forEach(warning => {
      summary += `  • ${warning}\n`;
    });
  }

  return {
    canProceed: validation.isValid,
    summary,
    normalizedChapters: sorted
  };
}