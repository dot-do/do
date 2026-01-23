# DO SDK Snippets

Example code snippets demonstrating usage patterns for Digital Objects (DO).

## Overview

These snippets show how to use the DO framework's key features:

| Snippet | Description |
|---------|-------------|
| [basic-do.ts](./basic-do.ts) | Creating and configuring a basic Digital Object |
| [collections.ts](./collections.ts) | Working with Things, Actions, and Relationships |
| [cascade.ts](./cascade.ts) | Using cascade operators (->, ~>, <-, <~) for entity linking |
| [rpc-client.ts](./rpc-client.ts) | Using the RPC client SDK for remote DO access |
| [cdc-streaming.ts](./cdc-streaming.ts) | CDC event handling with $context hierarchy |
| [ai-operations.ts](./ai-operations.ts) | AI generation with model selection |
| [startup-example.ts](./startup-example.ts) | Complete Startup DO example with full cascade |

## Key Concepts

### Digital Object Identity

Every DO has three identity properties:
- `$id`: HTTPS URL identifier (e.g., `https://headless.ly`)
- `$type`: Type URL or shorthand (e.g., `Startup`, `https://do.md/SaaS`)
- `$context`: Optional parent DO URL for hierarchical CDC streaming

### Collections

DOs contain multiple collection types:
- **Nouns/Verbs**: Schema definitions (entity types and action types)
- **Things**: Entity instances with MDXLD support
- **Actions**: Durable action instances with status tracking
- **Relationships**: Connections between Things

### Cascade Operators

Four operators for post-generation entity linking:
- `->` Forward Insert: Create entity, link TO it
- `~>` Forward Search: Vector search existing, link TO it
- `<-` Backward Insert: Create entity, link FROM it (it owns us)
- `<~` Backward Search: Vector search existing, link FROM it

### Context ($) API

The runtime context provides:
- `$.ai` - AI operations with tagged template syntax
- `$.db` - Database operations with natural language queries
- `$.on` - Event handlers for CDC events
- `$.every` - Scheduled task definitions
- `$.email`, `$.slack`, `$.sms` - Communication
- `$.voice` - Voice AI agents
- `$.pay` - Financial operations

## Running the Examples

```bash
# Install dependencies
pnpm install

# Run a specific example
npx tsx snippets/basic-do.ts
```

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture overview
- [types/](../types/) - TypeScript type definitions
- [src/](../src/) - Source implementations
