import axios from "axios";
import fs from "fs/promises";
import readline from "readline";
import path from "path";
import NodeID3 from "node-id3";
import {
  AudibleProductDetailResponse,
  AudibleSearchResponse,
  AudnexBookResponse,
  ChapterInfo,
  ChaptersResponse,
} from "./types.js";
import { isFileProcessed, markFileProcessed, readProcessedLog } from "./log.js";

type AudibleUrlInput =
  | { asin: string; keywords?: never }
  | { asin?: never; keywords: string };

const getAudibleUrl = ({ asin, keywords }: AudibleUrlInput): string => {
  const base = "https://api.audible.com/1.0/catalog/products";
  const responseGroups =
    "contributors,product_attrs,product_desc,product_extended_attrs,series";
  if (asin) {
    return `${base}/${asin}?response_groups=${responseGroups}`;
  }
  return `${base}?response_groups=${responseGroups}&num_results=10&products_sort_by=Relevance&keywords=${keywords}`;
};

function convertUint8ArraysToBuffers(obj: any) {
  // Check if the argument is an object and not null
  if (typeof obj === "object" && obj !== null) {
    // Iterate through each key in the object
    Object.keys(obj).forEach((key: string) => {
      const value = obj[key];
      // If the value is an Uint8Array, convert it to a Buffer
      if (value instanceof Uint8Array) {
        obj[key] = Buffer.from(value);
      }
      // If the value is an object, apply the function recursively
      else if (typeof value === "object") {
        convertUint8ArraysToBuffers(value);
      }
    });
  }
}

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
 * Search for audiobooks on Audible with given keywords
 * @param keywords Search terms to find audiobooks
 * @returns Promise containing the search results
 */
async function searchAudibleBooks(
  keywords: string,
): Promise<AudibleSearchResponse> {
  try {
    const encodedKeywords = encodeURIComponent(keywords);
    const url = getAudibleUrl({ keywords: encodedKeywords });

    const response = await axios.get<AudibleSearchResponse>(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Audible API Client/1.0",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error searching for audiobooks:", error);
    throw error;
  }
}

/**
 * Get detailed information about a specific product by ASIN
 * @param asin The Audible product ASIN
 * @returns Promise containing the product details
 */
async function getProductByAsin(
  asin: string,
): Promise<AudibleProductDetailResponse> {
  try {
    const url = getAudibleUrl({ asin });

    const response = await axios.get<AudibleProductDetailResponse>(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Audible API Client/1.0",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error getting product details:", error);
    throw error;
  }
}

/**
 * Fetch book information from the audnex API
 * @param asin The Audible ASIN (Amazon Standard Identification Number) of the book
 * @returns Promise containing the book data
 */
async function getBookInfo(asin: string): Promise<AudnexBookResponse> {
  try {
    const url = `https://api.audnex.us/books/${asin}`;

    const response = await axios.get<AudnexBookResponse>(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Audible API Client/1.0",
      },
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("API request failed:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
    } else {
      console.error("An unexpected error occurred:", error);
    }
    throw error;
  }
}

/**
 * Get chapter information for a specific audiobook by ASIN
 * @param asin The Audible product ASIN
 * @returns Promise containing the chapters information
 */
async function getChaptersByAsin(asin: string): Promise<ChaptersResponse> {
  try {
    const url = `https://api.audnex.us/books/${asin}/chapters`;

    const response = await axios.get<ChaptersResponse>(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Audible API Client/1.0",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error getting chapters information:", error);
    throw error;
  }
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
  console.log(`Found ${searchResults.total_results} results.`);
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
 * Fetches an image from a URL and returns it as a Uint8Array
 * @param imageUrl The URL of the image to fetch
 * @returns Promise containing the image as a Uint8Array
 */
async function getImageUint8ArrayFromUrl(
  imageUrl: string,
): Promise<{ imageBuffer: Uint8Array; mime: string }> {
  try {
    // Set responseType to 'arraybuffer' to get binary data
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        // Some servers require a user agent
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
    });

    // The response.data is already an ArrayBuffer
    // Convert it to a Uint8Array
    const out = new Uint8Array(response.data);
    return {
      imageBuffer: out,
      mime: response.headers["content-type"] || "bin",
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Failed to fetch image:", error.message);
      if (error.response) {
        console.error("Status:", error.response.status);
      }
    } else {
      console.error("Unexpected error fetching image:", error);
    }
    throw error;
  }
}

