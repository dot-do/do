import { describe, it, expect } from 'vitest'
import { DO, DigitalObjectDefinition } from './do.js'

// Helper to create mock storage for tests
function createMockStorage() {
  const storage: Map<string, unknown> = new Map()
  return {
    get: <T>(key: string) => storage.get(key) as T | null,
    put: <T>(key: string, value: T) => { storage.set(key, value) },
    delete: (key: string) => storage.delete(key),
    list: (options?: { prefix?: string }) => {
      const result = new Map<string, unknown>()
      for (const [key, value] of storage) {
        if (!options?.prefix || key.startsWith(options.prefix)) {
          result.set(key, value)
        }
      }
      return result
    },
    _raw: storage,
  }
}

describe('DO()', () => {
  it('creates a DigitalObjectDefinition from object', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      stage: 'Seed | SeriesA | SeriesB | Growth',
    })

    expect(Startup).toBeInstanceOf(DigitalObjectDefinition)
    expect(Startup.$type).toBe('Startup')
  })

  it('parses string fields with descriptions', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      description: 'What the startup does',
    })

    expect(Startup.fields.name.type).toBe('string')
    expect(Startup.fields.name.description).toBe('Name of the startup')
    expect(Startup.fields.description.type).toBe('string')
  })

  it('parses enum fields from pipe-separated values', () => {
    const Startup = DO({
      $type: 'Startup',
      stage: 'Seed | SeriesA | SeriesB | Growth',
    })

    expect(Startup.fields.stage.type).toBe('enum')
    expect(Startup.fields.stage.enumValues).toEqual(['Seed', 'SeriesA', 'SeriesB', 'Growth'])
  })

  it('parses type suffixes (number, date, boolean)', () => {
    const Startup = DO({
      $type: 'Startup',
      valuation: 'Current valuation (number)',
      founded: 'Date founded (date)',
      active: 'Is active (boolean)',
    })

    expect(Startup.fields.valuation.type).toBe('number')
    expect(Startup.fields.valuation.description).toBe('Current valuation')
    expect(Startup.fields.founded.type).toBe('date')
    expect(Startup.fields.active.type).toBe('boolean')
  })

  it('parses cascade operators in field values', () => {
    const Startup = DO({
      $type: 'Startup',
      canvas: 'Business model canvas ->LeanCanvas',
      industry: 'Target industry ~>Industry',
    })

    expect(Startup.fields.canvas.cascade?.operator).toBe('->')
    expect(Startup.fields.canvas.cascade?.targetType).toBe('LeanCanvas')
    expect(Startup.fields.industry.cascade?.operator).toBe('~>')
    expect(Startup.fields.industry.cascade?.targetType).toBe('Industry')
    expect(Startup.fields.industry.cascade?.isFuzzy).toBe(true)
  })

  it('parses all cascade operators', () => {
    const Entity = DO({
      $type: 'Entity',
      outgoing: 'Outgoing ref ->Target',
      incoming: '<- Source.predicate',
      bidirectional: '<-> Peer.relation',
      fuzzyOut: 'Fuzzy match ~>Target',
      fuzzyIn: '<~ Similar.embedding',
      fuzzyBi: '<~> Related.vector',
    })

    // Outgoing
    expect(Entity.fields.outgoing.cascade?.operator).toBe('->')
    expect(Entity.fields.outgoing.cascade?.isBidirectional).toBe(false)
    expect(Entity.fields.outgoing.cascade?.isFuzzy).toBe(false)

    // Incoming with predicate
    expect(Entity.fields.incoming.cascade?.operator).toBe('<-')
    expect(Entity.fields.incoming.cascade?.targetType).toBe('Source')
    expect(Entity.fields.incoming.cascade?.predicate).toBe('predicate')

    // Bidirectional
    expect(Entity.fields.bidirectional.cascade?.operator).toBe('<->')
    expect(Entity.fields.bidirectional.cascade?.isBidirectional).toBe(true)
    expect(Entity.fields.bidirectional.cascade?.predicate).toBe('relation')

    // Fuzzy outgoing
    expect(Entity.fields.fuzzyOut.cascade?.operator).toBe('~>')
    expect(Entity.fields.fuzzyOut.cascade?.isFuzzy).toBe(true)

    // Fuzzy incoming (vector search)
    expect(Entity.fields.fuzzyIn.cascade?.operator).toBe('<~')
    expect(Entity.fields.fuzzyIn.cascade?.isFuzzy).toBe(true)
    expect(Entity.fields.fuzzyIn.cascade?.predicate).toBe('embedding')

    // Fuzzy bidirectional
    expect(Entity.fields.fuzzyBi.cascade?.operator).toBe('<~>')
    expect(Entity.fields.fuzzyBi.cascade?.isFuzzy).toBe(true)
    expect(Entity.fields.fuzzyBi.cascade?.isBidirectional).toBe(true)
  })

  it('parses relationship with Type.predicate format', () => {
    const SaaS = DO({
      $type: 'SaaS',
      tenants: ['<- SaaSTenant.tenantOf'],
    })

    expect(SaaS.fields.tenants.cascade?.operator).toBe('<-')
    expect(SaaS.fields.tenants.cascade?.targetType).toBe('SaaSTenant')
    expect(SaaS.fields.tenants.cascade?.predicate).toBe('tenantOf')
  })

  it('parses route parameters for DO instances', () => {
    const Studio = DO({
      $type: 'Studio',
      startups: [':startup ->Startup'],
    })

    expect(Studio.fields.startups.cascade?.operator).toBe('->')
    expect(Studio.fields.startups.cascade?.targetType).toBe('Startup')
    expect(Studio.fields.startups.cascade?.routeParam).toBe('startup')
  })

  it('parses filters in cascade definitions', () => {
    const SaaS = DO({
      $type: 'SaaS',
      activeProTenants: ['<- SaaSTenant.tenantOf[status=active, plan=Pro]'],
      highValue: ['<- SaaSTenant.tenantOf[mrr>1000]'],
    })

    const activeFilters = SaaS.fields.activeProTenants.cascade?.filters
    expect(activeFilters).toHaveLength(2)
    expect(activeFilters?.[0]).toEqual({ field: 'status', operator: '=', value: 'active' })
    expect(activeFilters?.[1]).toEqual({ field: 'plan', operator: '=', value: 'Pro' })

    const highValueFilters = SaaS.fields.highValue.cascade?.filters
    expect(highValueFilters).toHaveLength(1)
    expect(highValueFilters?.[0]).toEqual({ field: 'mrr', operator: '>', value: 1000 })
  })

  it('parses array fields with cascades', () => {
    const Startup = DO({
      $type: 'Startup',
      founders: ['Co-founders with complementary skills ->Founder'],
      tags: ['Relevant tags'],
    })

    expect(Startup.fields.founders.type).toBe('array')
    expect(Startup.fields.founders.cascade?.operator).toBe('->')
    expect(Startup.fields.founders.cascade?.targetType).toBe('Founder')
    expect(Startup.fields.founders.cascade?.isArray).toBe(true)

    expect(Startup.fields.tags.type).toBe('array')
    expect(Startup.fields.tags.cascade).toBeUndefined()
  })

  it('parses nested objects', () => {
    const Startup = DO({
      $type: 'Startup',
      headquarters: {
        city: 'City name',
        country: 'Country name',
        coordinates: {
          lat: 'Latitude (number)',
          lng: 'Longitude (number)',
        },
      },
    })

    expect(Startup.fields.headquarters.type).toBe('object')
    expect(Startup.fields.headquarters.nested?.city.type).toBe('string')
    expect(Startup.fields.headquarters.nested?.coordinates.type).toBe('object')
    expect(Startup.fields.headquarters.nested?.coordinates.nested?.lat.type).toBe('number')
  })

  it('parses array of objects', () => {
    const Startup = DO({
      $type: 'Startup',
      fundingRounds: [{
        amount: 'Amount raised (number)',
        stage: 'PreSeed | Seed | SeriesA',
        leadInvestor: 'Lead investor name',
      }],
    })

    expect(Startup.fields.fundingRounds.type).toBe('array')
    expect(Startup.fields.fundingRounds.arrayItem?.type).toBe('object')
    expect(Startup.fields.fundingRounds.arrayItem?.nested?.amount.type).toBe('number')
    expect(Startup.fields.fundingRounds.arrayItem?.nested?.stage.type).toBe('enum')
  })

  it('parses generative functions (mdx)', () => {
    const Startup = DO({
      $type: 'Startup',
      pitch: { mdx: 'Generate elevator pitch for {name}' },
      summary: { mdx: 'Summarize {description}', schema: { summary: 'string' } },
    })

    expect(Startup.functions.pitch).toEqual({ mdx: 'Generate elevator pitch for {name}' })
    expect(Startup.functions.summary).toHaveProperty('mdx')
    expect(Startup.functions.summary).toHaveProperty('schema')
  })

  it('parses code functions', () => {
    const Startup = DO({
      $type: 'Startup',
      validate: (data: any) => data.name?.length > 0,
      calculate: (a: number, b: number) => a + b,
    })

    expect(typeof Startup.functions.validate).toBe('function')
    expect(typeof Startup.functions.calculate).toBe('function')
  })

  it('parses event handlers (onNounEvent)', () => {
    const handler = (founder: any, $: any) => $.notify(founder)
    const Startup = DO({
      $type: 'Startup',
      onFounderCreated: handler,
      onInvestmentReceived: (investment: any, $: any) => $.celebrate(investment),
    })

    expect(Startup.events.onFounderCreated).toBe(handler)
    expect(typeof Startup.events.onInvestmentReceived).toBe('function')
  })

  it('parses schedule handlers (everyInterval)', () => {
    const Startup = DO({
      $type: 'Startup',
      every5m: ($: any) => $.healthCheck(),
      everyDay: ($: any) => $.report(),
    })

    expect(typeof Startup.schedules.every5m).toBe('function')
    expect(typeof Startup.schedules.everyDay).toBe('function')
  })

  it('parses cron handlers', () => {
    const Startup = DO({
      $type: 'Startup',
      '0 9 * * 1-5': ($: any) => $.weekdayStandup(),
      '0 0 1 * *': ($: any) => $.monthlyReport(),
    })

    expect(typeof Startup.crons['0 9 * * 1-5']).toBe('function')
    expect(typeof Startup.crons['0 0 1 * *']).toBe('function')
  })

  it('serializes to JSON string via toString()', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      validate: (data: any) => data.name?.length > 0,
    })

    const json = Startup.toString()
    expect(json).toContain('"$type": "Startup"')
    expect(json).toContain('"name": "Name of the startup"')
    expect(json).toContain('validate')
  })

  it('parses from JSON string', () => {
    const json = JSON.stringify({
      $type: 'Startup',
      name: 'Name of the startup',
      stage: 'Seed | SeriesA',
    })

    const Startup = DO(json)
    expect(Startup.$type).toBe('Startup')
    expect(Startup.fields.name.type).toBe('string')
    expect(Startup.fields.stage.type).toBe('enum')
  })

  it('round-trips through serialization', () => {
    const original = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      stage: 'Seed | SeriesA | SeriesB',
      founders: ['Co-founders ->Founder'],
      pitch: { mdx: 'Generate pitch for {name}' },
    })

    const json = original.toString()
    const restored = DO(json)

    expect(restored.$type).toBe(original.$type)
    expect(restored.fields.name.type).toBe(original.fields.name.type)
    expect(restored.fields.stage.enumValues).toEqual(original.fields.stage.enumValues)
    expect(restored.fields.founders.cascade?.targetType).toBe('Founder')
  })

  it('manages instances', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
    })

    const acme = Startup.create('acme', { name: 'Acme Corp' })
    const globex = Startup.create('globex', { name: 'Globex Inc' })

    expect(Startup.instances()).toHaveLength(2)
    expect(Startup.get('acme')).toStrictEqual(acme)
    expect(Startup.get('globex')).toStrictEqual(globex)
    expect(Startup.get('unknown')).toBeNull()

    Startup.delete('acme')
    expect(Startup.instances()).toHaveLength(1)
    expect(Startup.get('acme')).toBeNull()
  })
})

