/**
 * DeepSeek Harness Host-Layer Plugin: dsh-pathfix
 *
 * Intercepts tool execution before dispatch and normalizes leading/trailing
 * whitespace and newlines in path and pattern parameters.
 *
 * @module dsh-pathfix
 */

import z from '@deepseek-ai/schemastery'
import { DEFAULT_TOOLS, normalizePath, normalizePattern, normalizeToolArgs } from './normalizer.js'
import { defaultTelemetry, PathfixTelemetry } from './telemetry.js'

export { DEFAULT_TOOLS, normalizePath, normalizePattern, normalizeToolArgs } from './normalizer.js'
export { defaultTelemetry, PathfixTelemetry } from './telemetry.js'

/** Cordis plugin name. */
export const name = 'dsh-pathfix'

/** Injected services required by dsh-pathfix. */
export const inject = ['tools']

/** Plugin configuration schema validated by schemastery. */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Whether parameter normalization is enabled.'),
  tools: z.array(z.string()).default([...DEFAULT_TOOLS]).description('List of tool names to inspect and normalize.'),
  stripLeading: z.boolean().default(true).description('Whether to strip leading whitespace in path parameters.'),
  logFixes: z.boolean().default(true).description('Whether to log repairs to session/console.'),
})

/**
 * Applies the dsh-pathfix plugin to a Cordis Context.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 * @param {Object} [config={}] - Plugin configuration.
 */
export function apply(ctx, config = {}) {
  // Validate and apply default configuration using Schemastery
  const resolved = typeof Config === 'function' ? Config(config) : config

  if (resolved.enabled === false) {
    return
  }

  const telemetry = new PathfixTelemetry()
  // Expose telemetry on context for session inspection / debug tools
  ctx.provide('pathfix', {
    telemetry,
    normalizeToolArgs,
    normalizePath,
    normalizePattern,
  })

  // Hook into around-dispatch lifetime
  ctx.on('tools/execute', async (exec, next) => {
    if (resolved.enabled === false) {
      return next()
    }

    const toolName = exec.name
    const targetTools = resolved.tools ?? DEFAULT_TOOLS

    // Check if the tool is in target list or has path-like parameters
    const shouldInspect = targetTools.includes(toolName) ||
      (exec.arguments && typeof exec.arguments === 'object' &&
       ('file_path' in exec.arguments || 'path' in exec.arguments || 'pattern' in exec.arguments))

    if (!shouldInspect) {
      return next()
    }

    const { args: fixedArgs, modified, repairs } = normalizeToolArgs(toolName, exec.arguments, {
      tools: targetTools.includes(toolName) ? targetTools : [...targetTools, toolName],
      stripLeading: resolved.stripLeading ?? true,
    })

    if (modified) {
      // Mutate arguments before dispatch
      exec.arguments = fixedArgs

      for (const repair of repairs) {
        telemetry.record(toolName, repair, exec)
        defaultTelemetry.record(toolName, repair, exec)

        if (resolved.logFixes !== false) {
          const logMsg = telemetry.formatLogMessage(toolName, repair)
          if (ctx.logger?.info) {
            ctx.logger.info(logMsg)
          } else {
            console.info(logMsg)
          }
        }
      }

      if (typeof ctx.emit === 'function') {
        ctx.emit('pathfix/repair', { tool: toolName, repairs, exec })
      }
    }

    return next()
  })
}

export default {
  name,
  inject,
  Config,
  apply,
}
