import {
  AudibleProductDetailResponse,
  AudibleSearchResponse,
} from "../../core/models/types.js";

/**
 * Display search results in a formatted list
 * @param searchResults The API response to display
 */
export function displaySearchResults(searchResults: AudibleSearchResponse): void {
  console.log(`\nFound ${searchResults.total_results} results.`);
  console.log("----------------------------------------");

  if (!searchResults.products || searchResults.products.length === 0) {
    return;
  }

  searchResults.products.forEach((product, index) => {
    console.log(`[${index + 1}] ${product.title}`);

    const authorNames = product.authors
      ? product.authors.map((author) => author.name).join(", ")
      : "Unknown";
    console.log(`Author(s): ${authorNames}`);
    console.log(`ASIN: ${product.asin}`);
    console.log("----------------------------------------");
  });
}

/**
 * Display the essential information about a product
 * @param productDetail The product detail response
 */
export function displayProductDetail(
  productDetail: AudibleProductDetailResponse,
): void {
  const product = productDetail.product;
  console.log("\n=== PRODUCT DETAILS ===");
  console.log(`Title: ${product.title}`);

  const authorNames = product.authors
    ? product.authors.map((author) => author.name).join(", ")
    : "Unknown";
  console.log(`Author(s): ${authorNames}`);
  console.log(`ASIN: ${product.asin}`);
  console.log("======================\n");
}

/**
 * Display processing status information
 * @param filename Current file being processed
 * @param current Current file number
 * @param total Total number of files
 */
export function displayProcessingStatus(
  filename: string,
  current: number,
  total: number,
): void {
  console.log(`\n[${current}/${total}] Processing: ${filename}`);
}

/**
 * Display application header with configuration
 * @param inputDir Input directory path
 * @param outputDir Output directory path
 * @param logFilePath Log file path
 * @param processAll Whether processing all files
 * @param dryRunMode Whether in dry run mode
 */
export function displayAppHeader(
  inputDir: string,
  outputDir: string,
  logFilePath: string,
  processAll: boolean,
  dryRunMode: boolean,
): void {
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Log file: ${logFilePath}\n`);

  if (processAll) {
    console.log(`Mode: Process all files (including previously processed)`);
  } else {
    console.log(`Mode: Skip previously processed files`);
  }

  if (dryRunMode) {
    console.log(`Mode: Dry run (no files will be modified)`);
  }
}

/**
 * Display file processing statistics
 * @param totalFiles Total number of audio files found
 * @param alreadyProcessed Number of already processed files
 * @param processAll Whether processing all files
 */
export function displayFileStats(
  totalFiles: number,
  alreadyProcessed: number,
  processAll: boolean,
): void {
  console.log(`\nFound ${totalFiles} audio files to process.\n`);

  if (alreadyProcessed > 0 && !processAll) {
    console.log(
      `${alreadyProcessed} files have already been processed and will be skipped.`,
    );
    console.log(
      `Use the --process-all flag to process all files regardless of log.`,
    );
  }
}