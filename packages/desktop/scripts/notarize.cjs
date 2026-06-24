/**
 * electron-builder afterSign hook — macOS notarization (N37).
 * ===========================================================
 * Notarizes the signed .app via Apple's notary service. Designed to be a no-op
 * outside CI so local/unsigned builds never fail:
 *   - skips on non-macOS platforms
 *   - skips when notarization is explicitly disabled (SKIP_NOTARIZE=1)
 *   - skips when the required Apple credentials are not present
 *
 * Required CI secrets (set as env vars) to actually notarize:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 */
const { existsSync } = require('node:fs')
const path = require('node:path')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') return
  if (process.env.SKIP_NOTARIZE === '1') {
    console.log('[notarize] SKIP_NOTARIZE=1 — skipping')
    return
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      '[notarize] Apple credentials not set — skipping notarization (unsigned build)',
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  if (!existsSync(appPath)) {
    console.log(`[notarize] ${appPath} not found — skipping`)
    return
  }

  // Lazy require so non-mac builds don't need the dependency installed.
  const { notarize } = require('@electron/notarize')
  console.log(`[notarize] notarizing ${appName}.app …`)
  await notarize({
    appBundleId: context.packager.appInfo.macBundleIdentifier,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  })
  console.log('[notarize] done')
}
