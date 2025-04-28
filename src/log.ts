import { ProcessedLog } from "./types.js";
import fs from "fs/promises";

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
