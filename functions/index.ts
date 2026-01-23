/**
 * Functions Module
 *
 * This module provides code execution capabilities across multiple tiers:
 * - Tier 1: Native in-worker execution (<1ms)
 * - Tier 2: RPC service calls (<5ms)
 * - Tier 3: Dynamic ESM module loading (<10ms)
 * - Tier 4: Linux sandbox execution (2-3s)
 *
 * @module functions
 */

// Re-export execution layer
export * from './execution'
