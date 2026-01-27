# [objects.do](https://objects.do)

Every entity IS a Durable Object.

```typescript
import { DigitalObject } from '@dotdo/do'

export class MyDO extends DigitalObject {
  // Collections (MongoDB-style on SQLite)
  users = this.collection<User>('users')

  // Relationships
  async follow(from: string, to: string) {
    this.rels.add(from, 'follows', to, 'followedBy')
  }

  async getFollowers(userId: string) {
    return this.rels.to(userId, 'follows')
  }
}
```

## Features

- **Collections** - MongoDB-style document store on SQLite (via `@dotdo/rpc`)
- **Relationships** - Simple graph relationships with reverse lookups
- **CDC** - All mutations emit to Cloudflare Pipelines
- **RPC** - Full capnweb RPC with WebSocket hibernation

## Install

```bash
npm install @dotdo/do
```

## Structure

- `@dotdo/do` - Abstract package (in `core/`)
- `objects.do` - Managed service (root)

## Development

```bash
pnpm install
pnpm dev        # Local dev server
pnpm deploy     # Deploy to Cloudflare
```
