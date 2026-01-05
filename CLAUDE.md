# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gittles is a GitHub stars CLI tool built with Ink (React for CLIs). It uses a local SQLite database with Drizzle ORM for data storage. Users authenticate via GitHub to browse and interact with their starred repositories.

## Commands

```bash
# Build
pnpm build

# Development (watch mode)
pnpm dev

# Run all checks (prettier + xo + ava tests)
pnpm test

# Run a single test file
pnpm exec ava test.tsx

# Run a single test by title
pnpm exec ava --match="greet unknown user"
```

## Architecture

- **Framework**: Ink v6 (React-based CLI framework)
- **Entry point**: `source/cli.tsx` - CLI argument parsing with meow, renders the React app
- **Main component**: `source/app.tsx` - Root React component
- **Database**: SQLite via `@libsql/client` with Drizzle ORM
- **Testing**: AVA with `ink-testing-library` for component tests

## Code Style

- Uses XO for linting (extends xo-react)
- Prettier for formatting (uses `@vdemedes/prettier-config`)
- TypeScript with `@sindresorhus/tsconfig` base config
- ESM modules (`"type": "module"`)
- Node.js 24+ required
