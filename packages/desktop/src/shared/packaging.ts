/**
 * Packaging constants + build-config validation (N37).
 * =====================================================
 * Pure, dependency-free helpers shared by the icon pipeline
 * (`scripts/generate-icons.mjs`) and the build-config tests. Keeping the
 * platform/target matrix here (rather than only inside `package.json`) means
 * the cross-platform packaging contract is type-checked and unit-tested instead
 * of silently drifting.
 */

/** The master raster size electron-builder derives platform icons from. */
export const MASTER_ICON_SIZE = 1024

/** Square PNG sizes emitted for the Linux icon set (and the .ico/.icns mips). */
export const ICON_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const

/** electron-builder output target per platform (matches `package.json#build`). */
export const PLATFORM_TARGETS = {
  mac: ['dmg', 'zip'],
  win: ['nsis'],
  linux: ['AppImage', 'deb', 'rpm'],
} as const

export type PlatformKey = keyof typeof PLATFORM_TARGETS

/** Minimal shape of the electron-builder config we assert against. */
export interface BuildConfigShape {
  appId?: unknown
  productName?: unknown
  directories?: { output?: unknown; buildResources?: unknown }
  files?: unknown
  asarUnpack?: unknown
  publish?: { provider?: unknown; owner?: unknown; repo?: unknown } | unknown
  mac?: { target?: unknown; icon?: unknown; hardenedRuntime?: unknown }
  win?: { target?: unknown; icon?: unknown }
  linux?: { target?: unknown; icon?: unknown; category?: unknown }
  nsis?: { differentialPackage?: unknown }
  afterSign?: unknown
}

function targetNames(target: unknown): string[] {
  if (!Array.isArray(target)) return []
  return target.map(t =>
    typeof t === 'string'
      ? t
      : typeof t === 'object' && t !== null && 'target' in t
        ? String((t as { target: unknown }).target)
        : '',
  )
}

/**
 * Validate an electron-builder config against the N37 cross-platform contract.
 * Returns a list of human-readable problems (empty ⇒ valid). Pure — no IO.
 */
export function validateBuildConfig(build: BuildConfigShape): string[] {
  const problems: string[] = []

  if (typeof build.appId !== 'string' || !build.appId) {
    problems.push('appId must be a non-empty string')
  }
  if (typeof build.productName !== 'string' || !build.productName) {
    problems.push('productName must be a non-empty string')
  }

  // Output must come from the electron-vite `out/` dir, never the stale `dist/`.
  const files = Array.isArray(build.files) ? build.files.map(String) : []
  if (!files.some(f => f.startsWith('out/'))) {
    problems.push('files must package the electron-vite "out/" output')
  }
  if (files.some(f => f.startsWith('dist/'))) {
    problems.push('files must not reference the stale "dist/" directory')
  }

  // node-pty ships a native binding that must be unpacked from the asar.
  const unpack = Array.isArray(build.asarUnpack)
    ? build.asarUnpack.map(String)
    : []
  if (!unpack.some(p => p.includes('node-pty'))) {
    problems.push('asarUnpack must include node-pty (native binding)')
  }

  // GitHub Releases is the update feed (paired with electron-updater, N36).
  const publish = build.publish as
    | { provider?: unknown; owner?: unknown; repo?: unknown }
    | undefined
  if (!publish || publish.provider !== 'github') {
    problems.push('publish.provider must be "github"')
  } else if (!publish.owner || !publish.repo) {
    problems.push('publish must set owner and repo')
  }

  // Each platform must emit exactly the required targets.
  for (const [platform, expected] of Object.entries(PLATFORM_TARGETS)) {
    const cfg = build[platform as PlatformKey] as
      | { target?: unknown; icon?: unknown }
      | undefined
    const names = targetNames(cfg?.target)
    for (const want of expected) {
      if (!names.includes(want)) {
        problems.push(`${platform} target must include "${want}"`)
      }
    }
    if (typeof cfg?.icon !== 'string' || !cfg.icon) {
      problems.push(`${platform} must declare an icon`)
    }
  }

  // Delta updates preferred on Windows (N36 requirement).
  if (
    build.nsis &&
    (build.nsis as { differentialPackage?: unknown }).differentialPackage !==
      true
  ) {
    problems.push('nsis.differentialPackage must be true (delta updates)')
  }

  // macOS notarization runs from an afterSign hook (skips when unsigned).
  if (typeof build.afterSign !== 'string' || !build.afterSign) {
    problems.push('afterSign hook required for macOS notarization')
  }

  return problems
}
