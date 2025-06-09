# Upoko Test Suite

This directory contains test scripts for validating the functionality of the Upoko audiobook processing tool.

## Quick Start

1. **Run Audiobook Split Test**: Test chapter splitting functionality for any supported format using the shell wrapper:
   ```bash
   ./test/run-split-test.sh path/to/test.{mp3,m4b,m4a} path/to/expected/files
   ```

That's it! The shell wrapper handles building, environment validation, and running the test for you.

## Test Environment Validation

The `validate-test-setup.ts` script checks if your environment is properly configured for testing.

## Audiobook Splitting Test

The `test-audio-splitting.ts` script validates the chapter splitting functionality by comparing output files with expected results for any supported audio format (MP3, M4B, M4A, etc.).

### Usage

Run the test using the convenient shell wrapper:
```bash
./test/run-split-test.sh <input-audio-file> <expected-files-directory> [output-directory] [tolerance-ms] [size-tolerance-percent]
```

### Arguments

- `<input-audio-file>`: Path to the audiobook file to test - supports MP3, M4B, M4A, etc. (required)
- `<expected-files-directory>`: Directory containing expected split files for comparison (required)
- `[output-directory]`: Output directory for test results (optional, default: `./test-output`)
- `[tolerance-ms]`: Duration tolerance in milliseconds (optional, default: 100)
- `[size-tolerance-percent]`: Size tolerance percentage (optional, default: 5)

### Test Process

1. **Input Validation**: Checks that input file and expected directory exist
2. **Split Execution**: Runs the upoko split command on the input M4B file
3. **File Comparison**: Compares output files with expected files by:
   - File count matching
   - Duration comparison (within tolerance)
   - File name matching (with normalization)
   - Optional file size comparison (within percentage tolerance)
4. **Report Generation**: Creates detailed pass/fail report and saves to JSON

### Expected Directory Structure

The expected directory should contain properly named chapter files that match the naming convention used by upoko:

```
expected-files/
├── 01 Chapter 1.mp3
├── 02 Chapter 2.mp3
├── 03 Chapter 3.mp3
└── ...
```

### Test Results

The script will output:
- Real-time progress during splitting
- Detailed comparison results
- Summary statistics (passed/failed/missing files)
- JSON report saved to the output directory

### Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed or error occurred

### Examples

```bash
# Test MP3 splitting with default settings
./test/run-split-test.sh ./samples/test-book.mp3 ./test-data/expected-chapters

# Test M4B splitting with custom tolerances
./test/run-split-test.sh ./samples/test-book.m4b ./test-data/expected-chapters ./test-results 50 3

# Test M4A splitting
./test/run-split-test.sh ./samples/audiobook.m4a ./reference-chapters
```

The second example will test splitting `test-book.m4b`, compare results with files in `expected-chapters`, save output to `test-results`, allow 50ms duration variance, and 3% size variance.

## Adding New Tests

To add new test scripts:

1. Create a new TypeScript file in this directory
2. Follow the same pattern as `test-m4b-splitting.ts`
3. Add a corresponding npm script in `package.json`
4. Update this README with usage instructions

## Error Handling

The test script handles common errors gracefully:
- Missing input files
- FFmpeg/FFprobe failures
- File permission issues
- Invalid command line arguments
- Comparison failures

All errors are logged with descriptive messages to help with debugging.