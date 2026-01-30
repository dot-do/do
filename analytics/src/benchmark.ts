/**
 * ClickBench Benchmark: Multi-Engine Analytics Comparison
 *
 * Compares analytics performance using the standard ClickBench dataset
 * (~100M rows of web analytics data)
 *
 * Dataset: https://datasets.clickhouse.com/hits_compatible/
 * Queries: https://github.com/ClickHouse/ClickBench
 */

export interface QueryResult {
  latencyMs: number
  coldStartMs?: number
  rowsReturned: number
  bytesScanned?: number
  error?: string
}

export interface QueryExecutor {
  name: string
  execute: (sql: string) => Promise<QueryResult>
}

export interface BenchmarkResult {
  query: number
  name: string
  results: Record<string, QueryResult | null>
  winner: string | null
}

export interface EngineSummary {
  wins: number
  geomean: number
  totalTime: number
  errors: number
}

export interface BenchmarkSummary {
  totalQueries: number
  engines: Record<string, EngineSummary>
  ties: number
  results: BenchmarkResult[]
  timestamp: number
}

/**
 * ClickBench queries - subset for initial benchmarking
 * Full set: 43 queries testing aggregations, filters, GROUP BY
 */
export const CLICKBENCH_QUERIES = [
  // Q1: Simple count
  { name: 'count_all', sql: 'SELECT COUNT(*) FROM hits' },

  // Q2: Count with simple filter
  { name: 'count_filtered', sql: 'SELECT COUNT(*) FROM hits WHERE AdvEngineID <> 0' },

  // Q3: Sum aggregation
  { name: 'sum_resolutions', sql: 'SELECT SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth) FROM hits' },

  // Q4: Count distinct
  { name: 'count_distinct', sql: 'SELECT COUNT(DISTINCT UserID) FROM hits' },

  // Q5: Count distinct filtered
  { name: 'count_distinct_filtered', sql: 'SELECT COUNT(DISTINCT UserID) FROM hits WHERE AdvEngineID <> 0' },

  // Q6: Group by with count
  { name: 'group_by_region', sql: 'SELECT RegionID, COUNT(DISTINCT UserID) AS u FROM hits GROUP BY RegionID ORDER BY u DESC LIMIT 10' },

  // Q7: Group by with sum
  { name: 'group_by_engine', sql: 'SELECT AdvEngineID, COUNT(*) FROM hits WHERE AdvEngineID <> 0 GROUP BY AdvEngineID ORDER BY COUNT(*) DESC' },

  // Q8: Search phrase analysis
  { name: 'search_phrases', sql: "SELECT SearchPhrase, COUNT(*) AS c FROM hits WHERE SearchPhrase <> '' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10" },

  // Q9: Multi-column group by
  { name: 'multi_group', sql: 'SELECT RegionID, SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth), COUNT(DISTINCT UserID) FROM hits GROUP BY RegionID ORDER BY COUNT(*) DESC LIMIT 10' },

  // Q10: Date range filter
  { name: 'date_range', sql: "SELECT COUNT(*) FROM hits WHERE EventDate >= '2013-07-01' AND EventDate <= '2013-07-31'" },

  // Q11: Complex filter
  { name: 'complex_filter', sql: "SELECT COUNT(*) FROM hits WHERE EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND DontCountHits = 0 AND IsRefresh = 0 AND URLHash = 686716256552154761" },

  // Q12: URL analysis
  { name: 'url_analysis', sql: "SELECT SUM(CASE WHEN SearchPhrase <> '' THEN 1 ELSE 0 END) / COUNT(*) AS ratio FROM hits WHERE EventDate >= '2013-07-01' AND EventDate <= '2013-07-31'" },

  // Q13: Time series grouping
  { name: 'time_series', sql: "SELECT DATE_TRUNC('minute', EventTime) AS m, COUNT(*) FROM hits WHERE EventDate >= '2013-07-14' AND EventDate <= '2013-07-15' GROUP BY m ORDER BY m LIMIT 100" },

  // Q14: Resolution distribution
  { name: 'resolution_dist', sql: 'SELECT COUNT(*), AVG(ResolutionWidth) FROM hits WHERE ResolutionWidth > 0 GROUP BY ResolutionWidth ORDER BY COUNT(*) DESC LIMIT 10' },

  // Q15: Large aggregation
  { name: 'large_agg', sql: 'SELECT SearchEngineID, SearchPhrase, COUNT(*) AS c FROM hits GROUP BY SearchEngineID, SearchPhrase ORDER BY c DESC LIMIT 10' },
]

/**
 * Run full benchmark suite across multiple engines
 */
