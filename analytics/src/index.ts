/**
 * Analytics Benchmark Worker
 *
 * Compares R2 SQL vs DuckDB WASM performance using ClickBench
 *
 * Endpoints:
 *   GET /               - API info
 *   POST /benchmark     - Run full benchmark
 *   POST /query         - Run single query on both engines
 *   GET /results/:id    - Get benchmark results
 *   GET /queries        - List available queries
 */

import { runBenchmark, formatResults, CLICKBENCH_QUERIES, type BenchmarkSummary, type QueryExecutor } from './benchmark'

// CloudflareService RPC interface from platform/workers/cloudflare
interface CloudflareService {
  queryR2Sql(sql: string): Promise<{
    rows: Record<string, unknown>[]
    meta: {
      served_by: string
      duration: number
      rows_read: number
      rows_written: number
    }
  }>
}

interface Env {
  R2: R2Bucket
  AI: Ai
  RESULTS: KVNamespace
  cloudflare: CloudflareService
  R2_BUCKET_NAME: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers })
    }

    try {
      // API discovery
      if (url.pathname === '/') {
        return Response.json({
          name: 'analytics.do',
          description: 'R2 SQL vs DuckDB WASM Benchmark',
          endpoints: {
            '/benchmark': 'POST - Run full ClickBench benchmark',
            '/query': 'POST - Run single query { sql, engine?: "both"|"r2"|"duckdb" }',
            '/queries': 'GET - List available ClickBench queries',
            '/results/:id': 'GET - Retrieve benchmark results',
            '/r2/list': 'GET - List R2 bucket contents',
            '/r2/upload': 'POST - Upload parquet file to R2',
          },
          dataset: {
            name: 'ClickBench Hits',
            rows: '~100M',
            columns: 105,
            source: 'https://datasets.clickhouse.com/hits_compatible/',
          },
          engines: {
            duckdb: 'DuckDB WASM (requires @duckdb/duckdb-wasm fork)',
            r2sql: 'Cloudflare R2 SQL (beta)',
          },
        }, { headers })
      }

      // List queries
      if (url.pathname === '/queries') {
        return Response.json({
          count: CLICKBENCH_QUERIES.length,
          queries: CLICKBENCH_QUERIES.map((q, i) => ({
            id: i + 1,
            name: q.name,
            sql: q.sql,
          })),
        }, { headers })
      }

      // List R2 bucket contents
      if (url.pathname === '/r2/list') {
        const prefix = url.searchParams.get('prefix') ?? ''
        const objects = await env.R2.list({ prefix, limit: 100 })

        return Response.json({
          prefix,
          objects: objects.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded.toISOString(),
          })),
          truncated: objects.truncated,
        }, { headers })
      }

      // Upload parquet file to R2 from URL
      if (url.pathname === '/r2/upload' && request.method === 'POST') {
        const body = await request.json() as { url: string; key: string }

        if (!body.url || !body.key) {
          return Response.json({ error: 'url and key are required' }, { status: 400, headers })
        }

        // Fetch the file
        const response = await fetch(body.url)
        if (!response.ok) {
          return Response.json({
            error: `Failed to fetch ${body.url}: ${response.status}`,
          }, { status: 400, headers })
        }

        // Get content length for progress indication
        const contentLength = response.headers.get('content-length')

        // Upload to R2
        await env.R2.put(body.key, response.body, {
          httpMetadata: {
            contentType: 'application/octet-stream',
          },
        })

        return Response.json({
          success: true,
          key: body.key,
          size: contentLength ? parseInt(contentLength) : null,
        }, { headers })
      }

      // Run single query
      if (url.pathname === '/query' && request.method === 'POST') {
        const body = await request.json() as { sql: string; engine?: string }
        const { sql, engine = 'r2' } = body

        if (!sql) {
          return Response.json({ error: 'sql is required' }, { status: 400, headers })
        }

        const results: Record<string, unknown> = { sql }

        // DuckDB WASM (placeholder - requires fork installation)
        if (engine === 'both' || engine === 'duckdb') {
          results.duckdb = {
            error: 'DuckDB WASM requires @duckdb/duckdb-wasm fork installation. Use the duckdb.do project for DuckDB queries.',
            hint: 'See https://github.com/dotdo/duckdb for setup instructions',
          }
        }

        // R2 SQL via cloudflare service binding
        if (engine === 'both' || engine === 'r2') {
          const start = performance.now()
          try {
            const result = await env.cloudflare.queryR2Sql(sql)
            results.r2sql = {
              latencyMs: performance.now() - start,
              rowCount: result.rows.length,
              rows: result.rows.slice(0, 100),
              meta: result.meta,
            }
          } catch (error) {
            results.r2sql = {
              latencyMs: performance.now() - start,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        return Response.json(results, { headers })
      }

      // Run full benchmark
      if (url.pathname === '/benchmark' && request.method === 'POST') {
        const body = await request.json().catch(() => ({})) as {
          queries?: number[]
          warmupRuns?: number
          runs?: number
          engines?: string[]
        }

        // Filter queries if specified
        const queries = body.queries
          ? CLICKBENCH_QUERIES.filter((_, i) => body.queries!.includes(i + 1))
          : CLICKBENCH_QUERIES

        const engines = body.engines ?? ['r2sql']

        // Create executors for selected engines
        const executors: Record<string, QueryExecutor> = {}

        if (engines.includes('r2sql')) {
          executors.r2sql = {
            name: 'R2 SQL',
            execute: async (sql: string) => {
              const start = performance.now()
              try {
                const result = await env.cloudflare.queryR2Sql(sql)
                return {
                  latencyMs: performance.now() - start,
                  rowsReturned: result.rows.length,
                }
              } catch (error) {
                return {
                  latencyMs: performance.now() - start,
                  rowsReturned: 0,
                  error: error instanceof Error ? error.message : String(error),
                }
              }
            },
          }
        }

        if (Object.keys(executors).length === 0) {
          return Response.json({
            error: 'No valid engines specified. Available: r2sql',
          }, { status: 400, headers })
        }

        const summary = await runBenchmark(executors, {
          queries,
          warmupRuns: body.warmupRuns ?? 0,
          runs: body.runs ?? 1,
        })

        // Store results
        const resultId = crypto.randomUUID()
        await env.RESULTS.put(resultId, JSON.stringify(summary), {
          expirationTtl: 86400 * 7, // 7 days
        })

        return Response.json({
          id: resultId,
          ...summary,
          markdown: formatResults(summary),
        }, { headers })
      }

      // Get stored results
      if (url.pathname.startsWith('/results/')) {
        const id = url.pathname.split('/results/')[1]
        const data = await env.RESULTS.get(id)

        if (!data) {
          return Response.json({ error: 'Results not found' }, { status: 404, headers })
        }

        const summary = JSON.parse(data) as BenchmarkSummary
        return Response.json({
          id,
          ...summary,
          markdown: formatResults(summary),
        }, { headers })
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers })
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 500, headers })
    }
  },
}
