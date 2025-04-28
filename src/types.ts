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
