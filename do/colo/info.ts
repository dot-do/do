/**
 * Colo Information Operations
 *
 * Get information about colos, regions, and the current DO location.
 *
 * @module colo/info
 */

import type { ColoInfo, Region, RegionInfo } from '../../types/colo'
import { REGIONS } from '../../types/colo'

/**
 * Get all colo codes from all regions
 *
 * @returns Array of all known colo codes
 */
function getAllColos(): string[] {
  return Object.values(REGIONS).flatMap((r) => r.colos)
}

/**
 * Validate that a colo code is known
 *
 * @param colo - IATA colo code to validate
 * @returns True if colo is valid
 */
export function isValidColo(colo: string): boolean {
  return getAllColos().includes(colo.toLowerCase())
}

/**
 * Get the region for a given colo code
 *
 * @param colo - IATA colo code
 * @returns Region code or null if colo not found
 *
 * @example
 * ```typescript
 * const region = getRegionForColo('iad')
 * // 'enam'
 * ```
 */
export function getRegionForColo(colo: string): Region | null {
  const normalizedColo = colo.toLowerCase()
  for (const [region, info] of Object.entries(REGIONS)) {
    if (info.colos.includes(normalizedColo)) {
      return region as Region
    }
  }
  return null
}

/**
 * Get region metadata
 *
 * @param region - Region code
 * @returns RegionInfo or null if region not found
 *
 * @example
 * ```typescript
 * const info = getRegionInfo('apac')
 * // { region: 'apac', name: 'Asia Pacific', colos: ['nrt', 'sin', ...] }
 * ```
 */
export function getRegionInfo(region: Region): RegionInfo | null {
  return REGIONS[region] ?? null
}

/**
 * Get information about the current colo where this DO is running
 *
 * Retrieves colo information from the request context or cached storage.
 * The colo code comes from Cloudflare's cf.colo property.
 *
 * @param state - The DurableObjectState instance
 * @param request - Optional request to extract colo from cf property
 * @returns ColoInfo with colo code, region, and metadata
 *
 * @example
 * ```typescript
 * const info = await getColoInfo(this.state, request)
 * console.log(info.colo) // 'iad'
 * console.log(info.region) // 'enam'
 * console.log(info.city) // 'Ashburn'
 * ```
 */
export async function getColoInfo(
  state: DurableObjectState,
  request?: Request
): Promise<ColoInfo> {
  // TODO: Implement getColoInfo
  // 1. Try to get colo from request.cf.colo
  // 2. Fall back to cached value in storage
  // 3. Build ColoInfo from colo code
  throw new Error('Not implemented')
}

/**
 * Get information about a specific colo by its IATA code
 *
 * @param colo - IATA airport code (e.g., 'iad', 'lhr', 'nrt')
 * @returns ColoInfo or null if colo not found
 *
 * @example
 * ```typescript
 * const info = await getColoInfoByColo('fra')
 * if (info) {
 *   console.log(info.region) // 'weur'
 *   console.log(info.city) // 'Frankfurt'
 * }
 * ```
 */
export async function getColoInfoByColo(colo: string): Promise<ColoInfo | null> {
  // TODO: Implement getColoInfoByColo
  // 1. Validate colo code
  // 2. Look up region
  // 3. Build ColoInfo with known metadata
  throw new Error('Not implemented')
}

/**
 * List all available colos, optionally filtered by region
 *
 * @param region - Optional region to filter by
 * @returns Array of ColoInfo for matching colos
 *
 * @example
 * ```typescript
 * // List all colos
 * const allColos = await listColos()
 *
 * // List only Asia Pacific colos
 * const apacColos = await listColos('apac')
 * // [{ colo: 'nrt', region: 'apac', ... }, ...]
 * ```
 */
export async function listColos(region?: Region): Promise<ColoInfo[]> {
  // TODO: Implement listColos
  // 1. If region provided, filter to that region
  // 2. Build ColoInfo for each colo
  // 3. Sort by some reasonable order (alphabetical or by size)
  throw new Error('Not implemented')
}

/**
 * Colo metadata lookup table
 *
 * Maps IATA codes to city/country information.
 * This is a subset of major colos - Cloudflare has 300+.
 */
export const COLO_METADATA: Record<
  string,
  { city: string; country: string; latitude: number; longitude: number }
