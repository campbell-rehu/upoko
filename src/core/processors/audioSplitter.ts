import { promises as fs } from 'fs';
import { join, basename, extname } from 'path';
import os from 'os';
import {
  ChapterInfo,
  ChapterSplitConfig,
  SplitOptions,
  SplitResult,
  ChapterFile,
  FFmpegProgress
} from '../models/types.js';
import { FFmpegService } from '../services/ffmpegService.js';
import {
  validateChapters,
  normalizeChapterTitles,
  sortChaptersByStartTime
} from './chapterValidator.js';
import { run } from '../../util.js';
import { addTags } from './audioProcessor.js';

/**
 * Create chapter-specific metadata for individual split files
 * @param config Split configuration containing book metadata
 * @param chapter Chapter information
 * @param chapterNumber Chapter number (1-based)
 * @param totalChapters Total number of chapters
 * @param image Album artwork image data
 * @returns Metadata object for the chapter file
 */
function createChapterMetadata(
  config: ChapterSplitConfig,
  chapter: ChapterInfo,
  chapterNumber: number,
  totalChapters: number,
  image?: any
): any {
  const metadata: any = {
    title: chapter.title,
    album: config.bookTitle,
    artist: config.metadata?.artist || 'Unknown Artist',
    albumArtist: config.metadata?.albumArtist || config.metadata?.artist || 'Unknown Artist',
    genre: config.metadata?.genre || 'Audiobook',
    year: config.metadata?.year || new Date().getFullYear().toString(),
    trackNumber: `${chapterNumber}/${totalChapters}`,
    comment: {
      language: 'eng',
      text: `Chapter ${chapterNumber} of ${config.bookTitle}`
    }
  };

  // Add album artwork if available
  if (image) {
    metadata.image = image;
  }

  return metadata;
}

/**
 * Main function to split an audio file into chapters
 * @param config Configuration for chapter splitting
 * @param options Additional split options
 * @returns Split result with success status and output files
 */
