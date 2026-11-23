---
name: improve-kernel
description: Find what the auril.js kernel should change next, from evidence. Scans every app that vendors auril for repeated patterns and workarounds, checks the latest web platform changes, and ranks kernel improvements under the two-app rule, each reproduced by a failing test. Use when asked to "improve the kernel", "what should auril change", "scan the apps", "what do my apps work around", "is auril still current", "new web platform features for auril", "kernel review", or before planning a kernel release. Not for one app's bug (fix it in that app) or for a design review of a diff (that is software-design).
---

# Improve the kernel

The kernel changes only when apps prove the need. FRAMEWORK.md's guardrail is the contract: the two-app rule, the 600-line budget, near-frozen.
This skill turns "what should change" into evidence from the apps and the platform, then a short ranked list.

A finding is one of three kinds, and the kind decides whether it may enter the kernel:

- **Bug**: the kernel does the wrong thing. Fix it even with one app affected. It needs a failing test.
- **Workaround**: two or more apps write the same code around a kernel gap. It passes the two-app rule.
- **Dead weight**: kernel code that no app uses as intended. Delete it. This is the cheapest way to make room under the budget.

## 1. Scan the apps

Run `scripts/scan-apps.sh` (defaults to `~/Development/projects`). It prints one line per app that vendors auril: the vendored version and counts of kernel API use and of known workaround signatures.

Read the counts as pointers, not findings:

- A count above zero in two or more apps means you should open those files and read them.
- An app on an old vendored version gets no recent fixes. List it.
- Zero use of a kernel feature across all apps is a dead-weight candidate.
- An option that apps mostly turn off has the wrong default, or should not exist.

Then read the code behind each count. The same count can hide two different patterns. For example, `update-override` matched two things: overrides that replace `update()` to protect nested components (a kernel bug), and overrides that call `super.update()` and then do work after the render (a working idiom). Only reading the code tells them apart.

Look beyond the script for:

- An app that copies a kernel guard or check. It drifts when the kernel changes.
- An app that copies kernel internals, such as the render memo, because it had to replace a kernel method.
- Hand-rolled code that appears in several apps (transport, persistence, focus handling).

When you find a new signature worth tracking, add a row to the script's `PATTERNS`.

## 2. Reproduce before you claim

Prove every bug candidate with a test against the kernel, in a scratch copy:

```sh
rm -rf /tmp/auril-x && cp -r <kernel repo> /tmp/auril-x && cd /tmp/auril-x
# write test/x.test.js, then:
bun test test/x.test.js
```

A test that fails for the reason you stated is the evidence. A test that passes means you were wrong. Drop the finding.

For test strength on a file you plan to change, hand-mutate its branches the same way. A mutant that survives is a missing test.

## 3. Research the platform

Search for changes since the kernel's last Versions entry in FRAMEWORK.md. Focus on what the kernel wraps or relies on:

- Navigation API, URLPattern, View Transitions (document- and element-scoped)
- DOM morphing inputs: `moveBefore`, `setHTML` / Sanitizer, streaming HTML insertion
- Custom elements, `reportError`, AbortSignal
- TC39 Signals (the Store's swap constraint) and anything else FRAMEWORK.md names
- New platform features that would let the kernel delete code

Check the status at the source: MDN compatibility data, caniuse, web-features, the official TC39 proposals repo (`gh api repos/tc39/proposals/...`). Search summaries often disagree with each other. If public pages block you, use `search.home.kuehns.club`.

Classify each platform change:

- **Baseline** (all major engines): it may replace kernel code now.
- **One or two engines**: note a revisit trigger. Do not build on it.
- **Contradicts a claim in FRAMEWORK.md**: a doc fact to correct.

## 4. Rank and report

Rank findings: bugs first, then dead weight, then workarounds, then doc facts. For each one, give:

- the evidence: the app files with line numbers, the scan counts, and the failing test output
- the smallest kernel change, with its line cost against the budget
- what each app does after re-vendoring (drop a workaround, drop an option)

Add the research sources as links. End with a **Bold idea** line and an **Alternative** line.

Unless asked, change nothing in the kernel or the apps. When asked to implement, follow FRAMEWORK.md: one change per commit, a test that failed first, FRAMEWORK.md and its Versions entry in the same commit, and `bun test && bunx tsc -p jsconfig.json` green. Never edit the apps; they upgrade by re-vendoring on purpose.
