import path from "path";
import { run } from "../../util.js";
import { filenameToKeywords, processAudioFile } from "../../core/processors/audioProcessor.js";
import { buildAudioMetadata, generateOutputFilename } from "../../core/processors/metadataBuilder.js";
import {
  searchAudibleBooks,
  getProductByAsin,
  getBookInfo,
  getChaptersByAsin,
  getImageFromUrl,
} from "../../core/services/audibleService.js";
import {
  isFileProcessed,
  markFileProcessed,
  copyFile,
  renameFile,
  createOutputDirectory,
} from "../../core/services/fileService.js";
import { 
  AudibleSearchResponse, 
  ChapterSplitConfig, 
  SplitOptions, 
  AudioFormat 
} from "../../core/models/types.js";
import { displaySearchResults, displayProductDetail } from "../ui/display.js";
import {
  question,
  promptForSearchSelection,
  promptForManualKeywords,
  parseUserSelection,
} from "../ui/prompts.js";
import { mapAndJoinOnField } from "../../util.js";
import { splitAudioByChapters } from "../../core/processors/audioSplitter.js";

/**
 * Display search results and prompt for selection or manual keyword input
 * @param searchResults The API response to display
 * @returns Promise resolving to the selected product ASIN or null if manual search requested
 */
async function handleSearchResults(
  searchResults: AudibleSearchResponse,
): Promise<string | null> {
  displaySearchResults(searchResults);
  
  const hasProducts = searchResults.products && searchResults.products.length > 0;
  const answer = await promptForSearchSelection(searchResults.total_results, hasProducts);
  
  if (answer === null) {
    return null; // Manual search requested
  }

  const selectedIndex = parseUserSelection(answer, searchResults.products.length);
  
  if (selectedIndex === -1) {
    console.error(
      "Invalid selection. Please enter a valid number from the list.",
    );
    return handleSearchResults(searchResults);
  }

  return searchResults.products[selectedIndex].asin;
}

/**
 * Process a single file to get chapters information and add tags
 * @param dryRunMode Whether to run in dry mode
 * @param originalFilePath The original file path for logging
 * @param filePath The path of the file to process
 * @param logFilePath Path to the log file
 * @param skipProcessed Whether to skip already processed files
 * @param splitAfterTagging Whether to split the file into chapters after tagging
 */
export async function processFile(
  dryRunMode: boolean,
  originalFilePath: string,
  filePath: string,
  logFilePath: string,
  skipProcessed: boolean = false,
  splitAfterTagging: boolean = false,
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
        keywords = await promptForManualKeywords();
        console.log(`Searching for: "${keywords}"`);
      }

      // First API call: Search for products
      const searchResults = await searchAudibleBooks(keywords);

      // Display results and get user selection
      selectedAsin = await handleSearchResults(searchResults);
      manualSearch = selectedAsin === null;
    } while (manualSearch);

    console.log(`Selected ASIN: ${selectedAsin}`);

    // Get product details and book information
    const [productDetail, bookInfo] = await Promise.all([
      getProductByAsin(selectedAsin!),
      getBookInfo(selectedAsin!),
    ]);

    displayProductDetail(productDetail);

    console.log("Fetching chapters information...");
    const [chaptersData, image] = await Promise.all([
      getChaptersByAsin(selectedAsin!),
      getImageFromUrl(bookInfo.image),
    ]);

    // Build metadata
    const metadata = buildAudioMetadata(productDetail, bookInfo, chaptersData, image);

    // Process the audio file
    processAudioFile(dryRunMode, filePath, metadata);

    // Generate output filename and rename
    console.log("\nRenaming file...");
    const ext = path.extname(filePath).replace(".", "");
    const authors = mapAndJoinOnField()(productDetail.product.authors ?? []);
    const releaseYear = new Date(productDetail.product.release_date)
      .getFullYear()
      .toString();
    
    title = productDetail.product.title;
    const outputFilename = generateOutputFilename(title, authors, releaseYear, ext);
    const outputPath = path.join("./output", outputFilename);
    
    run(dryRunMode, renameFile, filePath, outputPath);

    success = true;
    
    // If splitting is requested, split the tagged file into chapters
    if (splitAfterTagging && success) {
      console.log("\n=== SPLITTING INTO CHAPTERS ===");
      
      const taggedFilePath = dryRunMode ? filePath : outputPath;
      
      // Ask user for confirmation before splitting
      const splitConfirm = await question(
        `\nSplit "${title}" into ${chaptersData.chapters.length} chapter files? (y/n): `
      );
      
      if (splitConfirm.toLowerCase() === 'y' || splitConfirm.toLowerCase() === 'yes') {
        try {
          // Create split output directory
          const splitOutputDir = await createOutputDirectory(
            "./output/split",
            title,
            dryRunMode
          );
          
          // Detect format from tagged file
          const format = ext as AudioFormat;
          
          // For tag+split workflow, use the chapters we just embedded
          // This avoids re-fetching from API and uses the exact same data
          const splitConfig: ChapterSplitConfig = {
            bookTitle: title,
            chapters: chaptersData.chapters,
            metadata: metadata, // Include the full metadata with image
            outputDir: splitOutputDir,
            format,
          };
          
          const splitOptions: SplitOptions = {
            inputPath: taggedFilePath,
            outputDir: splitOutputDir,
            dryRun: dryRunMode,
            overwrite: false,
            format,
          };
          
          console.log(`\nSplitting "${title}" into chapters...`);
          console.log(`Output directory: ${splitOutputDir}`);
          
          const splitResult = await splitAudioByChapters(splitConfig, splitOptions);
          
          if (splitResult.success) {
            console.log(`\n✅ Successfully split into ${splitResult.processedChapters} chapters!`);
            console.log(`Split files location: ${splitOutputDir}`);
          } else {
            console.error(`\n❌ Split operation failed:`);
            splitResult.errors.forEach(error => console.error(`  - ${error}`));
          }
        } catch (splitError) {
          console.error(`\n❌ Error during splitting: ${splitError}`);
        }
      } else {
        console.log("Skipping split operation.");
      }
    }
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
      originalFilePath,
      selectedAsin ?? "",
      title,
      success,
    );
  }
}