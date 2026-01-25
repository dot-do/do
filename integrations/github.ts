/**
 * GitHub Integration
 *
 * Provides deep integration with GitHub for:
 * - GitHub App installation and management
 * - Repository content sync
 * - Pull request and issue tracking
 * - GitHub Actions integration
 * - Webhook event handling
 *
 * @module integrations/github
 */

import type { GitHubDeepIntegration } from '../types/integrations';
import {
  BaseIntegration,
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  HealthCheckResult,
  HealthCheckOptions,
  WebhookPayload,
  WebhookResult,
  IntegrationError,
} from './base';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for connecting GitHub
 */
export interface GitHubConnectConfig {
  /** GitHub App installation ID */
  installationId: string;
  /** Repository in owner/repo format */
  repository: string;
  /** Default branch (defaults to main) */
  branch?: string;
  /** Base path within repository */
  basePath?: string;
  /** Webhook secret for verification */
  webhookSecret?: string;
}

/**
 * Repository permissions
 */
export interface RepositoryPermissions {
  contents?: 'read' | 'write';
  pullRequests?: 'read' | 'write';
  issues?: 'read' | 'write';
  actions?: 'read' | 'write';
  webhooks?: 'read' | 'write';
}

/**
 * File content for operations
 */
export interface FileContent {
  /** File path relative to base path */
  path: string;
  /** File content (base64 or utf-8) */
  content: string;
  /** Encoding type */
  encoding?: 'base64' | 'utf-8';
  /** File SHA (for updates) */
  sha?: string;
}

/**
 * Commit configuration
 */
export interface CommitConfig {
  /** Commit message */
  message: string;
  /** Branch to commit to */
  branch?: string;
  /** Author information */
  author?: {
    name: string;
    email: string;
  };
  /** Committer information */
  committer?: {
    name: string;
    email: string;
  };
}

/**
 * Pull request configuration
 */
export interface PullRequestConfig {
  /** PR title */
  title: string;
  /** PR body/description */
  body?: string;
  /** Head branch (source) */
  head: string;
  /** Base branch (target) */
  base: string;
  /** Draft PR */
  draft?: boolean;
  /** Maintainer can modify */
  maintainerCanModify?: boolean;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Repository information
 */
export interface Repository {
  id: number;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description?: string;
  url: string;
  cloneUrl: string;
}

/**
 * File metadata
 */
export interface FileMetadata {
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  url: string;
  downloadUrl?: string;
}

/**
 * Commit information
 */
export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
}

/**
 * Pull request information
 */
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  draft: boolean;
  merged: boolean;
  mergeable?: boolean;
  url: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Issue information
 */
export interface Issue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  url: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Workflow run information
 */
export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';
  headSha: string;
  headBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Number of files synced */
  fileCount: number;
  /** New commit SHA */
  commitSha: string;
  /** Files that were added */
  added: string[];
  /** Files that were modified */
  modified: string[];
  /** Files that were deleted */
  deleted: string[];
}

// =============================================================================
// GitHub Integration Class
// =============================================================================

/**
 * GitHub Integration
 *
 * Manages GitHub App integration for repository sync, PRs, issues,
 * and GitHub Actions.
 *
 * @example
 * ```typescript
 * const github = new GitHubIntegration(config, credentials, events);
 *
 * // Connect GitHub
 * await github.connect({
 *   installationId: 'inst_123',
 *   repository: 'owner/repo',
 * });
 *
 * // Get file content
 * const content = await github.getFile('src/index.ts');
 *
 * // Create a commit
 * await github.createCommit(
 *   [{ path: 'src/index.ts', content: 'updated content' }],
 *   { message: 'Update index' }
 * );
 * ```
 */
class GitHubIntegration extends BaseIntegration<GitHubDeepIntegration> {
  readonly type = 'github' as const;

  /** GitHub client (injected) */
  private githubClient: GitHubClient | null = null;

