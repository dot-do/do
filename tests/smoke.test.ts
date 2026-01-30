import { describe, it, expect } from 'vitest'

// E2E tests run against deployed worker
// Set DO_URL env var to point to deployed instance
const DO_URL = process.env.DO_URL || 'http://localhost:8787'

// Helper to call /$ methods
// Only encode braces, keep other URL-safe chars
async function call(expr: string): Promise<unknown> {
  const encoded = expr.replace(/{/g, '%7B').replace(/}/g, '%7D')
  const url = `${DO_URL}/${encoded}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

describe('E2E: DigitalObject', () => {
  it('responds to fetch', async () => {
    const response = await fetch(DO_URL)
    expect(response.ok).toBe(true)
  })

  it('returns API discovery', async () => {
    const response = await fetch(DO_URL)
    const data = await response.json()
    expect(data).toHaveProperty('api')
    expect(data).toHaveProperty('links')
    expect(data).toHaveProperty('examples')
    expect(data).toHaveProperty('methods')
    expect(data).toHaveProperty('user')
    expect(data.api.name).toBe('objects.do')
  })
})

describe('E2E: Collections', () => {
  const testCollection = `test_${Date.now()}`

  it('puts and gets a document', async () => {
    await call(`$collection("${testCollection}").put("doc1",{"name":"Test"})`)
    const doc = await call(`$collection("${testCollection}").get("doc1")`)
    expect(doc).toEqual({ name: 'Test' })
  })

  it('finds documents', async () => {
    await call(`$collection("${testCollection}").put("doc2",{"name":"Alice","age":30})`)
    await call(`$collection("${testCollection}").put("doc3",{"name":"Bob","age":25})`)

    const all = await call(`$collection("${testCollection}").find()`)
    expect(Array.isArray(all)).toBe(true)
    expect((all as unknown[]).length).toBeGreaterThanOrEqual(2)
  })

  it('finds with filter', async () => {
    const filtered = await call(`$collection("${testCollection}").find({"age":{"$gt":26}})`)
    expect(Array.isArray(filtered)).toBe(true)
    const results = filtered as Array<{ name: string; age: number }>
    expect(results.every((r) => r.age > 26)).toBe(true)
  })

  it('finds with limit', async () => {
    const limited = await call(`$collection("${testCollection}").find().limit(1)`)
    expect(Array.isArray(limited)).toBe(true)
    expect((limited as unknown[]).length).toBe(1)
  })

  it('deletes a document', async () => {
    await call(`$collection("${testCollection}").delete("doc1")`)
    const doc = await call(`$collection("${testCollection}").get("doc1")`)
    expect(doc).toBeNull()
  })
})

describe('E2E: Relationships', () => {
  it('creates a relationship with relate()', async () => {
    const rel = await call('$relate("alice","follows","bob","followedBy")')
    expect(rel).toHaveProperty('id')
    expect(rel).toHaveProperty('from', 'alice')
    expect(rel).toHaveProperty('predicate', 'follows')
    expect(rel).toHaveProperty('to', 'bob')
    expect(rel).toHaveProperty('reverse', 'followedBy')
  })

  it('queries outgoing relationships()', async () => {
    const rels = await call('$relationships("alice")')
    expect(Array.isArray(rels)).toBe(true)
    const results = rels as Array<{ from: string; to: string; predicate: string }>
    expect(results.some((r) => r.from === 'alice' && r.to === 'bob' && r.predicate === 'follows')).toBe(true)
  })

  it('queries incoming references()', async () => {
    const refs = await call('$references("bob")')
    expect(Array.isArray(refs)).toBe(true)
    const results = refs as Array<{ from: string; to: string; predicate: string }>
    expect(results.some((r) => r.from === 'alice' && r.to === 'bob' && r.predicate === 'follows')).toBe(true)
  })

  it('filters relationships by predicate', async () => {
    const rels = await call('$relationships("alice","follows")')
    expect(Array.isArray(rels)).toBe(true)
    const results = rels as Array<{ predicate: string }>
    expect(results.every((r) => r.predicate === 'follows')).toBe(true)
  })
})
