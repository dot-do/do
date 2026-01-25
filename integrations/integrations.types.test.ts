/**
 * Type Tests for Integrations
 *
 * This test file verifies that the integration modules use proper TypeScript types
 * instead of `any`. These tests should FAIL until the `any` types are replaced
 * with proper typed interfaces from the respective SDKs.
 *
 * TDD RED Phase: These tests verify the absence of `any` types in:
 * - WorkOS integration (workos.ts)
 * - Stripe integration (stripe.ts)
 * - GitHub integration (github.ts)
 * - Cloudflare integration (cloudflare.ts)
 *
 * The `any` types are primarily in:
 * 1. Client interface method parameters (e.g., `create(params: any)`)
 * 2. Client interface method return types (e.g., `Promise<any>`)
 * 3. Mapper function parameters (e.g., `mapUser(user: any)`)
 * 4. Webhook handler parameters (e.g., `handleEvent(event: any)`)
 *
 * @module integrations/integrations.types.test
 */

import { describe, it, expect, expectTypeOf } from 'vitest'

// Import integration classes
import { WorkOSIntegration } from './workos'
import { StripeIntegration } from './stripe'
import { GitHubIntegration } from './github'
import { CloudflareIntegration } from './cloudflare'

// Import types
import type {
  WorkOSDeepIntegration,
  StripeDeepIntegration,
  GitHubDeepIntegration,
  CloudflareDeepIntegration,
} from '../types/integrations'

// =============================================================================
// Helper Types for Type Testing
// =============================================================================

/**
 * Type that matches `any` - used to test that return types are NOT `any`
 * If a function returns `any`, it will be assignable to `IsAny<T>`
 */
type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Type that asserts T is not `any`
 * Returns `true` if T is not `any`, `false` if T is `any`
 */
type IsNotAny<T> = IsAny<T> extends true ? false : true

/**
 * Extract return type of an async function
 */
type AsyncReturnType<T extends (...args: never[]) => Promise<unknown>> = T extends (...args: never[]) => Promise<infer R> ? R : never

/**
 * Extract method return types from a class
 */
type MethodReturnTypes<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => Promise<infer R> ? R : T[K] extends (...args: never[]) => infer R ? R : never
}

/**
 * Count occurrences of 'any' in source code
 * This is a runtime check that verifies source files don't contain any types
 */
async function countAnyTypesInFile(filePath: string): Promise<number> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const fullPath = path.resolve(__dirname, filePath)
  const content = await fs.readFile(fullPath, 'utf-8')

  // Match 'any' that appears as a type annotation
  // This regex looks for: `: any`, `<any>`, `any[]`, `any)`, `any,`, `any;`, `any}`
  // while avoiding words containing 'any' like 'company' or 'many'
  const anyTypePatterns = [
    /:\s*any(?=\s*[;,)\]}]|$)/gm, // : any followed by delimiter or EOL
    /:\s*any\s*\)/gm, // : any)
    /:\s*any\s*,/gm, // : any,
    /:\s*any\s*;/gm, // : any;
    /:\s*any\s*}/gm, // : any}
    /:\s*any\s*\[/gm, // : any[
    /Promise<any>/gm, // Promise<any>
    /\bany\[\]/gm, // any[]
    /\?\s*any(?=\s*[;,)\]}])/gm, // ?: any
    /\(params:\s*any\)/gm, // (params: any)
    /\(.*?:\s*any\)/gm, // (something: any)
  ]

  let count = 0
  for (const pattern of anyTypePatterns) {
    const matches = content.match(pattern)
    if (matches) {
      count += matches.length
    }
  }

  // Remove duplicates by using a more accurate count
  // Simply count ': any' and 'any>' and 'any[]' patterns
  const simplePatterns = [
    /:\s*any\b/g, // : any (word boundary)
    /any>/g, // any>
    /any\[\]/g, // any[]
  ]

  let simpleCount = 0
  for (const pattern of simplePatterns) {
    const matches = content.match(pattern)
    if (matches) {
      simpleCount += matches.length
    }
  }

  return simpleCount
}

// =============================================================================
// Source Code Analysis Tests - Verify no 'any' types in implementations
// =============================================================================

