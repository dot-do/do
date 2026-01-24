/**
 * DOAuthStorage - OAuth 2.1 storage implementation using Durable Object SQLite
 *
 * Implements the OAuthStorage interface from @dotdo/oauth, providing
 * persistent storage for OAuth users, organizations, clients, grants,
 * and tokens using the DigitalObject state system.
 *
 * @example
 * ```typescript
 * import { DigitalObject } from '@dotdo/do'
 * import { createOAuth21Server } from '@dotdo/oauth'
 * import { DOAuthStorage } from '@dotdo/do/oauth'
 *
 * class AuthDO extends DigitalObject {
 *   async fetch(request: Request) {
 *     const storage = new DOAuthStorage(this.state)
 *     const server = createOAuth21Server({
 *       issuer: 'https://mcp.do',
 *       storage,
 *       upstream: { provider: 'workos', ... }
 *     })
 *     return server.fetch(request)
 *   }
 * }
 * ```
 *
 * @module do/oauth
 */

import type {
  OAuthStorage,
  OAuthUser,
  OAuthOrganization,
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthRefreshToken,
  OAuthGrant,
  ListOptions,
} from '@dotdo/oauth'
import type { DOState } from './state'

/**
 * Key prefixes for different OAuth entities
 * @internal
 */
const PREFIXES = {
  user: 'oauth:user',
  userByEmail: 'oauth:user:email',
  userByProvider: 'oauth:user:provider',
  org: 'oauth:org',
  orgBySlug: 'oauth:org:slug',
  orgByDomain: 'oauth:org:domain',
  client: 'oauth:client',
  code: 'oauth:code',
  accessToken: 'oauth:access',
  refreshToken: 'oauth:refresh',
  grant: 'oauth:grant',
} as const

/**
 * DOAuthStorage - OAuth storage backed by Durable Object SQLite
 *
 * Uses the DigitalObject state system for persistent storage.
 * All data is stored with appropriate prefixes to enable efficient
 * listing and lookup operations.
 */
