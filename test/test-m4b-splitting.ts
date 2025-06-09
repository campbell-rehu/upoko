/**
 * Test script for validating M4B chapter splitting functionality
 * 
 * Usage:
 *   npm run build
 *   node dist/test/test-m4b-splitting.js --input path/to/test.m4b --expected path/to/expected/files [--output path/to/output] [--tolerance 100]
 * 
 * Arguments:
 *   --input <path>     Path to the M4B file to test
 *   --expected <path>  Directory containing expected split files for comparison
 *   --output <path>    Optional output directory for test results (default: ./test-output)
 *   --tolerance <ms>   Duration tolerance in milliseconds (default: 100)
 *   --size-tolerance   Size tolerance percentage (default: 5%)
 * 
 * The script will:
 *   1. Split the input M4B file using the upoko split command
 *   2. Compare the output with expected files
 *   3. Check file counts, durations, names, and optionally sizes
 *   4. Generate a detailed test report
 * 
 * Expected directory should contain split chapter files with the same naming convention
 * that upoko uses: "BookTitle - 001 - Chapter Title.m4b"
 */

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

// Import FFmpeg service for duration extraction
import { FFmpegService } from '../src/core/services/ffmpegService.js';

const require = createRequire(import.meta.url);

interface TestArgs {
  input: string;
  expected: string;
  output: string;
  tolerance: number;
  sizeTolerance: number;
}

interface TestResult {
  fileName: string;
  status: 'pass' | 'fail' | 'missing';
  details: {
    durationMatch?: boolean;
    durationDiff?: number;
    sizeMatch?: boolean;
    sizeDiff?: number;
    nameMatch?: boolean;
    error?: string;
  };
}

interface TestReport {
  totalFiles: number;
  expectedFiles: number;
  passed: number;
  failed: number;
  missing: number;
  results: TestResult[];
  overallStatus: 'pass' | 'fail';
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): TestArgs {
  const parsed: Partial<TestArgs> = {
    output: './test-output',
    tolerance: 100,
    sizeTolerance: 5
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--input':
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.input = nextArg;
          i++;
        }
        break;
      case '--expected':
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.expected = nextArg;
          i++;
        }
        break;
      case '--output':
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.output = nextArg;
          i++;
        }
        break;
      case '--tolerance':
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.tolerance = parseInt(nextArg);
          i++;
        }
        break;
      case '--size-tolerance':
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.sizeTolerance = parseFloat(nextArg);
          i++;
        }
        break;
    }
  }

  if (!parsed.input || !parsed.expected) {
    console.error('Error: --input and --expected arguments are required');
    process.exit(1);
  }

  return parsed as TestArgs;
}

/**
 * Run the upoko split command
 */
async function runSplitCommand(input: string, output: string): Promise<{ success: boolean; outputDir: string; error?: string }> {
  console.log('\n🔄 Running upoko split command...');
  console.log(`  Input: ${input}`);
  console.log(`  Output: ${output}`);

  return new Promise((resolve) => {
    // Build the command path
    const scriptPath = path.join(process.cwd(), 'dist', 'src', 'index.js');
    
    const args = [
      scriptPath,
      'split',
      '--input', input,
      '--output', output,
      '--skip-validation',
      '--no-subdir'
    ];

    const proc = spawn('node', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // Show progress in real-time
      process.stdout.write(output);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Extract the actual output directory from stdout (last occurrence)
        const dirMatches = stdout.match(/Output directory: (.+)/g);
        const lastMatch = dirMatches ? dirMatches[dirMatches.length - 1] : null;
        const outputDir = lastMatch ? lastMatch.replace('Output directory: ', '').trim() : output;
        resolve({ success: true, outputDir });
      } else {
        resolve({ 
          success: false, 
          outputDir: output,
          error: `Split command failed with code ${code}: ${stderr}` 
        });
      }
    });

    proc.on('error', (error) => {
      resolve({ 
        success: false, 
        outputDir: output,
        error: `Failed to run split command: ${error.message}` 
      });
    });
  });
}

/**
 * Get list of audio files in a directory
 */
