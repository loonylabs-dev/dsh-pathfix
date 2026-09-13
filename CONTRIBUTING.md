# Contributing

This repository provides an automated host-layer repair for an empirical failure
class in DeepSeek Harness: language models occasionally emit path-like tool
arguments with trailing newlines (`\n`, `\r\n`) or edge whitespace, causing
cryptic tool failures in standard filesystem tools.

Every test fixture and behavior in this repository corresponds to a real,
observed tool failure signature.

## What the code here is like

Four hard rules govern changes to this repository:

**1. The No-Op Guarantee is absolute.** Clean parameters must pass through
completely untouched (`fix(clean) === clean`), returning the identical object
reference (`modified: false`). An unneeded clone wastes allocations on every tool
invocation and breaks identity checks in downstream listeners.

**2. Strict Idempotency.** `fix(fix(x)) === fix(x)`. Normalization applied
repeatedly must never alter already-normalized parameters.

**3. Pattern boundaries are semantic.** In `pattern` arguments (used by `grep`
and `glob`), leading and trailing spaces or tabs are valid regex tokens. Strip
only `\r` and `\n`; never strip spaces or tabs from patterns.

**4. Never tamper with tool results.** The plugin normalizes inputs before
execution; it must never annotate, amend, or falsify the tool's returned
result block. Observability belongs in telemetry and host log lines.

## Before you open a pull request

Run the automated test suite and acceptance mount verification:

```bash
npm test                  # 25 tests, ~120 ms
npm run mount-check       # verifies plugin mounting against a DSH profile
```

If you add support for a new tool parameter or handle a new whitespace edge
case, add an explicit regression test fixture in `test/unit.test.mjs` naming the
exact error signature it prevents.

## What does not belong in this repository

- **Captured session transcripts with credentials or private prompts.** If you
  encounter a new failure signature, isolate the tool name, parameter name,
  and exact whitespace payload in a synthetic test case.
- **Runtime dependencies.** This plugin must remain zero-runtime-dependency,
  relying solely on peer dependencies provided by the DSH host runtime.
- **Uncontrolled tool parameter rewriting.** We do not guess or rewrite path
  targets beyond trimming extraneous whitespace and newlines.

## Language and Commit Style

- Everything in this repository is English (code, tests, documentation, commit messages).
- Use thematic commits with an em-dash:
  `<type>: <claim> — <context>`
  (e.g. `test: add fixture for edit tool path whitespace — prevents ENOENT`).
