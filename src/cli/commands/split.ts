import path from "path";
import { promises as fs } from "fs";
import NodeID3 from "node-id3";
import { run } from "../../util.js";
import {
  getChaptersByAsin,
  searchAudibleBooks,
  getProductByAsin,
  getBookInfo,
} from "../../core/services/audibleService.js";
import {
  createOutputDirectory,
  organizeChapterFiles,
  checkDiskSpace,
} from "../../core/services/fileService.js";
import {
  splitAudioByChapters,
  prepareSplitOperation,
} from "../../core/processors/audioSplitter.js";
import {
  ChapterInfo,
  ChapterSplitConfig,
  SplitOptions,
  AudioFormat,
  AudibleSearchResponse,
} from "../../core/models/types.js";
import {
  displaySearchResults,
  displayProductDetail,
} from "../ui/display.js";
import {
  question,
  promptForSearchSelection,
  promptForManualKeywords,
  parseUserSelection,
} from "../ui/prompts.js";
import { processFile } from "./process.js";

/**
 * Parse command line arguments for split command
 * @param args Command line arguments
 * @returns Parsed options
 */
function parseSplitArgs(args: string[]): {
  input?: string;
  output: string;
  dryRun: boolean;
  format?: AudioFormat;
  overwrite: boolean;
  noPlaylist: boolean;
  asin?: string;
  skipValidation: boolean;
} {
  const options = {
    output: "./output/split",
    dryRun: false,
    overwrite: false,
    noPlaylist: false,
    skipValidation: false,
  } as any;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--input":
      case "-i":
        if (nextArg && !nextArg.startsWith("-")) {
          options.input = nextArg;
          i++;
        }
        break;
      case "--output":
      case "-o":
        if (nextArg && !nextArg.startsWith("-")) {
          options.output = nextArg;
          i++;
        }
        break;
      case "--dry-run":
      case "-d":
        options.dryRun = true;
        break;
      case "--format":
      case "-f":
        if (nextArg && !nextArg.startsWith("-")) {
          options.format = nextArg as AudioFormat;
          i++;
        }
        break;
      case "--overwrite":
        options.overwrite = true;
        break;
      case "--no-playlist":
        options.noPlaylist = true;
        break;
      case "--asin":
        if (nextArg && !nextArg.startsWith("-")) {
          options.asin = nextArg;
          i++;
        }
        break;
      case "--skip-validation":
        options.skipValidation = true;
        break;
      default:
        // If no flag is provided and no input yet, treat as input file
        if (!arg.startsWith("-") && !options.input) {
          options.input = arg;
        }
    }
  }

  return options;
}

/**
 * Display help information for split command
 */
function displaySplitHelp(): void {
  console.log(`
Split Command - Split audiobook into chapter files

Usage: upoko split [options] [input-file]

Options:
  -i, --input <file>       Input audiobook file path (required)
  -o, --output <dir>       Output directory (default: "./output/split")
  -d, --dry-run           Run without creating files
  -f, --format <format>   Output format (mp3, m4a, etc.) - default from input
  --overwrite             Overwrite existing chapter files
  --no-playlist           Skip playlist/index generation
  --asin <asin>           Provide ASIN directly to fetch chapters
  --skip-validation       Skip chapter validation warnings

Examples:
  upoko split audiobook.mp3
  upoko split -i book.m4b -o ./chapters
  upoko split --asin B08G9PRS1K --format mp3
  upoko split book.mp3 --dry-run
`);
}

/**
 * Validate if a string is a proper ASIN format
 * @param asin The string to validate
 * @returns true if valid ASIN format
 */
function isValidAsin(asin: string): boolean {
  // ASIN should be exactly 10 characters
  // Starting with B (for books) or other valid prefixes
  // Followed by 9 alphanumeric characters
  const asinPattern = /^[B0-9][0-9A-Z]{9}$/;
  return asinPattern.test(asin);
}

/**
 * Extract chapter metadata from tagged audio file
 * @param filePath Path to the tagged audio file
 * @returns Chapter information and book details if found
 */
