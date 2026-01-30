#!/usr/bin/env npx tsx
/**
 * Upload ClickBench Data to R2
 *
 * Downloads ClickBench parquet files and uploads them to R2 for benchmarking.
 *
 * Usage:
 *   npx tsx scripts/upload-clickbench.ts
 *
 * Prerequisites:
 *   - wrangler configured with R2 bucket access
 *   - R2 bucket created (analytics-benchmark)
 *
 * Data source:
 *   https://datasets.clickhouse.com/hits_compatible/athena_partitioned/
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

const CLICKBENCH_BASE_URL = 'https://datasets.clickhouse.com/hits_compatible/athena_partitioned'
const LOCAL_DATA_DIR = './data/clickbench'
const R2_PREFIX = 'clickbench/hits'

// Number of partition files to download (full dataset has 100 files, ~14GB total)
// Start with 10 files (~1.4GB) for initial testing
const NUM_PARTITIONS = 10

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`)
  execSync(`curl -L -o "${dest}" "${url}"`, { stdio: 'inherit' })
}

async function uploadToR2(localPath: string, r2Key: string): Promise<void> {
  console.log(`Uploading to R2: ${r2Key}`)
  execSync(`wrangler r2 object put analytics-benchmark/${r2Key} --file="${localPath}"`, {
    stdio: 'inherit',
  })
}

async function main() {
  console.log('ClickBench Data Upload Script')
  console.log('=============================')
  console.log()

  // Create local data directory
  if (!existsSync(LOCAL_DATA_DIR)) {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  }

  // Download partition files
  const downloadedFiles: string[] = []

  for (let i = 0; i < NUM_PARTITIONS; i++) {
    const partitionNum = i.toString().padStart(2, '0')
    const filename = `hits_${partitionNum}.parquet`
    const url = `${CLICKBENCH_BASE_URL}/${filename}`
    const localPath = join(LOCAL_DATA_DIR, filename)

    if (existsSync(localPath)) {
      const stats = statSync(localPath)
      console.log(`Skipping ${filename} (already exists, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
    } else {
      try {
        await downloadFile(url, localPath)
      } catch (error) {
        console.error(`Failed to download ${filename}:`, error)
        continue
      }
    }

    downloadedFiles.push(localPath)
  }

  console.log()
  console.log(`Downloaded ${downloadedFiles.length} files`)
  console.log()

  // Upload to R2
  console.log('Uploading to R2...')
  console.log()

  for (const localPath of downloadedFiles) {
    const filename = localPath.split('/').pop()!
    const r2Key = `${R2_PREFIX}/${filename}`

    try {
      await uploadToR2(localPath, r2Key)
    } catch (error) {
      console.error(`Failed to upload ${filename}:`, error)
    }
  }

  console.log()
  console.log('Upload complete!')
  console.log()
  console.log('To run benchmarks:')
  console.log('  1. Deploy the worker: pnpm deploy')
  console.log('  2. Setup data: curl -X POST https://analytics-benchmark.YOUR_SUBDOMAIN.workers.dev/setup')
  console.log('  3. Run benchmark: curl -X POST https://analytics-benchmark.YOUR_SUBDOMAIN.workers.dev/benchmark')
  console.log()

  // Cleanup prompt
  const totalSize = downloadedFiles.reduce((sum, path) => {
    try {
      return sum + statSync(path).size
    } catch {
      return sum
    }
  }, 0)

  console.log(`Local files: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
  console.log('To cleanup local files: rm -rf ./data/clickbench')
}

main().catch(console.error)
