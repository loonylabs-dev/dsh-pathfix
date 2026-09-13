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
    // 1. Without pathfix
    const rawCtx = new Context()
    await rawCtx.plugin(SystemPrompt)
    await rawCtx.plugin(ToolRuntime)

    // Provide mock fs and attachments for read_image
    rawCtx.provide('fs', {
      stat: async () => ({ type: 'file', size: 100 }),
      readBytes: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      resolvePath: (_base, path) => ({ displayPath: path, resolvedPath: path }),
    })
    rawCtx.provide('attachments', {
      imageLimits: {
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        maxImageBytes: 10 * 1024 * 1024,
        maxMessageImageBytes: 20 * 1024 * 1024,
      },
      saveImage: async () => ({
        attachmentId: 'att_123',
        mediaType: 'image/png',
        bytes: 8,
        width: 1,
        height: 1,
      }),
    })

    await rawCtx.plugin(ToolFs, {})

    // Call read_image with trailing newline WITHOUT pathfix
    const failedResult = await rawCtx.tools.execute({
      callId: 'raw-call-1',
      name: 'read_image',
      arguments: { file_path: 'C:\\test\\shot.png\n' },
      signal: new AbortController().signal,
    })

    assert.equal(failedResult.isError, true)
    assert.match(
      failedResult.error.message,
      /read_image only accepts PNG\/JPEG\/WebP\/GIF paths/,
      'Without pathfix, trailing newline must trigger the misleading format refusal'
    )

    // 2. With dsh-pathfix mounted
    const fixedCtx = new Context()
    await fixedCtx.plugin(SystemPrompt)
    await fixedCtx.plugin(ToolRuntime)

    fixedCtx.provide('llm', {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
    })
    fixedCtx.provide('fs', {
      resolve: async (path) => ({ displayPath: path, resolvedPath: path }),
      stat: async () => ({ type: 'file', size: 100 }),
      readBytes: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })
    fixedCtx.provide('attachments', {
      imageLimits: {
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        maxImageBytes: 10 * 1024 * 1024,
        maxMessageImageBytes: 20 * 1024 * 1024,
      },
      saveImage: async () => ({
        attachmentId: 'att_123',
        mediaType: 'image/png',
        bytes: 8,
        width: 1,
        height: 1,
      }),
    })

    await fixedCtx.plugin(Pathfix.default, { enabled: true, logFixes: false })
    await fixedCtx.plugin(ToolFs, {})

    // Reset telemetry
    Pathfix.defaultTelemetry.reset()

    const mockAgent = {
      session: {
        header: { cwd: 'C:\\test' },
        requestHeader: () => ({ config: { provider: 'mock', model: 'vision-model' } }),
      },
      options: { provider: 'mock', model: 'vision-model' },
    }

    // Call read_image with trailing newline WITH pathfix
    const successResult = await fixedCtx.tools.execute({
      callId: 'fixed-call-1',
      name: 'read_image',
      arguments: { file_path: 'C:\\test\\shot.png\n' },
      agent: mockAgent,
      signal: new AbortController().signal,
    })

    // Now it must succeed!
    assert.equal(successResult.isError, false, `Expected success but got: ${successResult.error?.message}`)
    assert.equal(successResult.value.path, 'C:\\test\\shot.png')

    // Telemetry must record the repair
    assert.equal(Pathfix.defaultTelemetry.fixCount, 1)
    assert.equal(Pathfix.defaultTelemetry.history[0].tool, 'read_image')
    assert.equal(Pathfix.defaultTelemetry.history[0].param, 'file_path')
    assert.equal(Pathfix.defaultTelemetry.history[0].strippedTrailing, '\n')
  })
})