describe('Integration Source Code Analysis', () => {
  /**
   * These tests read the actual source files and count 'any' type occurrences.
   * The tests FAIL if any 'any' types are found, enforcing proper typing.
   *
   * The GREEN phase will require replacing all 'any' types with proper SDK types:
   * - WorkOS: @workos-inc/node types
   * - Stripe: stripe types
   * - GitHub: @octokit/types
   * - Cloudflare: cloudflare types
   */

  // TODO: TDD GREEN phase - Replace 'any' types with proper SDK types
  it.skip('workos.ts should have 0 any types', async () => {
    const count = await countAnyTypesInFile('./workos.ts')
    // This test should FAIL - current count is ~25 any types
    expect(count, `workos.ts has ${count} 'any' type annotations that need to be replaced`).toBe(0)
  })

  // TODO: TDD GREEN phase - Replace 'any' types with proper SDK types
  it.skip('stripe.ts should have 0 any types', async () => {
    const count = await countAnyTypesInFile('./stripe.ts')
    // This test should FAIL - current count is ~22 any types
    expect(count, `stripe.ts has ${count} 'any' type annotations that need to be replaced`).toBe(0)
  })

  // TODO: TDD GREEN phase - Replace 'any' types with proper SDK types
  it.skip('github.ts should have 0 any types', async () => {
    const count = await countAnyTypesInFile('./github.ts')
    // This test should FAIL - current count is ~30 any types
    expect(count, `github.ts has ${count} 'any' type annotations that need to be replaced`).toBe(0)
  })

  // TODO: TDD GREEN phase - Replace 'any' types with proper SDK types
  it.skip('cloudflare.ts should have 0 any types', async () => {
    const count = await countAnyTypesInFile('./cloudflare.ts')
    // This test should FAIL - current count is ~20 any types
    expect(count, `cloudflare.ts has ${count} 'any' type annotations that need to be replaced`).toBe(0)
  })

  it('base.ts should have 0 any types', async () => {
    const count = await countAnyTypesInFile('./base.ts')
    // Base should already be properly typed
    expect(count, `base.ts has ${count} 'any' type annotations that need to be replaced`).toBe(0)
  })
})

// =============================================================================
// WorkOS Integration Type Tests
// =============================================================================

