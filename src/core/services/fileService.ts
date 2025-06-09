import fs from "fs/promises";
import path from "path";
import { ProcessedLog, ChapterFile, AudioFormat } from "../models/types.js";

/**
 * Check if a file has been successfully processed before
 * @param logFilePath Path to the log file
 * @param filename The filename to check
 * @returns Whether the file has been successfully processed
 */
export async function isFileProcessed(
  logFilePath: string,
  filename: string,
): Promise<boolean> {
  const log = await readProcessedLog(logFilePath);
  return log.processedFiles[filename]?.success === true;
}

/**
 * Mark a file as processed in the log
 * @param logFilePath Path to the log file
 * @param filename The filename to mark as processed
 * @param asin The ASIN of the audiobook
 * @param title The title of the audiobook
 * @param success Whether the processing was successful
 */
export async function markFileProcessed(
  logFilePath: string,
  filename: string,
  asin: string,
  title: string,
  success: boolean,
): Promise<void> {
  const log = await readProcessedLog(logFilePath);
  log.processedFiles[filename] = {
    timestamp: new Date().toISOString(),
    asin,
    title,
    success,
  };
  await saveProcessedLog(logFilePath, log);
}

/**
 * Read the log file if it exists, or create a new empty log object
 * @param logFilePath Path to the log file
 * @returns The log object
 */
export async function readProcessedLog(
  logFilePath: string,
): Promise<ProcessedLog> {
  try {
    const logContent = await fs.readFile(logFilePath, "utf8");
    return JSON.parse(logContent) as ProcessedLog;
  } catch (error) {
    // If file doesn't exist or has invalid JSON, return an empty log
    return { processedFiles: {} };
  }
}

/**
 * Save the log file
 * @param logFilePath Path to the log file
 * @param log The log object to save
 */
export async function saveProcessedLog(
  logFilePath: string,
  log: ProcessedLog,
): Promise<void> {
  await fs.writeFile(logFilePath, JSON.stringify(log, null, 2), "utf8");
}

/**
 * Get all audio files from a directory
 * @param directory The directory to scan
 * @returns Array of audio file names
 */
export async function getAudioFiles(directory: string): Promise<string[]> {
  const files = await fs.readdir(directory);
  return files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return [
      ".mp3",
      ".m4a",
      ".m4b",
      ".aax",
      ".mp4",
      ".ogg",
      ".flac",
      ".wav",
    ].includes(ext);
  });
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param directory The directory path to ensure exists
 */
export async function ensureDirectoryExists(directory: string): Promise<void> {
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (err) {
    console.error(`Error creating directory ${directory}:`, err);
    throw err;
  }
}

/**
 * Copy a file from source to destination
 * @param source Source file path
 * @param destination Destination file path
 */
export async function copyFile(source: string, destination: string): Promise<void> {
  await fs.cp(source, destination, { recursive: true });
}

/**
 * Rename a file
 * @param oldPath Current file path
 * @param newPath New file path
 */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath);
}

/**
 * Sanitize a filename for cross-platform compatibility
 * @param filename The filename to sanitize
 * @param maxLength Maximum filename length (default: 200)
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string, maxLength: number = 200): string {
  let sanitized = filename;

  // Remove or replace filesystem-unsafe characters
  sanitized = sanitized
    .replace(/[<>:"/\\|?*]/g, '') // Remove forbidden characters for Windows/Unix
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Handle reserved Windows filenames
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(sanitized.replace(/\.[^.]*$/, ''))) {
    sanitized = `${sanitized}_file`;
  }

  // Remove leading/trailing dots and spaces (Windows compatibility)
  sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');

  // Ensure the filename doesn't end with a space or dot
  sanitized = sanitized.replace(/[\s.]+$/, '');

  // Handle empty filename
  if (!sanitized) {
    sanitized = 'unnamed';
  }

  // Split filename and extension
  const lastDotIndex = sanitized.lastIndexOf('.');
  let baseName = sanitized;
  let extension = '';
  
  if (lastDotIndex > 0 && lastDotIndex < sanitized.length - 1) {
    baseName = sanitized.substring(0, lastDotIndex);
    extension = sanitized.substring(lastDotIndex);
  }

  // Limit base name length to accommodate extension and potential collision suffix
  const maxBaseLength = maxLength - extension.length - 10; // Reserve space for collision suffix
  if (baseName.length > maxBaseLength) {
    baseName = baseName.substring(0, maxBaseLength).trim();
  }

  return baseName + extension;
}

/**
 * Generate a safe chapter filename
 * @param bookTitle The title of the book
 * @param chapterNumber The chapter number (1-based)
 * @param chapterTitle The title of the chapter
 * @param format The audio format for the file extension
 * @returns Sanitized filename for the chapter
 */