describe('Migrations', () => {
  it('parses migrate.N handlers', () => {
    const Startup = DO({
      $type: 'Startup',
      $version: 3,
      name: 'Name',
      'migrate.2': ($: any) => $.instances().forEach((s: any) => s.stage ??= 'Seed'),
      'migrate.3': ($: any) => $.instances().forEach((s: any) => $.cascade(s, 'founders')),
    })

    expect(Startup.$version).toBe(3)
    expect(typeof Startup.migrations[2]).toBe('function')
    expect(typeof Startup.migrations[3]).toBe('function')
  })

  it('runs migrations when binding to storage with lower version', () => {
    const migrationsCalled: number[] = []

    // Mock storage
    const storage: Map<string, unknown> = new Map()
    storage.set('$version', 1) // Stored version is 1

    const mockStorage = {
      get: <T>(key: string) => storage.get(key) as T | null,
      put: <T>(key: string, value: T) => { storage.set(key, value) },
      delete: (key: string) => storage.delete(key),
      list: () => storage,
    }

    const Startup = DO({
      $type: 'Startup',
      $version: 3,
      name: 'Name',
      'migrate.2': ($: any) => { migrationsCalled.push(2) },
      'migrate.3': ($: any) => { migrationsCalled.push(3) },
    }, mockStorage)

    expect(migrationsCalled).toEqual([2, 3])
    expect(storage.get('$version')).toBe(3)
  })

  it('skips migrations already applied', () => {
    const migrationsCalled: number[] = []

    const storage: Map<string, unknown> = new Map()
    storage.set('$version', 2) // Already at version 2

    const mockStorage = {
      get: <T>(key: string) => storage.get(key) as T | null,
      put: <T>(key: string, value: T) => { storage.set(key, value) },
      delete: (key: string) => storage.delete(key),
      list: () => storage,
    }

    const Startup = DO({
      $type: 'Startup',
      $version: 3,
      name: 'Name',
      'migrate.2': ($: any) => { migrationsCalled.push(2) },
      'migrate.3': ($: any) => { migrationsCalled.push(3) },
    }, mockStorage)

    // Only migration 3 should run (2 was already applied)
    expect(migrationsCalled).toEqual([3])
  })
})

