import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		// Deletes this run's fixture users/events from the shared dev DB afterwards.
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
				// Test-only admin credential so the admin-gated job triggers
				// (run-sweeps/run-reminders/run-reviews) are exercisable.
				miniflare: {
					// MODERATION_AI=off: tests never call the real Workers AI binding
					// (moderation specs inject a mock classifier instead).
					bindings: { ADMIN_SECRET: "test-admin-secret", MODERATION_AI: "off" },
				},
			},
		},
	},
});
