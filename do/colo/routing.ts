/**
 * Colo-Aware Routing
 *
 * Find the best colo for a given location, measure latency, and route
 * requests to the optimal replica.
 *
 * @module colo/routing
 */

import type { ColoInfo, Region, LocationHint, JurisdictionConfig } from '../../types/colo'
import type { DigitalObjectRef } from '../../types/identity'
import { COLO_METADATA, isValidColo, getRegionForColo } from './info'

/**
 * Ping result with timing information
 */
export interface PingResult {
  /** Target colo */
  colo: string
  /** Round-trip time in ms */
  latency: number
  /** Whether the colo is reachable */
  reachable: boolean
  /** Error message if not reachable */
  error?: string
}

/**
 * Routing decision result
 */
export interface RoutingDecision {
  /** Recommended DO reference to route to */
  target: DigitalObjectRef
  /** Colo of the target */
  colo: string
  /** Estimated latency to target */
  estimatedLatency: number
  /** Reason for this routing decision */
  reason: 'nearest' | 'lowest-latency' | 'jurisdiction' | 'fallback'
}

/**
 * Find the nearest colo to a given geographic location
 *
 * Uses the Haversine formula to calculate great-circle distance between
 * the given coordinates and known colo locations.
 *
 * @param latitude - Latitude of the target location
 * @param longitude - Longitude of the target location
 * @param filter - Optional region filter or jurisdiction config
 * @returns ColoInfo for the nearest colo
 *
 * @example
 * ```typescript
 * // Find nearest colo to Tokyo
 * const nearest = await findNearestColo(35.6762, 139.6503)
 * // { colo: 'nrt', region: 'apac', city: 'Tokyo', ... }
 *
 * // Find nearest colo in Europe only
 * const nearestEU = await findNearestColo(48.8566, 2.3522, 'weur')
 * // { colo: 'cdg', region: 'weur', city: 'Paris', ... }
 * ```
 */
export async function findNearestColo(
  latitude: number,
  longitude: number,
  filter?: Region | JurisdictionConfig
): Promise<ColoInfo> {
  // TODO: Implement findNearestColo
  //
  // 1. Get list of candidate colos (filtered if region specified)
  // 2. If JurisdictionConfig provided, filter by allowed/blocked
  // 3. Calculate distance to each colo using haversineDistance
  // 4. Return colo with minimum distance
  //
  throw new Error('Not implemented')
}

/**
 * Ping a colo to measure latency
 *
 * Sends a lightweight request to a colo to measure round-trip time.
 * Useful for runtime latency-based routing decisions.
 *
 * @param colo - IATA code of the colo to ping
 * @returns Ping result with latency
 *
 * @example
 * ```typescript
 * const result = await pingColo('fra')
 * console.log(`Latency to Frankfurt: ${result.latency}ms`)
 *
 * // Check multiple colos
 * const colos = ['iad', 'fra', 'nrt']
 * const results = await Promise.all(colos.map(pingColo))
 * const fastest = results.reduce((a, b) => a.latency < b.latency ? a : b)
 * console.log(`Fastest colo: ${fastest.colo} (${fastest.latency}ms)`)
 * ```
 */
export async function pingColo(colo: string): Promise<PingResult> {
  // TODO: Implement pingColo
  //
  // 1. Validate colo code
  // 2. Record start time
  // 3. Send ping request to colo
  // 4. Calculate round-trip time
  // 5. Return result
  //
  throw new Error('Not implemented')
}

/**
 * Ping multiple colos in parallel
 *
 * @param colos - Array of colo codes to ping
 * @returns Array of ping results
 *
 * @example
 * ```typescript
 * const results = await pingColos(['iad', 'fra', 'nrt', 'sin'])
 * const sorted = results.sort((a, b) => a.latency - b.latency)
 * console.log(`Fastest: ${sorted[0].colo} at ${sorted[0].latency}ms`)
 * ```
 */
export async function pingColos(colos: string[]): Promise<PingResult[]> {
  return Promise.all(colos.map(pingColo))
}

/**
 * Make a routing decision based on location and available replicas
 *
 * Determines the best replica to route a request to based on the client's
 * location, available replicas, and any jurisdiction constraints.
 *
 * @param hint - Location hint from the request
 * @param replicas - Available replica references with their colos
 * @param jurisdiction - Optional jurisdiction constraints
 * @returns Routing decision with target reference
 *
 * @example
 * ```typescript
 * const decision = await route(
 *   { clientIp: request.headers.get('cf-connecting-ip') },
 *   [
 *     { ref: 'https://...', colo: 'iad' },
 *     { ref: 'https://...', colo: 'fra' },
 *     { ref: 'https://...', colo: 'nrt' },
 *   ]
 * )
 *
 * // Route to the recommended target
 * const response = await fetch(decision.target, request)
 * ```
 */
