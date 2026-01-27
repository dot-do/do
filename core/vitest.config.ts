import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          durableObjects: {
            DO: 'DigitalObject',
          },
        },
      },
    },
    include: ['tests/**/*.test.ts'],
  },
})