describe('Storage Binding', () => {
  it('stores definition at $ key when bound', () => {
    const mockStorage = createMockStorage()

    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
    }, mockStorage)

    const storedDef = mockStorage._raw.get('$') as Record<string, unknown>
    expect(storedDef.$type).toBe('Startup')
    expect(storedDef.name).toBe('Name of the startup')
  })

  it('creates and retrieves instances', () => {
    const mockStorage = createMockStorage()

    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
    }, mockStorage)

    Startup.create('acme', { name: 'Acme Corp' })
    Startup.create('globex', { name: 'Globex Inc' })

    expect(Startup.instances()).toHaveLength(2)
    expect(Startup.get('acme')?.data.name).toBe('Acme Corp')
    expect(Startup.get('globex')?.data.name).toBe('Globex Inc')
  })

  it('updates instances with put', () => {
    const mockStorage = createMockStorage()

    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
    }, mockStorage)

    Startup.create('acme', { name: 'Acme Corp' })
    Startup.put('acme', { name: 'Acme Corporation' })

    expect(Startup.get('acme')?.data.name).toBe('Acme Corporation')
  })

  it('deletes instances', () => {
    const mockStorage = createMockStorage()

    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
    }, mockStorage)

    Startup.create('acme', { name: 'Acme Corp' })
    expect(Startup.instances()).toHaveLength(1)

    Startup.delete('acme')
    expect(Startup.instances()).toHaveLength(0)
    expect(Startup.get('acme')).toBeNull()
  })

  it('triggers event handlers on create', () => {
    const mockStorage = createMockStorage()
    let createdInstance: any = null

    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      onStartupCreated: (instance: any, $: any) => {
        createdInstance = instance
      },
    }, mockStorage)

    Startup.create('acme', { name: 'Acme Corp' })

    expect(createdInstance).not.toBeNull()
    expect(createdInstance.$id).toBe('acme')
  })
})

