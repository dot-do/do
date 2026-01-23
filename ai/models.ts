/**
 * Model Selection - Intelligent Model Routing
 *
 * Select the best model based on characteristics and constraints.
 *
 * Features:
 * - Single characteristic selection (fast, best, cost, etc.)
 * - Combo priority selection (fast,best or best,cost)
 * - Constraint-based filtering
 * - Provider availability checking
 *
 * @module ai/models
 */

import type {
  ModelSelector,
  ModelCharacteristic,
  ModelConstraints,
  ModelInfo,
  ModelCapabilities,
  ModelCostTier,
  ModelSpeedTier,
  TextLLMProvider,
} from '../types/ai'

/**
 * Model registry - all available models with metadata
 *
 * This should be kept up-to-date with provider offerings.
 */
const MODEL_REGISTRY: ModelInfo[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 128000,
      maxOutput: 16384,
    },
    costTier: 'Standard',
    speedTier: 'Fast',
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 128000,
      maxOutput: 16384,
    },
    costTier: 'Cheap',
    speedTier: 'Instant',
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
  },
  {
    id: 'o1',
    provider: 'openai',
    name: 'o1',
    capabilities: {
      functionCalling: false,
      vision: true,
      jsonMode: false,
      streaming: true,
      systemMessages: false,
      contextWindow: 200000,
      maxOutput: 100000,
    },
    costTier: 'Expensive',
    speedTier: 'Slow',
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
  },
  // Anthropic
  {
    id: 'claude-opus-4-20250514',
    provider: 'anthropic',
    name: 'Claude Opus 4',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 200000,
      maxOutput: 32000,
    },
    costTier: 'Expensive',
    speedTier: 'Standard',
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 200000,
      maxOutput: 64000,
    },
    costTier: 'Standard',
    speedTier: 'Fast',
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Haiku',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 200000,
      maxOutput: 8192,
    },
    costTier: 'Cheap',
    speedTier: 'Instant',
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
  },
  // Google
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 1000000,
      maxOutput: 8192,
    },
    costTier: 'Cheap',
    speedTier: 'Instant',
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0004,
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    name: 'Gemini 1.5 Pro',
    capabilities: {
      functionCalling: true,
      vision: true,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 2000000,
      maxOutput: 8192,
    },
    costTier: 'Standard',
    speedTier: 'Standard',
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.005,
  },
  // Groq
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    name: 'Llama 3.3 70B (Groq)',
    capabilities: {
      functionCalling: true,
      vision: false,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 128000,
      maxOutput: 32768,
    },
    costTier: 'Cheap',
    speedTier: 'Instant',
    inputCostPer1k: 0.00059,
    outputCostPer1k: 0.00079,
  },
  // DeepSeek
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    capabilities: {
      functionCalling: true,
      vision: false,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 64000,
      maxOutput: 8192,
    },
    costTier: 'Cheap',
    speedTier: 'Fast',
    inputCostPer1k: 0.00014,
    outputCostPer1k: 0.00028,
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek R1',
    capabilities: {
      functionCalling: false,
      vision: false,
      jsonMode: false,
      streaming: true,
      systemMessages: true,
      contextWindow: 64000,
      maxOutput: 8192,
    },
    costTier: 'Cheap',
    speedTier: 'Slow',
    inputCostPer1k: 0.00055,
    outputCostPer1k: 0.00219,
  },
  // Mistral
  {
    id: 'codestral-latest',
    provider: 'mistral',
    name: 'Codestral',
    capabilities: {
      functionCalling: true,
      vision: false,
      jsonMode: true,
      streaming: true,
      systemMessages: true,
      contextWindow: 32000,
      maxOutput: 8192,
    },
    costTier: 'Standard',
    speedTier: 'Fast',
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.003,
  },
]

/**
 * Quality scores for ranking (0-1)
 */
const QUALITY_SCORES: Record<string, number> = {
  'claude-opus-4-20250514': 0.98,
  'o1': 0.97,
  'gpt-4o': 0.92,
  'claude-sonnet-4-20250514': 0.90,
  'gemini-1.5-pro': 0.88,
  'deepseek-reasoner': 0.87,
  'deepseek-chat': 0.85,
  'llama-3.3-70b-versatile': 0.82,
  'codestral-latest': 0.85,
  'gemini-2.0-flash': 0.80,
  'gpt-4o-mini': 0.78,
  'claude-3-5-haiku-20241022': 0.75,
}

