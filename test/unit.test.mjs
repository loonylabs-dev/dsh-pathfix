/**
 * Unit tests for dsh-pathfix.
 *
 * Runs with Node.js built-in test runner:
 *   node --test plugins/dsh-pathfix/test/unit.test.mjs
 *
 * @module dsh-pathfix/test/unit
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TOOLS,
  normalizePath,
  normalizePattern,
  normalizeToolArgs,
} from '../lib/normalizer.js'
import { PathfixTelemetry } from '../lib/telemetry.js'
import { apply, Config } from '../lib/index.js'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'

describe('dsh-pathfix: Pure Normalizer Unit Tests', () => {
  describe('normalizePath()', () => {
    it('trims trailing newlines (single, double, triple)', () => {
      assert.deepEqual(normalizePath('C:\\images\\_shot.png\n'), {
        fixed: 'C:\\images\\_shot.png',
        strippedLeading: '',
        strippedTrailing: '\n',
        modified: true,
      })

      assert.deepEqual(normalizePath('C:\\images\\_shot.png\n\n'), {
        fixed: 'C:\\images\\_shot.png',
        strippedLeading: '',
        strippedTrailing: '\n\n',
        modified: true,
      })

      assert.deepEqual(normalizePath('C:\\images\\_shot.png\n\n\n'), {
        fixed: 'C:\\images\\_shot.png',
        strippedLeading: '',
        strippedTrailing: '\n\n\n',
        modified: true,
      })
    })

    it('trims Windows CRLF (\\r\\n)', () => {
      assert.deepEqual(normalizePath('C:\\dev\\file.ts\r\n'), {
        fixed: 'C:\\dev\\file.ts',
        strippedLeading: '',
        strippedTrailing: '\r\n',
        modified: true,
      })
    })

    it('trims leading whitespace when stripLeading is true', () => {
      assert.deepEqual(normalizePath('  \t\nC:\\images\\_shot.png'), {
        fixed: 'C:\\images\\_shot.png',
        strippedLeading: '  \t\n',
        strippedTrailing: '',
        modified: true,
      })
    })

    it('preserves leading whitespace when stripLeading is false', () => {
      assert.deepEqual(normalizePath('  C:\\images\\_shot.png\n', false), {
        fixed: '  C:\\images\\_shot.png',
        strippedLeading: '',
        strippedTrailing: '\n',
        modified: true,
      })
    })

    it('returns modified: false for clean paths (no-op guarantee)', () => {
      const clean = 'C:\\dev\\src\\index.ts'
      const res = normalizePath(clean)
      assert.equal(res.fixed, clean)
      assert.equal(res.modified, false)
      assert.equal(res.strippedLeading, '')
      assert.equal(res.strippedTrailing, '')
    })

    it('handles empty-after-trim without crashing', () => {
      const res = normalizePath('   \n\n\t  ')
      assert.equal(res.fixed, '')
      assert.equal(res.modified, true)
    })
  })

  describe('normalizePattern()', () => {
    it('strips trailing \\n from pattern', () => {
      assert.deepEqual(normalizePattern('function\\s+myFunc\n'), {
        fixed: 'function\\s+myFunc',
        strippedLeading: '',
        strippedTrailing: '\n',
        modified: true,
      })
    })

    it('strips trailing \\r\\n from pattern', () => {
      assert.deepEqual(normalizePattern('myPattern\r\n'), {
        fixed: 'myPattern',
        strippedLeading: '',
        strippedTrailing: '\r\n',
        modified: true,
      })
    })

    it('PRESERVES leading and trailing spaces/tabs in regex patterns', () => {
      // Regexes often have significant spaces, e.g. "  const x = "
      const patternWithSpaces = '   const x = 1   \n'
      const res = normalizePattern(patternWithSpaces)
      assert.equal(res.fixed, '   const x = 1   ')
      assert.equal(res.strippedLeading, '')
      assert.equal(res.strippedTrailing, '\n')
      assert.equal(res.modified, true)
    })

    it('strips leading \\n or \\r from pattern when stripLeading is true', () => {
      assert.deepEqual(normalizePattern('\n\nexport const'), {
        fixed: 'export const',
        strippedLeading: '\n\n',
        strippedTrailing: '',
        modified: true,
      })
    })

    it('returns modified: false for clean patterns', () => {
      const clean = 'const foo = "bar"'
      const res = normalizePattern(clean)
      assert.equal(res.fixed, clean)
      assert.equal(res.modified, false)
    })
  })

  describe('normalizeToolArgs(): Five Error-Signature Fixtures', () => {
    it('Fixture 1 (write): fixes EINVAL tmpdir failure caused by trailing \\n in file_path', () => {
      const args = {
        file_path: 'C:\\Development\\project\\src\\output.txt\n',
        content: 'hello world',
      }
      const res = normalizeToolArgs('write', args)
      assert.equal(res.modified, true)
      assert.equal(res.args.file_path, 'C:\\Development\\project\\src\\output.txt')
      assert.equal(res.args.content, 'hello world')
      assert.equal(res.repairs.length, 1)
      assert.equal(res.repairs[0].param, 'file_path')
      assert.equal(res.repairs[0].strippedTrailing, '\n')
    })

    it('Fixture 2 (glob): fixes os error 123 IO failure caused by trailing \\n in path', () => {
      const args = {
        pattern: '**/*.ts',
        path: 'C:\\Development\\project\n',
      }
      const res = normalizeToolArgs('glob', args)
      assert.equal(res.modified, true)
      assert.equal(res.args.path, 'C:\\Development\\project')
      assert.equal(res.args.pattern, '**/*.ts')
      assert.equal(res.repairs.length, 1)
      assert.equal(res.repairs[0].param, 'path')
      assert.equal(res.repairs[0].strippedTrailing, '\n')
    })

    it('Fixture 3 (grep): fixes "rg: the literal \\n is not allowed in a regex" caused by trailing \\n in pattern', () => {
      const args = {
        pattern: 'findMe\n',
        path: 'C:\\Development\\project',
      }
      const res = normalizeToolArgs('grep', args)
      assert.equal(res.modified, true)
      assert.equal(res.args.pattern, 'findMe')
      assert.equal(res.args.path, 'C:\\Development\\project')
      assert.equal(res.repairs.length, 1)
      assert.equal(res.repairs[0].param, 'pattern')
      assert.equal(res.repairs[0].strippedTrailing, '\n')
    })

    it('Fixture 4 (read_image): fixes misleading "read_image only accepts PNG/JPEG/WebP/GIF paths" error', () => {
      const args = {
        file_path: 'C:\\Development\\project\\assets\\_shot.png\n',
      }
      const res = normalizeToolArgs('read_image', args)
      assert.equal(res.modified, true)
      assert.equal(res.args.file_path, 'C:\\Development\\project\\assets\\_shot.png')
      assert.equal(res.repairs.length, 1)
      assert.equal(res.repairs[0].param, 'file_path')
      assert.equal(res.repairs[0].strippedTrailing, '\n')
    })

    it('Fixture 5 (read): fixes misleading "not found" error on valid existing files', () => {
      const args = {
        file_path: 'C:\\Development\\project\\src\\index.ts\n\n',
        offset: 1,
        limit: 100,
      }
      const res = normalizeToolArgs('read', args)
      assert.equal(res.modified, true)
      assert.equal(res.args.file_path, 'C:\\Development\\project\\src\\index.ts')
      assert.equal(res.args.offset, 1)
      assert.equal(res.args.limit, 100)
      assert.equal(res.repairs.length, 1)
      assert.equal(res.repairs[0].param, 'file_path')
      assert.equal(res.repairs[0].strippedTrailing, '\n\n')
    })
  })

  describe('Guarantees: No-Op & Idempotency', () => {
    it('No-Op Guarantee: clean arguments return identical object reference (zero change)', () => {
      const cleanArgs = Object.freeze({
        file_path: 'C:\\clean\\path\\file.ts',
        offset: 10,
      })
      const res = normalizeToolArgs('read', cleanArgs)
      assert.equal(res.modified, false)
      assert.equal(res.repairs.length, 0)
      assert.strictEqual(res.args, cleanArgs, 'Original args reference must be preserved on no-op')
    })

    it('Idempotency Guarantee: fix(fix(x)) === fix(x)', () => {
      const dirtyArgs = {
        file_path: '  C:\\dirty\\path\\image.png\n\n  ',
        pattern: '\r\nsearch_token\n',
      }
      const pass1 = normalizeToolArgs('grep', dirtyArgs)
      assert.equal(pass1.modified, true)

      const pass2 = normalizeToolArgs('grep', pass1.args)
      assert.equal(pass2.modified, false)
      assert.deepEqual(pass2.args, pass1.args)
      assert.strictEqual(pass2.args, pass1.args)
    })

    it('Ignores tools not listed in configuration', () => {
      const args = { file_path: 'some/path\n' }
      const res = normalizeToolArgs('unrelated_tool', args, { tools: ['read', 'write'] })
      assert.equal(res.modified, false)
      assert.strictEqual(res.args, args)
    })
  })

  describe('Telemetry Tracking', () => {
    let telemetry

    beforeEach(() => {
      telemetry = new PathfixTelemetry()
    })

    it('increments fixCount and appends to history on repair', () => {
      assert.equal(telemetry.fixCount, 0)
      assert.equal(telemetry.history.length, 0)

      telemetry.record('read_image', {
        param: 'file_path',
        original: 'img.png\n',
        repaired: 'img.png',
        strippedLeading: '',
        strippedTrailing: '\n',
      }, { callId: 'call_123' })

      assert.equal(telemetry.fixCount, 1)
      assert.equal(telemetry.history.length, 1)
      assert.equal(telemetry.history[0].tool, 'read_image')
      assert.equal(telemetry.history[0].param, 'file_path')
      assert.equal(telemetry.history[0].callId, 'call_123')
      assert.equal(telemetry.history[0].strippedTrailing, '\n')
    })

    it('formats informative human-readable log messages', () => {
      const msg = telemetry.formatLogMessage('write', {
        param: 'file_path',
        original: ' C:\\file.txt\n',
        repaired: 'C:\\file.txt',
        strippedLeading: ' ',
        strippedTrailing: '\n',
      })
      assert.match(msg, /\[dsh-pathfix\] Repaired parameter "file_path" on tool "write"/)
      assert.match(msg, /leading " "/)
      assert.match(msg, /trailing "\\n"/)
    })
  })
})