async function extractChaptersFromFile(filePath: string): Promise<{
  chapters: ChapterInfo[];
  bookTitle: string;
  asin: string;
} | null> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // For MP3 files, read ID3 tags
    if (ext === ".mp3") {
      const tags = NodeID3.read(filePath);
      
      // Check if we have chapter data
      if (tags.chapter && Array.isArray(tags.chapter) && tags.chapter.length > 0) {
        const chapters: ChapterInfo[] = tags.chapter.map((chapter: any, index: number) => ({
          title: chapter.title || `Chapter ${index + 1}`,
          lengthMs: chapter.endTimeMs - chapter.startTimeMs,
          startOffsetMs: chapter.startTimeMs,
        }));
        
        // Get book title and ASIN from tags
        const bookTitle = tags.title || tags.album || "Unknown Book";
        let asin = "";
        
        // Try to extract ASIN from various fields
        if (tags.userDefinedText) {
          for (const frame of tags.userDefinedText) {
            if (frame.description?.toLowerCase().includes("asin") && frame.value) {
              const potentialAsin = frame.value.trim();
              if (isValidAsin(potentialAsin)) {
                asin = potentialAsin;
                break;
              }
            }
          }
        }
        
        // Also check comment field for ASIN
        if (!asin && tags.comment?.text) {
          const asinMatch = tags.comment.text.match(/\b([B0][A-Z0-9]{9})\b/);
          if (asinMatch && isValidAsin(asinMatch[1])) {
            asin = asinMatch[1];
          }
        }
        
        console.log(`✅ Found ${chapters.length} chapters in embedded metadata`);
        return {
          chapters,
          bookTitle,
          asin,
        };
      }
    }
    
    // For other formats, we could add support later
    // (M4A/M4B files might have chapter metadata in different format)
    
    return null;
  } catch (error) {
    console.log("Could not extract chapter metadata from file");
    return null;
  }
}

/**
 * Extract ASIN from audio file metadata
 * @param filePath Path to the audio file
 * @returns ASIN if found, null otherwise
 */
async function extractAsinFromFile(filePath: string): Promise<string | null> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // For MP3 files, try to read ID3 tags
    if (ext === ".mp3") {
      const tags = NodeID3.read(filePath);
      
      // Check various fields where ASIN might be stored
      if (tags.comment?.text) {
        const asinMatch = tags.comment.text.match(/\b([B0][A-Z0-9]{9})\b/);
        if (asinMatch && isValidAsin(asinMatch[1])) {
          return asinMatch[1];
        }
      }
      
      // Check userDefinedText for ASIN
      if (tags.userDefinedText) {
        for (const frame of tags.userDefinedText) {
          if (frame.description?.toLowerCase().includes("asin") && frame.value) {
            const potentialAsin = frame.value.trim();
            if (isValidAsin(potentialAsin)) {
              return potentialAsin;
            }
          }
        }
      }
    }
    
    // For other formats, we might need different approaches
    // This is a placeholder for future enhancements
    
    return null;
  } catch (error) {
    console.log("Could not extract ASIN from file metadata");
    return null;
  }
}

/**
 * Display chapter information before splitting
 * @param chapters Array of chapter information
 * @param bookTitle Title of the book
 */
function displayChapterList(chapters: ChapterInfo[], bookTitle: string): void {
  console.log(`\n=== CHAPTERS FOR: ${bookTitle} ===`);
  console.log(`Total chapters: ${chapters.length}`);
  console.log("----------------------------------------");
  
  chapters.forEach((chapter, index) => {
    const durationMin = Math.floor(chapter.lengthMs / 60000);
    const durationSec = Math.floor((chapter.lengthMs % 60000) / 1000);
    console.log(
      `[${(index + 1).toString().padStart(2, "0")}] ${chapter.title} ` +
      `(${durationMin}:${durationSec.toString().padStart(2, "0")})`
    );
  });
  
  console.log("----------------------------------------\n");
}

/**
 * Get chapters information for the audiobook
 * @param asin The ASIN of the audiobook
 * @param filePath Path to the audio file (for filename-based search)
 * @param useEmbeddedFirst Whether to prioritize embedded chapter metadata
 * @returns Chapter information or null if not found
 */