/**
 * Code-specific quality scores
 */
const CODE_SCORES: Record<string, number> = {
  'claude-sonnet-4-20250514': 0.95,
  'codestral-latest': 0.93,
  'deepseek-chat': 0.92,
  'claude-opus-4-20250514': 0.90,
  'gpt-4o': 0.88,
  'o1': 0.85,
}

/**
 * Reasoning scores
 */
const REASONING_SCORES: Record<string, number> = {
  'o1': 0.98,
  'deepseek-reasoner': 0.95,
  'claude-opus-4-20250514': 0.92,
  'claude-sonnet-4-20250514': 0.88,
  'gpt-4o': 0.85,
}

/**
 * Select the best model based on selector and constraints
 *
 * @param selector - Model characteristic or combo (e.g., "fast", "best,cost")
 * @param constraints - Optional constraints to filter by
 * @returns Selected model info
 *
 * @example
 * ```typescript
 * // Single characteristic
 * const model = selectModel('fast')
 * // => { id: 'gpt-4o-mini', ... }
 *
 * // Combo priority
 * const model = selectModel('fast,best')
 * // => Fastest model that's also high quality
 *
 * const model = selectModel('best,cost')
 * // => Best quality without being expensive
 *
 * // With constraints
 * const model = selectModel('best', {
 *   maxCost: 10,
 *   requires: ['vision', 'functionCalling']
 * })
 * ```
 */
export function selectModel(
  selector: ModelSelector | string,
  constraints?: ModelConstraints
): ModelInfo {
  // Check if selector is a specific model ID
  const specificModel = MODEL_REGISTRY.find((m) => m.id === selector)
  if (specificModel) {
    return specificModel
  }

  // Parse selector into characteristics
  const characteristics = parseSelector(selector as ModelSelector)

  // Start with all models
  let candidates = [...MODEL_REGISTRY]

  // Apply constraint filters
  if (constraints) {
    candidates = filterByConstraints(candidates, constraints)
  }

  if (candidates.length === 0) {
    throw new Error('No models match the specified constraints')
  }

  // Sort by characteristics
  candidates = sortByCharacteristics(candidates, characteristics)

  return candidates[0]
}

/**
 * Parse selector string into characteristics array
 *
 * @internal
 */
function parseSelector(selector: ModelSelector): ModelCharacteristic[] {
  return selector.split(',') as ModelCharacteristic[]
}

/**
 * Filter models by constraints
 *
 * @internal
 */
function filterByConstraints(
  models: ModelInfo[],
  constraints: ModelConstraints
): ModelInfo[] {
  return models.filter((model) => {
    // Check required capabilities
    if (constraints.requires) {
      for (const cap of constraints.requires) {
        if (!model.capabilities[cap]) {
          return false
        }
      }
    }

    // Check max cost (rough estimate using input + output at equal ratio)
    if (constraints.maxCost !== undefined) {
      const avgCostPer1M =
        ((model.inputCostPer1k || 0) + (model.outputCostPer1k || 0)) * 500
      if (avgCostPer1M > constraints.maxCost) {
        return false
      }
    }

    // Check min quality
    if (constraints.minQuality !== undefined) {
      const quality = QUALITY_SCORES[model.id] || 0.5
      if (quality < constraints.minQuality) {
        return false
      }
    }

    return true
  })
}

/**
 * Sort models by characteristics
 *
 * @internal
 */
function sortByCharacteristics(
  models: ModelInfo[],
  characteristics: ModelCharacteristic[]
): ModelInfo[] {
  const primary = characteristics[0]
  const secondary = characteristics[1]

  return models.sort((a, b) => {
    // Primary sort
    const primaryScore = compareByCharacteristic(a, b, primary)
    if (primaryScore !== 0 || !secondary) {
      return primaryScore
    }

    // Secondary sort (tiebreaker)
    return compareByCharacteristic(a, b, secondary)
  })
}