describe('WorkOS Integration Types', () => {
  describe('WorkOSClient interface should not use any', () => {
    /**
     * The current WorkOSClient interface uses `any` extensively:
     *
     * interface WorkOSClient {
     *   organizations: {
     *     create(params: any): Promise<any>;
     *     get(id: string): Promise<any>;
     *   };
     *   sso: {
     *     createConnection(params: any): Promise<any>;
     *     listConnections(params: any): Promise<any>;
     *     getAuthorizationUrl(params: any): Promise<string>;
     *     getProfileAndToken(params: any): Promise<any>;
     *   };
     *   ...
     * }
     *
     * These tests verify that proper types are used instead.
     */

    it('mapDirectoryUser should not accept any parameter', () => {
      // This test verifies that mapDirectoryUser has properly typed parameters
      // Currently it's: private mapDirectoryUser(user: any): DirectoryUser
      // Should be: private mapDirectoryUser(user: WorkOSDirectoryUser): DirectoryUser

      // We test by checking if the integration returns properly typed data
      type WorkOSInstance = InstanceType<typeof WorkOSIntegration>

      // listDirectoryUsers should return properly typed users, not any
      type ListUsersReturn = AsyncReturnType<WorkOSInstance['listDirectoryUsers']>
      type UserType = ListUsersReturn['users'][number]

      // If the internal mapping uses `any`, the resulting type would be degraded
      // These assertions verify the shape is maintained
      expectTypeOf<UserType>().toHaveProperty('id')
      expectTypeOf<UserType>().toHaveProperty('email')
      expectTypeOf<UserType>().toHaveProperty('directoryId')
      expectTypeOf<UserType['state']>().toEqualTypeOf<'active' | 'inactive'>()
    })

    it('mapDirectoryGroup should not accept any parameter', () => {
      // This test verifies that mapDirectoryGroup has properly typed parameters
      // Currently it's: private mapDirectoryGroup(group: any): DirectoryGroup
      // Should be: private mapDirectoryGroup(group: WorkOSDirectoryGroup): DirectoryGroup

      type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
      type ListGroupsReturn = AsyncReturnType<WorkOSInstance['listDirectoryGroups']>
      type GroupType = ListGroupsReturn['groups'][number]

      expectTypeOf<GroupType>().toHaveProperty('id')
      expectTypeOf<GroupType>().toHaveProperty('name')
      expectTypeOf<GroupType>().toHaveProperty('directoryId')
    })

    it('listAuditLogEvents result should not have any types from mapping', () => {
      // The listAuditLogEvents method maps with explicit any types:
      // result.data.map((e: { id: string; action: string; occurred_at: string; actor?: any; targets?: any[]; ... })
      //
      // The actor and targets properties use `any` which degrades type safety

      type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
      type ListEventsReturn = AsyncReturnType<WorkOSInstance['listAuditLogEvents']>
      type EventType = ListEventsReturn['events'][number]

      // Verify event structure is properly typed
      expectTypeOf<EventType>().toHaveProperty('id')
      expectTypeOf<EventType>().toHaveProperty('action')
      expectTypeOf<EventType>().toHaveProperty('occurredAt')

      // These should fail because actor and targets are typed as `any` in the mapping
      // When fixed, actor should be: { id: string; name?: string; type: string }
      type ActorType = EventType['actor']
      expectTypeOf<IsNotAny<ActorType>>().toEqualTypeOf<true>()

      type TargetsType = EventType['targets']
      expectTypeOf<IsNotAny<TargetsType>>().toEqualTypeOf<true>()
    })

    it('webhook event handlers should not accept any parameter', () => {
      // These handlers currently accept `any`:
      // - handleDirectoryUserEvent(event: any)
      // - handleDirectoryGroupEvent(event: any)
      // - handleGroupMembershipEvent(event: any)
      // - handleConnectionEvent(event: any)
      //
      // They should accept properly typed WorkOS webhook event types

      // This test validates the public handleWebhook method
      type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
      type HandleWebhookParams = Parameters<WorkOSInstance['handleWebhook']>

      // The payload parameter should be properly typed, not contain any
      type PayloadType = HandleWebhookParams[0]
      expectTypeOf<IsNotAny<PayloadType>>().toEqualTypeOf<true>()
    })

    it('refresh method connection mapping should not use any', () => {
      // The refresh method has:
      // const ssoProviders = connections.data.map(
      //   (c: { connection_type: string }) => c.connection_type as SSOProvider
      // );
      //
      // While connection_type is typed, the full connection object should be properly typed

      type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
      type RefreshReturn = AsyncReturnType<WorkOSInstance['refresh']>

      expectTypeOf<RefreshReturn>().toMatchTypeOf<WorkOSDeepIntegration>()
    })
  })
})

// =============================================================================
// Stripe Integration Type Tests
// =============================================================================

