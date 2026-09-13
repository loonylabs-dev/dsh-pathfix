/**
 * Telemetry and observability for dsh-pathfix.
 *
 * Records parameter repairs in an in-memory observable log and counter,
 * providing transparency into tool parameter corrections without altering
 * tool result text.
 *
 * @module dsh-pathfix/telemetry
 */

export class PathfixTelemetry {
  constructor() {
    this.fixCount = 0
    /** @type {Array<{ tool: string, param: string, original: string, repaired: string, strippedLeading: string, strippedTrailing: string, timestamp: number, callId?: string }>} */
    this.history = []
    this.maxHistory = 500
  }

  /**
   * Records a parameter repair.
   *
   * @param {string} tool - Name of the tool repaired.
   * @param {import('./normalizer.js').ParameterRepair} repair - Repair details.
   * @param {Object} [exec] - Execution context (e.g. callId, agent).
   * @returns {Object} The recorded repair entry.
   */
  record(tool, repair, exec = {}) {
    this.fixCount += 1

    const entry = {
      tool,
      param: repair.param,
      original: repair.original,
      repaired: repair.repaired,
      strippedLeading: repair.strippedLeading,
      strippedTrailing: repair.strippedTrailing,
      callId: exec.callId,
      timestamp: Date.now(),
    }

    this.history.push(entry)
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    return entry
  }

  /**
   * Formats a human-readable log line for the repair.
   *
   * @param {string} tool - Tool name.
   * @param {import('./normalizer.js').ParameterRepair} repair - Repair details.
   * @returns {string}
   */
  formatLogMessage(tool, repair) {
    const parts = []
    if (repair.strippedLeading) {
      parts.push(`leading ${JSON.stringify(repair.strippedLeading)}`)
    }
    if (repair.strippedTrailing) {
      parts.push(`trailing ${JSON.stringify(repair.strippedTrailing)}`)
    }
    const details = parts.length > 0 ? parts.join(' and ') : 'whitespace'
    return `[dsh-pathfix] Repaired parameter "${repair.param}" on tool "${tool}": stripped ${details} (value: ${JSON.stringify(repair.original)} -> ${JSON.stringify(repair.repaired)})`
  }

  /**
   * Resets telemetry state (useful in tests).
   */
  reset() {
    this.fixCount = 0
    this.history.length = 0
  }
}

/** Global default telemetry instance. */
export const defaultTelemetry = new PathfixTelemetry()