  /**
   * Create a new GitHub integration instance
   */
  constructor(
    config: BaseIntegrationConfig,
    credentials: CredentialStore,
    events: IntegrationEventEmitter,
    githubClient?: GitHubClient
  ) {
    super(config, credentials, events);
    this.githubClient = githubClient ?? null;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect GitHub App installation
   *
   * @param config - GitHub connection configuration
   * @returns The integration state
   */
  async connect(config: GitHubConnectConfig): Promise<GitHubDeepIntegration> {
    this.debug('Connecting GitHub', { repository: config.repository });

    const client = this.getClient();

    try {
      // Verify installation access
      const installation = await client.apps.getInstallation(config.installationId);

      // Get repository info
      const [owner, repo] = config.repository.split('/');
      const repository = await client.repos.get({ owner, repo });

      // Get installation token
      const token = await client.apps.createInstallationAccessToken(config.installationId);
      await this.storeCredential('installation_token', token.token);
      await this.storeCredential('token_expires_at', token.expires_at);

      // Store webhook secret if provided
      if (config.webhookSecret) {
        await this.storeCredential('webhook_secret', config.webhookSecret);
      }

      // Get installation permissions
      const permissions = this.mapPermissions(installation.permissions);

      // Initialize state
      this.state = {
        type: 'github',
        status: 'Active',
        installationId: config.installationId,
        repository: config.repository,
        branch: config.branch ?? repository.default_branch,
        basePath: config.basePath ?? '',
        permissions,
        webhookSecret: config.webhookSecret ? '[configured]' : undefined,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      this.emitEvent({
        type: 'integration:connected',
        payload: { integrationType: 'github' },
      });

      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect GitHub';
      this.emitError(message);
      throw new IntegrationError('github', 'CONNECT_FAILED', message, error as Error);
    }
  }

  /**
   * Disconnect GitHub
   */
  async disconnect(): Promise<boolean> {
    if (!this.state?.installationId) {
      return false;
    }

    this.debug('Disconnecting GitHub', { installationId: this.state.installationId });

    // Clean up credentials
    await this.deleteCredential('installation_token');
    await this.deleteCredential('token_expires_at');
    await this.deleteCredential('webhook_secret');

    return super.disconnect();
  }

  /**
   * Check GitHub integration health
   */
  async healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!this.state?.installationId) {
      return {
        healthy: false,
        status: 'NotConfigured',
        checkedAt: startTime,
        error: 'GitHub not connected',
      };
    }

    try {
      await this.ensureValidToken();

      const client = this.getClient();
      const [owner, repo] = this.state.repository!.split('/');

      // Try to access the repository
      const repository = await client.repos.get({ owner, repo });

      return {
        healthy: true,
        status: 'Active',
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        details: options?.detailed ? {
          repository: repository.full_name,
          defaultBranch: repository.default_branch,
          private: repository.private,
        } : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      return {
        healthy: false,
        status: 'Error',
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        error: message,
      };
    }
  }

  /**
   * Refresh GitHub installation token
   */
  async refresh(): Promise<GitHubDeepIntegration> {
    if (!this.state?.installationId) {
      throw new IntegrationError('github', 'NOT_CONFIGURED', 'GitHub not connected');
    }

    await this.refreshToken();
    this.updateState({ lastActivityAt: Date.now() });

    return this.state;
  }

  // ===========================================================================
  // Webhook Handling
  // ===========================================================================

  /**
   * Handle GitHub webhook events
   *
   * @param payload - The webhook payload
   * @returns Webhook processing result
   */
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    this.debug('Handling GitHub webhook');

    const webhookSecret = await this.getCredential('webhook_secret');

    if (webhookSecret) {
      const signature = payload.headers['x-hub-signature-256'];
      if (!signature) {
        return {
          success: false,
          error: 'Missing GitHub signature',
        };
      }

      // TODO: Verify signature
    }

    try {
      const event = JSON.parse(payload.body);
      const eventType = payload.headers['x-github-event'];

      switch (eventType) {
        case 'push':
          await this.handlePushEvent(event);
          break;

        case 'pull_request':
          await this.handlePullRequestEvent(event);
          break;

        case 'issues':
          await this.handleIssuesEvent(event);
          break;

        case 'workflow_run':
          await this.handleWorkflowRunEvent(event);
          break;

        case 'installation':
          await this.handleInstallationEvent(event);
          break;

        default:
          this.debug('Unhandled event type', { type: eventType });
      }

      return {
        success: true,
        eventType,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      return {
        success: false,
        error: message,
      };
    }
  }

  // ===========================================================================
  // Repository Operations
  // ===========================================================================

  /**
   * Get repository information
   *
   * @returns Repository info
   */
  async getRepository(): Promise<Repository> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const repository = await client.repos.get({ owner, repo });

    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
      private: repository.private,
      description: repository.description,
      url: repository.url,
      cloneUrl: repository.clone_url,
    };
  }

  /**
   * List files in a directory
   *
   * @param path - Directory path (relative to base path)
   * @param ref - Git ref (branch, tag, or commit)
   * @returns Array of file metadata
   */
  async listFiles(path?: string, ref?: string): Promise<FileMetadata[]> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');
    const fullPath = this.resolvePath(path ?? '');

    const contents = await client.repos.getContent({
      owner,
      repo,
      path: fullPath,
      ref: ref ?? this.state!.branch,
    });

    if (!Array.isArray(contents)) {
      throw new IntegrationError('github', 'NOT_DIRECTORY', 'Path is not a directory');
    }

    return contents.map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size,
      type: item.type as FileMetadata['type'],
      url: item.url,
      downloadUrl: item.download_url,
    }));
  }

  /**
   * Get file content
   *
   * @param path - File path (relative to base path)
   * @param ref - Git ref
   * @returns File content
   */
  async getFile(path: string, ref?: string): Promise<FileContent> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');
    const fullPath = this.resolvePath(path);

    const content = await client.repos.getContent({
      owner,
      repo,
      path: fullPath,
      ref: ref ?? this.state!.branch,
    });

    if (Array.isArray(content)) {
      throw new IntegrationError('github', 'IS_DIRECTORY', 'Path is a directory');
    }

    return {
      path: content.path,
      content: content.content,
      encoding: 'base64',
      sha: content.sha,
    };
  }

  /**
   * Create or update a file
   *
   * @param file - File content
   * @param commit - Commit configuration
   * @returns Commit result
   */
  async putFile(file: FileContent, commit: CommitConfig): Promise<Commit> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');
    const fullPath = this.resolvePath(file.path);

    const content = file.encoding === 'utf-8'
      ? btoa(file.content)
      : file.content;

    const result = await client.repos.createOrUpdateFile({
      owner,
      repo,
      path: fullPath,
      message: commit.message,
      content,
      sha: file.sha,
      branch: commit.branch ?? this.state!.branch,
      author: commit.author,
      committer: commit.committer,
    });

    this.updateState({
      lastSyncSha: result.commit.sha,
      lastActivityAt: Date.now(),
    });

    return this.mapCommit(result.commit);
  }

  /**
   * Delete a file
   *
   * @param path - File path
   * @param sha - File SHA
   * @param commit - Commit configuration
   */
  async deleteFile(path: string, sha: string, commit: CommitConfig): Promise<Commit> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');
    const fullPath = this.resolvePath(path);

    const result = await client.repos.deleteFile({
      owner,
      repo,
      path: fullPath,
      message: commit.message,
      sha,
      branch: commit.branch ?? this.state!.branch,
      author: commit.author,
      committer: commit.committer,
    });

    return this.mapCommit(result.commit);
  }

  /**
   * Create a commit with multiple file changes
   *
   * @param files - Files to include in commit
   * @param commit - Commit configuration
   * @returns Commit result
   */
  async createCommit(files: FileContent[], commit: CommitConfig): Promise<Commit> {
    this.ensureConnected();
    await this.ensureValidToken();

    // For single file, use simple API
    if (files.length === 1) {
      return this.putFile(files[0], commit);
    }

    // For multiple files, use Git Data API
    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');
    const branch = commit.branch ?? this.state!.branch!;

    // Get the latest commit on the branch
    const ref = await client.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const latestCommitSha = ref.object.sha;

    // Get the tree of the latest commit
    const latestCommit = await client.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
    const baseTreeSha = latestCommit.tree.sha;

    // Create blobs for each file
    const treeItems = await Promise.all(files.map(async (file) => {
      const content = file.encoding === 'utf-8'
        ? file.content
        : atob(file.content);

      const blob = await client.git.createBlob({
        owner,
        repo,
        content,
        encoding: 'utf-8',
      });

      return {
        path: this.resolvePath(file.path),
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      };
    }));

    // Create new tree
    const newTree = await client.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });

    // Create commit
    const newCommit = await client.git.createCommit({
      owner,
      repo,
      message: commit.message,
      tree: newTree.sha,
      parents: [latestCommitSha],
      author: commit.author,
      committer: commit.committer,
    });

    // Update ref
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    this.updateState({
      lastSyncSha: newCommit.sha,
      lastActivityAt: Date.now(),
    });

    return this.mapCommit(newCommit);
  }

  // ===========================================================================
  // Pull Request Operations
  // ===========================================================================

  /**
   * Create a pull request
   *
   * @param config - Pull request configuration
   * @returns The created pull request
   */
  async createPullRequest(config: PullRequestConfig): Promise<PullRequest> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const pr = await client.pulls.create({
      owner,
      repo,
      title: config.title,
      body: config.body,
      head: config.head,
      base: config.base,
      draft: config.draft,
      maintainer_can_modify: config.maintainerCanModify,
    });

    return this.mapPullRequest(pr);
  }

  /**
   * List pull requests
   *
   * @param options - List options
   * @returns Array of pull requests
   */
  async listPullRequests(
    options?: { state?: 'open' | 'closed' | 'all'; limit?: number }
  ): Promise<PullRequest[]> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const prs = await client.pulls.list({
      owner,
      repo,
      state: options?.state ?? 'open',
      per_page: options?.limit ?? 30,
    });

    return prs.map(this.mapPullRequest);
  }

  /**
   * Merge a pull request
   *
   * @param pullNumber - Pull request number
   * @param options - Merge options
   * @returns Merge result
   */
  async mergePullRequest(
    pullNumber: number,
    options?: { commitTitle?: string; commitMessage?: string; mergeMethod?: 'merge' | 'squash' | 'rebase' }
  ): Promise<{ merged: boolean; sha?: string; message: string }> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const result = await client.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      commit_title: options?.commitTitle,
      commit_message: options?.commitMessage,
      merge_method: options?.mergeMethod ?? 'merge',
    });

    return {
      merged: result.merged,
      sha: result.sha,
      message: result.message,
    };
  }

  // ===========================================================================
  // Issue Operations
  // ===========================================================================

  /**
   * Create an issue
   *
   * @param title - Issue title
   * @param options - Issue options
   * @returns The created issue
   */
  async createIssue(
    title: string,
    options?: { body?: string; labels?: string[]; assignees?: string[] }
  ): Promise<Issue> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const issue = await client.issues.create({
      owner,
      repo,
      title,
      body: options?.body,
      labels: options?.labels,
      assignees: options?.assignees,
    });

    return this.mapIssue(issue);
  }

  /**
   * List issues
   *
   * @param options - List options
   * @returns Array of issues
   */
  async listIssues(
    options?: { state?: 'open' | 'closed' | 'all'; labels?: string[]; limit?: number }
  ): Promise<Issue[]> {
    this.ensureConnected();
    await this.ensureValidToken();

    const client = this.getClient();
    const [owner, repo] = this.state!.repository!.split('/');

    const issues = await client.issues.list({
      owner,
      repo,
      state: options?.state ?? 'open',
      labels: options?.labels?.join(','),
      per_page: options?.limit ?? 30,
    });

    return issues.map(this.mapIssue);
  }

  // ===========================================================================
  // Protected Methods
  // ===========================================================================

  protected async cleanupCredentials(): Promise<void> {
    await this.deleteCredential('installation_token');
    await this.deleteCredential('token_expires_at');
    await this.deleteCredential('webhook_secret');
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get the GitHub client
   */
  private getClient(): GitHubClient {
    if (!this.githubClient) {
      throw new IntegrationError(
        'github',
        'CLIENT_NOT_CONFIGURED',
        'GitHub client not configured'
      );
    }
    return this.githubClient;
  }

  /**
   * Ensure the integration is connected
   */
  private ensureConnected(): void {
    if (!this.state?.installationId) {
      throw new IntegrationError('github', 'NOT_CONNECTED', 'GitHub not connected');
    }

    if (this.state.status !== 'Active') {
      throw new IntegrationError(
        'github',
        'NOT_ACTIVE',
        `GitHub integration is ${this.state.status}`
      );
    }
  }

  /**
   * Ensure the installation token is valid
   */
  private async ensureValidToken(): Promise<void> {
    const expiresAt = await this.getCredential('token_expires_at');

    if (!expiresAt || new Date(expiresAt).getTime() < Date.now() + 60000) {
      await this.refreshToken();
    }
  }

  /**
   * Refresh the installation token
   */
  private async refreshToken(): Promise<void> {
    const client = this.getClient();

    const token = await client.apps.createInstallationAccessToken(
      this.state!.installationId!
    );

    await this.storeCredential('installation_token', token.token);
    await this.storeCredential('token_expires_at', token.expires_at);
  }

  /**
   * Resolve a path relative to the base path
   */
  private resolvePath(path: string): string {
    const basePath = this.state!.basePath ?? '';
    if (!basePath) return path;
    return `${basePath}/${path}`.replace(/\/+/g, '/').replace(/^\//, '');
  }

  /**
   * Map installation permissions to our format
   */
  private mapPermissions(permissions: GitHubInstallationPermissions): RepositoryPermissions {
    return {
      contents: permissions.contents,
      pullRequests: permissions.pull_requests,
      issues: permissions.issues,
      actions: permissions.actions,
      webhooks: permissions.webhooks,
    }
  }

  /**
   * Map API commit to our format
   */
  private mapCommit(commit: GitHubCommitResponse): Commit {
    return {
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      committer: commit.committer,
      url: commit.url,
    }
  }

  /**
   * Map API pull request to our format
   */
  private mapPullRequest(pr: GitHubPullRequestResponse): PullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      head: { ref: pr.head.ref, sha: pr.head.sha },
      base: { ref: pr.base.ref, sha: pr.base.sha },
      draft: pr.draft,
      merged: pr.merged,
      mergeable: pr.mergeable,
      url: pr.url,
      htmlUrl: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }
  }

  /**
   * Map API issue to our format
   */
  private mapIssue(issue: GitHubIssueResponse): Issue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((l: GitHubLabel) => l.name),
      assignees: issue.assignees.map((a: GitHubUser) => a.login),
      url: issue.url,
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }
  }

  /**
   * Handle push event
   */
  private async handlePushEvent(event: GitHubPushWebhookEvent): Promise<void> {
    this.debug('Push event', { ref: event.ref, commits: event.commits?.length })

    // Update last sync SHA if this is our tracked branch
    if (event.ref === `refs/heads/${this.state!.branch}`) {
      this.updateState({
        lastSyncSha: event.after,
        lastActivityAt: Date.now(),
      })
    }
  }

  /**
   * Handle pull request event
   */
  private async handlePullRequestEvent(event: GitHubPullRequestWebhookEvent): Promise<void> {
    this.debug('Pull request event', { action: event.action, number: event.number })
    // Emit event or trigger workflow
  }

  /**
   * Handle issues event
   */
  private async handleIssuesEvent(event: GitHubIssuesWebhookEvent): Promise<void> {
    this.debug('Issues event', { action: event.action, number: event.issue?.number })
    // Emit event or trigger workflow
  }

  /**
   * Handle workflow run event
   */
  private async handleWorkflowRunEvent(event: GitHubWorkflowRunWebhookEvent): Promise<void> {
    this.debug('Workflow run event', { action: event.action, status: event.workflow_run?.status })
    // Emit event or trigger workflow
  }

  /**
   * Handle installation event
   */
  private async handleInstallationEvent(event: GitHubInstallationWebhookEvent): Promise<void> {
    this.debug('Installation event', { action: event.action })

    if (event.action === 'deleted' || event.action === 'suspend') {
      this.setStatus('Suspended', 'GitHub App installation was removed or suspended')
    }
  }
}

