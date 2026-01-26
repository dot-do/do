#!/usr/bin/env node
/**
 * @dotdo/cli - The DO CLI
 *
 * Publish, deploy, and manage Digital Objects.
 *
 * Usage:
 *   dotdo publish ./my-do.ts              # Publish DO to objects.do
 *   dotdo publish ./my-do.ts --id app.do  # Publish with specific ID
 *   dotdo dev ./my-do.ts                  # Local development
 *   dotdo types ./my-do.ts                # Generate types only
 *
 * When installed globally:
 *   do publish ./my-do.ts
 *   do dev ./my-do.ts
 */

import { Command } from 'commander'
import { publish, type PublishOptions } from './publish.js'
import { dev } from './dev.js'
import { extractTypes, generateDTS, generateIndex } from 'rpc.do'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

const program = new Command()

program
  .name('dotdo')
  .description('The DO CLI - publish, deploy, and manage Digital Objects')
  .version('0.1.0')

// =============================================================================
// publish command
// =============================================================================

program
  .command('publish <source>')
  .description('Publish a DO definition to objects.do')
  .option('--id <id>', 'DO ID (defaults to filename)')
  .option('--domain <domain>', 'Custom domain to point to this DO')
  .option('--registry <url>', 'Registry URL (default: https://objects.do)')
  .option('--token <token>', 'Auth token (or set DOTDO_TOKEN)')
  .option('--dry-run', 'Show what would be published without publishing')
  .action(async (source: string, options) => {
    const sourceFile = resolve(process.cwd(), source)

    if (!existsSync(sourceFile)) {
      console.error(`Error: Source file not found: ${source}`)
      process.exit(1)
    }

    const id = options.id || basename(source, '.ts').replace(/DO$/, '') + '.do'
    const token = options.token || process.env.DOTDO_TOKEN

    if (!token && !options.dryRun) {
      console.error('Error: Auth token required. Set DOTDO_TOKEN or use --token')
      process.exit(1)
    }

    console.log(`Publishing ${source} as ${id}...`)

    try {
      const result = await publish({
        source: sourceFile,
        id,
        domain: options.domain,
        registry: options.registry || 'https://objects.do',
        token: token || '',
        dryRun: options.dryRun,
      })

      if (options.dryRun) {
        console.log('\nDry run - would publish:')
        console.log(JSON.stringify(result.definition, null, 2))
        return
      }

      console.log(`\n✓ Published: ${result.url}`)
      if (result.domain) {
        console.log(`✓ Domain: https://${result.domain}`)
      }
      console.log(`\nYour DO is live at:`)
      console.log(`  ${result.url}`)
      console.log(`\nRPC endpoint:`)
      console.log(`  POST ${result.url}/rpc`)
      console.log(`\nSchema:`)
      console.log(`  GET ${result.url}/__schema`)
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

// =============================================================================
// dev command
// =============================================================================

program
  .command('dev <source>')
  .description('Run a DO locally for development')
  .option('--port <port>', 'Port to run on', '8787')
  .option('--id <id>', 'DO ID for local development')
  .action(async (source: string, options) => {
    const sourceFile = resolve(process.cwd(), source)

    if (!existsSync(sourceFile)) {
      console.error(`Error: Source file not found: ${source}`)
      process.exit(1)
    }

    console.log(`Starting dev server for ${source}...`)

    try {
      await dev({
        source: sourceFile,
        port: parseInt(options.port, 10),
        id: options.id,
      })
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

// =============================================================================
// types command
// =============================================================================

program
  .command('types <source>')
  .description('Generate TypeScript types for a DO')
  .option('--output <dir>', 'Output directory', '.do')
  .action(async (source: string, options) => {
    const sourceFile = resolve(process.cwd(), source)
    const outputDir = resolve(process.cwd(), options.output)

    if (!existsSync(sourceFile)) {
      console.error(`Error: Source file not found: ${source}`)
      process.exit(1)
    }

    console.log(`Generating types for ${source}...`)

    try {
      const schemas = await extractTypes(sourceFile)

      if (schemas.length === 0) {
        console.error('Error: No DO classes found in source file')
        process.exit(1)
      }

      mkdirSync(outputDir, { recursive: true })

      for (const schema of schemas) {
        const dtsContent = generateDTS(schema)
        const dtsPath = join(outputDir, `${schema.className}.d.ts`)
        writeFileSync(dtsPath, dtsContent)
        console.log(`  Generated: ${dtsPath}`)
      }

      const indexContent = generateIndex(schemas)
      const indexPath = join(outputDir, 'index.ts')
      writeFileSync(indexPath, indexContent)
      console.log(`  Generated: ${indexPath}`)

      console.log(`\n✓ Types generated in ${options.output}/`)
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

// =============================================================================
// login command
// =============================================================================

program
  .command('login')
  .description('Authenticate with objects.do')
  .option('--token <token>', 'API token')
  .action(async (options) => {
    // TODO: Implement OAuth flow or token-based login
    console.log('Login flow coming soon...')
    console.log('For now, set DOTDO_TOKEN environment variable')
  })

// =============================================================================
// list command
// =============================================================================

program
  .command('list')
  .description('List your published DOs')
  .option('--registry <url>', 'Registry URL', 'https://objects.do')
  .action(async (options) => {
    const token = process.env.DOTDO_TOKEN
    if (!token) {
      console.error('Error: Auth token required. Set DOTDO_TOKEN')
      process.exit(1)
    }

    try {
      const response = await fetch(`${options.registry}/api/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error(`Failed to list: ${response.statusText}`)
      }

      const dos = await response.json() as Array<{ id: string; updatedAt: string }>

      if (dos.length === 0) {
        console.log('No DOs published yet.')
        return
      }

      console.log('Your published DOs:\n')
      for (const d of dos) {
        console.log(`  ${d.id}`)
        console.log(`    Updated: ${new Date(d.updatedAt).toLocaleString()}`)
        console.log(`    URL: ${options.registry}/${d.id}`)
        console.log('')
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

// =============================================================================
// delete command
// =============================================================================

program
  .command('delete <id>')
  .description('Delete a published DO')
  .option('--registry <url>', 'Registry URL', 'https://objects.do')
  .option('--force', 'Skip confirmation')
  .action(async (id: string, options) => {
    const token = process.env.DOTDO_TOKEN
    if (!token) {
      console.error('Error: Auth token required. Set DOTDO_TOKEN')
      process.exit(1)
    }

    if (!options.force) {
      console.log(`This will delete ${id} permanently.`)
      console.log('Use --force to confirm.')
      process.exit(1)
    }

    try {
      const response = await fetch(`${options.registry}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.statusText}`)
      }

      console.log(`✓ Deleted: ${id}`)
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program.parse()
