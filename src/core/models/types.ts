// Define simplified types for the Audible API responses
export interface AudibleProduct {
  asin: string;
  title: string;
  authors?: {
    name: string;
    asin: string;
  }[];
  publisher_summary: string;
  release_date: string;
  thesaurus_subject_keywords: string[];
  narrators: { name: string }[];
}
// Define a log file type for tracking processed files
export interface ProcessedLog {
  processedFiles: Record<
    string,
    {
      timestamp: string;
      asin: string;
      title: string;
      success: boolean;
    }
  >;
}

export interface AudibleSearchResponse {
  products: AudibleProduct[];
  total_results: number;
  product_count: number;
}

export interface AudibleProductDetailResponse {
  product: AudibleProduct;
}

// Interface for the chapters API response
export interface ChapterInfo {
  title: string;
  lengthMs: number;
  startOffsetMs: number;
}

export interface ChaptersResponse {
  asin: string;
  brandIntroDurationMs?: number;
  brandOutroDurationMs?: number;
  chapters: ChapterInfo[];
  isAccurate: boolean;
  runtimeLengthMs?: number;
  runtimeLengthSec?: number;
}

/**
 * Interface for the book data response from audnex API
 */
export interface AudnexBookResponse {
  asin: string;
  authors?: {
    name: string;
    asin: string;
  }[];
  title?: string;
  subtitle?: string;
  narrators?: {
    name: string;
  }[];
  series?: {
    name: string;
    position?: string;
  }[];
  genres?: {
    name: string;
    type: string;
  }[];
  description?: string;
  releaseDate?: string;
  publisher?: string;
  duration?: number;
  language?: string;
  image: string;
  // Add other properties as needed
}

// Audio splitting interfaces
export interface SplitOptions {
  inputPath: string;
  outputDir: string;
  dryRun?: boolean;
  overwrite?: boolean;
  format?: AudioFormat;
}

export interface ChapterSplitConfig {
  bookTitle: string;
  chapters: ChapterInfo[];
  metadata?: any;
  outputDir: string;
  format: AudioFormat;
}

export interface SplitResult {
  success: boolean;
  outputFiles: string[];
  errors: string[];
  totalChapters: number;
  processedChapters: number;
}

export interface ChapterFile {
  chapterNumber: number;
  title: string;
  filePath: string;
  startTimeMs: number;
  durationMs: number;
}

export type AudioFormat = "mp3" | "m4a" | "aac" | "wav" | "flac";

export interface FFmpegProgress {
  chapterNumber: number;
  chapterTitle: string;
  progress: number; // 0-100
  timeRemaining?: string;
}

// Chapter validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ChapterGap {
  chapterIndex: number;
  gapStartMs: number;
  gapEndMs: number;
  gapDurationMs: number;
  description: string;
}

export interface GapDetectionResult {
  hasGaps: boolean;
  gaps: ChapterGap[];
  totalGapDurationMs: number;
}
