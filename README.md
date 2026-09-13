<div align="center">

# 🧹 dsh-pathfix

*Host-layer DeepSeek Harness (DSH) plugin that automatically detects and repairs whitespace and trailing newlines in tool path and pattern parameters before dispatch.*

<!-- Horizontal Badge Navigation Bar -->
[![npm version](https://img.shields.io/npm/v/dsh-pathfix.svg?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-pathfix)
[![CI](https://github.com/loonylabs-dev/dsh-pathfix/actions/workflows/tests.yml/badge.svg?branch=master&style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/loonylabs-dev/dsh-pathfix/actions)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge&logo=opensource&logoColor=white)](#license)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/loonylabs-dev/dsh-pathfix)

</div>

<!-- Table of Contents -->
<details>
<summary>📋 <strong>Table of Contents</strong></summary>

- [What It Fixes](#what-it-fixes)
- [Guarantees](#guarantees)
- [Installation](#installation)
- [Configuration](#configuration)
- [Observability & Telemetry](#observability--telemetry)
- [Verification & Testing](#verification--testing)
- [Contributing](#-contributing)
- [Links](#-links)
- [License](#license)

</details>

---

## What It Fixes

Due to model tokenization and sampling variance, LLMs occasionally emit tool parameters with unexpected trailing newlines or edge whitespace (e.g. `"file_path": "C:\\images\\_shot.png\n"`). Because standard filesystem tools take parameters verbatim, this causes recurring, misleading tool failures:

| Tool | Error when a trailing `\n` is in the parameter | What `dsh-pathfix` does |
|---|---|---|
| `write` | `EINVAL: invalid argument, mkdir '...<filename>\n.<id>.tmpdir'` | Trims whitespace; directory and file creation succeed. |
| `glob` | IO error / `The filename, directory name, or volume label syntax is incorrect (os error 123)` | Trims path whitespace; search succeeds. |
| `grep` | `rg: the literal "\n" is not allowed in a regex` | Strips `\r`/`\n` while preserving regex edge spaces. |
| `read_image` | Misleading `read_image only accepts PNG/JPEG/WebP/GIF paths` | Trims path; image extension check passes. |
| `read` | Misleading `not found` (file exists) | Trims path; file resolves and reads normally. |

`dsh-pathfix` operates transparently at the host layer before tool dispatch. The model does not need to learn any replacement tool, and tool result prose is never modified.

## Guarantees

- **No-Op Guarantee**: Clean arguments pass through completely untouched (`fix(clean) === clean`). If no repair is required, the original argument object reference is returned and no telemetry is emitted.
- **Idempotency Guarantee**: `fix(fix(x)) === fix(x)`. Applying normalization multiple times yields the exact same state.
- **Preserves Regex Edge Spaces**: In `pattern` arguments (for `grep` and `glob`), only `\r` and `\n` characters are stripped. Spaces and tabs at pattern boundaries are preserved because they can be semantically significant in regular expressions.
- **Zero Runtime Dependencies**: Relies solely on host peer dependencies (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`).

## Installation

Install into your target DSH profile (e.g. `web`):

```bash
dsh plugin --profile web add file:/absolute/path/to/plugins/dsh-pathfix
```

Verify that the bundle is mounted in your profile:

```bash
dsh web --dump-config | Select-String -Pattern "pathfix" -Context 1,2
```

Expected output includes the patch layer:
```yaml
# == dsh-pathfix
- id: pathfix
  name: dsh-pathfix
```

## Configuration

`dsh-pathfix` is configurable via your profile's `cordis.patch.yml` or cordis configuration:

```yaml
- id: pathfix
  name: dsh-pathfix
  config:
    enabled: true           # Enable or disable parameter normalization (default: true)
    tools:                  # List of tool names to inspect (default: fs tools)
      - read
      - read_image
      - write
      - edit
      - glob
      - grep
    stripLeading: true      # Strip leading whitespace in paths (default: true)
    logFixes: true          # Log repairs to session/console (default: true)
```

## Observability & Telemetry

When a parameter is repaired, `dsh-pathfix` records the event in an internal telemetry tracker and emits an informational log message (if `logFixes: true`):

```
[dsh-pathfix] Repaired parameter "file_path" on tool "read_image": stripped trailing "\n" (value: "C:\\images\\_shot.png\n" -> "C:\\images\\_shot.png")
```

The repair event is also emitted as `pathfix/repair` on the Cordis context and tracked in `ctx.pathfix.telemetry`.

## Verification & Testing

### Verification (Check if Plugin is Mounted in Profile)

**In Windows CMD (Command Prompt):**
```cmd
dsh web --dump-config | findstr /i "pathfix"
```

**In PowerShell:**
```powershell
dsh web --dump-config | Select-String -Pattern "pathfix" -Context 1,2
```

Expected output:
```yaml
# == dsh-pathfix
- id: pathfix
  name: dsh-pathfix
```

### Acceptance Mount Check

Verify that the profile dependencies, bundle patch, and live Cordis normalization hook are fully active:

```bash
node acceptance/mount_check.mjs C:\Users\marti\.dsh\profiles\web
```
Or via npm:
```bash
npm run mount-check C:\Users\marti\.dsh\profiles\web
```

### Automated Test Suite

Run unit and E2E tests using Node.js built-in test runner:

```bash
# Run all tests (unit + E2E)
npm test

# Run unit tests covering the 5 real-world error fixtures
npm run test:unit

# Run E2E test with real @deepseek-ai/dsh-tool-fs suite
npm run test:e2e
```
Or directly with Node:
```bash
node --test test/unit.test.mjs test/e2e.test.mjs
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on code invariants, test fixtures, and commit standards.

## 🔗 Links

- [📚 DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [🐛 Issues](https://github.com/loonylabs-dev/dsh-pathfix/issues)
- [📦 NPM Package](https://www.npmjs.com/package/dsh-pathfix)

## License

MIT © [loonylabs-dev](https://github.com/loonylabs-dev)

---

<div align="center">

**Maintained by [loonylabs-dev](https://github.com/loonylabs-dev)**

</div>
