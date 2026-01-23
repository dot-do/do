# DO CLI - Implementation Guidelines

## Architecture Overview

The CLI is built with a modular command structure using a consistent pattern:

1. **Command Definition** - Each command is a separate module
2. **Option Parsing** - Consistent option handling with yargs/commander style
3. **Execution** - Async command execution with proper error handling
4. **Output** - Consistent logging with colors and spinners

## File Structure

```
src/cli/
├── index.ts              # CLI entry point and command router
├── commands/
│   ├── init.ts           # Project initialization
│   ├── dev.ts            # Local development server
│   ├── deploy.ts         # Cloudflare deployment
│   ├── sync.ts           # GitHub synchronization
│   └── publish.ts        # NPM publishing
├── lib/
│   ├── config.ts         # Configuration loading (to be created)
│   ├── logger.ts         # Logging utilities (to be created)
│   ├── cloudflare.ts     # Cloudflare API client (to be created)
│   ├── github.ts         # GitHub API client (to be created)
│   └── npm.ts            # NPM registry client (to be created)
└── templates/            # Project templates (to be created)
    ├── basic/
    ├── chat/
    ├── game/
    └── api/
```

## Implementation Guidelines

### index.ts

The entry point should:

1. Parse command-line arguments
2. Load configuration from `do.config.ts`
3. Route to appropriate command handler
4. Handle errors gracefully with user-friendly messages
5. Exit with appropriate exit codes

```typescript
// Key patterns:
// - Use process.argv for argument parsing
// - Support both CLI and programmatic usage
// - Provide help text with examples
// - Handle SIGINT/SIGTERM for cleanup
```

### Command Pattern

Each command module should export:

```typescript
export interface CommandOptions {
  // Command-specific options
}

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
}

export async function execute(options: CommandOptions): Promise<CommandResult>

// Also export metadata for help generation
export const name = 'command-name'
export const description = 'What this command does'
export const options = [
  { name: '--option', alias: '-o', description: '...' }
]
```

### init.ts

Initialization should:

1. Prompt for missing configuration interactively
2. Support template selection
3. Create directory structure
4. Generate configuration files
5. Initialize git repository
6. Install dependencies

### dev.ts

Development server should:

1. Watch for file changes
2. Rebuild on changes
3. Restart DO instances
4. Proxy WebSocket connections
5. Persist DO state (optional)
6. Log requests with colors

Implementation considerations:
- Use miniflare for local DO simulation
- Support hot module replacement
- Provide error overlay in browser

### deploy.ts

Deployment should:

1. Validate configuration
2. Build TypeScript
3. Bundle with esbuild
4. Upload to Cloudflare API
5. Configure DO bindings
6. Wait for deployment to be active
7. Output deployment URL

### sync.ts

GitHub sync should:

1. Check for uncommitted changes
2. Create/update repository
3. Push changes
4. Configure Actions (if enabled)
5. Set up branch protection

### publish.ts

NPM publishing should:

1. Validate package.json
2. Build distribution
3. Generate type declarations
4. Create SDK bindings
5. Publish to registry

## Configuration Loading

Configuration should be loaded from multiple sources with precedence:

1. CLI arguments (highest)
2. Environment variables
3. `do.config.ts` file
4. Default values (lowest)

```typescript
// Configuration schema with defaults
const defaultConfig = {
  src: './src',
  out: './dist',
  dev: {
    port: 8787,
    host: 'localhost',
    persist: false,
  },
}
```

## Error Handling

All commands should:

1. Catch and format errors
2. Provide actionable error messages
3. Suggest fixes when possible
4. Exit with non-zero code on failure

```typescript
class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string
  ) {
    super(message)
  }
}
```

## Logging

Use a consistent logger with:

- Log levels: debug, info, warn, error
- Color support (respect NO_COLOR)
- Spinners for long operations
- Progress bars for uploads

```typescript
// Example usage
logger.info('Deploying to Cloudflare...')
logger.success('Deployed successfully!')
logger.error('Deployment failed', error)
logger.warn('No CLOUDFLARE_API_TOKEN found')
```

## Testing Considerations

- Mock external APIs (Cloudflare, GitHub, NPM)
- Test command parsing
- Test configuration loading
- Integration tests with real services

## Security Considerations

- Never log sensitive tokens
- Use secure token storage
- Validate all user input
- Handle file permissions correctly
