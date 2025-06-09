import { ChapterInfo, ValidationResult, ChapterGap, GapDetectionResult } from "../models/types.js";

/**
 * Validates that chapters are in correct sequential order and don't overlap
 * @param chapters Array of chapter information
 * @returns Validation result with detailed error messages
 */
export function validateChapterSequence(chapters: ChapterInfo[]): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Handle empty chapters array
  if (!chapters || chapters.length === 0) {
    result.isValid = false;
    result.errors.push("No chapters provided for validation");
    return result;
  }

  // Sort chapters by start time for validation
  const sortedChapters = [...chapters].sort((a, b) => a.startOffsetMs - b.startOffsetMs);

  // Check if original order matches sorted order
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].startOffsetMs !== sortedChapters[i].startOffsetMs) {
      result.warnings.push("Chapters are not in chronological order by start time");
      break;
    }
  }

  // Validate each chapter and check for overlaps
  for (let i = 0; i < sortedChapters.length; i++) {
    const chapter = sortedChapters[i];
    
    // Check for negative start times
    if (chapter.startOffsetMs < 0) {
      result.isValid = false;
      result.errors.push(`Chapter ${i + 1} "${chapter.title}" has negative start time: ${chapter.startOffsetMs}ms`);
    }

    // Check for non-positive length
    if (chapter.lengthMs <= 0) {
      result.isValid = false;
      result.errors.push(`Chapter ${i + 1} "${chapter.title}" has non-positive length: ${chapter.lengthMs}ms`);
    }

    // Check for overlaps with next chapter
    if (i < sortedChapters.length - 1) {
      const nextChapter = sortedChapters[i + 1];
      const currentChapterEnd = chapter.startOffsetMs + chapter.lengthMs;
      
      if (currentChapterEnd > nextChapter.startOffsetMs) {
        result.isValid = false;
        const overlapMs = currentChapterEnd - nextChapter.startOffsetMs;
        result.errors.push(
          `Chapter ${i + 1} "${chapter.title}" overlaps with chapter ${i + 2} "${nextChapter.title}" by ${overlapMs}ms`
        );
      }
    }
  }

  return result;
}

/**
 * Validates chapter timing against audio duration and logical constraints
 * @param chapters Array of chapter information
 * @param totalDurationMs Total duration of the audio file (optional)
 * @returns Validation result with detailed error messages
 */
export function validateChapterTiming(chapters: ChapterInfo[], totalDurationMs?: number): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!chapters || chapters.length === 0) {
    result.isValid = false;
    result.errors.push("No chapters provided for timing validation");
    return result;
  }

  // Sort chapters by start time
  const sortedChapters = [...chapters].sort((a, b) => a.startOffsetMs - b.startOffsetMs);
  
  // Calculate total chapter duration
  let totalChapterDuration = 0;
  let lastChapterEnd = 0;

  for (let i = 0; i < sortedChapters.length; i++) {
    const chapter = sortedChapters[i];
    
    // Basic timing validation
    if (chapter.startOffsetMs < 0) {
      result.isValid = false;
      result.errors.push(`Chapter ${i + 1} "${chapter.title}" has negative start time: ${chapter.startOffsetMs}ms`);
    }

    if (chapter.lengthMs <= 0) {
      result.isValid = false;
      result.errors.push(`Chapter ${i + 1} "${chapter.title}" has non-positive duration: ${chapter.lengthMs}ms`);
    }

    // Check for unreasonably short chapters (less than 30 seconds)
    if (chapter.lengthMs > 0 && chapter.lengthMs < 30000) {
      result.warnings.push(`Chapter ${i + 1} "${chapter.title}" is very short: ${Math.round(chapter.lengthMs / 1000)}s`);
    }

    // Check for unreasonably long chapters (more than 4 hours)
    if (chapter.lengthMs > 14400000) {
      result.warnings.push(`Chapter ${i + 1} "${chapter.title}" is very long: ${Math.round(chapter.lengthMs / 3600000)}h`);
    }

    const chapterEnd = chapter.startOffsetMs + chapter.lengthMs;
    if (chapterEnd > lastChapterEnd) {
      lastChapterEnd = chapterEnd;
    }
    
    totalChapterDuration += chapter.lengthMs;
  }

  // Validate against total audio duration if provided
  if (totalDurationMs !== undefined) {
    if (lastChapterEnd > totalDurationMs) {
      result.isValid = false;
      const excessMs = lastChapterEnd - totalDurationMs;
      result.errors.push(`Chapters extend ${excessMs}ms beyond audio file duration (${totalDurationMs}ms)`);
    }

    // Check if chapters are significantly shorter than total duration
    const coveragePercentage = (lastChapterEnd / totalDurationMs) * 100;
    if (coveragePercentage < 90) {
      result.warnings.push(
        `Chapters only cover ${coveragePercentage.toFixed(1)}% of the audio file. ` +
        `Missing ${Math.round((totalDurationMs - lastChapterEnd) / 1000)}s of content`
      );
    }
  }

  return result;
}

