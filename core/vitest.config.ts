import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2025-01-20',
          compatibilityFlags: ['nodejs_compat_v2'],
          durableObjects: {
            DO: 'DigitalObject',
          },
        },
      },
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
