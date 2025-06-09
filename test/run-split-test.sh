#!/bin/bash

# Simple wrapper script for running audiobook splitting tests
# Usage: ./run-split-test.sh input.{mp3,m4b,m4a} expected-dir [output-dir] [tolerance] [size-tolerance]

set -e

# Check if required arguments are provided
if [ $# -lt 2 ]; then
    echo "Usage: $0 <input-audio> <expected-dir> [output-dir] [tolerance] [size-tolerance]"
    echo ""
    echo "Arguments:"
    echo "  input-audio  Path to audiobook file to test (MP3, M4B, M4A, etc.)"
    echo "  expected-dir Directory with expected split files"
    echo "  output-dir   Output directory (default: ./test-output)"
    echo "  tolerance    Duration tolerance in ms (default: 100)"
    echo "  size-tolerance Size tolerance percentage (default: 5)"
    echo ""
    echo "Examples:"
    echo "  $0 ./samples/book.mp3 ./expected-chapters"
    echo "  $0 ./samples/book.m4b ./expected-chapters ./my-test-output 50 3"
    exit 1
fi

INPUT_FILE="$1"
EXPECTED_DIR="$2"
OUTPUT_DIR="${3:-./test-output}"
TOLERANCE="${4:-100}"
SIZE_TOLERANCE="${5:-5}"

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

# Check if expected directory exists
if [ ! -d "$EXPECTED_DIR" ]; then
    echo "Error: Expected directory '$EXPECTED_DIR' not found"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Audiobook Chapter Splitting Test"
echo "========================="
echo "Input file: $INPUT_FILE"
echo "Expected directory: $EXPECTED_DIR" 
echo "Output directory: $OUTPUT_DIR"
echo "Duration tolerance: ${TOLERANCE}ms"
echo "Size tolerance: ${SIZE_TOLERANCE}%"
echo ""

# Build the project first
echo "Building project..."
cd "$PROJECT_ROOT"
npm run build

echo ""
echo "Running test..."

# Run the test
node "$PROJECT_ROOT/dist/test/test-audio-splitting.js" \
    --input "$INPUT_FILE" \
    --expected "$EXPECTED_DIR" \
    --output "$OUTPUT_DIR" \
    --tolerance "$TOLERANCE" \
    --size-tolerance "$SIZE_TOLERANCE"

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Test completed successfully!"
    exit 0
else
    echo ""
    echo "❌ Test failed!"
    exit 1
fi