// =============================================================================
// Type Definitions for GitHub Client
// =============================================================================

/**
 * GitHub user object
 */
interface GitHubUser {
  login: string
  id: number
}

/**
 * GitHub label object
 */
interface GitHubLabel {
  name: string
  color?: string
}

/**
 * GitHub installation response
 */
interface GitHubInstallationResponse {
  id: number
  permissions: GitHubInstallationPermissions
}

/**
 * GitHub installation permissions
 */
interface GitHubInstallationPermissions {
  contents?: 'read' | 'write'
  pull_requests?: 'read' | 'write'
  issues?: 'read' | 'write'
  actions?: 'read' | 'write'
  webhooks?: 'read' | 'write'
}

/**
 * GitHub installation access token response
 */
interface GitHubInstallationAccessTokenResponse {
  token: string
  expires_at: string
}

/**
 * GitHub repository response
 */
interface GitHubRepositoryResponse {
  id: number
  name: string
  full_name: string
  default_branch: string
  private: boolean
  description?: string
  url: string
  clone_url: string
}

/**
 * GitHub content response (file)
 */
interface GitHubFileContentResponse {
  path: string
  sha: string
  size: number
  type: 'file'
  content: string
  encoding: string
  url: string
  download_url?: string
}

/**
 * GitHub content response (directory item)
 */
