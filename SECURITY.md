# Reporting a vulnerability

**info@loonylabs.dev**, or GitHub's private vulnerability reporting if enabled on this repository.

Please do not open a public issue for an exploitable security defect. There is no bounty and no SLA — reports will be reviewed and answered promptly.

## What is worth reporting

`dsh-pathfix` intercepts tool execution parameters directly before tool dispatch. Because it modifies input arguments, safety defects in the normalization pipeline matter:

* **Regular Expression Denial of Service (ReDoS)**: Any input that causes unbounded backtracking or stalls the event loop in `normalizePath` or `normalizePattern`.
* **Path-traversal or boundary escape**: Any normalization behavior that alters a relative or restricted path such that it circumvents a tool's intentional filesystem boundary or permission check.
* **Argument corruption**: Any defect where normalization corrupts valid tool parameters or injects unexpected properties into tool execution contexts.

## What is not a vulnerability here

* **Normal tool filesystem access**: `dsh-pathfix` only repairs whitespace and trailing newlines on parameters passed by the model; whether the tool is allowed to read or write a given file is governed by the host harness filesystem security policy (`ctx.fs`, `ctx.approval`, or container sandboxes).
* **Model hallucination or invalid tool arguments**: If the model provides a completely nonexistent file path, the tool will fail with standard filesystem errors; `dsh-pathfix` does not invent files or suppress genuine error returns.
* **Misconfigured profile layers**: An upstream profile that excludes `dsh-pathfix` or disables it via `enabled: false` is operating as configured.

## Please do not send

Live session logs containing API keys, credentials, or proprietary prompt text. Reproduce the defect using a minimal synthetic argument fixture in `test/unit.test.mjs`.
