import path from "path";
import { run } from "../util.js";
import {
  getAudioFiles,
  ensureDirectoryExists,
  readProcessedLog,
  copyFile,
} from "../core/services/fileService.js";
import { processFile } from "./commands/process.js";
import { displayAppHeader, displayFileStats, displayProcessingStatus } from "./ui/display.js";
import { closePrompts } from "./ui/prompts.js";

/**
 * Main function to run the program from command line
 */
export async function main(): Promise<void> {
  try {
    // Get directory path from command line arguments
    const args = process.argv.slice(2);

    const inputDir = "./input";
    const outputDir = "./output";

    // Check for command line flags
    const processAll = args.includes("--process-all");
    const dryRunMode = process.argv.includes("--dry-run");

    // Create output directory
    try {
      await ensureDirectoryExists(outputDir);
    } catch (err) {
      console.error(`Error creating output directory ${outputDir}:`, err);
      process.exit(1);
    }

    // Create log file path
    const logFilePath = path.join(outputDir, "processed_files.json");

    // Display application header
    displayAppHeader(inputDir, outputDir, logFilePath, processAll, dryRunMode);

    // Get all audio files in the directory
    const audioFiles = await getAudioFiles(inputDir);

    // Count how many files have already been processed
    const log = await readProcessedLog(logFilePath);
    const alreadyProcessed = audioFiles.filter(
      (file) => log.processedFiles[file]?.success === true,
    ).length;

    // Display file statistics
    displayFileStats(audioFiles.length, alreadyProcessed, processAll);

    // Process each file
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];

      if (log.processedFiles?.[file]?.success === true) {
        if (!processAll) {
          console.log(`Skipping already processed file: ${file}`);
          continue;
        }
      }

      displayProcessingStatus(file, i + 1, audioFiles.length);

      const filePath = path.join(inputDir, file);
      const copyFilePath = path.join(outputDir, file);

      // Copy file to output directory
      run(dryRunMode, copyFile, filePath, copyFilePath);

      // Process the copied file
      await processFile(
        dryRunMode,
        filePath,
        copyFilePath,
        logFilePath,
        !processAll,
      );
    }

    console.log("\nAll files processed successfully!");
    console.log(`Log file saved at: ${logFilePath}`);
  } catch (error) {
    console.error("Operation failed:", error);
    closePrompts();
    process.exit(1);
  } finally {
    closePrompts();
  }
}