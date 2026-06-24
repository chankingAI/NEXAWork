import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ICON_PNG_SIZES,
  validateBuildConfig,
  type BuildConfigShape,
} from '../shared/packaging'

const desktopRoot = join(import.meta.dir, '..', '..')

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(desktopRoot, rel), 'utf8'))
}

const pkg = readJson('package.json')
const build = pkg.build as BuildConfigShape

describe('package.json build config (N37)', () => {
  test('build block exists and passes the cross-platform contract', () => {
    expect(build).toBeDefined()
    expect(validateBuildConfig(build)).toEqual([])
  })

  test('main entry points at the electron-vite out/ output', () => {
    expect(pkg.main).toBe('out/main/index.js')
  })

  test('mac is configured for signing + notarization', () => {
    const mac = build.mac as Record<string, unknown>
    expect(mac.hardenedRuntime).toBe(true)
    expect(mac.gatekeeperAssess).toBe(false)
    expect(mac.entitlements).toBe('build/entitlements.mac.plist')
  })

  test('nsis installer is user-friendly + differential', () => {
    const nsis = build.nsis as Record<string, unknown>
    expect(nsis.oneClick).toBe(false)
    expect(nsis.allowToChangeInstallationDirectory).toBe(true)
    expect(nsis.differentialPackage).toBe(true)
  })

  test('publish feed matches the electron-updater repo', () => {
    const publish = build.publish as Record<string, unknown>
    expect(publish.provider).toBe('github')
    expect(publish.owner).toBe('chankingAI')
    expect(publish.repo).toBe('NEXAWork')
  })

  test('dist scripts exist for each platform', () => {
    const scripts = pkg.scripts as Record<string, string>
    expect(scripts['dist:mac']).toContain('--mac')
    expect(scripts['dist:win']).toContain('--win')
    expect(scripts['dist:linux']).toContain('--linux')
    expect(scripts.icons).toBeDefined()
  })
})

describe('generated icon assets', () => {
  test('master + platform icons are committed', () => {
    for (const f of [
      'build/icon.svg',
      'build/icon.png',
      'build/icon.icns',
      'build/icon.ico',
      'build/entitlements.mac.plist',
    ]) {
      expect(existsSync(join(desktopRoot, f))).toBe(true)
    }
  })

  test('linux png icon set is complete', () => {
    for (const size of ICON_PNG_SIZES) {
      expect(
        existsSync(join(desktopRoot, 'build', 'icons', `${size}.png`)),
      ).toBe(true)
    }
  })

  test('icns/ico are non-trivial binaries', () => {
    expect(
      readFileSync(join(desktopRoot, 'build/icon.icns')).length,
    ).toBeGreaterThan(1000)
    expect(
      readFileSync(join(desktopRoot, 'build/icon.ico')).length,
    ).toBeGreaterThan(1000)
  })
})

describe('preload packaging', () => {
  test('package is CommonJS so electron-vite emits a sandbox-safe CJS preload', () => {
    // Sandboxed preload scripts (webPreferences.sandbox: true) must be
    // CommonJS; a "type": "module" package forces ESM (.mjs) output which
    // cannot load in a sandboxed preload.
    expect(pkg.type).toBeUndefined()
  })

  test('main process keeps the sandboxed preload + isolation flags', () => {
    const main = readFileSync(join(desktopRoot, 'src/main/index.ts'), 'utf8')
    expect(main).toContain("'../preload/index.js'")
    expect(main).toContain('sandbox: true')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
  })
})

describe('release workflow', () => {
  const wf = join(
    desktopRoot,
    '..',
    '..',
    '.github',
    'workflows',
    'release-desktop.yml',
  )

  test('workflow file exists', () => {
    expect(existsSync(wf)).toBe(true)
  })

  test('builds all three platforms and wires signing secrets', () => {
    const yml = readFileSync(wf, 'utf8')
    expect(yml).toContain('macos-latest')
    expect(yml).toContain('windows-latest')
    expect(yml).toContain('ubuntu-latest')
    expect(yml).toContain('APPLE_ID')
    expect(yml).toContain('CSC_LINK')
    expect(yml).toContain('electron-builder')
  })
})