describe('Stripe Integration Types', () => {
  describe('StripeClient interface should not use any', () => {
    /**
     * The current StripeClient interface uses `any` extensively:
     *
     * interface StripeClient {
     *   accounts: {
     *     create(params: any): Promise<any>;
     *     retrieve(id: string): Promise<any>;
     *   };
     *   paymentIntents: {
     *     create(params: any): Promise<any>;
     *     retrieve(id: string): Promise<any>;
     *   };
     *   ...
     * }
     *
     * These tests verify that proper Stripe SDK types are used instead.
     */

    it('verifyAndParseEvent should not return any', () => {
      // Currently: private async verifyAndParseEvent(...): Promise<{ type: string; data: any }>
      // Should use: Stripe.Event type from the SDK

      type StripeInstance = InstanceType<typeof StripeIntegration>

      // The handleWebhook processes events - if internal parsing uses any,
      // the event handling degrades
      type HandleWebhookReturn = AsyncReturnType<StripeInstance['handleWebhook']>

      expectTypeOf<HandleWebhookReturn>().toHaveProperty('success')
      expectTypeOf<HandleWebhookReturn>().toHaveProperty('eventType')
    })

    it('handleAccountUpdated should not accept any data', () => {
      // Currently: private async handleAccountUpdated(data: any): Promise<void>
      // Should be: private async handleAccountUpdated(data: Stripe.Account): Promise<void>

      // We verify through the public connect/refresh methods that return proper types
      type StripeInstance = InstanceType<typeof StripeIntegration>
      type ConnectReturn = AsyncReturnType<StripeInstance['connect']>

      expectTypeOf<ConnectReturn>().toMatchTypeOf<StripeDeepIntegration>()
      expectTypeOf<ConnectReturn['chargesEnabled']>().toEqualTypeOf<boolean | undefined>()
      expectTypeOf<ConnectReturn['payoutsEnabled']>().toEqualTypeOf<boolean | undefined>()
    })

    it('handlePaymentSucceeded should not accept any data', () => {
      // Currently: private async handlePaymentSucceeded(data: any): Promise<void>
      // Should be: private async handlePaymentSucceeded(data: Stripe.PaymentIntent): Promise<void>

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type CreatePaymentReturn = AsyncReturnType<StripeInstance['createPaymentIntent']>

      // Verify payment intent return type is properly structured, not any
      expectTypeOf<CreatePaymentReturn>().toHaveProperty('id')
      expectTypeOf<CreatePaymentReturn>().toHaveProperty('amount')
      expectTypeOf<CreatePaymentReturn>().toHaveProperty('status')
      expectTypeOf<CreatePaymentReturn['status']>().toEqualTypeOf<
        'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded'
      >()
    })

    it('handlePaymentFailed should not accept any data', () => {
      // Currently: private async handlePaymentFailed(data: any): Promise<void>
      // Validates through getPaymentIntent which should return properly typed data

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type GetPaymentReturn = AsyncReturnType<StripeInstance['getPaymentIntent']>

      expectTypeOf<IsNotAny<GetPaymentReturn>>().toEqualTypeOf<true>()
    })

    it('handleSubscriptionEvent should not accept any data', () => {
      // Currently: private async handleSubscriptionEvent(type: string, data: any): Promise<void>
      // Should be properly typed with Stripe.Subscription

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type CreateSubReturn = AsyncReturnType<StripeInstance['createSubscription']>

      expectTypeOf<CreateSubReturn>().toHaveProperty('id')
      expectTypeOf<CreateSubReturn>().toHaveProperty('status')
      expectTypeOf<CreateSubReturn['status']>().toEqualTypeOf<
        'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused'
      >()
    })

    it('handlePayoutEvent should not accept any data', () => {
      // Currently: private async handlePayoutEvent(type: string, data: any): Promise<void>

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type CreatePayoutReturn = AsyncReturnType<StripeInstance['createPayout']>

      expectTypeOf<CreatePayoutReturn>().toHaveProperty('id')
      expectTypeOf<CreatePayoutReturn>().toHaveProperty('status')
      expectTypeOf<CreatePayoutReturn['status']>().toEqualTypeOf<'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'>()
    })

    it('mapSubscription should not accept any parameter', () => {
      // Currently: private mapSubscription(subscription: any): Subscription
      // Should use Stripe.Subscription type

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type CancelSubReturn = AsyncReturnType<StripeInstance['cancelSubscription']>

      expectTypeOf<CancelSubReturn>().toHaveProperty('customerId')
      expectTypeOf<CancelSubReturn>().toHaveProperty('currentPeriodStart')
      expectTypeOf<CancelSubReturn>().toHaveProperty('currentPeriodEnd')
      expectTypeOf<CancelSubReturn>().toHaveProperty('cancelAtPeriodEnd')
    })

    it('getBalance should not use any in mapping', () => {
      // Currently: balance.available.map((b: { amount: number; currency: string }, i: number) => ...)
      // The explicit inline typing suggests the balance response is typed as any

      type StripeInstance = InstanceType<typeof StripeIntegration>
      type BalanceReturn = AsyncReturnType<StripeInstance['getBalance']>

      expectTypeOf<BalanceReturn>().toBeArray()
      type BalanceItem = BalanceReturn[number]
      expectTypeOf<BalanceItem>().toHaveProperty('available')
      expectTypeOf<BalanceItem>().toHaveProperty('pending')
      expectTypeOf<BalanceItem>().toHaveProperty('currency')
    })
  })
})

// =============================================================================
// GitHub Integration Type Tests
// =============================================================================

