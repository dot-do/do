# CLAUDE.md - Digital Object (DO)

## What This Is

Every entity IS a Durable Object. Simple database (collections + relationships), CDC events to Pipeline.

## Structure

```
/                    # objects.do (managed service)
  index.ts           # Worker entry point
  wrangler.jsonc     # Worker config
  package.json       # objects.do service
  tests/             # E2E tests

core/                # @dotdo/do (abstract package)
  src/
    index.ts         # DigitalObject class
    rels.ts          # Relationships helper (~50 lines)
    cdc.ts           # CDC emitter (~30 lines)
  tests/             # Unit tests (vitest-pool-workers)
  package.json       # @dotdo/do package
```

## Dependencies

- `@dotdo/rpc` - RPC layer (capnweb, collections, hibernation)
- `oauth.do` - Auth (WorkOS)
- `events` (separate repo) - Event queries (DuckDB)

## Commands

```bash
# Root (objects.do service)
pnpm dev          # Local dev
pnpm test:e2e     # E2E tests
pnpm deploy       # Deploy to Cloudflare

# Core (@dotdo/do package)
cd core
pnpm test         # Unit tests (vitest-pool-workers)
pnpm build        # Build package
```

## Code Style

- No semicolons
- Single quotes
- 2-space indent

## Beads Issue Tracking

This project uses Beads (`.beads/`) for issue tracking.

### Commands

```bash
bd ready                           # Show issues ready to work
bd list --status=open              # All open issues
bd show <id>                       # Detailed issue view
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>                      # Mark complete
bd dep add <issue> <depends-on>    # Add dependency
bd sync                            # Sync with git
```

**Priority**: 0-4 (0=critical, 2=medium, 4=backlog).

### Session Close Protocol

Before saying "done":
```bash
git status          # Check changes
git add <files>     # Stage code
bd sync             # Commit beads
git commit          # Commit code
git push            # Push to remote
```
