// Makes Sentry's Xcode build phases (source map upload + dSYM upload) skip
// gracefully when upload is not fully configured, instead of failing the build.
// Upload runs only when a token AND an org AND a project are all resolvable, from
// the build environment, app/.env.sentry-build-plugin (gitignored) or
// ios/sentry.properties. Otherwise SENTRY_DISABLE_AUTO_UPLOAD=true is set.
//
// A token alone is not enough: if SENTRY_AUTH_TOKEN is merely exported in the
// shell (for other tooling) but no org/project is set, sentry-cli fails with
// "An organization ID or slug is required", no source map is written, and the
// bundle phase then dies in Sentry's collect-modules step ("Source map file does
// not exist"). With upload disabled, sentry-xcode.sh still exports
// SOURCEMAP_FILE, so the map is emitted and collect-modules succeeds.
//
// Register BEFORE "@sentry/react-native" in app.json: Expo runs mods in reverse
// registration order, so this one then sees the phases that plugin adds. A
// warning is printed if none are found.
const { withXcodeProject } = require('expo/config-plugins');

const MARKER = '# withSentryUploadGuard';
// POSIX sh (Xcode phases run /bin/sh). ENVF is the optional dotenv file.
const GUARD =
  `${MARKER}\n` +
  'ENVF="$PROJECT_DIR/../.env.sentry-build-plugin"\n' +
  'SENTRY_OK=1\n' +
  '{ [ -n "$SENTRY_AUTH_TOKEN" ] || { [ -f "$ENVF" ] && grep -q "^SENTRY_AUTH_TOKEN=." "$ENVF"; }; } || SENTRY_OK=\n' +
  '{ [ -n "$SENTRY_ORG" ] || { [ -f "$ENVF" ] && grep -q "^SENTRY_ORG=." "$ENVF"; } || grep -qs "^defaults.org=." "$PROJECT_DIR/sentry.properties"; } || SENTRY_OK=\n' +
  '{ [ -n "$SENTRY_PROJECT" ] || { [ -f "$ENVF" ] && grep -q "^SENTRY_PROJECT=." "$ENVF"; } || grep -qs "^defaults.project=." "$PROJECT_DIR/sentry.properties"; } || SENTRY_OK=\n' +
  '[ -n "$SENTRY_OK" ] || export SENTRY_DISABLE_AUTO_UPLOAD=true\n';

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
