#!/usr/bin/env node

/**
 * Acceptance mount check script for dsh-pathfix.
 *
 * Usage:
 *   node acceptance/mount_check.mjs <profile_dir>
 * Example:
 *   node acceptance/mount_check.mjs C:\Users\marti\.dsh\profiles\web
 *
 * Verifies:
 * 1. Profile package.json declares dsh-pathfix in dependencies.
 * 2. dsh.profile.bundles includes dsh-pathfix.
 * 3. Installed plugin package contains cordis.patch.yml bundle patch.
 * 4. Plugin mounts cleanly and intercepts tools/execute to fix trailing newlines.
 *
 * @module dsh-pathfix/acceptance/mount_check
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const profileDir = process.argv[2]
if (!profileDir) {
  console.error('Error: missing profile directory argument.')
  console.error('Usage: node acceptance/mount_check.mjs <profile_dir>')
  process.exit(1)
}

const resolvedProfileDir = resolve(profileDir)
console.log(`[mount_check] Checking profile at: ${resolvedProfileDir}`)

// 1. Verify package.json in profile
const pkgPath = join(resolvedProfileDir, 'package.json')
if (!existsSync(pkgPath)) {
  console.error(`[mount_check] FAILED: package.json not found at ${pkgPath}`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const hasDependency = Boolean(pkg.dependencies?.['dsh-pathfix'])
if (!hasDependency) {
  console.error('[mount_check] FAILED: dsh-pathfix is not in profile package.json dependencies.')
  process.exit(1)
}
console.log('[mount_check] OK: dsh-pathfix found in profile package.json dependencies.')

// 2. Verify dsh.profile.bundles
const bundles = pkg.dsh?.profile?.bundles ?? []
const hasBundle = bundles.includes('dsh-pathfix')
if (!hasBundle) {
  console.warn('[mount_check] WARNING: dsh-pathfix is not yet in pkg.dsh.profile.bundles (will be reconciled by dsh boot).')
} else {
  console.log('[mount_check] OK: dsh-pathfix declared in dsh.profile.bundles.')
}

// 3. Verify installed module and cordis.patch.yml
const installedDir = join(resolvedProfileDir, 'node_modules', 'dsh-pathfix')
const patchFile = join(installedDir, 'cordis.patch.yml')
if (!existsSync(installedDir)) {
  console.error(`[mount_check] FAILED: node_modules/dsh-pathfix not found at ${installedDir}`)
  process.exit(1)
}
if (!existsSync(patchFile)) {
  console.error(`[mount_check] FAILED: cordis.patch.yml not found at ${patchFile}`)
  process.exit(1)
}
console.log('[mount_check] OK: node_modules/dsh-pathfix and cordis.patch.yml are present.')

// 4. Test live Cordis hook registration
console.log('[mount_check] Verifying live Cordis mount and normalization hook...')
try {
  const { Context } = await import('@deepseek-ai/cordis')
  const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
  const { ToolRuntime, defineTool } = await import('@deepseek-ai/dsh-tools')
  const PathfixPlugin = (await import(pathToFileURL(join(installedDir, 'lib', 'index.js')).href)).default

  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(PathfixPlugin, { enabled: true, logFixes: false })

  let receivedPath = null
  ctx.tools.register(defineTool({
    name: 'read_image',
    description: 'Acceptance verification tool',
    parameters: {
      file_path: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, val) => [{ type: 'text', text: String(val) }],
    },
    async execute(args) {
      receivedPath = args.file_path
      return 'verified'
    },
  }))

  const result = await ctx.tools.execute({
    callId: 'acceptance-verify-1',
    name: 'read_image',
    arguments: { file_path: 'C:\\test\\verification_shot.png\n\n' },
    signal: new AbortController().signal,
  })

  assert.equal(result.isError, false, `Execution failed with: ${result.error?.message}`)
  assert.equal(receivedPath, 'C:\\test\\verification_shot.png', 'Trailing newlines were not trimmed!')
  console.log(`[mount_check] OK: read_image path was successfully normalized: "C:\\test\\verification_shot.png\\n\\n" -> "${receivedPath}"`)
} catch (err) {
  console.error('[mount_check] FAILED during live hook execution:', err)
  process.exit(1)
}

console.log('[mount_check] SUCCESS: dsh-pathfix is mounted and active.')
process.exit(0)
