import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

describe('DigitalObject', () => {
  it('responds to fetch', async () => {
    const id = env.DO.idFromName('test')
    const stub = env.DO.get(id)
    const response = await stub.fetch('https://test.do/')
    expect(response.status).toBe(200)
  })

  it('exposes schema at root', async () => {
    const id = env.DO.idFromName('test')
    const stub = env.DO.get(id)
    const response = await stub.fetch('https://test.do/')
    const schema = await response.json()
    expect(schema).toHaveProperty('version')
    expect(schema).toHaveProperty('methods')
    expect(schema).toHaveProperty('namespaces')
  })

  it('has rels namespace in schema', async () => {
    const id = env.DO.idFromName('test')
    const stub = env.DO.get(id)
    const response = await stub.fetch('https://test.do/')
    const schema = await response.json()
    const relsNamespace = schema.namespaces.find((ns: any) => ns.name === 'rels')
    expect(relsNamespace).toBeDefined()
    expect(relsNamespace.methods.map((m: any) => m.name)).toContain('add')
    expect(relsNamespace.methods.map((m: any) => m.name)).toContain('from')
    expect(relsNamespace.methods.map((m: any) => m.name)).toContain('to')
  })
})
