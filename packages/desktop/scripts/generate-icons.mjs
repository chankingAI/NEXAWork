#!/usr/bin/env node
/**
 * NexaWork icon pipeline (N37).
 * ============================
 * Single source of truth → every platform icon electron-builder needs.
 *
 *   build/icon.svg  (vector master, hand-authored)
 *      │  sharp (rasterize @ 1024)
 *      ▼
 *   build/icon.png  (1024×1024, the master raster electron-builder can also
 *                    auto-derive from)
 *      │
 *      ├─ sharp  → build/icons/{16,32,48,64,128,256,512,1024}.png  (Linux set)
 *      └─ png2icons → build/icon.icns (macOS)  +  build/icon.ico (Windows)
 *
 * Run with:  bun run icons   (or  node scripts/generate-icons.mjs)
 * The generated assets are committed, so CI never has to run this.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import png2icons from 'png2icons'
import { ICON_PNG_SIZES, MASTER_ICON_SIZE } from '../src/shared/packaging.ts'

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = join(here, '..', 'build')
const iconsDir = join(buildDir, 'icons')
mkdirSync(iconsDir, { recursive: true })

const svgPath = join(buildDir, 'icon.svg')
const masterPng = join(buildDir, 'icon.png')

async function main() {
  const svg = readFileSync(svgPath)

  // 1. Vector → master raster.
  await sharp(svg, { density: 384 })
    .resize(MASTER_ICON_SIZE, MASTER_ICON_SIZE)
    .png()
    .toFile(masterPng)
  const master = readFileSync(masterPng)

  // 2. Linux PNG set.
  for (const size of ICON_PNG_SIZES) {
    await sharp(master)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `${size}.png`))
  }

  // 3. macOS .icns + Windows .ico (Bicubic resampling for crisp small sizes).
  const icns = png2icons.createICNS(master, png2icons.BICUBIC, 0)
  if (!icns) throw new Error('failed to generate icon.icns')
  writeFileSync(join(buildDir, 'icon.icns'), icns)

  const ico = png2icons.createICO(master, png2icons.BICUBIC, 0, true)
  if (!ico) throw new Error('failed to generate icon.ico')
  writeFileSync(join(buildDir, 'icon.ico'), ico)

  console.log(
    `icons: wrote icon.png, icon.icns, icon.ico and ${ICON_PNG_SIZES.length} Linux PNGs`,
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