interface GitHubDirectoryItemResponse {
  path: string
  sha: string
  size: number
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  url: string
  download_url?: string
}

/**
 * GitHub create/update file parameters
 */
interface GitHubCreateOrUpdateFileParams {
  owner: string
  repo: string
  path: string
  message: string
  content: string
  sha?: string
  branch?: string
  author?: { name: string; email: string }
  committer?: { name: string; email: string }
}

/**
 * GitHub create/update file response
 */
interface GitHubCreateOrUpdateFileResponse {
  commit: GitHubCommitResponse
}

/**
 * GitHub delete file parameters
 */
interface GitHubDeleteFileParams {
  owner: string
  repo: string
  path: string
  message: string
  sha: string
  branch?: string
  author?: { name: string; email: string }
  committer?: { name: string; email: string }
}

/**
 * GitHub delete file response
 */
interface GitHubDeleteFileResponse {
  commit: GitHubCommitResponse
}

/**
 * GitHub git ref response
 */
interface GitHubRefResponse {
  object: {
    sha: string
    type: string
  }
}

/**
 * GitHub commit response
 */
interface GitHubCommitResponse {
  sha: string
  message: string
  author: { name: string; email: string; date: string }
  committer: { name: string; email: string; date: string }
  url: string
  tree: { sha: string }
}