async function getChaptersInfo(
  asin: string | null,
  filePath: string,
  useEmbeddedFirst: boolean = true
): Promise<{ chapters: ChapterInfo[]; bookTitle: string; asin: string } | null> {
  let selectedAsin = asin;
  let bookTitle = "";

  try {
    // First priority: Check for embedded chapter metadata
    if (useEmbeddedFirst) {
      console.log("Checking for embedded chapter metadata...");
      const embeddedChapters = await extractChaptersFromFile(filePath);
      
      if (embeddedChapters) {
        console.log(`📖 Using embedded chapter metadata (${embeddedChapters.chapters.length} chapters)`);
        return embeddedChapters;
      } else {
        console.log("No embedded chapter metadata found, checking for ASIN...");
      }
    }

    if (!selectedAsin) {
      // Try to extract ASIN from file metadata
      console.log("Checking file metadata for ASIN...");
      selectedAsin = await extractAsinFromFile(filePath);
      
      if (selectedAsin) {
        console.log(`Found ASIN in metadata: ${selectedAsin}`);
      }
    }

    // If we have an ASIN, verify with user before proceeding
    if (selectedAsin) {
      console.log("Fetching product details...");
      try {
        const productDetail = await getProductByAsin(selectedAsin);
        displayProductDetail(productDetail);
        bookTitle = productDetail.product.title;
        
        // Ask user to confirm this is the correct book
        const confirmChoice = await question(
          "\nIs this the correct audiobook? (y/n/s for search manually): "
        );
        
        if (confirmChoice.toLowerCase() === 'y' || confirmChoice.toLowerCase() === 'yes') {
          console.log("Fetching chapter information...");
          const chaptersData = await getChaptersByAsin(selectedAsin);
          
          return {
            chapters: chaptersData.chapters,
            bookTitle,
            asin: selectedAsin,
          };
        } else if (confirmChoice.toLowerCase() === 's' || confirmChoice.toLowerCase() === 'search') {
          console.log("Starting manual search...");
          selectedAsin = null; // Reset to trigger manual search
        } else {
          console.log("Operation cancelled.");
          return null;
        }
      } catch (error) {
        console.log(`Failed to fetch details for ASIN ${selectedAsin}: ${error}`);
        console.log("Falling back to manual search...");
        selectedAsin = null;
      }
    }

    // No ASIN found, search by filename
    const filename = path.basename(filePath);
    const nameWithoutExt = path.parse(filename).name;
    let keywords = nameWithoutExt.replace(/[_\-.]+/g, " ");
    keywords = keywords.replace(/\b(unabridged|audiobook|mp3|m4b|aax|audio)\b/gi, "");
    keywords = keywords.replace(/\s+/g, " ").trim();
    
    console.log(`\nSearching for audiobook: "${keywords}"`);
    
    let manualSearch = false;
    
    do {
      if (manualSearch) {
        keywords = await promptForManualKeywords();
        console.log(`Searching for: "${keywords}"`);
      }

      const searchResults = await searchAudibleBooks(keywords);
      selectedAsin = await handleSearchResults(searchResults);
      manualSearch = selectedAsin === null;
    } while (manualSearch);

    if (!selectedAsin) {
      return null;
    }

    // Fetch product details and chapters
    const [productDetail, chaptersData] = await Promise.all([
      getProductByAsin(selectedAsin),
      getChaptersByAsin(selectedAsin),
    ]);
    
    displayProductDetail(productDetail);
    bookTitle = productDetail.product.title;
    
    return {
      chapters: chaptersData.chapters,
      bookTitle,
      asin: selectedAsin,
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "User chose to skip this file") {
        console.log("Skipping file.");
        return null;
      } else {
        console.error("Error fetching chapter information:", error.message);
      }
    }
    return null;
  }
}

/**
 * Handle search results and prompt for selection
 * @param searchResults The API response to display
 * @returns Promise resolving to the selected product ASIN or null if manual search requested
 */
async function handleSearchResults(
  searchResults: AudibleSearchResponse
): Promise<string | null> {
  displaySearchResults(searchResults);
  
  const hasProducts = searchResults.products && searchResults.products.length > 0;
  const answer = await promptForSearchSelection(searchResults.total_results, hasProducts);
  
  if (answer === null) {
    return null; // Manual search requested
  }

  const selectedIndex = parseUserSelection(answer, searchResults.products.length);
  
  if (selectedIndex === -1) {
    console.error("Invalid selection. Please enter a valid number from the list.");
    return handleSearchResults(searchResults);
  }

  return searchResults.products[selectedIndex].asin;
}

/**
 * Estimate output size based on input file size and chapters
 * @param inputPath Path to input file
 * @param chapterCount Number of chapters
 * @returns Estimated size in bytes
 */
async function estimateOutputSize(
  inputPath: string,
  chapterCount: number
): Promise<number> {
  try {
    const stats = await fs.stat(inputPath);
    // Add 10% overhead for metadata and filesystem
    return Math.ceil(stats.size * 1.1);
  } catch (error) {
    // If we can't get file size, estimate 500MB per hour of audio
    // Assuming average chapter is 30 minutes
    return chapterCount * 250 * 1024 * 1024;
  }
}

/**
 * Main split command handler
 * @param args Command line arguments
 */
