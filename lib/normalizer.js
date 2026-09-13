/**
 * Pure parameter normalization functions for dsh-pathfix.
 *
 * Repairs leading and trailing whitespace in path parameters, and strips
 * leading/trailing carriage returns and newlines in pattern parameters while
 * preserving edge whitespace (spaces/tabs) that may be semantically significant
 * in regular expressions.
 *
 * @module dsh-pathfix/normalizer
 */

/** Default tool names normalized by dsh-pathfix. */
export const DEFAULT_TOOLS = Object.freeze([
  'read',
  'read_image',
  'write',
  'edit',
  'glob',
  'grep',
])

/**
 * Normalizes a path parameter (file_path, path) by trimming whitespace.
 *
 * @param {string} value - Raw path argument.
 * @param {boolean} [stripLeading=true] - Whether to strip leading whitespace.
 * @returns {{ fixed: string, strippedLeading: string, strippedTrailing: string, modified: boolean }}
 */
export function normalizePath(value, stripLeading = true) {
  if (typeof value !== 'string') {
    return { fixed: value, strippedLeading: '', strippedTrailing: '', modified: false }
  }

  // Calculate leading whitespace to strip
  let leadingStripped = ''
  let afterLeading = value
  if (stripLeading) {
    const trimmedStart = value.trimStart()
    if (trimmedStart.length < value.length) {
      leadingStripped = value.slice(0, value.length - trimmedStart.length)
      afterLeading = trimmedStart
    }
  }

  // Calculate trailing whitespace to strip
  const trimmedEnd = afterLeading.trimEnd()
  let trailingStripped = ''
  if (trimmedEnd.length < afterLeading.length) {
    trailingStripped = afterLeading.slice(trimmedEnd.length)
  }

  const fixed = trimmedEnd
  const modified = fixed !== value

  return {
    fixed,
    strippedLeading: leadingStripped,
    strippedTrailing: trailingStripped,
    modified,
  }
}

/**
 * Normalizes a pattern parameter (grep, glob) by stripping \r and \n only.
 * Spaces and tabs at edges are intentionally preserved since regex patterns
 * may depend on leading or trailing spaces.
 *
 * @param {string} value - Raw pattern argument.
 * @param {boolean} [stripLeading=true] - Whether to strip leading \r and \n.
 * @returns {{ fixed: string, strippedLeading: string, strippedTrailing: string, modified: boolean }}
 */
export function normalizePattern(value, stripLeading = true) {
  if (typeof value !== 'string') {
    return { fixed: value, strippedLeading: '', strippedTrailing: '', modified: false }
  }

  let leadingStripped = ''
  let working = value
  if (stripLeading) {
    const match = working.match(/^[\r\n]+/)
    if (match) {
      leadingStripped = match[0]
      working = working.slice(leadingStripped.length)
    }
  }

  let trailingStripped = ''
  const trailingMatch = working.match(/[\r\n]+$/)
  if (trailingMatch) {
    trailingStripped = trailingMatch[0]
    working = working.slice(0, working.length - trailingStripped.length)
  }

  const fixed = working
  const modified = fixed !== value

  return {
    fixed,
    strippedLeading: leadingStripped,
    strippedTrailing: trailingStripped,
    modified,
  }
}

/**
 * Details of a single parameter repair.
 * @typedef {Object} ParameterRepair
 * @property {string} param - Name of repaired parameter (e.g. 'file_path').
 * @property {string} original - Original parameter value.
 * @property {string} repaired - Repaired parameter value.
 * @property {string} strippedLeading - String of stripped leading characters.
 * @property {string} strippedTrailing - String of stripped trailing characters.
 */

/**
 * Normalizes tool arguments according to configuration.
 *
 * Guarantees:
 * 1. No-op guarantee: clean arguments return identical object reference and modified: false.
 * 2. Idempotency: normalizeToolArgs(name, normalizeToolArgs(name, args).args) === normalizeToolArgs(name, args).
 *
 * @param {string} toolName - The tool name being invoked.
 * @param {Record<string, unknown>} args - The invocation arguments object.
 * @param {Object} [options={}] - Configuration options.
 * @param {string[]} [options.tools=DEFAULT_TOOLS] - List of tool names to inspect.
 * @param {boolean} [options.stripLeading=true] - Whether to strip leading whitespace.
 * @returns {{ args: Record<string, unknown>, modified: boolean, repairs: ParameterRepair[] }}
 */
export function normalizeToolArgs(toolName, args, options = {}) {
  const tools = options.tools ?? DEFAULT_TOOLS
  const stripLeading = options.stripLeading ?? true

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { args, modified: false, repairs: [] }
  }

  // Only normalize if toolName is in the target list
  if (!tools.includes(toolName)) {
    return { args, modified: false, repairs: [] }
  }

  let hasModification = false
  const repairs = []
  const cloned = { ...args }

  for (const [key, val] of Object.entries(args)) {
    if (typeof val !== 'string') continue

    // Path parameters: file_path, path
    if (key === 'file_path' || key === 'path') {
      const res = normalizePath(val, stripLeading)
      if (res.modified) {
        cloned[key] = res.fixed
        hasModification = true
        repairs.push({
          param: key,
          original: val,
          repaired: res.fixed,
          strippedLeading: res.strippedLeading,
          strippedTrailing: res.strippedTrailing,
        })
      }
    }
    // Pattern parameter (glob, grep)
    else if (key === 'pattern') {
      const res = normalizePattern(val, stripLeading)
      if (res.modified) {
        cloned[key] = res.fixed
        hasModification = true
        repairs.push({
          param: key,
          original: val,
          repaired: res.fixed,
          strippedLeading: res.strippedLeading,
          strippedTrailing: res.strippedTrailing,
        })
      }
    }
  }

  if (!hasModification) {
    return { args, modified: false, repairs: [] }
  }

  return {
    args: cloned,
    modified: true,
    repairs,
  }
}