export function generateChapterFilename(
  bookTitle: string,
  chapterNumber: number,
  chapterTitle: string,
  format: AudioFormat
): string {
  const sanitizedBookTitle = sanitizeFilename(bookTitle, 50);
  const sanitizedChapterTitle = sanitizeFilename(chapterTitle, 80);
  const paddedChapterNumber = chapterNumber.toString().padStart(2, '0');
  
  const filename = `${sanitizedBookTitle} - Chapter ${paddedChapterNumber} - ${sanitizedChapterTitle}.${format}`;
  
  // Final sanitization and length check for the complete filename
  return sanitizeFilename(filename, 250);
}

/**
 * Create output directory structure for a book
 * @param baseDir Base output directory
 * @param bookTitle Title of the book for subdirectory name
 * @param dryRun If true, only validate paths without creating directories
 * @returns Full path to the book's output directory
 */
export async function createOutputDirectory(
  baseDir: string,
  bookTitle: string,
  dryRun: boolean = false
): Promise<string> {
  const sanitizedBookTitle = sanitizeFilename(bookTitle, 100);
  const bookDir = path.join(baseDir, sanitizedBookTitle);
  
  if (!dryRun) {
    try {
      await ensureDirectoryExists(bookDir);
    } catch (error) {
      throw new Error(`Failed to create output directory '${bookDir}': ${error}`);
    }
  }
  
  return bookDir;
}

/**
 * Check if there's sufficient disk space for processing
 * @param outputDir Target output directory
 * @param estimatedSizeBytes Estimated size in bytes needed
 * @returns Promise resolving to true if sufficient space is available
 */
export async function checkDiskSpace(
  outputDir: string,
  estimatedSizeBytes: number
): Promise<boolean> {
  try {
    const stats = await fs.statfs(outputDir);
    const availableBytes = stats.bavail * stats.bsize;
    
    // Add 10% buffer for safety
    const requiredBytes = estimatedSizeBytes * 1.1;
    
    return availableBytes >= requiredBytes;
  } catch (error) {
    console.warn(`Could not check disk space for ${outputDir}:`, error);
    // Return true to allow processing to continue if we can't check space
    return true;
  }
}

/**
 * Generate a collision-safe filename by appending a number if the file exists
 * @param baseDir Directory where the file will be created
 * @param filename Desired filename
 * @returns Promise resolving to a filename that doesn't exist in the directory
 */
export async function generateUniqueFilename(
  baseDir: string,
  filename: string
): Promise<string> {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  let counter = 1;
  let uniqueFilename = filename;
  
  while (true) {
    try {
      const fullPath = path.join(baseDir, uniqueFilename);
      await fs.access(fullPath);
      // File exists, try next number
      uniqueFilename = `${baseName} (${counter})${ext}`;
      counter++;
    } catch {
      // File doesn't exist, we can use this filename
      break;
    }
  }
  
  return uniqueFilename;
}

/**
 * Organize completed chapter files with additional metadata
 * @param chapters Array of chapter file information
 * @param outputDir Directory containing the chapter files
 * @param bookTitle Title of the book for playlist naming
 * @param dryRun If true, only validate without creating files
 * @returns Promise resolving to paths of created organizational files
 */