/**
 * Compare two models by a single characteristic
 *
 * @internal
 */
function compareByCharacteristic(
  a: ModelInfo,
  b: ModelInfo,
  characteristic: ModelCharacteristic
): number {
  switch (characteristic) {
    case 'fast':
      return compareSpeed(a, b)
    case 'cost':
      return compareCost(a, b)
    case 'best':
      return compareQuality(a, b)
    case 'reasoning':
      return compareReasoning(a, b)
    case 'vision':
      return compareVision(a, b)
    case 'code':
      return compareCode(a, b)
    case 'long':
      return compareContext(a, b)
    default:
      return 0
  }
}

/**
 * Compare by speed (lower latency = better)
 */
function compareSpeed(a: ModelInfo, b: ModelInfo): number {
  const speedOrder: Record<ModelSpeedTier, number> = {
    Instant: 0,
    Fast: 1,
    Standard: 2,
    Slow: 3,
  }
  return speedOrder[a.speedTier] - speedOrder[b.speedTier]
}

/**
 * Compare by cost (cheaper = better)
 */
function compareCost(a: ModelInfo, b: ModelInfo): number {
  const costOrder: Record<ModelCostTier, number> = {
    Free: 0,
    Cheap: 1,
    Standard: 2,
    Premium: 3,
    Expensive: 4,
  }
  return costOrder[a.costTier] - costOrder[b.costTier]
}

/**
 * Compare by quality (higher = better, so reversed)
 */
function compareQuality(a: ModelInfo, b: ModelInfo): number {
  const qualityA = QUALITY_SCORES[a.id] || 0.5
  const qualityB = QUALITY_SCORES[b.id] || 0.5
  return qualityB - qualityA
}

/**
 * Compare by reasoning ability
 */
function compareReasoning(a: ModelInfo, b: ModelInfo): number {
  const reasoningA = REASONING_SCORES[a.id] || 0.5
  const reasoningB = REASONING_SCORES[b.id] || 0.5
  return reasoningB - reasoningA
}

/**
 * Compare by vision capability
 */
function compareVision(a: ModelInfo, b: ModelInfo): number {
  // Vision-capable models first, then by quality
  if (a.capabilities.vision && !b.capabilities.vision) return -1
  if (!a.capabilities.vision && b.capabilities.vision) return 1
  return compareQuality(a, b)
}

/**
 * Compare by code ability
 */
function compareCode(a: ModelInfo, b: ModelInfo): number {
  const codeA = CODE_SCORES[a.id] || 0.5
  const codeB = CODE_SCORES[b.id] || 0.5
  return codeB - codeA
}

/**
 * Compare by context window (longer = better)
 */
function compareContext(a: ModelInfo, b: ModelInfo): number {
  return b.capabilities.contextWindow - a.capabilities.contextWindow
}

/**
 * Get information about a specific model
 *
 * @param modelId - The model ID
 * @returns Model info or undefined
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId)
}

/**
 * List all available models
 *
 * @param provider - Optional provider filter
 * @returns Array of model info
 */
export function listModels(provider?: TextLLMProvider): ModelInfo[] {
  if (provider) {
    return MODEL_REGISTRY.filter((m) => m.provider === provider)
  }
  return [...MODEL_REGISTRY]
}

/**
 * Check if a model supports a capability
 *
 * @param modelId - The model ID
 * @param capability - The capability to check
 * @returns True if supported
 */
export function modelSupports(
  modelId: string,
  capability: keyof ModelCapabilities
): boolean {
  const model = getModelInfo(modelId)
  if (!model) return false
  return Boolean(model.capabilities[capability])
}

/**
 * Get the provider for a model
 *
 * @param modelId - The model ID
 * @returns Provider name or undefined
 */
export function getModelProvider(modelId: string): TextLLMProvider | undefined {
  return getModelInfo(modelId)?.provider
}

/**
 * Estimate cost for a request
 *
 * @param modelId - The model ID
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelInfo(modelId)
  if (!model) return 0

  const inputCost = ((model.inputCostPer1k || 0) * inputTokens) / 1000
  const outputCost = ((model.outputCostPer1k || 0) * outputTokens) / 1000

  return inputCost + outputCost
}