export class DOAuthStorage implements OAuthStorage {
  constructor(private state: DOState) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // User Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async getUser(id: string): Promise<OAuthUser | null> {
    return this.state.get<OAuthUser>(`${PREFIXES.user}:${id}`)
  }

  async getUserByEmail(email: string): Promise<OAuthUser | null> {
    const userId = await this.state.get<string>(`${PREFIXES.userByEmail}:${email.toLowerCase()}`)
    if (!userId) return null
    return this.getUser(userId)
  }

  async getUserByProvider(provider: string, providerId: string): Promise<OAuthUser | null> {
    const userId = await this.state.get<string>(`${PREFIXES.userByProvider}:${provider}:${providerId}`)
    if (!userId) return null
    return this.getUser(userId)
  }

  async saveUser(user: OAuthUser): Promise<void> {
    // Save the user
    await this.state.set(`${PREFIXES.user}:${user.id}`, user)

    // Create email index
    if (user.email) {
      await this.state.set(`${PREFIXES.userByEmail}:${user.email.toLowerCase()}`, user.id)
    }

    // Create provider index
    if (user.provider && user.providerId) {
      await this.state.set(`${PREFIXES.userByProvider}:${user.provider}:${user.providerId}`, user.id)
    }
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUser(id)
    if (!user) return

    // Delete indexes
    if (user.email) {
      await this.state.delete(`${PREFIXES.userByEmail}:${user.email.toLowerCase()}`)
    }
    if (user.provider && user.providerId) {
      await this.state.delete(`${PREFIXES.userByProvider}:${user.provider}:${user.providerId}`)
    }

    // Delete the user
    await this.state.delete(`${PREFIXES.user}:${id}`)
  }

  async listUsers(options?: ListOptions): Promise<OAuthUser[]> {
    const result = await this.state.list({ prefix: `${PREFIXES.user}:` })
    const users: OAuthUser[] = []

    for (const key of result.keys) {
      const user = await this.state.get<OAuthUser>(key)
      if (user) {
        if (options?.organizationId && user.organizationId !== options.organizationId) {
          continue
        }
        users.push(user)
        if (options?.limit && users.length >= options.limit) {
          break
        }
      }
    }

    return users
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Organization Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async getOrganization(id: string): Promise<OAuthOrganization | null> {
    return this.state.get<OAuthOrganization>(`${PREFIXES.org}:${id}`)
  }

  async getOrganizationBySlug(slug: string): Promise<OAuthOrganization | null> {
    const orgId = await this.state.get<string>(`${PREFIXES.orgBySlug}:${slug.toLowerCase()}`)
    if (!orgId) return null
    return this.getOrganization(orgId)
  }

  async getOrganizationByDomain(domain: string): Promise<OAuthOrganization | null> {
    const orgId = await this.state.get<string>(`${PREFIXES.orgByDomain}:${domain.toLowerCase()}`)
    if (!orgId) return null
    return this.getOrganization(orgId)
  }

  async saveOrganization(org: OAuthOrganization): Promise<void> {
    // Save the organization
    await this.state.set(`${PREFIXES.org}:${org.id}`, org)

    // Create slug index
    if (org.slug) {
      await this.state.set(`${PREFIXES.orgBySlug}:${org.slug.toLowerCase()}`, org.id)
    }

    // Create domain indexes
    if (org.domains) {
      for (const domain of org.domains) {
        await this.state.set(`${PREFIXES.orgByDomain}:${domain.toLowerCase()}`, org.id)
      }
    }
  }

  async deleteOrganization(id: string): Promise<void> {
    const org = await this.getOrganization(id)
    if (!org) return

    // Delete slug index
    if (org.slug) {
      await this.state.delete(`${PREFIXES.orgBySlug}:${org.slug.toLowerCase()}`)
    }

    // Delete domain indexes
    if (org.domains) {
      for (const domain of org.domains) {
        await this.state.delete(`${PREFIXES.orgByDomain}:${domain.toLowerCase()}`)
      }
    }

    // Delete the organization
    await this.state.delete(`${PREFIXES.org}:${id}`)
  }

  async listOrganizations(options?: ListOptions): Promise<OAuthOrganization[]> {
    const result = await this.state.list({ prefix: `${PREFIXES.org}:` })
    const orgs: OAuthOrganization[] = []

    for (const key of result.keys) {
      const org = await this.state.get<OAuthOrganization>(key)
      if (org) {
        orgs.push(org)
        if (options?.limit && orgs.length >= options.limit) {
          break
        }
      }
    }

    return orgs
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Client Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.state.get<OAuthClient>(`${PREFIXES.client}:${clientId}`)
  }

  async saveClient(client: OAuthClient): Promise<void> {
    await this.state.set(`${PREFIXES.client}:${client.clientId}`, client)
  }

  async deleteClient(clientId: string): Promise<void> {
    await this.state.delete(`${PREFIXES.client}:${clientId}`)
  }

  async listClients(options?: ListOptions): Promise<OAuthClient[]> {
    const result = await this.state.list({ prefix: `${PREFIXES.client}:` })
    const clients: OAuthClient[] = []

    for (const key of result.keys) {
      const client = await this.state.get<OAuthClient>(key)
      if (client) {
        clients.push(client)
        if (options?.limit && clients.length >= options.limit) {
          break
        }
      }
    }

    return clients
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization Code Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async saveAuthorizationCode(authCode: OAuthAuthorizationCode): Promise<void> {
    // Calculate TTL - auth codes should expire (default 10 minutes)
    const ttl = authCode.expiresAt - Date.now()
    await this.state.set(`${PREFIXES.code}:${authCode.code}`, authCode, {
      ttl: ttl > 0 ? ttl : undefined,
    })
  }

  async consumeAuthorizationCode(code: string): Promise<OAuthAuthorizationCode | null> {
    const authCode = await this.state.get<OAuthAuthorizationCode>(`${PREFIXES.code}:${code}`)
    if (!authCode) return null
    await this.state.delete(`${PREFIXES.code}:${code}`)
    return authCode
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Access Token Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async saveAccessToken(accessToken: OAuthAccessToken): Promise<void> {
    // Calculate TTL - access tokens should expire
    const ttl = accessToken.expiresAt - Date.now()
    await this.state.set(`${PREFIXES.accessToken}:${accessToken.token}`, accessToken, {
      ttl: ttl > 0 ? ttl : undefined,
    })
  }

  async getAccessToken(token: string): Promise<OAuthAccessToken | null> {
    return this.state.get<OAuthAccessToken>(`${PREFIXES.accessToken}:${token}`)
  }

  async revokeAccessToken(token: string): Promise<void> {
    await this.state.delete(`${PREFIXES.accessToken}:${token}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Refresh Token Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async saveRefreshToken(refreshToken: OAuthRefreshToken): Promise<void> {
    // Calculate TTL if there's an expiration
    const ttl = refreshToken.expiresAt ? refreshToken.expiresAt - Date.now() : undefined
    await this.state.set(`${PREFIXES.refreshToken}:${refreshToken.token}`, refreshToken, {
      ttl: ttl && ttl > 0 ? ttl : undefined,
    })
  }

  async getRefreshToken(token: string): Promise<OAuthRefreshToken | null> {
    return this.state.get<OAuthRefreshToken>(`${PREFIXES.refreshToken}:${token}`)
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.state.delete(`${PREFIXES.refreshToken}:${token}`)
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    // Revoke access tokens
    const accessResult = await this.state.list({ prefix: `${PREFIXES.accessToken}:` })
    for (const key of accessResult.keys) {
      const token = await this.state.get<OAuthAccessToken>(key)
      if (token && token.userId === userId) {
        await this.state.delete(key)
      }
    }

    // Revoke refresh tokens
    const refreshResult = await this.state.list({ prefix: `${PREFIXES.refreshToken}:` })
    for (const key of refreshResult.keys) {
      const token = await this.state.get<OAuthRefreshToken>(key)
      if (token && token.userId === userId) {
        await this.state.delete(key)
      }
    }
  }

  async revokeAllClientTokens(clientId: string): Promise<void> {
    // Revoke access tokens
    const accessResult = await this.state.list({ prefix: `${PREFIXES.accessToken}:` })
    for (const key of accessResult.keys) {
      const token = await this.state.get<OAuthAccessToken>(key)
      if (token && token.clientId === clientId) {
        await this.state.delete(key)
      }
    }

    // Revoke refresh tokens
    const refreshResult = await this.state.list({ prefix: `${PREFIXES.refreshToken}:` })
    for (const key of refreshResult.keys) {
      const token = await this.state.get<OAuthRefreshToken>(key)
      if (token && token.clientId === clientId) {
        await this.state.delete(key)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Grant Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async getGrant(userId: string, clientId: string): Promise<OAuthGrant | null> {
    return this.state.get<OAuthGrant>(`${PREFIXES.grant}:${userId}:${clientId}`)
  }

  async saveGrant(grant: OAuthGrant): Promise<void> {
    await this.state.set(`${PREFIXES.grant}:${grant.userId}:${grant.clientId}`, grant)
  }

  async revokeGrant(userId: string, clientId: string): Promise<void> {
    // Delete the grant
    await this.state.delete(`${PREFIXES.grant}:${userId}:${clientId}`)

    // Revoke associated tokens
    const accessResult = await this.state.list({ prefix: `${PREFIXES.accessToken}:` })
    for (const key of accessResult.keys) {
      const token = await this.state.get<OAuthAccessToken>(key)
      if (token && token.userId === userId && token.clientId === clientId) {
        await this.state.delete(key)
      }
    }

    const refreshResult = await this.state.list({ prefix: `${PREFIXES.refreshToken}:` })
    for (const key of refreshResult.keys) {
      const token = await this.state.get<OAuthRefreshToken>(key)
      if (token && token.userId === userId && token.clientId === clientId) {
        await this.state.delete(key)
      }
    }
  }

  async listUserGrants(userId: string): Promise<OAuthGrant[]> {
    const result = await this.state.list({ prefix: `${PREFIXES.grant}:${userId}:` })
    const grants: OAuthGrant[] = []

    for (const key of result.keys) {
      const grant = await this.state.get<OAuthGrant>(key)
      if (grant) {
        grants.push(grant)
      }
    }

    return grants
  }
}

export default DOAuthStorage
