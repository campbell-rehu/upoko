import path from "path";
import { run } from "../util.js";
import {
  getAudioFiles,
  ensureDirectoryExists,
  readProcessedLog,
  copyFile,
} from "../core/services/fileService.js";
import { processFile } from "./commands/process.js";
import { split } from "./commands/split.js";
import { displayAppHeader, displayFileStats, displayProcessingStatus } from "./ui/display.js";
import { closePrompts } from "./ui/prompts.js";

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
Upoko - Audiobook Processing Tool

Usage: upoko [command] [options]

Commands:
  process    Add metadata tags to audiobook files (default)
  split      Split audiobook into chapter files
  help       Show this help message

Options:
  --dry-run        Run without making actual changes
  --process-all    Process all files, including already processed ones
  --split          Tag files and then split them into chapters

Examples:
  upoko                    # Process audiobooks (add metadata)
  upoko process            # Same as above
  upoko --split            # Tag AND split audiobooks into chapters
  upoko split              # Split already-tagged audiobooks into chapters
  upoko split --dry-run    # Preview split operation
  upoko --process-all      # Reprocess all files
`);
}

/**
 * Process command handler - adds metadata tags to audiobook files
 */
async function processCommand(args: string[]): Promise<void> {
  const inputDir = "./input";
  const outputDir = "./output";

  // Check for command line flags
  const processAll = args.includes("--process-all");
  const dryRunMode = args.includes("--dry-run");
  const splitAfterTagging = args.includes("--split");

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
  
  if (splitAfterTagging) {
    console.log("📝 MODE: Tag + Split - Files will be tagged and then split into chapters");
  }

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
        continue; // Skip silently, will be shown in processFile
      }
    }

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
      splitAfterTagging,
    );
  }

  console.log("\n🎉 Processing complete!");
}

/**
 * Main function to run the program from command line
 */
export async function main(): Promise<void> {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    let command = args[0]?.toLowerCase();
    let commandArgs = args;

    // Check if first argument is a command or a flag
    if (command && !command.startsWith("-")) {
      // It's a command, remove it from args
      commandArgs = args.slice(1);
    } else {
      // It's a flag or no argument, default to process command
      command = "process";
    }

    // Route to appropriate command
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        displayHelp();
        break;
      
      case "split":
        await split(commandArgs);
        break;
      
      case "process":
        await processCommand(commandArgs);
        break;
      
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run "upoko help" for usage information.');
        process.exit(1);
    }
  } catch (error) {
    console.error("Operation failed:", error);
    closePrompts();
    process.exit(1);
  } finally {
    closePrompts();
  }
}