/**
 * GitHub blob response
 */
interface GitHubBlobResponse {
  sha: string
  url: string
}

/**
 * GitHub tree item
 */
interface GitHubTreeItem {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  type: 'blob' | 'tree' | 'commit'
  sha: string
}

/**
 * GitHub create tree parameters
 */
interface GitHubCreateTreeParams {
  owner: string
  repo: string
  base_tree?: string
  tree: GitHubTreeItem[]
}

/**
 * GitHub tree response
 */
interface GitHubTreeResponse {
  sha: string
  tree: GitHubTreeItem[]
}

/**
 * GitHub create commit parameters
 */
interface GitHubCreateCommitParams {
  owner: string
  repo: string
  message: string
  tree: string
  parents: string[]
  author?: { name: string; email: string }
  committer?: { name: string; email: string }
}

/**
 * GitHub update ref parameters
 */
interface GitHubUpdateRefParams {
  owner: string
  repo: string
  ref: string
  sha: string
  force?: boolean
}

/**
 * GitHub pull request response
 */
interface GitHubPullRequestResponse {
  id: number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed'
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  draft: boolean
  merged: boolean
  mergeable?: boolean
  url: string
  html_url: string
  created_at: string
  updated_at: string
}

/**
 * GitHub create pull request parameters
 */
