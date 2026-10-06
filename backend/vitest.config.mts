import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
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
