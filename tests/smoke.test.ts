import { describe, it, expect } from 'vitest'

// E2E tests run against deployed worker
// Set DO_URL env var to point to deployed instance
const DO_URL = process.env.DO_URL || 'http://localhost:8787'

describe('E2E: DigitalObject', () => {
  it('responds to fetch', async () => {
    const response = await fetch(DO_URL)
    expect(response.ok).toBe(true)
  })

  it('returns schema', async () => {
    const response = await fetch(DO_URL)
    const schema = await response.json()
    expect(schema).toHaveProperty('version')
  })

  // TODO: Add RPC call tests once rpc.do client is verified
})