interface GitHubCreatePullRequestParams {
  owner: string
  repo: string
  title: string
  body?: string
  head: string
  base: string
  draft?: boolean
  maintainer_can_modify?: boolean
}

/**
 * GitHub list pull requests parameters
 */
interface GitHubListPullRequestsParams {
  owner: string
  repo: string
  state?: 'open' | 'closed' | 'all'
  per_page?: number
}

/**
 * GitHub merge pull request parameters
 */
interface GitHubMergePullRequestParams {
  owner: string
  repo: string
  pull_number: number
  commit_title?: string
  commit_message?: string
  merge_method?: 'merge' | 'squash' | 'rebase'
}

/**
 * GitHub merge pull request response
 */
interface GitHubMergePullRequestResponse {
  merged: boolean
  sha?: string
  message: string
}

/**
 * GitHub issue response
 */
interface GitHubIssueResponse {
  id: number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  assignees: GitHubUser[]
  url: string
  html_url: string
  created_at: string
  updated_at: string
}

/**
 * GitHub create issue parameters
 */
interface GitHubCreateIssueParams {
  owner: string
  repo: string
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
}

/**
 * GitHub list issues parameters
 */
interface GitHubListIssuesParams {
  owner: string
  repo: string
  state?: 'open' | 'closed' | 'all'
  labels?: string
  per_page?: number
}