describe('Full DO Definition', () => {
  it('handles a complete startup definition', () => {
    const Startup = DO({
      $type: 'Startup',
      $id: 'https://startups.do',

      // Schema fields
      name: 'Name of the startup',
      stage: 'Seed | SeriesA | SeriesB | Growth',
      valuation: 'Current valuation in USD (number)',
      founded: 'Date founded (date)',

      // Nested object
      headquarters: {
        city: 'City name',
        country: 'Country name',
      },

      // Array of objects
      fundingRounds: [{
        amount: 'Amount raised (number)',
        stage: 'PreSeed | Seed | SeriesA',
        date: 'Date closed (date)',
      }],

      // Cascades
      founders: ['Co-founders with complementary skills ->Founder'],
      canvas: 'Business model canvas ->LeanCanvas',
      industry: 'Target industry ~>Industry',

      // Generative function
      pitch: { mdx: 'Generate elevator pitch for {name} in {industry}' },

      // Code function
      validate: (data: any) => Boolean(data.name && data.stage),

      // Event handlers
      onFounderCreated: (founder: any, $: any) => $.assignEquity(founder),
      onFundingRoundCreated: (round: any, $: any) => $.updateValuation(round),

      // Schedules
      everyWeek: ($: any) => $.progressReport(),
      '0 9 * * 1': ($: any) => $.mondayStandup(),
    })

    // Verify schema
    expect(Startup.$type).toBe('Startup')
    expect(Startup.$id).toBe('https://startups.do')

    // Verify fields
    expect(Object.keys(Startup.fields)).toContain('name')
    expect(Object.keys(Startup.fields)).toContain('stage')
    expect(Object.keys(Startup.fields)).toContain('headquarters')
    expect(Object.keys(Startup.fields)).toContain('fundingRounds')
    expect(Object.keys(Startup.fields)).toContain('founders')
    expect(Object.keys(Startup.fields)).toContain('canvas')
    expect(Object.keys(Startup.fields)).toContain('industry')

    // Verify cascades
    expect(Object.keys(Startup.cascades)).toContain('founders')
    expect(Object.keys(Startup.cascades)).toContain('canvas')
    expect(Object.keys(Startup.cascades)).toContain('industry')

    // Verify functions
    expect(Object.keys(Startup.functions)).toContain('pitch')
    expect(Object.keys(Startup.functions)).toContain('validate')

    // Verify events
    expect(Object.keys(Startup.events)).toContain('onFounderCreated')
    expect(Object.keys(Startup.events)).toContain('onFundingRoundCreated')

    // Verify schedules
    expect(Object.keys(Startup.schedules)).toContain('everyWeek')
    expect(Object.keys(Startup.crons)).toContain('0 9 * * 1')

    // Verify serialization
    const json = Startup.toString()
    expect(json).toContain('"$type": "Startup"')
    expect(json).toContain('"name": "Name of the startup"')
  })
})