describe('dsh-pathfix: Cordis Integration Pipeline Tests', () => {
  async function createHarnessContext() {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    return ctx
  }

  it('mounts into Cordis and normalizes arguments in live tools/execute waterfall', async () => {
    const ctx = await createHarnessContext()

    // Mount dsh-pathfix
    apply(ctx, { enabled: true, logFixes: false })

    let toolExecutedWith = null
    ctx.tools.register(defineTool({
      name: 'read_image',
      description: 'Mock read_image tool',
      parameters: {
        file_path: { type: 'string', required: true },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args) {
        toolExecutedWith = args
        // Emulate the read_image extension check
        if (args.file_path.endsWith('\n')) {
          throw new Error('read_image only accepts PNG/JPEG/WebP/GIF paths')
        }
        return 'image_data_mock'
      },
    }))

    // Execute with trailing newline — pathfix should repair it transparently
    const result = await ctx.tools.execute({
      callId: 'test-call-1',
      name: 'read_image',
      arguments: { file_path: 'C:\\Users\\marti\\shot.png\n' },
      signal: new AbortController().signal,
    })

    assert.equal(result.isError, false)
    assert.equal(toolExecutedWith.file_path, 'C:\\Users\\marti\\shot.png')
    assert.equal(result.value, 'image_data_mock')
  })

  it('respects enabled: false in config and does not alter arguments', async () => {
    const ctx = await createHarnessContext()

    apply(ctx, { enabled: false })

    let toolExecutedWith = null
    ctx.tools.register(defineTool({
      name: 'read',
      description: 'Mock read tool',
      parameters: {
        file_path: { type: 'string', required: true },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args) {
        toolExecutedWith = args
        return 'done'
      },
    }))

    await ctx.tools.execute({
      callId: 'test-call-disabled',
      name: 'read',
      arguments: { file_path: 'file.txt\n' },
      signal: new AbortController().signal,
    })

    assert.equal(toolExecutedWith.file_path, 'file.txt\n', 'Disabled plugin should not touch arguments')
  })

  it('surfaces tool errors when input is empty after trimming without crashing plugin', async () => {
    const ctx = await createHarnessContext()

    apply(ctx, { enabled: true, logFixes: false })

    ctx.tools.register(defineTool({
      name: 'read',
      description: 'Mock read tool with validation',
      parameters: {
        file_path: { type: 'string', required: true },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args) {
        if (args.file_path.length === 0) {
          throw new Error('file_path must be a non-empty string')
        }
        return 'ok'
      },
    }))

    const result = await ctx.tools.execute({
      callId: 'test-empty-trim',
      name: 'read',
      arguments: { file_path: '   \n\n  ' },
      signal: new AbortController().signal,
    })

    assert.equal(result.isError, true)
    assert.match(result.error.message, /file_path must be a non-empty string/)
  })
})
