/**
 * objects.do CLI
 *
 * Interactive REPL for Digital Objects
 */

import * as readline from 'readline'
import { cli } from '@dotdo/cli'

const DEFAULT_URL = 'https://objects.do'

interface ParsedArgs {
  url: string
  expression?: string
  help: boolean
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    url: DEFAULT_URL,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') {
      result.help = true
    } else if (arg === '-u' || arg === '--url') {
      result.url = args[++i] || DEFAULT_URL
    } else if (!arg.startsWith('-')) {
      result.expression = arg
    }
  }

  return result
}

function printHelp(): void {
  console.log(`
objects.do CLI - Interactive Digital Objects REPL

Usage:
  objects [options] [expression]

Options:
  -u, --url <url>    Base URL (default: ${DEFAULT_URL})
  -h, --help         Show this help message

Examples:
  objects                                  # Start interactive REPL
  objects '$.collection("users").find()'   # Run single expression
  objects '$.relsFrom("alice")'            # Query relationships

REPL Commands:
  .help              Show REPL commands
  .exit              Exit the REPL
  .clear             Clear screen
  .schema            Show DO schema

Expression Syntax:
  $.methodName(args)                       # Call method
  $.collection("name").find()              # Query collection
  $.collection("name").put("id", {...})    # Store document
  $.relsAdd("from", "predicate", "to")     # Add relationship
`)
}

async function evalExpression(baseUrl: string, expr: string): Promise<unknown> {
  // Convert $.method() to /$method() URL format
  let path = expr.trim()
  if (path.startsWith('$.')) {
    path = '/$' + path.slice(2)
  } else if (path.startsWith('$')) {
    path = '/' + path
  } else if (!path.startsWith('/')) {
    path = '/$' + path
  }

  const url = new URL(path, baseUrl)
  const response = await fetch(url.toString())

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return response.json()
}

async function startRepl(baseUrl: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'objects> ',
  })

  console.log(`objects.do REPL - connected to ${baseUrl}`)
  console.log('Type .help for commands, .exit to quit\n')

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()

    if (!input) {
      rl.prompt()
      return
    }

    // Handle REPL commands
    if (input === '.exit' || input === '.quit') {
      rl.close()
      return
    }
    if (input === '.help') {
      printHelp()
      rl.prompt()
      return
    }
    if (input === '.clear') {
      console.clear()
      rl.prompt()
      return
    }
    if (input === '.schema') {
      try {
        const schema = await evalExpression(baseUrl, '')
        await cli.printHighlighted(JSON.stringify(schema, null, 2), 'json')
      } catch (err) {
        console.error('Error:', (err as Error).message)
      }
      rl.prompt()
      return
    }

    // Evaluate expression
    try {
      const result = await evalExpression(baseUrl, input)
      await cli.printHighlighted(JSON.stringify(result, null, 2), 'json')
    } catch (err) {
      console.error('Error:', (err as Error).message)
    }

    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\nGoodbye!')
    process.exit(0)
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (args.expression) {
    // Single expression mode
    try {
      const result = await evalExpression(args.url, args.expression)
      await cli.printHighlighted(JSON.stringify(result, null, 2), 'json')
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  } else {
    // Interactive REPL mode
    await startRepl(args.url)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