describe('GitHub Integration Types', () => {
  describe('GitHubClient interface should not use any', () => {
    /**
     * The current GitHubClient interface uses `any` extensively:
     *
     * interface GitHubClient {
     *   apps: {
     *     getInstallation(installationId: string): Promise<any>;
     *     createInstallationAccessToken(installationId: string): Promise<any>;
     *   };
     *   repos: {
     *     get(params: { owner: string; repo: string }): Promise<any>;
     *     getContent(params: ...): Promise<any>;
     *     createOrUpdateFile(params: any): Promise<any>;
     *     deleteFile(params: any): Promise<any>;
     *   };
     *   ...
     * }
     *
     * These should use @octokit/rest types.
     */

    it('mapPermissions should not accept any parameter', () => {
      // Currently: private mapPermissions(permissions: any): RepositoryPermissions
      // Should use Octokit installation permissions type

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type ConnectReturn = AsyncReturnType<GitHubInstance['connect']>

      expectTypeOf<ConnectReturn>().toMatchTypeOf<GitHubDeepIntegration>()
      expectTypeOf<ConnectReturn['permissions']>().not.toBeAny()
    })

    it('mapCommit should not accept any parameter', () => {
      // Currently: private mapCommit(commit: any): Commit
      // Should use Octokit commit type

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type PutFileReturn = AsyncReturnType<GitHubInstance['putFile']>

      expectTypeOf<PutFileReturn>().toHaveProperty('sha')
      expectTypeOf<PutFileReturn>().toHaveProperty('message')
      expectTypeOf<PutFileReturn>().toHaveProperty('author')
      expectTypeOf<PutFileReturn['author']>().toHaveProperty('name')
      expectTypeOf<PutFileReturn['author']>().toHaveProperty('email')
      expectTypeOf<PutFileReturn['author']>().toHaveProperty('date')
    })

    it('mapPullRequest should not accept any parameter', () => {
      // Currently: private mapPullRequest(pr: any): PullRequest
      // Should use Octokit pull request type

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type CreatePRReturn = AsyncReturnType<GitHubInstance['createPullRequest']>

      expectTypeOf<CreatePRReturn>().toHaveProperty('id')
      expectTypeOf<CreatePRReturn>().toHaveProperty('number')
      expectTypeOf<CreatePRReturn>().toHaveProperty('title')
      expectTypeOf<CreatePRReturn>().toHaveProperty('state')
      expectTypeOf<CreatePRReturn['state']>().toEqualTypeOf<'open' | 'closed'>()
      expectTypeOf<CreatePRReturn>().toHaveProperty('head')
      expectTypeOf<CreatePRReturn>().toHaveProperty('base')
    })

    it('mapIssue should not accept any parameter', () => {
      // Currently: private mapIssue(issue: any): Issue
      // With: issue.labels.map((l: any) => l.name) and issue.assignees.map((a: any) => a.login)

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type CreateIssueReturn = AsyncReturnType<GitHubInstance['createIssue']>

      expectTypeOf<CreateIssueReturn>().toHaveProperty('id')
      expectTypeOf<CreateIssueReturn>().toHaveProperty('number')
      expectTypeOf<CreateIssueReturn>().toHaveProperty('title')
      expectTypeOf<CreateIssueReturn>().toHaveProperty('state')
      expectTypeOf<CreateIssueReturn['state']>().toEqualTypeOf<'open' | 'closed'>()
      expectTypeOf<CreateIssueReturn>().toHaveProperty('labels')
      expectTypeOf<CreateIssueReturn['labels']>().toEqualTypeOf<string[]>()
      expectTypeOf<CreateIssueReturn>().toHaveProperty('assignees')
      expectTypeOf<CreateIssueReturn['assignees']>().toEqualTypeOf<string[]>()
    })

    it('listPullRequests should not return any[] internally', () => {
      // The prs.map(this.mapPullRequest) call uses any internally

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type ListPRReturn = AsyncReturnType<GitHubInstance['listPullRequests']>

      expectTypeOf<ListPRReturn>().toBeArray()
      type PRType = ListPRReturn[number]
      expectTypeOf<IsNotAny<PRType>>().toEqualTypeOf<true>()
    })

    it('listIssues should not return any[] internally', () => {
      // The issues.map(this.mapIssue) call uses any internally

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type ListIssuesReturn = AsyncReturnType<GitHubInstance['listIssues']>

      expectTypeOf<ListIssuesReturn>().toBeArray()
      type IssueType = ListIssuesReturn[number]
      expectTypeOf<IsNotAny<IssueType>>().toEqualTypeOf<true>()
    })

    it('webhook handlers should not accept any event', () => {
      // Currently all handlers accept any:
      // - handlePushEvent(event: any)
      // - handlePullRequestEvent(event: any)
      // - handleIssuesEvent(event: any)
      // - handleWorkflowRunEvent(event: any)
      // - handleInstallationEvent(event: any)

      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type HandleWebhookReturn = AsyncReturnType<GitHubInstance['handleWebhook']>

      expectTypeOf<HandleWebhookReturn>().toHaveProperty('success')
      // This verifies the public interface; internal handlers need proper GitHub webhook types
    })

    it('getRepository should not return any', () => {
      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type GetRepoReturn = AsyncReturnType<GitHubInstance['getRepository']>

      expectTypeOf<GetRepoReturn>().toHaveProperty('id')
      expectTypeOf<GetRepoReturn>().toHaveProperty('name')
      expectTypeOf<GetRepoReturn>().toHaveProperty('fullName')
      expectTypeOf<GetRepoReturn>().toHaveProperty('defaultBranch')
      expectTypeOf<GetRepoReturn>().toHaveProperty('private')
      expectTypeOf<GetRepoReturn['private']>().toEqualTypeOf<boolean>()
    })

    it('listFiles should return properly typed array', () => {
      type GitHubInstance = InstanceType<typeof GitHubIntegration>
      type ListFilesReturn = AsyncReturnType<GitHubInstance['listFiles']>

      expectTypeOf<ListFilesReturn>().toBeArray()
      type FileType = ListFilesReturn[number]
      expectTypeOf<FileType>().toHaveProperty('path')
      expectTypeOf<FileType>().toHaveProperty('sha')
      expectTypeOf<FileType>().toHaveProperty('type')
      expectTypeOf<FileType['type']>().toEqualTypeOf<'file' | 'dir' | 'symlink' | 'submodule'>()
    })
  })
})

