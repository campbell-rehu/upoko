import {
  AudibleProductDetailResponse,
  AudnexBookResponse,
  ChapterInfo,
  ChaptersResponse,
} from "../models/types.js";
import { convertUint8ArraysToBuffers, mapAndJoinOnField } from "../../util.js";

export interface AudioMetadata {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  comment: {
    language: string;
    text: string;
  };
  recordingTime: string;
  date: string;
  year: string;
  originalYear: string;
  genre: string;
  composer: string;
  image: {
    imageBuffer: Uint8Array;
    mime: string;
    type: { id: number; name: string };
    description: string;
  };
  chapter: Array<{
    elementID: string;
    startTimeMs: number;
    endTimeMs: number;
    tags: {
      title: string;
      artist?: string;
    };
  }>;
  tableOfContents: {
    elementID: string;
    isOrdered: boolean;
    elements: string[];
  };
}

/**
 * Build chapter tags from chapters data
 * @param chaptersData The chapters response from API
 * @param productDetail The product details for author information
 * @returns Array of chapter tag objects
 */
export function buildChapterTags(
  chaptersData: ChaptersResponse,
  productDetail: AudibleProductDetailResponse,
) {
  return chaptersData.chapters.map((chapter: ChapterInfo, index: number) => {
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
  });
}

/**
 * Build table of contents tag
 * @param chapterTags Array of chapter tags
 * @returns Table of contents tag object
 */
export function buildTableOfContents(chapterTags: any[]) {
  return {
    elementID: "toc",
    isOrdered: true,
    elements: chapterTags.map((chapter) => chapter.elementID),
  };
}

/**
 * Build complete metadata object for audio file
 * @param productDetail Product details from Audible API
 * @param bookInfo Book information from Audnex API
 * @param chaptersData Chapters data from Audnex API
 * @param image Image data for cover art
 * @returns Complete metadata object ready for tagging
 */
export function buildAudioMetadata(
  productDetail: AudibleProductDetailResponse,
  bookInfo: AudnexBookResponse,
  chaptersData: ChaptersResponse,
  image: {
    imageBuffer: Uint8Array;
    mime: string;
    type: { id: number; name: string };
  },
): AudioMetadata {
  const chapterTags = buildChapterTags(chaptersData, productDetail);
  const tocTag = buildTableOfContents(chapterTags);
  const authors = mapAndJoinOnField()(productDetail.product.authors ?? []);
  const title = productDetail.product.title;
  const releaseYear = new Date(productDetail.product.release_date)
    .getFullYear()
    .toString();

  const metadata = {
    title,
    artist: authors,
    albumArtist: authors,
    album: title,
    comment: {
      language: "eng",
      text: bookInfo.description || "",
    },
    recordingTime: releaseYear,
    date: releaseYear,
    year: releaseYear,
    originalYear: releaseYear,
    genre: mapAndJoinOnField()(
      bookInfo.genres?.filter((x) => x.type == "genre") ?? [],
    ),
    composer: mapAndJoinOnField()(productDetail.product.narrators),
    image: {
      ...image,
      description: "Cover art",
    },
    chapter: chapterTags,
    tableOfContents: tocTag,
  };

  // Convert Uint8Arrays to Buffers for NodeID3 compatibility
  convertUint8ArraysToBuffers(metadata);
  
  return metadata;
}

/**
 * Generate output filename for processed audiobook
 * @param title Book title
 * @param authors Book authors
 * @param releaseYear Release year
 * @param extension File extension
 * @returns Formatted filename
 */
export function generateOutputFilename(
  title: string,
  authors: string,
  releaseYear: string,
  extension: string,
): string {
  return `${title} - ${authors} - ${releaseYear}.${extension}`;
}