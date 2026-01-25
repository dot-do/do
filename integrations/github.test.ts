/**
 * GitHub Integration Tests
 *
 * Tests for the GitHub App integration.
 *
 * @module integrations/__tests__/github.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GitHubDeepIntegration } from '../types/integrations';
import {
  GitHubIntegration,
  GitHubConnectConfig,
  FileContent,
  CommitConfig,
  PullRequestConfig,
  Repository,
  Commit,
  PullRequest,
} from './github';
import {
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  IntegrationError,
} from './base';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create mock credential store
 */
function createMockCredentialStore(): CredentialStore {
  const store = new Map<string, string>();

  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    has: vi.fn(async (key: string) => store.has(key)),
  };
}

/**
 * Create mock event emitter
 */
function createMockEventEmitter(): IntegrationEventEmitter {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

/**
 * Create mock GitHub client
 */
function createMockGitHubClient() {
  return {
    apps: {
      getInstallation: vi.fn().mockResolvedValue({
        id: 'inst_test123',
        permissions: {
          contents: 'write',
          pull_requests: 'write',
          issues: 'write',
        },
      }),
      createInstallationAccessToken: vi.fn().mockResolvedValue({
        token: 'ghs_test_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    },
    repos: {
      get: vi.fn().mockResolvedValue({
        id: 12345,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        default_branch: 'main',
        private: false,
        description: 'Test repository',
        url: 'https://api.github.com/repos/owner/test-repo',
        clone_url: 'https://github.com/owner/test-repo.git',
      }),
      getContent: vi.fn().mockResolvedValue({
        path: 'src/index.ts',
        sha: 'abc123',
        content: btoa('export const hello = "world"'),
        encoding: 'base64',
        size: 100,
        type: 'file',
        url: 'https://api.github.com/repos/owner/repo/contents/src/index.ts',
        download_url: 'https://raw.githubusercontent.com/owner/repo/main/src/index.ts',
      }),
      createOrUpdateFile: vi.fn().mockResolvedValue({
        commit: {
          sha: 'def456',
          message: 'Update file',
          author: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
          committer: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
          url: 'https://api.github.com/repos/owner/repo/commits/def456',
        },
      }),
      deleteFile: vi.fn().mockResolvedValue({
        commit: {
          sha: 'ghi789',
          message: 'Delete file',
          author: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
          committer: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
          url: 'https://api.github.com/repos/owner/repo/commits/ghi789',
        },
      }),
    },
    git: {
      getRef: vi.fn().mockResolvedValue({
        object: { sha: 'abc123' },
      }),
      getCommit: vi.fn().mockResolvedValue({
        tree: { sha: 'tree123' },
      }),
      createBlob: vi.fn().mockResolvedValue({
        sha: 'blob123',
      }),
      createTree: vi.fn().mockResolvedValue({
        sha: 'newtree123',
      }),
      createCommit: vi.fn().mockResolvedValue({
        sha: 'newcommit123',
        message: 'Multi-file commit',
        author: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
        committer: { name: 'Test', email: 'test@example.com', date: new Date().toISOString() },
        url: 'https://api.github.com/repos/owner/repo/commits/newcommit123',
      }),
      updateRef: vi.fn().mockResolvedValue({}),
    },
    pulls: {
      create: vi.fn().mockResolvedValue({
        id: 1001,
        number: 42,
        title: 'Test PR',
        body: 'Test description',
        state: 'open',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        draft: false,
        merged: false,
        mergeable: true,
        url: 'https://api.github.com/repos/owner/repo/pulls/42',
        html_url: 'https://github.com/owner/repo/pull/42',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      list: vi.fn().mockResolvedValue([
        {
          id: 1001,
          number: 42,
          title: 'Test PR',
          state: 'open',
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          draft: false,
          merged: false,
          url: 'https://api.github.com/repos/owner/repo/pulls/42',
          html_url: 'https://github.com/owner/repo/pull/42',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
      merge: vi.fn().mockResolvedValue({
        merged: true,
        sha: 'mergesha123',
        message: 'Pull Request successfully merged',
      }),
    },
    issues: {
      create: vi.fn().mockResolvedValue({
        id: 2001,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        labels: [{ name: 'bug' }],
        assignees: [{ login: 'testuser' }],
        url: 'https://api.github.com/repos/owner/repo/issues/123',
        html_url: 'https://github.com/owner/repo/issues/123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      list: vi.fn().mockResolvedValue([
        {
          id: 2001,
          number: 123,
          title: 'Test Issue',
          state: 'open',
          labels: [{ name: 'bug' }],
          assignees: [{ login: 'testuser' }],
          url: 'https://api.github.com/repos/owner/repo/issues/123',
          html_url: 'https://github.com/owner/repo/issues/123',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('GitHubIntegration', () => {
  let config: BaseIntegrationConfig;
  let credentials: CredentialStore;
  let events: IntegrationEventEmitter;
  let githubClient: ReturnType<typeof createMockGitHubClient>;
  let integration: GitHubIntegration;

  beforeEach(() => {
    config = {
      doId: 'test-do-id',
      workspaceId: 'test-workspace-id',
      debug: false,
    };
    credentials = createMockCredentialStore();
    events = createMockEventEmitter();
    githubClient = createMockGitHubClient();
    integration = new GitHubIntegration(config, credentials, events, githubClient as any);
  });

  describe('connect', () => {
    it('should connect GitHub App installation', async () => {
      const connectConfig: GitHubConnectConfig = {
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      };

      const state = await integration.connect(connectConfig);

      expect(state.type).toBe('github');
      expect(state.status).toBe('Active');
      expect(state.installationId).toBe('inst_test123');
      expect(state.repository).toBe('owner/test-repo');
      expect(state.branch).toBe('main');
    });

    it('should store installation token', async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });

      expect(credentials.set).toHaveBeenCalledWith(
        'test-do-id:github:installation_token',
        'ghs_test_token',
        undefined
      );
    });

    it('should map permissions correctly', async () => {
      const state = await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });

      expect(state.permissions).toEqual({
        contents: 'write',
        pullRequests: 'write',
        issues: 'write',
      });
    });

    it('should emit connected event', async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:connected',
        payload: { integrationType: 'github' },
      });
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
    });

    it('should disconnect and clear state', async () => {
      const result = await integration.disconnect();

      expect(result).toBe(true);
      expect(await integration.getState()).toBeNull();
    });

    it('should delete stored credentials', async () => {
      await integration.disconnect();

      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:github:installation_token');
      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:github:token_expires_at');
    });
  });

  describe('healthCheck', () => {
    it('should return not_configured when not connected', async () => {
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('NotConfigured');
    });

    it('should verify repository access', async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      // Simulate valid token
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);

      const result = await integration.healthCheck({ detailed: true });

      expect(result.healthy).toBe(true);
      expect(result.details).toEqual({
        repository: 'owner/test-repo',
        defaultBranch: 'main',
        private: false,
      });
    });
  });

  describe('getRepository', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    it('should return repository information', async () => {
      const repo = await integration.getRepository();

      expect(repo.fullName).toBe('owner/test-repo');
      expect(repo.defaultBranch).toBe('main');
      expect(repo.private).toBe(false);
    });
  });

  describe('getFile', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    it('should retrieve file content', async () => {
      const file = await integration.getFile('src/index.ts');

      expect(file.path).toBe('src/index.ts');
      expect(file.sha).toBe('abc123');
      expect(file.encoding).toBe('base64');
    });

    it('should throw when path is a directory', async () => {
      githubClient.repos.getContent.mockResolvedValueOnce([
        { path: 'file1.ts', type: 'file' },
      ]);

      await expect(integration.getFile('src')).rejects.toThrow('Path is a directory');
    });
  });

  describe('putFile', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    it('should create or update file', async () => {
      const file: FileContent = {
        path: 'src/index.ts',
        content: 'export const hello = "world"',
        encoding: 'utf-8',
      };
      const commitConfig: CommitConfig = {
        message: 'Update index.ts',
      };

      const commit = await integration.putFile(file, commitConfig);

      expect(commit.sha).toBe('def456');
      expect(commit.message).toBe('Update file');
    });

    it('should update lastSyncSha', async () => {
      await integration.putFile(
        { path: 'test.ts', content: 'test', encoding: 'utf-8' },
        { message: 'Test' }
      );

      const state = await integration.getState();
      expect(state!.lastSyncSha).toBe('def456');
    });
  });

  describe('createCommit', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    it('should create multi-file commit', async () => {
      const files: FileContent[] = [
        { path: 'file1.ts', content: 'content1', encoding: 'utf-8' },
        { path: 'file2.ts', content: 'content2', encoding: 'utf-8' },
      ];

      const commit = await integration.createCommit(files, { message: 'Multi-file commit' });

      expect(commit.sha).toBe('newcommit123');
      expect(githubClient.git.createBlob).toHaveBeenCalledTimes(2);
      expect(githubClient.git.createTree).toHaveBeenCalled();
      expect(githubClient.git.createCommit).toHaveBeenCalled();
      expect(githubClient.git.updateRef).toHaveBeenCalled();
    });

    it('should use simple API for single file', async () => {
      const files: FileContent[] = [
        { path: 'file1.ts', content: 'content1', encoding: 'utf-8' },
      ];

      await integration.createCommit(files, { message: 'Single file commit' });

      expect(githubClient.repos.createOrUpdateFile).toHaveBeenCalled();
      expect(githubClient.git.createBlob).not.toHaveBeenCalled();
    });
  });

  describe('Pull Requests', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    describe('createPullRequest', () => {
      it('should create pull request', async () => {
        const prConfig: PullRequestConfig = {
          title: 'Test PR',
          body: 'Test description',
          head: 'feature',
          base: 'main',
        };

        const pr = await integration.createPullRequest(prConfig);

        expect(pr.number).toBe(42);
        expect(pr.title).toBe('Test PR');
        expect(pr.state).toBe('open');
      });
    });

    describe('listPullRequests', () => {
      it('should list pull requests', async () => {
        const prs = await integration.listPullRequests();

        expect(prs).toHaveLength(1);
        expect(prs[0].number).toBe(42);
      });

      it('should filter by state', async () => {
        await integration.listPullRequests({ state: 'closed' });

        expect(githubClient.pulls.list).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'closed' })
        );
      });
    });

    describe('mergePullRequest', () => {
      it('should merge pull request', async () => {
        const result = await integration.mergePullRequest(42);

        expect(result.merged).toBe(true);
        expect(result.sha).toBe('mergesha123');
      });

      it('should support different merge methods', async () => {
        await integration.mergePullRequest(42, { mergeMethod: 'squash' });

        expect(githubClient.pulls.merge).toHaveBeenCalledWith(
          expect.objectContaining({ merge_method: 'squash' })
        );
      });
    });
  });

  describe('Issues', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
      await credentials.set('test-do-id:github:token_expires_at', new Date(Date.now() + 3600000).toISOString(), undefined);
    });

    describe('createIssue', () => {
      it('should create issue', async () => {
        const issue = await integration.createIssue('Test Issue', {
          body: 'Test body',
          labels: ['bug'],
        });

        expect(issue.number).toBe(123);
        expect(issue.title).toBe('Test Issue');
      });
    });

    describe('listIssues', () => {
      it('should list issues', async () => {
        const issues = await integration.listIssues();

        expect(issues).toHaveLength(1);
        expect(issues[0].number).toBe(123);
      });
    });
  });

  describe('handleWebhook', () => {
    beforeEach(async () => {
      await integration.connect({
        installationId: 'inst_test123',
        repository: 'owner/test-repo',
      });
    });

    it('should handle push event', async () => {
      const payload = {
        body: JSON.stringify({
          ref: 'refs/heads/main',
          after: 'newsha123',
          commits: [{ id: 'commit1' }],
        }),
        headers: {
          'x-github-event': 'push',
        },
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('push');

      const state = await integration.getState();
      expect(state!.lastSyncSha).toBe('newsha123');
    });

    it('should handle pull_request event', async () => {
      const payload = {
        body: JSON.stringify({
          action: 'opened',
          number: 42,
          pull_request: {},
        }),
        headers: {
          'x-github-event': 'pull_request',
        },
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('pull_request');
    });

    it('should handle installation suspension', async () => {
      const payload = {
        body: JSON.stringify({
          action: 'suspend',
        }),
        headers: {
          'x-github-event': 'installation',
        },
      };

      await integration.handleWebhook(payload);

      const state = await integration.getState();
      expect(state!.status).toBe('Suspended');
    });
  });
});