/**
 * Normalizes chapter titles for safe filesystem usage
 * @param chapters Array of chapter information
 * @returns Array of chapters with normalized titles
 */
export function normalizeChapterTitles(chapters: ChapterInfo[]): ChapterInfo[] {
  return chapters.map((chapter, index) => {
    let normalizedTitle = chapter.title;

    // Remove or replace filesystem-unsafe characters
    normalizedTitle = normalizedTitle
      .replace(/[<>:"/\\|?*]/g, '') // Remove forbidden characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Handle empty titles
    if (!normalizedTitle) {
      normalizedTitle = `Chapter ${index + 1}`;
    }

    // Limit length to reasonable filesystem limits (200 characters)
    if (normalizedTitle.length > 200) {
      normalizedTitle = normalizedTitle.substring(0, 197) + '...';
    }

    // Remove leading/trailing dots and spaces (Windows compatibility)
    normalizedTitle = normalizedTitle.replace(/^[.\s]+|[.\s]+$/g, '');

    // Ensure the title doesn't end with a space or dot
    normalizedTitle = normalizedTitle.replace(/[\s.]+$/, '');

    // Handle reserved Windows filenames
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(normalizedTitle)) {
      normalizedTitle = `${normalizedTitle}_chapter`;
    }

    return {
      ...chapter,
      title: normalizedTitle
    };
  });
}

/**
 * Detects gaps between chapters
 * @param chapters Array of chapter information
 * @returns Gap detection result with detailed gap information
 */
export function detectChapterGaps(chapters: ChapterInfo[]): GapDetectionResult {
  const result: GapDetectionResult = {
    hasGaps: false,
    gaps: [],
    totalGapDurationMs: 0
  };

  if (!chapters || chapters.length <= 1) {
    return result;
  }

  // Sort chapters by start time
  const sortedChapters = [...chapters].sort((a, b) => a.startOffsetMs - b.startOffsetMs);

  for (let i = 0; i < sortedChapters.length - 1; i++) {
    const currentChapter = sortedChapters[i];
    const nextChapter = sortedChapters[i + 1];
    
    const currentEnd = currentChapter.startOffsetMs + currentChapter.lengthMs;
    const nextStart = nextChapter.startOffsetMs;
    
    // Check for gaps (allowing up to 1 second tolerance)
    if (nextStart > currentEnd + 1000) {
      const gapDuration = nextStart - currentEnd;
      
      const gap: ChapterGap = {
        chapterIndex: i,
        gapStartMs: currentEnd,
        gapEndMs: nextStart,
        gapDurationMs: gapDuration,
        description: `${Math.round(gapDuration / 1000)}s gap between "${currentChapter.title}" and "${nextChapter.title}"`
      };
      
      result.gaps.push(gap);
      result.totalGapDurationMs += gapDuration;
      result.hasGaps = true;
    }
  }

  return result;
}

/**
 * Sorts chapters chronologically by start time
 * @param chapters Array of chapter information
 * @returns Array of chapters sorted by start time
 */
export function sortChaptersByStartTime(chapters: ChapterInfo[]): ChapterInfo[] {
  if (!chapters || chapters.length === 0) {
    return [];
  }

  return [...chapters].sort((a, b) => {
    // Primary sort by start time
    if (a.startOffsetMs !== b.startOffsetMs) {
      return a.startOffsetMs - b.startOffsetMs;
    }
    
    // Secondary sort by length (shorter chapters first if start times are equal)
    return a.lengthMs - b.lengthMs;
  });
}

/**
 * Comprehensive chapter validation that runs all validation checks
 * @param chapters Array of chapter information
 * @param totalDurationMs Total duration of the audio file (optional)
 * @returns Combined validation result
 */
export function validateChapters(chapters: ChapterInfo[], totalDurationMs?: number): ValidationResult {
  const sequenceResult = validateChapterSequence(chapters);
  const timingResult = validateChapterTiming(chapters, totalDurationMs);
  const gapResult = detectChapterGaps(chapters);

  const combinedResult: ValidationResult = {
    isValid: sequenceResult.isValid && timingResult.isValid,
    errors: [...sequenceResult.errors, ...timingResult.errors],
    warnings: [...sequenceResult.warnings, ...timingResult.warnings]
  };

  // Add gap warnings
  if (gapResult.hasGaps) {
    gapResult.gaps.forEach(gap => {
      combinedResult.warnings.push(gap.description);
    });
    
    if (gapResult.totalGapDurationMs > 10000) { // More than 10 seconds total gaps
      combinedResult.warnings.push(
        `Total gap duration is significant: ${Math.round(gapResult.totalGapDurationMs / 1000)}s across ${gapResult.gaps.length} gaps`
      );
    }
  }

  return combinedResult;
}