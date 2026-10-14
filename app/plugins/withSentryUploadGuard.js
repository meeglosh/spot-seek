// Makes Sentry's Xcode build phases (source map upload + dSYM upload) skip
// gracefully when no auth token is configured, instead of failing the build.
// Upload runs only when SENTRY_AUTH_TOKEN is exported in the build environment
// or app/.env.sentry-build-plugin exists (gitignored). Otherwise
// SENTRY_DISABLE_AUTO_UPLOAD=true is set for the phase.
// Register BEFORE "@sentry/react-native" in app.json: Expo runs mods in reverse
// registration order, so this one then sees the phases that plugin adds. A
// warning is printed if none are found.
const { withXcodeProject } = require('expo/config-plugins');

const MARKER = '# withSentryUploadGuard';
const GUARD =
  `${MARKER}\n` +
  'if [ -z "$SENTRY_AUTH_TOKEN" ] && [ ! -f "$PROJECT_DIR/../.env.sentry-build-plugin" ]; then export SENTRY_DISABLE_AUTO_UPLOAD=true; fi\n';

module.exports = function withSentryUploadGuard(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    let patched = 0;
    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase !== 'object' || typeof phase.shellScript !== 'string') continue;
      if (!phase.shellScript.includes('sentry-xcode')) continue;
      // shellScript is stored as a quoted, JSON-escaped string
      const script = JSON.parse(phase.shellScript);
      if (!script.includes(MARKER)) {
        phase.shellScript = JSON.stringify(GUARD + script);
      }
      patched++;
    }
    if (patched === 0) {
      console.warn('withSentryUploadGuard: no Sentry build phases found; is "@sentry/react-native" listed after this plugin?');
    }
    return cfg;
  });
};