async function getAudioFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => /\.(mp3|m4a|m4b|aac|wav|flac)$/i.test(f))
      .sort();
  } catch (error) {
    console.error(`Error reading directory ${dir}: ${error}`);
    return [];
  }
}

/**
 * Extract file duration using FFmpeg
 */
async function getFileDuration(filePath: string): Promise<number> {
  try {
    const audioInfo = await FFmpegService.getAudioInfo(filePath);
    return audioInfo.duration;
  } catch (error) {
    console.error(`Error getting duration for ${filePath}: ${error}`);
    return -1;
  }
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error getting size for ${filePath}: ${error}`);
    return -1;
  }
}

/**
 * Compare two file names, ignoring minor differences
 */
function compareFileNames(actual: string, expected: string): boolean {
  // Remove extensions for comparison
  const actualBase = path.parse(actual).name;
  const expectedBase = path.parse(expected).name;
  
  // Direct match
  if (actualBase === expectedBase) {
    return true;
  }
  
  // Try normalizing (remove extra spaces, lowercase)
  const actualNorm = actualBase.toLowerCase().replace(/\s+/g, ' ').trim();
  const expectedNorm = expectedBase.toLowerCase().replace(/\s+/g, ' ').trim();
  
  return actualNorm === expectedNorm;
}

/**
 * Compare output files with expected files
 */
async function compareFiles(
  outputDir: string, 
  expectedDir: string, 
  tolerance: number,
  sizeTolerance: number
): Promise<TestReport> {
  console.log('\n🔍 Comparing output files with expected files...');
  
  const outputFiles = await getAudioFiles(outputDir);
  const expectedFiles = await getAudioFiles(expectedDir);
  
  console.log(`  Output files: ${outputFiles.length}`);
  console.log(`  Expected files: ${expectedFiles.length}`);
  console.log(`  Duration tolerance: ${tolerance}ms`);
  console.log(`  Size tolerance: ${sizeTolerance}%`);
  
  const results: TestResult[] = [];
  const processedExpected = new Set<string>();
  
  // Check each output file against expected files
  for (const outputFile of outputFiles) {
    const outputPath = path.join(outputDir, outputFile);
    let matched = false;
    
    // Try to find matching expected file
    for (const expectedFile of expectedFiles) {
      if (processedExpected.has(expectedFile)) continue;
      
      const expectedPath = path.join(expectedDir, expectedFile);
      
      // Check if names match
      if (compareFileNames(outputFile, expectedFile)) {
        processedExpected.add(expectedFile);
        matched = true;
        
        // Compare durations
        const [outputDuration, expectedDuration] = await Promise.all([
          getFileDuration(outputPath),
          getFileDuration(expectedPath)
        ]);
        
        const durationDiff = Math.abs(outputDuration - expectedDuration);
        const durationMatch = durationDiff <= tolerance;
        
        // Compare sizes
        const [outputSize, expectedSize] = await Promise.all([
          getFileSize(outputPath),
          getFileSize(expectedPath)
        ]);
        
        const sizeDiffPercent = Math.abs((outputSize - expectedSize) / expectedSize) * 100;
        const sizeMatch = sizeDiffPercent <= sizeTolerance;
        
        results.push({
          fileName: outputFile,
          status: durationMatch && sizeMatch ? 'pass' : 'fail',
          details: {
            nameMatch: true,
            durationMatch,
            durationDiff,
            sizeMatch,
            sizeDiff: sizeDiffPercent
          }
        });
        
        break;
      }
    }
    
    if (!matched) {
      results.push({
        fileName: outputFile,
        status: 'fail',
        details: {
          nameMatch: false,
          error: 'No matching expected file found'
        }
      });
    }
  }
  
  // Check for missing files (in expected but not in output)
  for (const expectedFile of expectedFiles) {
    if (!processedExpected.has(expectedFile)) {
      results.push({
        fileName: expectedFile,
        status: 'missing',
        details: {
          error: 'Expected file not found in output'
        }
      });
    }
  }
  
  // Calculate summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const missing = results.filter(r => r.status === 'missing').length;
  
  return {
    totalFiles: outputFiles.length,
    expectedFiles: expectedFiles.length,
    passed,
    failed,
    missing,
    results,
    overallStatus: failed === 0 && missing === 0 && outputFiles.length === expectedFiles.length ? 'pass' : 'fail'
  };
}

/**
 * Generate and display test report
 */
function displayReport(report: TestReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('TEST REPORT');
  console.log('='.repeat(60));
  
  console.log(`\nSummary:`);
  console.log(`  Total output files: ${report.totalFiles}`);
  console.log(`  Expected files: ${report.expectedFiles}`);
  console.log(`  Passed: ${report.passed}`);
  console.log(`  Failed: ${report.failed}`);
  console.log(`  Missing: ${report.missing}`);
  console.log(`  Overall Status: ${report.overallStatus.toUpperCase()}`);
  
  if (report.results.length > 0) {
    console.log(`\nDetailed Results:`);
    console.log('-'.repeat(60));
    
    // Group by status
    const groups = {
      pass: report.results.filter(r => r.status === 'pass'),
      fail: report.results.filter(r => r.status === 'fail'),
      missing: report.results.filter(r => r.status === 'missing')
    };
    
    // Show passed files
    if (groups.pass.length > 0) {
      console.log('\n✅ PASSED:');
      for (const result of groups.pass) {
        console.log(`  ${result.fileName}`);
      }
    }
    
    // Show failed files with details
    if (groups.fail.length > 0) {
      console.log('\n❌ FAILED:');
      for (const result of groups.fail) {
        console.log(`  ${result.fileName}:`);
        const details = result.details;
        
        if (!details.nameMatch) {
          console.log(`    - Name mismatch: ${details.error}`);
        }
        if (details.durationMatch === false) {
          console.log(`    - Duration mismatch: ${details.durationDiff}ms difference`);
        }
        if (details.sizeMatch === false) {
          console.log(`    - Size mismatch: ${details.sizeDiff?.toFixed(1)}% difference`);
        }
      }
    }
    
    // Show missing files
    if (groups.missing.length > 0) {
      console.log('\n⚠️  MISSING:');
      for (const result of groups.missing) {
        console.log(`  ${result.fileName}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(report.overallStatus === 'pass' ? '✅ ALL TESTS PASSED!' : '❌ TESTS FAILED!');
  console.log('='.repeat(60) + '\n');
}