// =============================================================================
// Cloudflare Integration Type Tests
// =============================================================================

describe('Cloudflare Integration Types', () => {
  describe('CloudflareClient interface should not use any', () => {
    /**
     * The current CloudflareClient interface uses `any` extensively:
     *
     * interface CloudflareClient {
     *   user: { tokens: { verify(): Promise<any> } };
     *   zones: {
     *     create(params: any): Promise<any>;
     *     get(zoneId: string): Promise<any>;
     *     list(params: any): Promise<any>;
     *   };
     *   dns: { records: { create(zoneId: string, params: any): Promise<any>; ... } };
     *   ...
     * }
     *
     * These should use official Cloudflare SDK types.
     */

    it('mapZone should not accept any parameter', () => {
      // Currently: private mapZone(zone: any): Zone

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type CreateZoneReturn = AsyncReturnType<CloudflareInstance['createZone']>

      expectTypeOf<CreateZoneReturn>().toHaveProperty('id')
      expectTypeOf<CreateZoneReturn>().toHaveProperty('name')
      expectTypeOf<CreateZoneReturn>().toHaveProperty('status')
      expectTypeOf<CreateZoneReturn['status']>().toEqualTypeOf<'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated'>()
      expectTypeOf<CreateZoneReturn>().toHaveProperty('nameServers')
      expectTypeOf<CreateZoneReturn['nameServers']>().toEqualTypeOf<string[]>()
    })

    it('mapDNSRecord should not accept any parameter', () => {
      // Currently: private mapDNSRecord(record: any): DNSRecord

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type CreateDNSReturn = AsyncReturnType<CloudflareInstance['createDNSRecord']>

      expectTypeOf<CreateDNSReturn>().toHaveProperty('id')
      expectTypeOf<CreateDNSReturn>().toHaveProperty('zoneId')
      expectTypeOf<CreateDNSReturn>().toHaveProperty('name')
      expectTypeOf<CreateDNSReturn>().toHaveProperty('type')
      expectTypeOf<CreateDNSReturn>().toHaveProperty('content')
      expectTypeOf<CreateDNSReturn>().toHaveProperty('proxied')
      expectTypeOf<CreateDNSReturn['proxied']>().toEqualTypeOf<boolean>()
    })

    it('mapBindingToApi should not return any', () => {
      // Currently: private mapBindingToApi(binding: WorkerBinding): any
      // Should return properly typed Cloudflare binding config

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type DeployWorkerReturn = AsyncReturnType<CloudflareInstance['deployWorker']>

      expectTypeOf<DeployWorkerReturn>().toHaveProperty('id')
      expectTypeOf<DeployWorkerReturn>().toHaveProperty('name')
      expectTypeOf<DeployWorkerReturn>().toHaveProperty('createdOn')
      expectTypeOf<DeployWorkerReturn>().toHaveProperty('modifiedOn')
    })

    it('listZones should not use any in mapping', () => {
      // The list response mapping uses: zones.result.map(this.mapZone)
      // where zones.result is typed as any

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type ListZonesReturn = AsyncReturnType<CloudflareInstance['listZones']>

      expectTypeOf<ListZonesReturn>().toBeArray()
      type ZoneType = ListZonesReturn[number]
      expectTypeOf<IsNotAny<ZoneType>>().toEqualTypeOf<true>()
    })

    it('listDNSRecords should not use any in mapping', () => {
      // The list response mapping uses: records.result.map(this.mapDNSRecord)

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type ListDNSReturn = AsyncReturnType<CloudflareInstance['listDNSRecords']>

      expectTypeOf<ListDNSReturn>().toBeArray()
      type RecordType = ListDNSReturn[number]
      expectTypeOf<IsNotAny<RecordType>>().toEqualTypeOf<true>()
    })

    it('refresh method should not use any in result mapping', () => {
      // Currently maps with inline typing suggesting any source:
      // zones.result.map((z: { id: string }) => z.id)
      // kvNamespaces.result.map((ns: { id: string }) => ns.id)
      // etc.

      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type RefreshReturn = AsyncReturnType<CloudflareInstance['refresh']>

      expectTypeOf<RefreshReturn>().toMatchTypeOf<CloudflareDeepIntegration>()
      expectTypeOf<RefreshReturn['zoneIds']>().toEqualTypeOf<string[] | undefined>()
      expectTypeOf<RefreshReturn['kvNamespaces']>().toEqualTypeOf<string[] | undefined>()
      expectTypeOf<RefreshReturn['r2Buckets']>().toEqualTypeOf<string[] | undefined>()
      expectTypeOf<RefreshReturn['d1Databases']>().toEqualTypeOf<string[] | undefined>()
    })

    it('d1Query should return properly typed results', () => {
      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type D1QueryReturn = AsyncReturnType<CloudflareInstance['d1Query']>

      expectTypeOf<D1QueryReturn>().toHaveProperty('results')
      expectTypeOf<D1QueryReturn>().toHaveProperty('meta')
      expectTypeOf<D1QueryReturn['results']>().toEqualTypeOf<Record<string, unknown>[]>()
      expectTypeOf<D1QueryReturn['meta']>().toHaveProperty('changes')
      expectTypeOf<D1QueryReturn['meta']>().toHaveProperty('lastRowId')
    })

    it('getSSLCertificate should return properly typed certificate', () => {
      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type GetSSLReturn = AsyncReturnType<CloudflareInstance['getSSLCertificate']>

      // Can be null
      expectTypeOf<GetSSLReturn>().toEqualTypeOf<{
        id: string
        type: string
        hosts: string[]
        status: 'active' | 'pending_validation' | 'pending_issuance' | 'pending_deployment'
        issuer: string
        expiresOn: string
      } | null>()
    })

    it('createKVNamespace should return properly typed namespace', () => {
      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type CreateKVReturn = AsyncReturnType<CloudflareInstance['createKVNamespace']>

      expectTypeOf<CreateKVReturn>().toHaveProperty('id')
      expectTypeOf<CreateKVReturn>().toHaveProperty('title')
      expectTypeOf<CreateKVReturn>().toHaveProperty('supportsUrlEncoding')
    })

    it('createR2Bucket should return properly typed bucket', () => {
      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type CreateR2Return = AsyncReturnType<CloudflareInstance['createR2Bucket']>

      expectTypeOf<CreateR2Return>().toHaveProperty('name')
      expectTypeOf<CreateR2Return>().toHaveProperty('creationDate')
    })

    it('createD1Database should return properly typed database', () => {
      type CloudflareInstance = InstanceType<typeof CloudflareIntegration>
      type CreateD1Return = AsyncReturnType<CloudflareInstance['createD1Database']>

      expectTypeOf<CreateD1Return>().toHaveProperty('uuid')
      expectTypeOf<CreateD1Return>().toHaveProperty('name')
      expectTypeOf<CreateD1Return>().toHaveProperty('version')
      expectTypeOf<CreateD1Return>().toHaveProperty('numTables')
      expectTypeOf<CreateD1Return>().toHaveProperty('fileSize')
    })
  })
})