export async function splitAudioByChapters(
  config: ChapterSplitConfig,
  options: SplitOptions
): Promise<SplitResult> {
  const result: SplitResult = {
    success: false,
    outputFiles: [],
    errors: [],
    totalChapters: config.chapters.length,
    processedChapters: 0
  };

  try {
    // Pre-flight checks
    console.log(`\nPreparing to split audio into ${config.chapters.length} chapters...`);
    const prepResult = await prepareSplitOperation(config, options);
    if (!prepResult.success) {
      result.errors = prepResult.errors;
      return result;
    }

    // Sort and normalize chapters
    const sortedChapters = sortChaptersByStartTime(config.chapters);
    const normalizedChapters = normalizeChapterTitles(sortedChapters);

    // Calculate concurrency based on system resources
    const concurrency = calculateOptimalConcurrency();
    console.log(`Processing with concurrency level: ${concurrency}`);

    // Process chapters in batches
    const chapterFiles: ChapterFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < normalizedChapters.length; i += concurrency) {
      const batch = normalizedChapters.slice(i, i + concurrency);
      const batchPromises = batch.map((chapter, batchIndex) => {
        const chapterNumber = i + batchIndex + 1;
        return processChapterSplit(
          options.inputPath,
          chapter,
          chapterNumber,
          config,
          options
        );
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((promiseResult, index) => {
        const chapterNumber = i + index + 1;
        if (promiseResult.status === 'fulfilled' && promiseResult.value) {
          chapterFiles.push(promiseResult.value);
          result.processedChapters++;
          console.log(`✓ Chapter ${chapterNumber} processed successfully`);
        } else if (promiseResult.status === 'rejected') {
          const error = `Chapter ${chapterNumber}: ${promiseResult.reason}`;
          errors.push(error);
          console.error(`✗ ${error}`);
        }
      });
    }

    // Update result
    result.outputFiles = chapterFiles.map(cf => cf.filePath);
    result.errors = errors;
    result.success = errors.length === 0 && result.processedChapters === result.totalChapters;

    if (result.success) {
      console.log(`\n✅ Successfully split ${result.processedChapters} chapters`);
    } else {
      console.log(`\n⚠️  Completed with errors: ${result.processedChapters}/${result.totalChapters} chapters processed`);
    }

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Fatal error during split operation: ${errorMessage}`);
    console.error(`\n❌ Split operation failed: ${errorMessage}`);
    return result;
  }
}

/**
 * Process splitting for an individual chapter
 * @param inputPath Path to the input audio file
 * @param chapter Chapter information
 * @param chapterNumber Chapter number (1-based)
 * @param config Split configuration
 * @param options Split options
 * @returns Chapter file information or throws error
 */
export async function processChapterSplit(
  inputPath: string,
  chapter: ChapterInfo,
  chapterNumber: number,
  config: ChapterSplitConfig,
  options?: SplitOptions
): Promise<ChapterFile> {
  try {
    // Generate output file path
    const outputFileName = generateChapterFileName(
      config.bookTitle,
      chapterNumber,
      chapter.title,
      config.format
    );
    const outputPath = join(config.outputDir, outputFileName);

    // Check if file already exists and overwrite is not enabled
    if (!options?.overwrite) {
      try {
        await fs.access(outputPath);
        // File exists, check if we should skip
        if (!options?.dryRun) {
          console.log(`  Skipping chapter ${chapterNumber} - file already exists: ${outputFileName}`);
          return {
            chapterNumber,
            title: chapter.title,
            filePath: outputPath,
            startTimeMs: chapter.startOffsetMs,
            durationMs: chapter.lengthMs
          };
        }
      } catch {
        // File doesn't exist, proceed with splitting
      }
    }

    console.log(`  Processing chapter ${chapterNumber}: "${chapter.title}"`);
    console.log(`    Start: ${formatTime(chapter.startOffsetMs)}, Duration: ${formatTime(chapter.lengthMs)}`);

    // Create progress callback
    const progressCallback = (progress: number) => {
      if (progress % 10 === 0) { // Log every 10%
        process.stdout.write(`\r    Progress: ${progress.toFixed(0)}%`);
      }
    };

    // Perform the actual split using FFmpeg service
    if (options?.dryRun) {
      console.log(`    DRY RUN: Would create ${outputFileName}`);
      console.log(`    DRY RUN: Would apply metadata with album artwork`);
    } else {
      await FFmpegService.splitAudioByTime(
        inputPath,
        outputPath,
        chapter.startOffsetMs,
        chapter.lengthMs,
        progressCallback
      );
      process.stdout.write('\r    Progress: 100%\n');
      
      // Apply chapter-specific metadata including album artwork
      if (config.format === 'mp3') {
        console.log(`    Adding metadata and artwork...`);
        const chapterMetadata = createChapterMetadata(
          config,
          chapter,
          chapterNumber,
          config.chapters.length,
          config.metadata?.image
        );
        
        try {
          addTags(chapterMetadata, outputPath);
          console.log(`    ✅ Metadata applied to chapter ${chapterNumber}`);
        } catch (metadataError) {
          console.warn(`    ⚠️ Warning: Could not apply metadata to chapter ${chapterNumber}: ${metadataError}`);
        }
      } else {
        console.log(`    Note: Metadata application currently only supported for MP3 format`);
      }
    }

    return {
      chapterNumber,
      title: chapter.title,
      filePath: outputPath,
      startTimeMs: chapter.startOffsetMs,
      durationMs: chapter.lengthMs
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process chapter ${chapterNumber}: ${errorMessage}`);
  }
}

/**
 * Perform pre-flight checks before splitting operation
 * @param config Split configuration
 * @param options Split options
 * @returns Preparation result with success status and errors
 */
