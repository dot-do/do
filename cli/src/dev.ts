/**
 * Local development server for DOs
 *
 * Runs a DO locally with hot reloading.
 */

export interface DevOptions {
  source: string
  port: number
  id?: string
}

export async function dev(options: DevOptions): Promise<void> {
  const { source, port, id } = options

  console.log(`
  ╭──────────────────────────────────────────╮
  │                                          │
  │   DO Dev Server                          │
  │                                          │
  │   Source: ${source.padEnd(30)}│
  │   URL:    http://localhost:${String(port).padEnd(18)}│
  │                                          │
  │   Press Ctrl+C to stop                   │
  │                                          │
  ╰──────────────────────────────────────────╯
  `)

  // TODO: Implement local dev server using miniflare
  // For now, suggest using wrangler dev
  console.log('Local dev server coming soon...')
  console.log('')
  console.log('For now, use wrangler:')
  console.log(`  wrangler dev ${source}`)
}
