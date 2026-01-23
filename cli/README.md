# DO CLI

Command-line interface for managing Durable Object projects.

## Overview

The DO CLI provides tools for initializing, developing, deploying, and publishing Durable Object projects. It integrates with Cloudflare Workers, GitHub, and NPM.

## Installation

```bash
npm install -g @do/cli
# or
pnpm add -g @do/cli
# or
yarn global add @do/cli
```

## Commands

### `do init`

Initialize a new DO project in the current directory.

```bash
do init [name]
do init my-counter

# Options
--template, -t    Project template (basic, chat, game, api)
--typescript      Use TypeScript (default: true)
--git             Initialize git repository (default: true)
--install         Install dependencies (default: true)
```

Creates:
- `do.config.ts` - DO configuration file
- `src/` - Source directory with example DO
- `package.json` - Node.js package manifest
- `wrangler.toml` - Cloudflare Workers configuration
- `tsconfig.json` - TypeScript configuration

### `do dev`

Start local development server with hot reload.

```bash
do dev

# Options
--port, -p        Port to listen on (default: 8787)
--host, -h        Host to bind to (default: localhost)
--persist         Persist DO state between restarts
--inspect         Enable Node.js inspector
--env, -e         Environment to use (default: development)
```

Features:
- Hot module replacement for DO code
- Local DO state persistence
- WebSocket support
- Request logging
- Error overlay

### `do deploy`

Deploy the DO to Cloudflare Workers.

```bash
do deploy

# Options
--env, -e         Environment to deploy to (default: production)
--dry-run         Preview deployment without applying
--minify          Minify output (default: true)
--compatibility   Compatibility date (default: today)
```

Steps:
1. Build TypeScript to JavaScript
2. Bundle with dependencies
3. Upload to Cloudflare
4. Configure DO bindings
5. Activate deployment

### `do sync`

Sync project to GitHub repository.

```bash
do sync

# Options
--repo, -r        GitHub repository (owner/repo)
--branch, -b      Branch to sync (default: main)
--force, -f       Force push (use with caution)
--message, -m     Commit message
```

Features:
- Create repository if it doesn't exist
- Push all changes with a commit
- Configure GitHub Actions for CI/CD
- Set up branch protection rules

### `do publish`

Publish the DO as an NPM package.

```bash
do publish

# Options
--tag             NPM tag (default: latest)
--access          Package access (public, restricted)
--dry-run         Preview publish without uploading
--otp             One-time password for 2FA
```

Publishes:
- Compiled JavaScript
- TypeScript declarations
- SDK client bindings
- README and documentation

## Configuration

### do.config.ts

```typescript
import { defineConfig } from '@do/cli'

export default defineConfig({
  // Project name
  name: 'my-counter',

  // Source directory
  src: './src',

  // Output directory
  out: './dist',

  // Durable Objects
  durableObjects: {
    Counter: {
      class: 'Counter',
      script: './src/counter.ts',
    },
  },

  // Cloudflare configuration
  cloudflare: {
    accountId: process.env.CF_ACCOUNT_ID,
    workerName: 'my-counter-worker',
  },

  // GitHub sync configuration
  github: {
    repo: 'myorg/my-counter',
    branch: 'main',
    actions: true,
  },

  // NPM publish configuration
  npm: {
    name: '@myorg/counter-do',
    access: 'public',
  },

  // Development server
  dev: {
    port: 8787,
    persist: true,
  },
})
```

### Environment Variables

```bash
# Required for deploy
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Required for sync
GITHUB_TOKEN=your-github-token

# Required for publish
NPM_TOKEN=your-npm-token
```

## Project Structure

```
my-do-project/
├── do.config.ts          # DO configuration
├── package.json          # Node.js manifest
├── tsconfig.json         # TypeScript config
├── wrangler.toml         # Cloudflare config
├── src/
│   ├── index.ts          # Worker entry point
│   └── counter.ts        # DO implementation
├── test/
│   └── counter.test.ts   # DO tests
└── dist/                 # Build output
    ├── index.js
    └── index.d.ts
```

## Workflows

### Development Workflow

```bash
# 1. Initialize project
do init my-project

# 2. Start development
cd my-project
do dev

# 3. Make changes (hot reload)
# Edit src/counter.ts

# 4. Deploy when ready
do deploy
```

### Publishing Workflow

```bash
# 1. Sync to GitHub
do sync -m "feat: add decrement method"

# 2. Publish to NPM
do publish

# 3. Deploy update
do deploy
```

## Integration

### GitHub Actions

When `github.actions` is enabled, `do sync` creates:

```yaml
# .github/workflows/do.yml
name: DO CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx do deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### NPM Package

Published packages include:

```typescript
// Consumer usage
import { Counter } from '@myorg/counter-do'
import { createClient } from '@do/sdk'

const client = createClient<Counter>({
  url: 'https://my-counter.workers.dev',
  id: 'counter-1',
})

await client.call('increment', { amount: 5 })
```

## Troubleshooting

### Common Issues

**"CLOUDFLARE_API_TOKEN is not set"**
- Ensure the environment variable is set
- Verify token has correct permissions

**"Failed to connect to DO"**
- Check if the worker is deployed
- Verify the DO binding is correct

**"Build failed"**
- Check TypeScript errors: `npx tsc --noEmit`
- Verify dependencies are installed

## License

MIT