/**
 * Save test report to file
 */
async function saveReport(report: TestReport, outputDir: string): Promise<void> {
  const reportPath = path.join(outputDir, 'test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Test report saved to: ${reportPath}`);
}

/**
 * Main test function
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  console.log('M4B Chapter Splitting Test');
  console.log('=========================');
  console.log(`Input file: ${args.input}`);
  console.log(`Expected files: ${args.expected}`);
  console.log(`Output directory: ${args.output}`);
  console.log(`Duration tolerance: ${args.tolerance}ms`);
  console.log(`Size tolerance: ${args.sizeTolerance}%`);
  
  try {
    // Validate input file exists
    await fs.access(args.input);
    
    // Validate expected directory exists
    await fs.access(args.expected);
    const expectedFiles = await getAudioFiles(args.expected);
    if (expectedFiles.length === 0) {
      throw new Error('No audio files found in expected directory');
    }
    
    // Create output directory
    await fs.mkdir(args.output, { recursive: true });
    
    // Run split command
    const splitResult = await runSplitCommand(args.input, args.output);
    
    if (!splitResult.success) {
      console.error(`\n❌ Split command failed: ${splitResult.error}`);
      process.exit(1);
    }
    
    // Wait a moment for files to be fully written
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Compare files
    const report = await compareFiles(
      splitResult.outputDir, 
      args.expected, 
      args.tolerance,
      args.sizeTolerance
    );
    
    // Display report
    displayReport(report);
    
    // Save report
    await saveReport(report, args.output);
    
    // Exit with appropriate code
    process.exit(report.overallStatus === 'pass' ? 0 : 1);
    
  } catch (error) {
    console.error(`\n❌ Test failed with error: ${error}`);
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});