export async function route(
  hint: LocationHint,
  replicas: Array<{ ref: DigitalObjectRef; colo: string }>,
  jurisdiction?: JurisdictionConfig
): Promise<RoutingDecision> {
  // TODO: Implement route
  //
  // 1. If hint.colo specified, try to match directly
  // 2. If hint.region specified, filter replicas to that region
  // 3. If hint.clientIp, geo-locate IP and find nearest
  // 4. If hint.coordinates, use findNearestColo
  // 5. Apply jurisdiction constraints
  // 6. Return routing decision with reason
  //
  throw new Error('Not implemented')
}

/**
 * Calculate the great-circle distance between two points
 *
 * Uses the Haversine formula for accurate distance calculation.
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in kilometers
 *
 * @example
 * ```typescript
 * // Distance from New York to London
 * const distance = haversineDistance(40.7128, -74.0060, 51.5074, -0.1278)
 * // ~5570 km
 * ```
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Earth radius in kilometers

  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Estimate latency based on geographic distance
 *
 * Uses a simple model: base latency + distance-based latency.
 * This is a rough estimate; use pingColo for actual measurements.
 *
 * @param distanceKm - Distance in kilometers
 * @returns Estimated latency in milliseconds
 */
export function estimateLatency(distanceKm: number): number {
  // Base latency (processing, serialization, etc.)
  const baseLatency = 10

  // Speed of light in fiber: ~200,000 km/s
  // Round trip, so divide by 100,000 km/s
  const propagationLatency = distanceKm / 100

  // Add some overhead for network hops (~20%)
  return Math.round((baseLatency + propagationLatency) * 1.2)
}

/**
 * Check if a colo is allowed by jurisdiction config
 *
 * @param colo - Colo to check
 * @param config - Jurisdiction configuration
 * @returns True if colo is allowed
 */
export function isColoAllowedByJurisdiction(
  colo: string,
  config: JurisdictionConfig
): boolean {
  // Check blocked colos
  if (config.blockedColos?.includes(colo.toLowerCase())) {
    return false
  }

  // Check allowed colos (if specified, must be in list)
  if (config.allowedColos && !config.allowedColos.includes(colo.toLowerCase())) {
    return false
  }

  // Check region
  const region = getRegionForColo(colo)
  if (region) {
    if (config.blockedRegions?.includes(region)) {
      return false
    }
    if (config.allowedRegions && !config.allowedRegions.includes(region)) {
      return false
    }
  }

  // Check country
  const metadata = COLO_METADATA[colo.toLowerCase()]
  if (metadata && config.requiredCountries) {
    if (!config.requiredCountries.includes(metadata.country)) {
      return false
    }
  }

  return true
}

/**
 * Get all colos in a region
 *
 * @param region - Region code
 * @returns Array of colo codes in the region
 */
export function getColosInRegion(region: Region): string[] {
  // TODO: Import REGIONS from types at module level when implementing
  // For now, use the inline data
  const regionColos: Record<Region, string[]> = {
    wnam: ['sjc', 'lax', 'sea', 'den', 'phx', 'pdx', 'yvr'],
    enam: ['iad', 'dfw', 'atl', 'ord', 'mia', 'yyz', 'bos', 'jfk'],
    sam: ['gru', 'eze', 'scl', 'bog'],
    weur: ['lhr', 'cdg', 'fra', 'ams', 'dub', 'mad', 'lis'],
    eeur: ['waw', 'bud', 'prg', 'vie'],
    apac: ['nrt', 'sin', 'hkg', 'bom', 'del', 'icn', 'kix'],
    oc: ['syd', 'mel', 'akl', 'per'],
    afr: ['jnb', 'cpt', 'nbo'],
    me: ['dxb', 'tlv', 'ruh'],
  }
  return regionColos[region] ?? []
}

/**
 * Sort colos by distance from a location
 *
 * @param latitude - Origin latitude
 * @param longitude - Origin longitude
 * @param colos - Colos to sort (defaults to all known colos)
 * @returns Colos sorted by distance (nearest first)
 */
export function sortColosByDistance(
  latitude: number,
  longitude: number,
  colos?: string[]
): Array<{ colo: string; distance: number }> {
  const candidates = colos ?? Object.keys(COLO_METADATA)

  return candidates
    .map((colo) => {
      const metadata = COLO_METADATA[colo.toLowerCase()]
      if (!metadata) {
        return { colo, distance: Infinity }
      }
      return {
        colo,
        distance: haversineDistance(latitude, longitude, metadata.latitude, metadata.longitude),
      }
    })
    .sort((a, b) => a.distance - b.distance)
}