/**
 * GitHub push webhook event
 */
interface GitHubPushWebhookEvent {
  ref: string
  after: string
  commits?: Array<{ id: string; message: string }>
}

/**
 * GitHub pull request webhook event
 */
interface GitHubPullRequestWebhookEvent {
  action: string
  number: number
  pull_request?: GitHubPullRequestResponse
}

/**
 * GitHub issues webhook event
 */
interface GitHubIssuesWebhookEvent {
  action: string
  issue?: { number: number }
}

/**
 * GitHub workflow run webhook event
 */
interface GitHubWorkflowRunWebhookEvent {
  action: string
  workflow_run?: { status: string; conclusion?: string }
}

/**
 * GitHub installation webhook event
 */
interface GitHubInstallationWebhookEvent {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend'
}

/**
 * GitHub client interface
 * Matches the official Octokit SDK structure
 */
interface GitHubClient {
  apps: {
    getInstallation(installationId: string): Promise<GitHubInstallationResponse>
    createInstallationAccessToken(installationId: string): Promise<GitHubInstallationAccessTokenResponse>
  }
  repos: {
    get(params: { owner: string; repo: string }): Promise<GitHubRepositoryResponse>
    getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<GitHubFileContentResponse | GitHubDirectoryItemResponse[]>
    createOrUpdateFile(params: GitHubCreateOrUpdateFileParams): Promise<GitHubCreateOrUpdateFileResponse>
    deleteFile(params: GitHubDeleteFileParams): Promise<GitHubDeleteFileResponse>
  }
  git: {
    getRef(params: { owner: string; repo: string; ref: string }): Promise<GitHubRefResponse>
    getCommit(params: { owner: string; repo: string; commit_sha: string }): Promise<GitHubCommitResponse>
    createBlob(params: { owner: string; repo: string; content: string; encoding: string }): Promise<GitHubBlobResponse>
    createTree(params: GitHubCreateTreeParams): Promise<GitHubTreeResponse>
    createCommit(params: GitHubCreateCommitParams): Promise<GitHubCommitResponse>
    updateRef(params: GitHubUpdateRefParams): Promise<GitHubRefResponse>
  }
  pulls: {
    create(params: GitHubCreatePullRequestParams): Promise<GitHubPullRequestResponse>
    list(params: GitHubListPullRequestsParams): Promise<GitHubPullRequestResponse[]>
    merge(params: GitHubMergePullRequestParams): Promise<GitHubMergePullRequestResponse>
  }
  issues: {
    create(params: GitHubCreateIssueParams): Promise<GitHubIssueResponse>
    list(params: GitHubListIssuesParams): Promise<GitHubIssueResponse[]>
  }
}

// =============================================================================
// Exports
// =============================================================================

export { GitHubIntegration };
