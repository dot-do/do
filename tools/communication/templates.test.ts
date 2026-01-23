/**
 * Templates Module Tests
 *
 * @module communication/__tests__/templates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  createTemplate,
  validateTemplate,
  renderTemplate,
  renderAllChannels,
  interpolate,
  deepInterpolate,
  extractVariables,
  getMissingVariables,
  approvalRequestTemplate,
  workflowCompletedTemplate,
  errorNotificationTemplate,
  saveTemplate,
  loadTemplate,
  listTemplates,
  deleteTemplate,
  TemplateRegistry,
  templateRegistry,
} from './templates'

import type { MessageTemplate, TemplateChannel } from './templates'

// =============================================================================
// Test Setup
// =============================================================================

describe('Templates Module', () => {
  // Mock storage
  const mockStorage = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  }

  const testTemplate: MessageTemplate = {
    id: 'test-template',
    name: 'Test Template',
    description: 'A test template',
    channels: ['slack', 'discord', 'email'],
    variables: [
      { name: 'name', required: true },
      { name: 'count', type: 'number' },
      { name: 'optional' },
    ],
    slack: {
      text: 'Hello, {{name}}! You have {{count}} items.',
      blocks: [
        { type: 'Header', text: { type: 'PlainText', text: '{{name}}' } },
      ],
    },
    discord: {
      embeds: [{
        title: 'Hello, {{name}}!',
        description: 'You have {{count}} items.',
      }],
    },
    email: {
      subject: 'Hello, {{name}}!',
      html: '<h1>Hello, {{name}}!</h1><p>You have {{count}} items.</p>',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // Template Creation
  // ===========================================================================

  describe('createTemplate', () => {
    it('should create template with timestamps', () => {
      const template = createTemplate({
        id: 'new-template',
        name: 'New Template',
        channels: ['slack'],
        variables: [],
        slack: { text: 'Hello' },
      })

      expect(template.createdAt).toBeDefined()
      expect(template.updatedAt).toBeDefined()
    })

    it('should preserve all input fields', () => {
      const input = {
        id: 'test',
        name: 'Test',
        description: 'A test',
        channels: ['slack' as const, 'discord' as const],
        variables: [{ name: 'var1' }],
        slack: { text: 'Hello' },
        discord: { content: 'Hello' },
      }

      const template = createTemplate(input)

      expect(template.id).toBe(input.id)
      expect(template.name).toBe(input.name)
      expect(template.description).toBe(input.description)
      expect(template.channels).toEqual(input.channels)
      expect(template.variables).toEqual(input.variables)
    })
  })

  describe('validateTemplate', () => {
    it('should return empty array for valid template', () => {
      const errors = validateTemplate(testTemplate)
      expect(errors).toHaveLength(0)
    })

    it('should error when ID is missing', () => {
      const template = { ...testTemplate, id: '' }
      const errors = validateTemplate(template)
      expect(errors).toContain('Template ID is required')
    })

    it('should error when name is missing', () => {
      const template = { ...testTemplate, name: '' }
      const errors = validateTemplate(template)
      expect(errors).toContain('Template name is required')
    })

    it('should error when no channels specified', () => {
      const template = { ...testTemplate, channels: [] }
      const errors = validateTemplate(template)
      expect(errors).toContain('At least one channel must be specified')
    })

    it('should error when channel template is missing', () => {
      const template = { ...testTemplate, slack: undefined }
      const errors = validateTemplate(template)
      expect(errors).toContain('Template for channel "slack" is required')
    })
  })

  // ===========================================================================
  // Template Rendering
  // ===========================================================================

  describe('renderTemplate', () => {
    it.todo('should render Slack template')
    it.todo('should render Discord template')
    it.todo('should render email template')
    it.todo('should interpolate variables in text')
    it.todo('should interpolate variables in nested objects')
    it.todo('should use default values for missing variables')
    it.todo('should throw for missing required variables')
    it.todo('should throw for unsupported channel')
  })

  describe('renderAllChannels', () => {
    it.todo('should render all configured channels')
    it.todo('should skip channels not in template')
    it.todo('should return partial record')
  })

  // ===========================================================================
  // Variable Interpolation
  // ===========================================================================

  describe('interpolate', () => {
    it('should replace single variable', () => {
      const result = interpolate('Hello, {{name}}!', { name: 'World' })
      expect(result).toBe('Hello, World!')
    })

    it('should replace multiple variables', () => {
      const result = interpolate('{{greeting}}, {{name}}!', {
        greeting: 'Hello',
        name: 'World',
      })
      expect(result).toBe('Hello, World!')
    })

    it('should handle missing variables', () => {
      const result = interpolate('Hello, {{name}}!', {})
      expect(result).toBe('Hello, !')
    })

    it('should handle null/undefined values', () => {
      const result = interpolate('Value: {{value}}', { value: null })
      expect(result).toBe('Value: ')
    })

    it('should convert non-string values', () => {
      const result = interpolate('Count: {{count}}', { count: 42 })
      expect(result).toBe('Count: 42')
    })
  })

  describe('deepInterpolate', () => {
    it('should interpolate strings', () => {
      const result = deepInterpolate('Hello, {{name}}!', { name: 'World' })
      expect(result).toBe('Hello, World!')
    })

    it('should interpolate arrays', () => {
      const result = deepInterpolate(['{{a}}', '{{b}}'], { a: '1', b: '2' })
      expect(result).toEqual(['1', '2'])
    })

    it('should interpolate nested objects', () => {
      const obj = {
        outer: '{{a}}',
        nested: {
          inner: '{{b}}',
        },
      }
      const result = deepInterpolate(obj, { a: '1', b: '2' })
      expect(result).toEqual({
        outer: '1',
        nested: { inner: '2' },
      })
    })

    it('should preserve non-string values', () => {
      const obj = { count: 42, flag: true }
      const result = deepInterpolate(obj, {})
      expect(result).toEqual({ count: 42, flag: true })
    })
  })

  describe('extractVariables', () => {
    it('should extract single variable', () => {
      const vars = extractVariables('Hello, {{name}}!')
      expect(vars).toEqual(['name'])
    })

    it('should extract multiple variables', () => {
      const vars = extractVariables('{{greeting}}, {{name}}!')
      expect(vars).toContain('greeting')
      expect(vars).toContain('name')
    })

    it('should deduplicate variables', () => {
      const vars = extractVariables('{{name}} and {{name}}')
      expect(vars).toEqual(['name'])
    })

    it('should return empty array for no variables', () => {
      const vars = extractVariables('Hello, World!')
      expect(vars).toEqual([])
    })
  })

  describe('getMissingVariables', () => {
    it('should return missing required variables', () => {
      const missing = getMissingVariables(testTemplate, { count: 5 })
      expect(missing).toContain('name')
    })

    it('should return empty array when all required provided', () => {
      const missing = getMissingVariables(testTemplate, { name: 'Test' })
      expect(missing).toEqual([])
    })

    it('should not include optional variables', () => {
      const missing = getMissingVariables(testTemplate, { name: 'Test' })
      expect(missing).not.toContain('optional')
      expect(missing).not.toContain('count')
    })
  })

  // ===========================================================================
  // Built-in Templates
  // ===========================================================================

  describe('Built-in Templates', () => {
    describe('approvalRequestTemplate', () => {
      it('should have correct ID', () => {
        expect(approvalRequestTemplate.id).toBe('builtin:approval-request')
      })

      it('should support all channels', () => {
        expect(approvalRequestTemplate.channels).toContain('slack')
        expect(approvalRequestTemplate.channels).toContain('discord')
        expect(approvalRequestTemplate.channels).toContain('email')
      })

      it('should have required variables', () => {
        const required = approvalRequestTemplate.variables.filter(v => v.required)
        expect(required.map(v => v.name)).toContain('title')
        expect(required.map(v => v.name)).toContain('description')
        expect(required.map(v => v.name)).toContain('approvalId')
      })
    })

    describe('workflowCompletedTemplate', () => {
      it('should have correct ID', () => {
        expect(workflowCompletedTemplate.id).toBe('builtin:workflow-completed')
      })

      it('should have workflowName as required', () => {
        const required = workflowCompletedTemplate.variables.filter(v => v.required)
        expect(required.map(v => v.name)).toContain('workflowName')
      })
    })

    describe('errorNotificationTemplate', () => {
      it('should have correct ID', () => {
        expect(errorNotificationTemplate.id).toBe('builtin:error-notification')
      })

      it('should have errorType and message as required', () => {
        const required = errorNotificationTemplate.variables.filter(v => v.required)
        expect(required.map(v => v.name)).toContain('errorType')
        expect(required.map(v => v.name)).toContain('message')
      })
    })
  })

  // ===========================================================================
  // Template Storage
  // ===========================================================================

  describe('saveTemplate', () => {
    it.todo('should save template with prefix')
    it.todo('should update updatedAt timestamp')
  })

  describe('loadTemplate', () => {
    it.todo('should load existing template')
    it.todo('should return null for non-existent template')
  })

  describe('listTemplates', () => {
    it.todo('should list all templates')
    it.todo('should filter by prefix')
  })

  describe('deleteTemplate', () => {
    it.todo('should delete template')
    it.todo('should return true on success')
    it.todo('should return false for non-existent template')
  })

  // ===========================================================================
  // Template Registry
  // ===========================================================================

  describe('TemplateRegistry', () => {
    describe('constructor', () => {
      it('should register built-in templates', () => {
        const registry = new TemplateRegistry()
        expect(registry.get('builtin:approval-request')).toBeDefined()
        expect(registry.get('builtin:workflow-completed')).toBeDefined()
        expect(registry.get('builtin:error-notification')).toBeDefined()
      })
    })

    describe('register', () => {
      it('should register custom template', () => {
        const registry = new TemplateRegistry()
        registry.register(testTemplate)
        expect(registry.get('test-template')).toBe(testTemplate)
      })
    })

    describe('get', () => {
      it('should return template by ID', () => {
        const registry = new TemplateRegistry()
        registry.register(testTemplate)
        expect(registry.get('test-template')).toBe(testTemplate)
      })

      it('should return undefined for unknown ID', () => {
        const registry = new TemplateRegistry()
        expect(registry.get('unknown')).toBeUndefined()
      })
    })

    describe('list', () => {
      it('should list all registered templates', () => {
        const registry = new TemplateRegistry()
        const templates = registry.list()
        expect(templates.length).toBeGreaterThanOrEqual(3) // built-in templates
      })
    })

    describe('render', () => {
      it.todo('should render registered template')
      it.todo('should throw for unknown template')
    })
  })

  describe('Default templateRegistry', () => {
    it('should be a TemplateRegistry instance', () => {
      expect(templateRegistry).toBeInstanceOf(TemplateRegistry)
    })

    it('should have built-in templates', () => {
      expect(templateRegistry.get('builtin:approval-request')).toBeDefined()
    })
  })
})