export async function organizeChapterFiles(
  chapters: ChapterFile[],
  outputDir: string,
  bookTitle: string,
  dryRun: boolean = false
): Promise<{ playlistPath?: string; indexPath?: string; errors: string[] }> {
  const errors: string[] = [];
  const result: { playlistPath?: string; indexPath?: string; errors: string[] } = { errors };
  
  if (chapters.length === 0) {
    errors.push("No chapters provided for organization");
    return result;
  }
  
  try {
    // Sort chapters by chapter number to ensure correct order
    const sortedChapters = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    
    // Generate playlist file (M3U format)
    const playlistFilename = sanitizeFilename(`${bookTitle} - Chapters.m3u`);
    const playlistPath = path.join(outputDir, playlistFilename);
    
    if (!dryRun) {
      const uniquePlaylistFilename = await generateUniqueFilename(outputDir, playlistFilename);
      const finalPlaylistPath = path.join(outputDir, uniquePlaylistFilename);
      
      const playlistContent = [
        '#EXTM3U',
        `#PLAYLIST:${bookTitle}`,
        ...sortedChapters.map(chapter => {
          const filename = path.basename(chapter.filePath);
          const durationSeconds = Math.ceil(chapter.durationMs / 1000);
          return `#EXTINF:${durationSeconds},${chapter.title}\n${filename}`;
        })
      ].join('\n');
      
      await fs.writeFile(finalPlaylistPath, playlistContent, 'utf8');
      result.playlistPath = finalPlaylistPath;
    } else {
      result.playlistPath = playlistPath;
    }
    
    // Generate chapter index file (JSON format)
    const indexFilename = sanitizeFilename(`${bookTitle} - Chapter Index.json`);
    const indexPath = path.join(outputDir, indexFilename);
    
    if (!dryRun) {
      const uniqueIndexFilename = await generateUniqueFilename(outputDir, indexFilename);
      const finalIndexPath = path.join(outputDir, uniqueIndexFilename);
      
      const indexData = {
        bookTitle,
        totalChapters: sortedChapters.length,
        totalDurationMs: sortedChapters.reduce((sum, ch) => sum + ch.durationMs, 0),
        createdAt: new Date().toISOString(),
        chapters: sortedChapters.map(chapter => ({
          number: chapter.chapterNumber,
          title: chapter.title,
          filename: path.basename(chapter.filePath),
          startTimeMs: chapter.startTimeMs,
          durationMs: chapter.durationMs,
          durationFormatted: formatDuration(chapter.durationMs)
        }))
      };
      
      await fs.writeFile(finalIndexPath, JSON.stringify(indexData, null, 2), 'utf8');
      result.indexPath = finalIndexPath;
    } else {
      result.indexPath = indexPath;
    }
    
  } catch (error) {
    errors.push(`Failed to organize chapter files: ${error}`);
  }
  
  return result;
}

/**
 * Format duration from milliseconds to HH:MM:SS format
 * @param durationMs Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Clean up temporary files in a directory
 * @param directory Directory to clean
 * @param pattern Glob pattern for files to remove (default: temp files)
 * @param dryRun If true, only report what would be deleted
 * @returns Promise resolving to array of cleaned file paths
 */
export async function cleanupTemporaryFiles(
  directory: string,
  pattern: string = '*.tmp',
  dryRun: boolean = false
): Promise<string[]> {
  const cleanedFiles: string[] = [];
  
  try {
    const files = await fs.readdir(directory);
    const tempFiles = files.filter(file => {
      // Simple pattern matching for common temp file patterns
      return file.endsWith('.tmp') || 
             file.endsWith('.temp') || 
             file.startsWith('temp_') ||
             file.startsWith('.tmp');
    });
    
    for (const file of tempFiles) {
      const filePath = path.join(directory, file);
      
      if (!dryRun) {
        try {
          await fs.unlink(filePath);
          cleanedFiles.push(filePath);
        } catch (error) {
          console.warn(`Could not delete temporary file ${filePath}:`, error);
        }
      } else {
        cleanedFiles.push(filePath);
      }
    }
    
  } catch (error) {
    console.warn(`Could not clean temporary files in ${directory}:`, error);
  }
  
  return cleanedFiles;
}