export async function prepareSplitOperation(
  config: ChapterSplitConfig,
  options: SplitOptions
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Check FFmpeg availability
    const ffmpegCheck = await FFmpegService.checkFFmpegAvailability();
    if (!ffmpegCheck.ffmpeg || !ffmpegCheck.ffprobe) {
      errors.push('FFmpeg or FFprobe is not available. Please ensure they are installed.');
      return { success: false, errors };
    }

    // Validate input file exists and is readable
    try {
      await FFmpegService.validateAudioFile(options.inputPath);
    } catch (error) {
      errors.push(`Input file validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, errors };
    }

    // Get audio info for validation
    const audioInfo = await FFmpegService.getAudioInfo(options.inputPath);
    console.log(`  Audio file duration: ${formatTime(audioInfo.duration)}`);
    console.log(`  Audio format: ${audioInfo.format}, Codec: ${audioInfo.codec || 'unknown'}`);

    // Validate chapters
    const validationResult = validateChapters(config.chapters, audioInfo.duration);
    if (!validationResult.isValid) {
      errors.push(...validationResult.errors);
      return { success: false, errors };
    }

    // Show warnings if any
    if (validationResult.warnings.length > 0) {
      console.log('\n⚠️  Chapter validation warnings:');
      validationResult.warnings.forEach(warning => {
        console.log(`  - ${warning}`);
      });
    }

    // Ensure output directory exists
    if (!options.dryRun) {
      try {
        await fs.mkdir(config.outputDir, { recursive: true });
        console.log(`  Output directory ready: ${config.outputDir}`);
      } catch (error) {
        errors.push(`Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false, errors };
      }
    }

    // Check available disk space
    const diskSpace = await checkAvailableDiskSpace(config.outputDir);
    const estimatedSpaceNeeded = estimateOutputSize(audioInfo.size, config.chapters.length);
    
    if (diskSpace !== null && diskSpace < estimatedSpaceNeeded) {
      errors.push(
        `Insufficient disk space. Available: ${formatBytes(diskSpace)}, ` +
        `Estimated needed: ${formatBytes(estimatedSpaceNeeded)}`
      );
      return { success: false, errors };
    }

    console.log(`  Disk space check: ${formatBytes(diskSpace || 0)} available`);

    return { success: true, errors: [] };

  } catch (error) {
    errors.push(`Preparation failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, errors };
  }
}

/**
 * Calculate optimal concurrency level based on system resources
 * @returns Number of concurrent operations to perform
 */
function calculateOptimalConcurrency(): number {
  const cpuCount = os.cpus().length;
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const memoryUsageRatio = (totalMemory - freeMemory) / totalMemory;

  // Base concurrency on CPU count
  let concurrency = Math.max(1, Math.floor(cpuCount / 2));

  // Reduce if memory usage is high
  if (memoryUsageRatio > 0.8) {
    concurrency = Math.max(1, Math.floor(concurrency / 2));
  }

  // Cap at reasonable maximum
  return Math.min(concurrency, 4);
}

/**
 * Generate a safe filename for a chapter
 * @param bookTitle Title of the book
 * @param chapterNumber Chapter number
 * @param chapterTitle Chapter title
 * @param format Audio format extension
 * @returns Safe filename for the chapter
 */
function generateChapterFileName(
  bookTitle: string,
  chapterNumber: number,
  chapterTitle: string,
  format: string
): string {
  // Sanitize book title
  const safeBookTitle = bookTitle
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50);

  // Format chapter number with leading zeros
  const chapterNum = chapterNumber.toString().padStart(3, '0');

  // Sanitize chapter title (already normalized by validator)
  const safeChapterTitle = chapterTitle.substring(0, 100);

  // Ensure format starts with dot
  const extension = format.startsWith('.') ? format : `.${format}`;

  return `${safeBookTitle} - ${chapterNum} - ${safeChapterTitle}${extension}`;
}

/**
 * Format time in milliseconds to human-readable string
 * @param timeMs Time in milliseconds
 * @returns Formatted time string (HH:MM:SS)
 */
function formatTime(timeMs: number): string {
  const totalSeconds = Math.floor(timeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format bytes to human-readable string
 * @param bytes Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Check available disk space for output directory
 * @param directory Directory path to check
 * @returns Available space in bytes or null if unable to determine
 */
async function checkAvailableDiskSpace(directory: string): Promise<number | null> {
  try {
    // This is a simplified check - in production you might want to use
    // a package like 'check-disk-space' for more accurate results
    const stats = await fs.statfs(directory).catch(() => fs.statfs('/'));
    return stats.bavail * stats.bsize;
  } catch {
    // Unable to determine disk space
    return null;
  }
}

/**
 * Estimate the total output size based on input size and chapter count
 * @param inputSize Size of input file in bytes
 * @param chapterCount Number of chapters
 * @returns Estimated total output size in bytes
 */
function estimateOutputSize(inputSize: number, chapterCount: number): number {
  // Add 10% overhead for metadata and filesystem overhead
  // This is a conservative estimate as we're copying streams without re-encoding
  return Math.ceil(inputSize * 1.1);
}

// Export all functions for use in other modules
export default {
  splitAudioByChapters,
  processChapterSplit,
  prepareSplitOperation
};