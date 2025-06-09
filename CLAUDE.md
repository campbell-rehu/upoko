# Claude Instructions for Upoko

## Project Information
- Project Type: Node.js CLI Application
- Main Language: TypeScript
- Framework: Node.js with NodeID3 for audio tagging

## Commands
- Build: npm run build
- Test: (no tests configured yet)
- Lint: (no linter configured yet)
- Start: npm run start

## Project Structure
- `src/cli/` - Command line interface components
- `src/core/` - Core business logic (services, processors, models)
- `src/util.ts` - Utility functions
- `input/` - Directory for source audiobook files
- `output/` - Directory for processed files with chapter tags

## Development Guidelines
- Always run `npm run build` before testing changes
- Use the existing modular architecture when adding features
- Follow TypeScript strict mode conventions
- Maintain separation between CLI, core logic, and services

## Notes
- This application processes audiobook files by adding chapter metadata from Audible APIs
- Uses dry-run mode for testing without file modifications
- Maintains a log of processed files to avoid reprocessing