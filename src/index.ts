import fs from "fs/promises";
import readline from "readline";
import path from "path";
import NodeID3 from "node-id3";
import {
  AudibleProductDetailResponse,
  AudibleSearchResponse,
  ChapterInfo,
} from "./types.js";
import { isFileProcessed, markFileProcessed, readProcessedLog } from "./log.js";
import { convertUint8ArraysToBuffers, mapAndJoinOnField, run } from "./util.js";
import {
  getBookInfo,
  getChaptersByAsin,
  getImageFromUrl,
  getProductByAsin,
  searchAudibleBooks,
} from "./api.js";

// Function to read a file as a buffer
// Function to add tags to an MP3 buffer and return a new buffer
function addTags(tags: any, mp3file: any) {
  convertUint8ArraysToBuffers(tags);
  const taggedBuffer = NodeID3.write(tags, mp3file);
  if (!taggedBuffer) {
    throw new Error("Failed to write tags to the MP3 file");
  }
  console.log("Tags added successfully");
}

function removeTags(mp3file: any) {
  const removedBuffer = NodeID3.removeTags(mp3file);
  if (!removedBuffer) {
    throw new Error("Failed to remove tags from the MP3 file");
  }
  console.log("Tags removed successfully");
  return removedBuffer;
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Convert filename to search keywords
 * @param filename The filename to process
 * @returns The processed keywords
 */
function filenameToKeywords(filename: string): string {
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

/**
 * Display search results and prompt for selection or manual keyword input
 * @param searchResults The API response to display
 * @returns Promise resolving to the selected product ASIN or null if manual search requested
 */
async function displaySearchResults(
  searchResults: AudibleSearchResponse,
): Promise<string | null> {
  console.log(`\nFound ${searchResults.total_results} results.`);
  console.log("----------------------------------------");

  if (!searchResults.products || searchResults.products.length === 0) {
    console.log("No products found.");
    const manualSearch = await question(
      "Would you like to try a manual search? (y/n): ",
    );
    if (manualSearch.toLowerCase() === "y") {
      return null;
    }
    throw new Error("No products found");
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

  // Additional option for manual search
  console.log(`[m] Manual search with different keywords`);
  console.log(`[s] Skip this file`);
  console.log("----------------------------------------");

  // Prompt user to select a product
  const answer = await question("Enter your choice: ");

  if (answer.toLowerCase() === "m") {
    return null; // Signal that manual search is requested
  }

  if (answer.toLowerCase() === "s") {
    throw new Error("User chose to skip this file");
  }

  const selectedIndex = parseInt(answer, 10) - 1;

  if (
    isNaN(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= searchResults.products.length
  ) {
    console.error(
      "Invalid selection. Please enter a valid number from the list.",
    );
    return displaySearchResults(searchResults);
  }

  const selectedAsin = searchResults.products[selectedIndex].asin;
  return selectedAsin;
}

/**
 * Display the essential information about a product
 * @param productDetail The product detail response
 */
function displayProductDetail(
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
 * Process a single file to get chapters information and export to a txt file
 * @param filePath The path of the file to process
 * @param outputDir The directory where to save the output
 * @param logFilePath Path to the log file
 * @param skipProcessed Whether to skip already processed files
 */
async function processFile(
  dryRunMode: boolean,
  filePath: string,
  logFilePath: string,
  skipProcessed: boolean = false,
): Promise<void> {
  const filename = path.basename(filePath);
  console.log(`\nProcessing file: ${filename}`);

  // Initial check for already processed files
  if (skipProcessed && (await isFileProcessed(logFilePath, filename))) {
    console.log(`Skipping file (already processed successfully): ${filename}`);
    return;
  }

  let selectedAsin: string | null = null;
  let success = false;
  let title = "";
  try {
    // Extract keywords from filename
    let keywords = filenameToKeywords(filename);
    console.log(`\nInitial search keywords: "${keywords}"`);

    let manualSearch = false;

    do {
      // If manual search was requested, ask for new keywords
      if (manualSearch) {
        keywords = await question("Enter new search keywords: ");
        console.log(`Searching for: "${keywords}"`);
      }

      // First API call: Search for products
      const searchResults = await searchAudibleBooks(keywords);

      // Display results and get user selection
      selectedAsin = await displaySearchResults(searchResults);
      manualSearch = selectedAsin === null;
    } while (manualSearch);

    console.log(`Selected ASIN: ${selectedAsin}`);

    const productDetail = await getProductByAsin(selectedAsin!);
    displayProductDetail(productDetail);

    const bookInfo = await getBookInfo(selectedAsin!);

    console.log("Fetching chapters information...");
    const chaptersData = await getChaptersByAsin(selectedAsin!);

    const chapterTags = chaptersData.chapters.map(
      (chapter: ChapterInfo, index: number) => {
        const { startOffsetMs, lengthMs, title } = chapter;
        return {
          elementID: `chp${index}`,
          startTimeMs: startOffsetMs,
          endTimeMs: startOffsetMs + lengthMs,
          tags: {
            title,
            artist: productDetail.product.authors?.[0].name,
          },
        };
      },
    );

    const tocTag = {
      elementID: "toc",
      isOrdered: true,
      elements: chapterTags.map((chapter) => chapter.elementID),
    };

    const authors = mapAndJoinOnField()(productDetail.product.authors ?? []);

    const image = await getImageFromUrl(bookInfo.image);

    const releaseYear = new Date(productDetail.product.release_date)
      .getFullYear()
      .toString();

    title = productDetail.product.title;

    const tags = {
      title,
      artist: authors,
      albumArtist: authors,
      album: title,
      comment: {
        language: "eng",
        text: bookInfo.description,
      },
      recordingTime: releaseYear,
      date: releaseYear,
      year: releaseYear,
      originalYear: releaseYear,
      genre: mapAndJoinOnField()(
        bookInfo.genres?.filter((x) => x.type == "genre") ?? [],
      ),
      composer: mapAndJoinOnField()(productDetail.product.narrators),
      image: image,
      chapter: chapterTags,
      tableOfContents: tocTag,
    };

    console.log("\nremoving any existing tags...");
    run(dryRunMode, removeTags, filePath);

    console.log("\nadding new tags...");
    run(dryRunMode, addTags, tags, filePath);

    success = true;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "User chose to skip this file") {
        console.log("Skipping this file and continuing to the next one.");
      } else {
        console.error(`Error processing file ${filename}:`, error.message);
      }
    } else {
      console.error(`Unknown error processing file ${filename}`);
    }
  } finally {
    run(
      dryRunMode,
      markFileProcessed,
      logFilePath,
      filename,
      selectedAsin ?? "",
      title,
      success,
    );
  }
}

/**
 * Main function to run the program from command line
 */
async function main(): Promise<void> {
  try {
    // Get directory path from command line arguments
    const args = process.argv.slice(2);

    const inputDir = "./input";

    // Check for --process-all flag
    const processAll = args.includes("--process-all");
    // Check for --dry-run flag
    const dryRunMode = process.argv.includes("--dry-run");

    // Create output directory (same as input directory but with '_chapters' suffix)
    const outputDir = "./output";
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) {
      console.error(`Error creating output directory ${outputDir}:`, err);
      process.exit(1);
    }

    // Create log file path
    const logFilePath = path.join(outputDir, "processed_files.json");

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

    // Get all files in the directory
    const files = await fs.readdir(inputDir);
    const audioFiles = files.filter((file) => {
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

    console.log(`\nFound ${audioFiles.length} audio files to process.\n`);

    // Count how many files have already been processed
    const log = await readProcessedLog(logFilePath);
    const alreadyProcessed = audioFiles.filter(
      (file) => log.processedFiles[file]?.success === true,
    ).length;

    if (alreadyProcessed > 0 && !processAll) {
      console.log(
        `${alreadyProcessed} files have already been processed and will be skipped.`,
      );
      console.log(
        `Use the --process-all flag to process all files regardless of log.`,
      );
    }

    // Process each file
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];

      console.log(`\n[${i + 1}/${audioFiles.length}] Processing: ${file}`);

      const filePath = path.join(inputDir, file);
      const copyFilePath = path.join(outputDir, file);

      run(dryRunMode, fs.cp, filePath, copyFilePath, { recursive: true });

      await processFile(dryRunMode, copyFilePath, logFilePath, !processAll);
    }

    console.log("\nAll files processed successfully!");
    console.log(`Log file saved at: ${logFilePath}`);
  } catch (error) {
    console.error("Operation failed:", error);
    rl.close();
    process.exit(1);
  } finally {
    rl.close();
  }
}

export { processFile, displayProductDetail, filenameToKeywords };

main();
