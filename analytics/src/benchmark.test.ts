import { describe, it, expect, vi } from 'vitest'
import { runBenchmark, formatResults, CLICKBENCH_QUERIES, type QueryExecutor } from './benchmark'

describe('Benchmark', () => {
  describe('CLICKBENCH_QUERIES', () => {
    it('has expected number of queries', () => {
      expect(CLICKBENCH_QUERIES.length).toBe(15)
    })

    it('all queries have name and sql', () => {
      for (const query of CLICKBENCH_QUERIES) {
        expect(query.name).toBeTruthy()
        expect(query.sql).toBeTruthy()
        expect(query.sql.toUpperCase()).toContain('SELECT')
      }
    })

    it('all queries reference hits table', () => {
      for (const query of CLICKBENCH_QUERIES) {
        expect(query.sql.toLowerCase()).toContain('hits')
      }
    })
  })

  describe('runBenchmark', () => {
    it('runs benchmark with single engine', async () => {
      const mockExecutor: QueryExecutor = {
        name: 'mock',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 100,
          rowsReturned: 1000,
        }),
      }

      const summary = await runBenchmark({ mock: mockExecutor }, {
        queries: [CLICKBENCH_QUERIES[0]],
        warmupRuns: 0,
        runs: 1,
      })

      expect(summary.totalQueries).toBe(1)
      expect(summary.engines.mock).toBeDefined()
      expect(summary.engines.mock.wins).toBe(1)
      expect(summary.results).toHaveLength(1)
      expect(summary.results[0].winner).toBe('mock')
    })

    it('runs benchmark with multiple engines', async () => {
      const fastExecutor: QueryExecutor = {
        name: 'fast',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 50,
          rowsReturned: 1000,
        }),
      }

      const slowExecutor: QueryExecutor = {
        name: 'slow',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 200,
          rowsReturned: 1000,
        }),
      }

      const summary = await runBenchmark(
        { fast: fastExecutor, slow: slowExecutor },
        {
          queries: [CLICKBENCH_QUERIES[0], CLICKBENCH_QUERIES[1]],
          warmupRuns: 0,
          runs: 1,
        }
      )

      expect(summary.totalQueries).toBe(2)
      expect(summary.engines.fast.wins).toBe(2)
      expect(summary.engines.slow.wins).toBe(0)
    })

    it('handles engine errors', async () => {
      const workingExecutor: QueryExecutor = {
        name: 'working',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 100,
          rowsReturned: 1000,
        }),
      }

      const errorExecutor: QueryExecutor = {
        name: 'error',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 0,
          rowsReturned: 0,
          error: 'Query failed',
        }),
      }

      const summary = await runBenchmark(
        { working: workingExecutor, error: errorExecutor },
        {
          queries: [CLICKBENCH_QUERIES[0]],
          warmupRuns: 0,
          runs: 1,
        }
      )

      expect(summary.engines.error.errors).toBe(1)
      expect(summary.engines.working.wins).toBe(1)
      expect(summary.results[0].results.error?.error).toBe('Query failed')
    })

    it('detects ties within tolerance', async () => {
      const executor1: QueryExecutor = {
        name: 'engine1',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 100,
          rowsReturned: 1000,
        }),
      }

      const executor2: QueryExecutor = {
        name: 'engine2',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 102, // Within 5% of 100
          rowsReturned: 1000,
        }),
      }

      const summary = await runBenchmark(
        { engine1: executor1, engine2: executor2 },
        {
          queries: [CLICKBENCH_QUERIES[0]],
          warmupRuns: 0,
          runs: 1,
        }
      )

      expect(summary.ties).toBe(1)
      expect(summary.results[0].winner).toBeNull()
    })

    it('calculates geometric mean', async () => {
      let callCount = 0
      const variableExecutor: QueryExecutor = {
        name: 'variable',
        execute: vi.fn().mockImplementation(async () => {
          callCount++
          // Return different latencies: 100, 200, 100, 200...
          const latency = callCount % 2 === 1 ? 100 : 400
          return { latencyMs: latency, rowsReturned: 1 }
        }),
      }

      const summary = await runBenchmark({ variable: variableExecutor }, {
        queries: [CLICKBENCH_QUERIES[0], CLICKBENCH_QUERIES[1]],
        warmupRuns: 0,
        runs: 1,
      })

      // Geomean of 100 and 400 = sqrt(100 * 400) = 200
      expect(summary.engines.variable.geomean).toBeCloseTo(200, 0)
    })
  })

  describe('formatResults', () => {
    it('generates markdown output', async () => {
      const mockExecutor: QueryExecutor = {
        name: 'test',
        execute: vi.fn().mockResolvedValue({
          latencyMs: 123.456,
          rowsReturned: 1000,
        }),
      }

      const summary = await runBenchmark({ test: mockExecutor }, {
        queries: [CLICKBENCH_QUERIES[0]],
        warmupRuns: 0,
        runs: 1,
      })

      const markdown = formatResults(summary)

      expect(markdown).toContain('# ClickBench Analytics Benchmark')
      expect(markdown).toContain('## Summary')
      expect(markdown).toContain('## Query Results')
      expect(markdown).toContain('test')
      expect(markdown).toContain('123.46') // Formatted latency
      expect(markdown).toContain('count_all')
    })

    it('handles multiple engines in output', async () => {
      const summary = await runBenchmark({
        duckdb: {
          name: 'DuckDB',
          execute: vi.fn().mockResolvedValue({ latencyMs: 50, rowsReturned: 1 }),
        },
        r2sql: {
          name: 'R2 SQL',
          execute: vi.fn().mockResolvedValue({ latencyMs: 75, rowsReturned: 1 }),
        },
      }, {
        queries: [CLICKBENCH_QUERIES[0]],
        warmupRuns: 0,
        runs: 1,
      })

      const markdown = formatResults(summary)

      expect(markdown).toContain('duckdb')
      expect(markdown).toContain('r2sql')
      expect(markdown).toContain('50.00')
      expect(markdown).toContain('75.00')
    })

    it('shows error states in output', async () => {
      const summary = await runBenchmark({
        error: {
          name: 'Error Engine',
          execute: vi.fn().mockResolvedValue({ latencyMs: 0, rowsReturned: 0, error: 'fail' }),
        },
      }, {
        queries: [CLICKBENCH_QUERIES[0]],
        warmupRuns: 0,
        runs: 1,
      })

      const markdown = formatResults(summary)

      expect(markdown).toContain('ERR')
    })
  })
})
