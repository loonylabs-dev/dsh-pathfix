/**
 * E2E tests verifying dsh-pathfix with real @deepseek-ai/dsh-tool-fs implementations.
 *
 * Demonstrates:
 * 1. Without dsh-pathfix: read_image with trailing \n fails with:
 *    "read_image only accepts PNG/JPEG/WebP/GIF paths"
 * 2. With dsh-pathfix: read_image with trailing \n has its argument repaired and succeeds.
 * 3. Telemetry records the fix.
 *
 * @module dsh-pathfix/test/e2e
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as Pathfix from '../lib/index.js'

describe('dsh-pathfix: E2E Tests with @deepseek-ai/dsh-tool-fs', () => {
  it('reproduces failure without dsh-pathfix, and confirms repair with dsh-pathfix', async () => {
    const createMockFs = () => ({
      resolve: async (filePath) => ({
        displayPath: filePath,
        resolvedPath: filePath,
      }),
      writeText: async (target, content) => {
        if (target.resolvedPath.endsWith('\n')) {
          throw new Error(`EINVAL: invalid argument, mkdir '${target.resolvedPath}.tmpdir'`)
        }
        return {
          path: target.displayPath,
          operation: 'create',
          before: null,
          after: content,
        }
      },
    })

    // 1. Without pathfix
    const rawCtx = new Context()
    await rawCtx.plugin(SystemPrompt)
    await rawCtx.plugin(ToolRuntime)
    rawCtx.provide('fs', createMockFs())
    await rawCtx.plugin(ToolFs, {})

    // Call write with trailing newline WITHOUT pathfix
    const failedResult = await rawCtx.tools.execute({
      callId: 'raw-call-1',
      name: 'write',
      arguments: { file_path: 'C:\\test\\output.txt\n', content: 'hello' },
      signal: new AbortController().signal,
    })

    assert.equal(failedResult.isError, true)
    assert.match(
      failedResult.error.message,
      /EINVAL: invalid argument, mkdir/,
      'Without pathfix, trailing newline must trigger EINVAL'
    )

    // 2. With dsh-pathfix mounted
    const fixedCtx = new Context()
    await fixedCtx.plugin(SystemPrompt)
    await fixedCtx.plugin(ToolRuntime)
    fixedCtx.provide('fs', createMockFs())
    await fixedCtx.plugin(Pathfix.default, { enabled: true, logFixes: false })
    await fixedCtx.plugin(ToolFs, {})

    // Reset telemetry
    Pathfix.defaultTelemetry.reset()

    // Call write with trailing newline WITH pathfix
    const successResult = await fixedCtx.tools.execute({
      callId: 'fixed-call-1',
      name: 'write',
      arguments: { file_path: 'C:\\test\\output.txt\n', content: 'hello' },
      signal: new AbortController().signal,
    })

    // Now it must succeed!
    assert.equal(successResult.isError, false, `Expected success but got: ${successResult.error?.message}`)
    assert.equal(successResult.value.path, 'C:\\test\\output.txt')

    // Telemetry must record the repair
    assert.equal(Pathfix.defaultTelemetry.fixCount, 1)
    assert.equal(Pathfix.defaultTelemetry.history[0].tool, 'write')
    assert.equal(Pathfix.defaultTelemetry.history[0].param, 'file_path')
    assert.equal(Pathfix.defaultTelemetry.history[0].strippedTrailing, '\n')
  })
})