describe('Extension (Callable Definitions)', () => {
  it('creates extended definition by calling parent', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name of the startup',
      stage: 'Seed | SeriesA | SeriesB',
    })

    // Extend by calling with additional fields
    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Technologies used'],
      githubOrg: 'GitHub organization URL',
    })

    // TechStartup has parent fields
    expect(TechStartup.$type).toBe('TechStartup')
    expect(TechStartup.$extends).toBe('Startup')
    expect(TechStartup.fields.name).toBeDefined()
    expect(TechStartup.fields.stage).toBeDefined()

    // Plus new fields
    expect(TechStartup.fields.techStack).toBeDefined()
    expect(TechStartup.fields.githubOrg).toBeDefined()
  })

  it('supports multi-level inheritance', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    const FinTechStartup = TechStartup({
      $type: 'FinTechStartup',
      regulated: 'Is regulated (boolean)',
      licenses: ['Required licenses'],
    })

    expect(FinTechStartup.$type).toBe('FinTechStartup')
    expect(FinTechStartup.$extends).toBe('TechStartup')

    // Has all inherited fields
    expect(FinTechStartup.fields.name).toBeDefined()
    expect(FinTechStartup.fields.techStack).toBeDefined()
    expect(FinTechStartup.fields.regulated).toBeDefined()
    expect(FinTechStartup.fields.licenses).toBeDefined()
  })

  it('inherits functions from parent', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name',
      validate: (data: any) => Boolean(data.name),
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    expect(TechStartup.functions.validate).toBeDefined()
  })

  it('can override parent fields', () => {
    const Startup = DO({
      $type: 'Startup',
      stage: 'Seed | SeriesA',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      stage: 'PreSeed | Seed | SeriesA | SeriesB', // More stages
    })

    expect(TechStartup.fields.stage.enumValues).toEqual(['PreSeed', 'Seed', 'SeriesA', 'SeriesB'])
  })

  it('inherits events and schedules', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name',
      onStartupCreated: (startup: any, $: any) => {},
      everyWeek: ($: any) => {},
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    expect(TechStartup.events.onStartupCreated).toBeDefined()
    expect(TechStartup.schedules.everyWeek).toBeDefined()
  })

  it('inherits version from parent if not specified', () => {
    const Startup = DO({
      $type: 'Startup',
      $version: 3,
      name: 'Name',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    expect(TechStartup.$version).toBe(3)
  })

  it('can override version in extension', () => {
    const Startup = DO({
      $type: 'Startup',
      $version: 3,
      name: 'Name',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      $version: 1, // New type starts at v1
      techStack: ['Stack'],
    })

    expect(TechStartup.$version).toBe(1)
  })

  it('extended definitions can create instances', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    const acme = TechStartup.create('acme', {
      name: 'Acme Tech',
      techStack: ['TypeScript', 'Cloudflare'],
    })

    expect(acme.$id).toBe('acme')
    expect(acme.$type).toBe('TechStartup')
    expect(acme.data.name).toBe('Acme Tech')
    expect(acme.data.techStack).toEqual(['TypeScript', 'Cloudflare'])
  })

  it('extended definitions are also callable', () => {
    const Startup = DO({
      $type: 'Startup',
      name: 'Name',
    })

    const TechStartup = Startup({
      $type: 'TechStartup',
      techStack: ['Stack'],
    })

    // TechStartup is also callable
    const AIStartup = TechStartup({
      $type: 'AIStartup',
      models: ['AI models used'],
    })

    expect(AIStartup.$type).toBe('AIStartup')
    expect(AIStartup.$extends).toBe('TechStartup')
    expect(AIStartup.fields.name).toBeDefined()
    expect(AIStartup.fields.techStack).toBeDefined()
    expect(AIStartup.fields.models).toBeDefined()
  })
})