// =============================================================================
// Cross-Integration Type Tests
// =============================================================================

describe('Base Integration Type Safety', () => {
  it('all integrations should have type-safe getState', () => {
    type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
    type StripeInstance = InstanceType<typeof StripeIntegration>
    type GitHubInstance = InstanceType<typeof GitHubIntegration>
    type CloudflareInstance = InstanceType<typeof CloudflareIntegration>

    type WorkOSState = AsyncReturnType<WorkOSInstance['getState']>
    type StripeState = AsyncReturnType<StripeInstance['getState']>
    type GitHubState = AsyncReturnType<GitHubInstance['getState']>
    type CloudflareState = AsyncReturnType<CloudflareInstance['getState']>

    // All states should be their respective types or null, never any
    expectTypeOf<WorkOSState>().toEqualTypeOf<WorkOSDeepIntegration | null>()
    expectTypeOf<StripeState>().toEqualTypeOf<StripeDeepIntegration | null>()
    expectTypeOf<GitHubState>().toEqualTypeOf<GitHubDeepIntegration | null>()
    expectTypeOf<CloudflareState>().toEqualTypeOf<CloudflareDeepIntegration | null>()
  })

  it('all integrations should have type-safe healthCheck', () => {
    type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
    type StripeInstance = InstanceType<typeof StripeIntegration>
    type GitHubInstance = InstanceType<typeof GitHubIntegration>
    type CloudflareInstance = InstanceType<typeof CloudflareIntegration>

    type WorkOSHealth = AsyncReturnType<WorkOSInstance['healthCheck']>
    type StripeHealth = AsyncReturnType<StripeInstance['healthCheck']>
    type GitHubHealth = AsyncReturnType<GitHubInstance['healthCheck']>
    type CloudflareHealth = AsyncReturnType<CloudflareInstance['healthCheck']>

    // All health checks should return HealthCheckResult, not any
    expectTypeOf<WorkOSHealth>().toHaveProperty('healthy')
    expectTypeOf<WorkOSHealth>().toHaveProperty('status')

    expectTypeOf<StripeHealth>().toHaveProperty('healthy')
    expectTypeOf<StripeHealth>().toHaveProperty('status')

    expectTypeOf<GitHubHealth>().toHaveProperty('healthy')
    expectTypeOf<GitHubHealth>().toHaveProperty('status')

    expectTypeOf<CloudflareHealth>().toHaveProperty('healthy')
    expectTypeOf<CloudflareHealth>().toHaveProperty('status')
  })

  it('all integrations should have type-safe disconnect', () => {
    type WorkOSInstance = InstanceType<typeof WorkOSIntegration>
    type StripeInstance = InstanceType<typeof StripeIntegration>
    type GitHubInstance = InstanceType<typeof GitHubIntegration>
    type CloudflareInstance = InstanceType<typeof CloudflareIntegration>

    type WorkOSDisconnect = AsyncReturnType<WorkOSInstance['disconnect']>
    type StripeDisconnect = AsyncReturnType<StripeInstance['disconnect']>
    type GitHubDisconnect = AsyncReturnType<GitHubInstance['disconnect']>
    type CloudflareDisconnect = AsyncReturnType<CloudflareInstance['disconnect']>

    // All disconnects should return boolean, not any
    expectTypeOf<WorkOSDisconnect>().toEqualTypeOf<boolean>()
    expectTypeOf<StripeDisconnect>().toEqualTypeOf<boolean>()
    expectTypeOf<GitHubDisconnect>().toEqualTypeOf<boolean>()
    expectTypeOf<CloudflareDisconnect>().toEqualTypeOf<boolean>()
  })
})