/**
 * Process a single file to get chapters information and export to a txt file
 * @param filePath The path of the file to process
 * @param outputDir The directory where to save the output
 * @param logFilePath Path to the log file
 * @param skipProcessed Whether to skip already processed files
 */
async function processFile(
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

  try {
    // Extract keywords from filename
    let keywords = filenameToKeywords(filename);
    console.log(`Initial search keywords: "${keywords}"`);

    let selectedAsin: string | null = null;
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

    const { imageBuffer, mime } = await getImageUint8ArrayFromUrl(
      bookInfo.image,
    );
    const image = {
      imageBuffer,
      mime,
      type: { id: 3, name: "front cover" },
    };

    const releaseYear = new Date(productDetail.product.release_date)
      .getFullYear()
      .toString();

    const tags = {
      title: productDetail.product.title,
      artist: authors,
      albumArtist: authors,
      album: productDetail.product.title,
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

    console.log("removing any existing tags...");
    removeTags(filePath);

    console.log("adding new tags...");
    addTags(tags, filePath);

    markFileProcessed(
      logFilePath,
      filename,
      selectedAsin!,
      productDetail.product.title,
      true,
    );
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
    markFileProcessed(logFilePath, filename, "", "", false);
  }
}

function mapAndJoinOnField(field: string = "name") {
  return (arr: any[]) => {
    if (!Array.isArray(arr)) {
      return "";
    }
    return arr.map((item) => item[field]).join(", ");
  };
}

export function encodeImage(image: any) {
  return new Promise((resolve, reject) => {
    var img = new Image();

    img.onload = function () {
      // no need to resize
      if (
        (image.mime === "image/jpeg" &&
          img.width <= 1400 &&
          img.height <= 1400) ||
        (image.mime === "image/png" && image.imageBuffer.length < 100000)
      ) {
        resolve(image);
      } else {
        console.log("Resizing image");
        // Calculate new dimensions
        var maxSize = 1400; // maximum size of the largest dimension
        var width = img.width;
        var height = img.height;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        // Create a canvas and draw the resized image onto it
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        canvas.width = width;
        canvas.height = height;
        ctx!.drawImage(img, 0, 0, width, height);

        // Convert the canvas content to a JPEG blob
        canvas.toBlob(function (resizedBlob) {
          blobToUint8Array(resizedBlob, function (uint8Array: any) {
            const newImage = {
              ...image,
              imageBuffer: uint8Array,
              mime: "image/jpeg",
            };
            console.log("Resized image", newImage);
            resolve(newImage);
          });
        }, "image/jpeg");
      }

      // Revoke the blob URL to release memory
      URL.revokeObjectURL(img.src);
    };

    img.onerror = function () {
      reject(new Error("Image loading failed"));
    };

    // Set the source of the image to the blob URL
    var blob = new Blob([image.imageBuffer], { type: image.mime });
    img.src = URL.createObjectURL(blob);
  });
}

function blobToUint8Array(blob: any, callback: any) {
  var reader = new FileReader();

  reader.onloadend = function () {
    if (reader.readyState === FileReader.DONE) {
      var arrayBuffer = reader.result as ArrayBuffer;
      var uint8Array = new Uint8Array(arrayBuffer);
      callback(uint8Array);
    }
  };

  reader.onerror = function () {
    console.error("There was an error reading the blob as an ArrayBuffer.");
  };

  reader.readAsArrayBuffer(blob);
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

    console.log(`Reading files from: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`Log file: ${logFilePath}`);
    if (processAll) {
      console.log(`Mode: Process all files (including previously processed)`);
    } else {
      console.log(`Mode: Skip previously processed files`);
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

    console.log(`Found ${audioFiles.length} audio files to process.`);

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
      fs.cp(filePath, copyFilePath, { recursive: true });
      await processFile(copyFilePath, logFilePath, !processAll);
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

main();

// Export functions for use in other modules
export { searchAudibleBooks, getProductByAsin, getChaptersByAsin };