export async function split(args: string[]): Promise<void> {
  // Parse command line arguments
  const options = parseSplitArgs(args);
  
  // Show help if requested or no input provided
  if (args.includes("--help") || args.includes("-h") || !options.input) {
    displaySplitHelp();
    return;
  }

  const inputPath = path.resolve(options.input);
  
  // Validate input file exists
  try {
    await fs.access(inputPath);
  } catch (error) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`\nSplitting audiobook: ${path.basename(inputPath)}`);
  console.log(`Output directory: ${options.output}`);
  if (options.dryRun) {
    console.log("Mode: Dry run (no files will be created)");
  }

  // Get chapter information (prefer embedded metadata)
  let chapterInfo = await getChaptersInfo(options.asin || null, inputPath, true);
  
  // If no chapter information found, offer to tag the file first
  if (!chapterInfo) {
    console.log("\n❌ No chapter metadata found in file and no valid ASIN detected.");
    
    const autoTag = await question(
      "Would you like to tag this file first to add chapter metadata? (y/n): "
    );
    
    if (autoTag.toLowerCase() === 'y' || autoTag.toLowerCase() === 'yes') {
      console.log("\n=== AUTO-TAGGING BEFORE SPLIT ===");
      
      // Create a temporary output path for tagging
      const outputDir = "./output";
      const filename = path.basename(inputPath);
      const outputPath = path.join(outputDir, filename);
      
      try {
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });
        
        // Tag the file using the process function
        await processFile(
          options.dryRun,
          inputPath,
          inputPath, // Use original file as both source and target for tagging
          path.join(outputDir, "processed_files.json"),
          false, // don't skip processed
          false  // don't split after tagging (we'll do it here)
        );
        
        console.log("\n=== RETRYING CHAPTER EXTRACTION ===");
        
        // Try to get chapter info again from the now-tagged file
        chapterInfo = await getChaptersInfo(null, inputPath, true);
        
        if (!chapterInfo) {
          console.error("❌ Still no chapter metadata after tagging. Aborting split.");
          return;
        }
        
        console.log("✅ Successfully tagged file, proceeding with split...");
        
      } catch (tagError) {
        console.error(`❌ Error during auto-tagging: ${tagError}`);
        return;
      }
    } else {
      console.log("Split operation cancelled.");
      return;
    }
  }

  const { chapters, bookTitle, asin } = chapterInfo;
  
  // Display chapter list
  displayChapterList(chapters, bookTitle);
  
  // Confirm before proceeding
  const confirmAnswer = await question(
    `\nProceed with splitting into ${chapters.length} chapters? (y/n): `
  );
  
  if (confirmAnswer.toLowerCase() !== "y") {
    console.log("Split operation cancelled.");
    return;
  }

  // Create output directory for this book
  const bookOutputDir = await createOutputDirectory(
    options.output,
    bookTitle,
    options.dryRun
  );
  
  console.log(`\nOutput directory: ${bookOutputDir}`);

  // Check disk space
  if (!options.dryRun) {
    const estimatedSize = await estimateOutputSize(inputPath, chapters.length);
    const hasSpace = await checkDiskSpace(bookOutputDir, estimatedSize);
    
    if (!hasSpace) {
      console.error("\nError: Insufficient disk space for split operation.");
      console.log("Please free up space and try again.");
      return;
    }
  }

  // Detect format from input file if not specified
  const format = options.format || (path.extname(inputPath).slice(1) as AudioFormat);
  
  // Prepare split configuration
  const splitConfig: ChapterSplitConfig = {
    bookTitle,
    chapters,
    outputDir: bookOutputDir,
    format,
  };
  
  const splitOptions: SplitOptions = {
    inputPath,
    outputDir: bookOutputDir,
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    format,
  };

  // Perform pre-flight checks
  if (!options.skipValidation) {
    const prepResult = await prepareSplitOperation(splitConfig, splitOptions);
    if (!prepResult.success) {
      console.error("\nPre-flight checks failed:");
      prepResult.errors.forEach(error => console.error(`  - ${error}`));
      return;
    }
  }

  // Perform the split
  console.log("\nStarting split operation...");
  const result = await splitAudioByChapters(splitConfig, splitOptions);
  
  if (result.success) {
    console.log(`\n✅ Successfully split audiobook into ${result.processedChapters} chapters!`);
    console.log(`Output directory: ${bookOutputDir}`);
    
    // Organize chapter files (create playlist and index)
    if (!options.noPlaylist && !options.dryRun) {
      console.log("\nCreating playlist and index files...");
      
      const chapterFiles = result.outputFiles.map((filePath, index) => ({
        chapterNumber: index + 1,
        title: chapters[index].title,
        filePath,
        startTimeMs: chapters[index].startOffsetMs,
        durationMs: chapters[index].lengthMs,
      }));
      
      const orgResult = await organizeChapterFiles(
        chapterFiles,
        bookOutputDir,
        bookTitle,
        options.dryRun
      );
      
      if (orgResult.playlistPath) {
        console.log(`  ✓ Playlist created: ${path.basename(orgResult.playlistPath)}`);
      }
      if (orgResult.indexPath) {
        console.log(`  ✓ Index created: ${path.basename(orgResult.indexPath)}`);
      }
      
      if (orgResult.errors.length > 0) {
        console.log("\n⚠️  Warnings during organization:");
        orgResult.errors.forEach(error => console.log(`  - ${error}`));
      }
    }
  } else {
    console.log(`\n❌ Split operation completed with errors:`);
    console.log(`  Processed: ${result.processedChapters}/${result.totalChapters} chapters`);
    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
  }
}