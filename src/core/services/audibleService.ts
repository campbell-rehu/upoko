import axios from "axios";
import {
  AudibleProductDetailResponse,
  AudibleSearchResponse,
  AudnexBookResponse,
  ChaptersResponse,
} from "../models/types.js";

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

/**
 * Search for audiobooks on Audible with given keywords
 * @param keywords Search terms to find audiobooks
 * @returns Promise containing the search results
 */
export async function searchAudibleBooks(
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
export async function getProductByAsin(
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
export async function getBookInfo(asin: string): Promise<AudnexBookResponse> {
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
export async function getChaptersByAsin(
  asin: string,
): Promise<ChaptersResponse> {
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
 * Fetches an image from a URL and returns it as a Uint8Array
 * @param imageUrl The URL of the image to fetch
 * @returns Promise containing the image as a Uint8Array
 */
export async function getImageFromUrl(imageUrl: string): Promise<{
  imageBuffer: Uint8Array;
  mime: string;
  type: { id: number; name: string };
}> {
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
      type: { id: 3, name: "front cover" },
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