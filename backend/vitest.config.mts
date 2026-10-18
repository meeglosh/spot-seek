import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// `npm test` (scripts/test-branch.mjs) creates an ephemeral Neon branch and
// exports its URL; it must win over the shared-dev-DB URL in .dev.vars.
const dbOverride = process.env.SPOTSEEK_TEST_DB_BRANCH && process.env.DATABASE_URL
	? { DATABASE_URL: process.env.DATABASE_URL, DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL }
	: {};

export default defineWorkersConfig({
	test: {
		// Neon-backed specs intermittently exceed the 5s default under full-suite load.
		testTimeout: 20000,
		// Shared-DB runs only: deletes this run's fixture users/events afterwards.
		// A no-op on an ephemeral branch (the whole branch is deleted instead).
		globalSetup: ["./test/global-teardown.ts"],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
				// Never open a Cloudflare remote proxy session for tests. The `ai`
				// binding is always remote in wrangler 4, so without this the pool
				// calls the Cloudflare API (edge-preview) at startup and the whole
				// run dies if that API is unreachable. Tests don't use the real AI
				// binding (MODERATION_AI=off + injected classifier).
				remoteBindings: false,
				// Test-only credentials (admin + Better Auth signing secret) so the admin-gated job triggers
				// (run-sweeps/run-reminders/run-reviews) are exercisable.
				miniflare: {
					// MODERATION_AI=off: tests never call the real Workers AI binding
					// (moderation specs inject a mock classifier instead).
					// SENTRY_DSN blank: Sentry is a no-op in tests (the wrangler var holds the real DSN).
					bindings: { BETTER_AUTH_SECRET: "test-only-better-auth-secret-0123456789abcdef", ADMIN_SECRET: "test-admin-secret", MODERATION_AI: "off", SENTRY_DSN: "", ...dbOverride },
				},
			},
		},
	},
});