> = {
  // Western North America
  sjc: { city: 'San Jose', country: 'US', latitude: 37.3639, longitude: -121.9289 },
  lax: { city: 'Los Angeles', country: 'US', latitude: 33.9416, longitude: -118.4085 },
  sea: { city: 'Seattle', country: 'US', latitude: 47.4502, longitude: -122.3088 },
  den: { city: 'Denver', country: 'US', latitude: 39.8561, longitude: -104.6737 },
  phx: { city: 'Phoenix', country: 'US', latitude: 33.4352, longitude: -112.0101 },
  pdx: { city: 'Portland', country: 'US', latitude: 45.5898, longitude: -122.5951 },
  yvr: { city: 'Vancouver', country: 'CA', latitude: 49.1967, longitude: -123.1815 },

  // Eastern North America
  iad: { city: 'Ashburn', country: 'US', latitude: 38.9519, longitude: -77.448 },
  dfw: { city: 'Dallas', country: 'US', latitude: 32.8998, longitude: -97.0403 },
  atl: { city: 'Atlanta', country: 'US', latitude: 33.6407, longitude: -84.4277 },
  ord: { city: 'Chicago', country: 'US', latitude: 41.9742, longitude: -87.9073 },
  mia: { city: 'Miami', country: 'US', latitude: 25.7959, longitude: -80.287 },
  yyz: { city: 'Toronto', country: 'CA', latitude: 43.6777, longitude: -79.6248 },
  bos: { city: 'Boston', country: 'US', latitude: 42.3656, longitude: -71.0096 },
  jfk: { city: 'New York', country: 'US', latitude: 40.6413, longitude: -73.7781 },

  // Western Europe
  lhr: { city: 'London', country: 'GB', latitude: 51.47, longitude: -0.4543 },
  cdg: { city: 'Paris', country: 'FR', latitude: 49.0097, longitude: 2.5479 },
  fra: { city: 'Frankfurt', country: 'DE', latitude: 50.0379, longitude: 8.5622 },
  ams: { city: 'Amsterdam', country: 'NL', latitude: 52.3105, longitude: 4.7683 },
  dub: { city: 'Dublin', country: 'IE', latitude: 53.4264, longitude: -6.2499 },
  mad: { city: 'Madrid', country: 'ES', latitude: 40.4983, longitude: -3.5676 },
  lis: { city: 'Lisbon', country: 'PT', latitude: 38.7742, longitude: -9.1342 },

  // Eastern Europe
  waw: { city: 'Warsaw', country: 'PL', latitude: 52.1672, longitude: 20.9679 },
  bud: { city: 'Budapest', country: 'HU', latitude: 47.4398, longitude: 19.2611 },
  prg: { city: 'Prague', country: 'CZ', latitude: 50.1008, longitude: 14.26 },
  vie: { city: 'Vienna', country: 'AT', latitude: 48.1103, longitude: 16.5697 },

  // Asia Pacific
  nrt: { city: 'Tokyo', country: 'JP', latitude: 35.7653, longitude: 140.3857 },
  sin: { city: 'Singapore', country: 'SG', latitude: 1.3644, longitude: 103.9915 },
  hkg: { city: 'Hong Kong', country: 'HK', latitude: 22.308, longitude: 113.9185 },
  bom: { city: 'Mumbai', country: 'IN', latitude: 19.0896, longitude: 72.8656 },
  del: { city: 'Delhi', country: 'IN', latitude: 28.5562, longitude: 77.1 },
  icn: { city: 'Seoul', country: 'KR', latitude: 37.4602, longitude: 126.4407 },
  kix: { city: 'Osaka', country: 'JP', latitude: 34.4347, longitude: 135.244 },

  // Oceania
  syd: { city: 'Sydney', country: 'AU', latitude: -33.9399, longitude: 151.1753 },
  mel: { city: 'Melbourne', country: 'AU', latitude: -37.6733, longitude: 144.8433 },
  akl: { city: 'Auckland', country: 'NZ', latitude: -37.0082, longitude: 174.7917 },
  per: { city: 'Perth', country: 'AU', latitude: -31.9385, longitude: 115.9672 },

  // South America
  gru: { city: 'Sao Paulo', country: 'BR', latitude: -23.4356, longitude: -46.4731 },
  eze: { city: 'Buenos Aires', country: 'AR', latitude: -34.8222, longitude: -58.5358 },
  scl: { city: 'Santiago', country: 'CL', latitude: -33.393, longitude: -70.7858 },
  bog: { city: 'Bogota', country: 'CO', latitude: 4.7016, longitude: -74.1469 },

  // Africa
  jnb: { city: 'Johannesburg', country: 'ZA', latitude: -26.1367, longitude: 28.242 },
  cpt: { city: 'Cape Town', country: 'ZA', latitude: -33.9715, longitude: 18.6021 },
  nbo: { city: 'Nairobi', country: 'KE', latitude: -1.3192, longitude: 36.9258 },

  // Middle East
  dxb: { city: 'Dubai', country: 'AE', latitude: 25.2532, longitude: 55.3657 },
  tlv: { city: 'Tel Aviv', country: 'IL', latitude: 32.0055, longitude: 34.8854 },
  ruh: { city: 'Riyadh', country: 'SA', latitude: 24.9578, longitude: 46.6989 },
}
