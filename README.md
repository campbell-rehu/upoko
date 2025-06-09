# upoko

> upoko means "chapter" in Te Reo Maori. (https://maoridictionary.co.nz/word/8896)

Upoko is a Node.js CLI application that processes audiobook files by adding chapter metadata and optionally splitting them into individual chapter files. It queries the [Audible](https://audible.readthedocs.io/en/latest/misc/external_api.html#documentation) and [Audnexus](https://github.com/laxamentumtech/audnexus) APIs to retrieve chapter information for audiobook files.

## Features

- **Chapter Metadata**: Add chapter tags to audiobook files using the [NodeID3](https://github.com/Zazama/node-id3) library
- **Chapter Splitting**: Split audiobooks into individual chapter files using FFmpeg
- **Interactive Search**: Automatically search for audiobooks by filename or ASIN
- **Multiple Formats**: Support for MP3, M4A, AAC, WAV, and FLAC files
- **Dry-Run Mode**: Preview operations without making actual changes
- **Progress Tracking**: Real-time progress feedback for long operations
- **Cross-Platform**: Works on Windows, macOS, and Linux

This app was inspired by the following projects:

- [mp3chapters.github.io](https://github.com/mp3chapters/mp3chapters.github.io)
- [beets-audible](https://github.com/seanap/beets-audible)
- [mp3chaps](https://github.com/dskrad/mp3chaps)

## Installation

```bash
npm install
npm run build
```

## Usage

Upoko provides two main commands:

### Process Command (Add Chapter Metadata)

Add chapter metadata to audiobook files:

```bash
# Process all files in input directory
npm run start

# Explicit process command
npm run start process

# Dry-run mode (preview changes)
npm run start -- --dry-run

# Process all files without prompts
npm run start -- --process-all

# Tag files AND split them into chapters in one operation
npm run start -- --split
```

**Setup:**
1. Create an `input` directory in the project root
2. Place your audiobook files in the `input` directory
3. Run the command above
4. Processed files will be saved to the `output` directory

### Split Command (Split into Chapters)

Split audiobooks into individual chapter files:

```bash
# Split with smart defaults
npm run start split audiobook.mp3

# Specify output directory and format
npm run start split -i audiobook.mp3 -o ./chapters -f mp3

# Preview split operation
npm run start split --dry-run audiobook.mp3

# Use specific ASIN
npm run start split --asin B123456789 audiobook.mp3

# See all options
npm run start split --help
```

**Split Options:**
- `--input, -i`: Input audiobook file path (required)
- `--output, -o`: Output directory (default: "./output/split")
- `--format, -f`: Output format (mp3, m4a, aac, wav, flac)
- `--dry-run, -d`: Preview without creating files
- `--overwrite`: Overwrite existing chapter files
- `--no-playlist`: Skip playlist/index generation
- `--asin`: Provide ASIN directly to fetch chapters

**Process + Split Combined:**
Use `--split` with the process command to tag and split in one operation:
```bash
npm run start -- --split           # Tag and split all files in input/
npm run start -- --split --dry-run # Preview tag + split operation
```

## Development

### Project Structure
```
src/
├── cli/              # Command line interface
│   ├── commands/     # Individual CLI commands
│   └── ui/          # User interface components
├── core/            # Core business logic
│   ├── models/      # Type definitions
│   ├── processors/  # Audio processing logic
│   └── services/    # External service integrations
└── util.ts         # Utility functions
```

### Building
```bash
npm run build        # Compile TypeScript
```

### Configuration
See `CLAUDE.md` for development configuration and commands.

## Requirements

- Node.js 18+
- FFmpeg (automatically installed via ffmpeg-static)
- TypeScript 5+

## Output

### Process Command
- Tagged audiobook files in `output/` directory
- Processing log in `output/processed_files.json`

### Split Command  
- Individual chapter files in organized subdirectories
- M3U playlist file for chapter playback order
- JSON index file with chapter metadata
- Automatic filename sanitization for cross-platform compatibility
