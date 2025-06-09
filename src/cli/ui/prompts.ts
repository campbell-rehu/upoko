import readline from "readline";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Promisify readline question
 * @param query The question to ask the user
 * @returns Promise resolving to the user's answer
 */
export function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Close the readline interface
 */
export function closePrompts(): void {
  rl.close();
}

/**
 * Ask user to select from search results or request manual search
 * @param totalResults Total number of search results
 * @param hasProducts Whether products were found
 * @returns Promise resolving to user's choice or null for manual search
 */
export async function promptForSearchSelection(
  totalResults: number,
  hasProducts: boolean,
): Promise<string | null> {
  if (!hasProducts) {
    console.log("No products found.");
    const manualSearch = await question(
      "Would you like to try a manual search? (y/n): ",
    );
    if (manualSearch.toLowerCase() === "y") {
      return null;
    }
    throw new Error("No products found");
  }

  // Additional options
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

  return answer;
}

/**
 * Ask user for new search keywords
 * @returns Promise resolving to the new keywords
 */
export async function promptForManualKeywords(): Promise<string> {
  return await question("Enter new search keywords: ");
}

/**
 * Validate and parse user's selection
 * @param answer User's input
 * @param maxIndex Maximum valid index
 * @returns Parsed index or -1 if invalid
 */
export function parseUserSelection(answer: string, maxIndex: number): number {
  const selectedIndex = parseInt(answer, 10) - 1;

  if (
    isNaN(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= maxIndex
  ) {
    return -1;
  }

  return selectedIndex;
}