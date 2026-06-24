import { describe, expect, test } from 'bun:test'
import {
  ICON_PNG_SIZES,
  MASTER_ICON_SIZE,
  PLATFORM_TARGETS,
  validateBuildConfig,
  type BuildConfigShape,
} from '../shared/packaging'

function validBuild(): BuildConfigShape {
  return {
    appId: 'ai.nexawork.desktop',
    productName: 'NexaWork',
    directories: { output: 'release', buildResources: 'build' },
    files: ['out/**/*', 'package.json'],
    asarUnpack: ['**/node_modules/node-pty/**'],
    afterSign: 'scripts/notarize.cjs',
    publish: { provider: 'github', owner: 'chankingAI', repo: 'NEXAWork' },
    win: { icon: 'build/icon.ico', target: [{ target: 'nsis' }] },
    nsis: { differentialPackage: true },
    mac: {
      icon: 'build/icon.icns',
      hardenedRuntime: true,
      target: [{ target: 'dmg' }, { target: 'zip' }],
    },
    linux: { icon: 'build/icons', target: ['AppImage', 'deb', 'rpm'] },
  }
}

describe('packaging constants', () => {
  test('master icon size is 1024', () => {
    expect(MASTER_ICON_SIZE).toBe(1024)
  })

  test('icon png sizes are ascending powers/standard sizes including 1024', () => {
    expect(ICON_PNG_SIZES).toContain(1024)
    expect(ICON_PNG_SIZES[0]).toBe(16)
    const sorted = [...ICON_PNG_SIZES].sort((a, b) => a - b)
    expect([...ICON_PNG_SIZES]).toEqual(sorted)
  })

  test('platform targets cover mac/win/linux with required formats', () => {
    expect(PLATFORM_TARGETS.mac).toEqual(['dmg', 'zip'])
    expect(PLATFORM_TARGETS.win).toEqual(['nsis'])
    expect(PLATFORM_TARGETS.linux).toEqual(['AppImage', 'deb', 'rpm'])
  })
})

describe('validateBuildConfig', () => {
  test('accepts a complete valid config', () => {
    expect(validateBuildConfig(validBuild())).toEqual([])
  })

  test('flags missing appId', () => {
    const b = validBuild()
    b.appId = ''
    expect(validateBuildConfig(b)).toContain('appId must be a non-empty string')
  })

  test('flags missing productName', () => {
    const b = validBuild()
    delete b.productName
    expect(validateBuildConfig(b)).toContain(
      'productName must be a non-empty string',
    )
  })

  test('flags output that does not package out/', () => {
    const b = validBuild()
    b.files = ['lib/**/*']
    expect(validateBuildConfig(b)).toContain(
      'files must package the electron-vite "out/" output',
    )
  })

  test('flags stale dist/ reference', () => {
    const b = validBuild()
    b.files = ['out/**/*', 'dist/**/*']
    expect(validateBuildConfig(b)).toContain(
      'files must not reference the stale "dist/" directory',
    )
  })

  test('flags missing node-pty asarUnpack', () => {
    const b = validBuild()
    b.asarUnpack = []
    expect(validateBuildConfig(b)).toContain(
      'asarUnpack must include node-pty (native binding)',
    )
  })

  test('flags non-github publish provider', () => {
    const b = validBuild()
    b.publish = { provider: 's3' }
    expect(validateBuildConfig(b)).toContain(
      'publish.provider must be "github"',
    )
  })

  test('flags github publish missing owner/repo', () => {
    const b = validBuild()
    b.publish = { provider: 'github' }
    expect(validateBuildConfig(b)).toContain('publish must set owner and repo')
  })

  test('flags missing platform target', () => {
    const b = validBuild()
    b.linux = { icon: 'build/icons', target: ['AppImage'] }
    const problems = validateBuildConfig(b)
    expect(problems).toContain('linux target must include "deb"')
    expect(problems).toContain('linux target must include "rpm"')
  })

  test('flags missing platform icon', () => {
    const b = validBuild()
    b.mac = { target: [{ target: 'dmg' }, { target: 'zip' }] }
    expect(validateBuildConfig(b)).toContain('mac must declare an icon')
  })

  test('flags nsis without differential package', () => {
    const b = validBuild()
    b.nsis = { differentialPackage: false }
    expect(validateBuildConfig(b)).toContain(
      'nsis.differentialPackage must be true (delta updates)',
    )
  })

  test('flags missing afterSign hook', () => {
    const b = validBuild()
    delete b.afterSign
    expect(validateBuildConfig(b)).toContain(
      'afterSign hook required for macOS notarization',
    )
  })

  test('accepts string-form targets too', () => {
    const b = validBuild()
    b.mac = { icon: 'build/icon.icns', target: ['dmg', 'zip'] }
    expect(validateBuildConfig(b)).toEqual([])
  })

  test('reports multiple problems at once', () => {
    const problems = validateBuildConfig({})
    expect(problems.length).toBeGreaterThan(5)
  })
})