export async function runBenchmark(
  executors: Record<string, QueryExecutor>,
  options: {
    queries?: typeof CLICKBENCH_QUERIES
    warmupRuns?: number
    runs?: number
  } = {}
): Promise<BenchmarkSummary> {
  const queries = options.queries ?? CLICKBENCH_QUERIES
  const warmupRuns = options.warmupRuns ?? 1
  const runs = options.runs ?? 3
  const results: BenchmarkResult[] = []

  const engineNames = Object.keys(executors)
  const engineTimes: Record<string, number[]> = {}
  const engineSummaries: Record<string, EngineSummary> = {}

  // Initialize tracking
  for (const name of engineNames) {
    engineTimes[name] = []
    engineSummaries[name] = {
      wins: 0,
      geomean: 0,
      totalTime: 0,
      errors: 0,
    }
  }

  let ties = 0

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]
    console.log(`Running Q${i + 1}: ${query.name}`)

    // Warmup runs (discard results)
    for (let w = 0; w < warmupRuns; w++) {
      await Promise.all(
        engineNames.map(name => executors[name].execute(query.sql).catch(() => null))
      )
    }

    // Timed runs
    const engineTotals: Record<string, number> = {}
    const engineResults: Record<string, QueryResult | null> = {}

    for (const name of engineNames) {
      engineTotals[name] = 0
      engineResults[name] = null
    }

    for (let r = 0; r < runs; r++) {
      const runResults = await Promise.all(
        engineNames.map(async name => {
          const result = await executors[name].execute(query.sql)
          return { name, result }
        })
      )

      for (const { name, result } of runResults) {
        engineTotals[name] += result.latencyMs
        engineResults[name] = result // Keep last result
      }
    }

    // Calculate averages
    const engineAvgs: Record<string, number> = {}
    for (const name of engineNames) {
      const avg = engineTotals[name] / runs
      engineAvgs[name] = avg
      engineTimes[name].push(avg)
      engineSummaries[name].totalTime += avg

      if (engineResults[name]?.error) {
        engineSummaries[name].errors++
      }
    }

    // Determine winner (within 5% is a tie)
    let winner: string | null = null
    const validEngines = engineNames.filter(name => !engineResults[name]?.error)

    if (validEngines.length > 0) {
      const minTime = Math.min(...validEngines.map(name => engineAvgs[name]))
      const minEngines = validEngines.filter(name =>
        Math.abs(engineAvgs[name] - minTime) / minTime < 0.05
      )

      if (minEngines.length === 1) {
        winner = minEngines[0]
        engineSummaries[winner].wins++
      } else if (minEngines.length > 1) {
        ties++
      }
    }

    results.push({
      query: i + 1,
      name: query.name,
      results: Object.fromEntries(
        engineNames.map(name => [
          name,
          engineResults[name] ? { ...engineResults[name]!, latencyMs: engineAvgs[name] } : null
        ])
      ),
      winner,
    })
  }

  // Calculate geometric means
  const geomean = (times: number[]) => {
    const validTimes = times.filter(t => t > 0)
    if (validTimes.length === 0) return 0
    return Math.pow(validTimes.reduce((a, b) => a * b, 1), 1 / validTimes.length)
  }

  for (const name of engineNames) {
    engineSummaries[name].geomean = geomean(engineTimes[name])
  }

  return {
    totalQueries: queries.length,
    engines: engineSummaries,
    ties,
    results,
    timestamp: Date.now(),
  }
}

/**
 * Format benchmark results as markdown table
 */
export function formatResults(summary: BenchmarkSummary): string {
  const engineNames = Object.keys(summary.engines)

  const lines = [
    '# ClickBench Analytics Benchmark',
    '',
    `_Generated: ${new Date(summary.timestamp).toISOString()}_`,
    '',
    '## Summary',
    '',
    '| Metric | ' + engineNames.join(' | ') + ' |',
    '|--------|' + engineNames.map(() => '--------').join('|') + '|',
    '| Wins | ' + engineNames.map(name => summary.engines[name].wins).join(' | ') + ' |',
    '| Geomean (ms) | ' + engineNames.map(name => summary.engines[name].geomean.toFixed(2)).join(' | ') + ' |',
    '| Total Time (ms) | ' + engineNames.map(name => summary.engines[name].totalTime.toFixed(2)).join(' | ') + ' |',
    '| Errors | ' + engineNames.map(name => summary.engines[name].errors).join(' | ') + ' |',
    `| Ties | ${summary.ties} |` + engineNames.slice(1).map(() => ' - |').join(''),
    '',
    '## Query Results',
    '',
    '| # | Query | ' + engineNames.map(name => `${name} (ms)`).join(' | ') + ' | Winner |',
    '|---|-------|' + engineNames.map(() => '------------').join('|') + '|--------|',
  ]

  for (const r of summary.results) {
    const times = engineNames.map(name => {
      const result = r.results[name]
      if (!result) return '-'
      if (result.error) return 'ERR'
      return result.latencyMs.toFixed(2)
    })

    const winnerDisplay = r.winner
      ? `${r.winner}`
      : (engineNames.every(name => r.results[name]?.error) ? 'ERR' : '=')

    lines.push(`| ${r.query} | ${r.name} | ${times.join(' | ')} | ${winnerDisplay} |`)
  }

  lines.push('')
  lines.push('## Notes')
  lines.push('')
  lines.push('- Times are averaged over multiple runs')
  lines.push('- Winner determined by fastest time (5% tolerance for ties)')
  lines.push('- Geomean is geometric mean of all query times')
  lines.push('')

  return lines.join('\n')
}
