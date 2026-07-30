# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

**Exception:** when the true cause of a bug lies outside the file you're editing, §5 takes precedence over this section. Scope follows the root cause, not the symptom.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Root Cause Over Symptom

**Prefer the permanent fix. A patch that hides a problem is not a fix.**

- Find *why* it breaks, not just *where* it surfaces. Fix the origin.
- If only a mitigation is possible right now, say so explicitly: name the root cause and what the real fix would be. Never present a workaround as though it were a fix.
- A permanent fix touching three files beats a one-line patch that leaves the cause in place. The extra scope must be what the root cause actually requires — §2 still forbids speculative work.

Symptom vs. cause, concretely:

| Symptom patch | Root-cause fix |
|---|---|
| Guard against a null | Find what produces the null |
| Raise a timeout | Find what got slow |
| Wrap a failing call in try/except | Find why it throws |
| Dedupe in the consumer | Fix the producer emitting duplicates |
| Cast/coerce a wrong type | Fix where the wrong type originates |

**If the root cause needs a decision only the user can make** — a schema change, a breaking API change, a data-model or product call — stop and ask. Do not quietly ship the patch instead.

## 6. Working Agreement

**One problem at a time. Ask rather than guess.**

- Work the single problem given. Don't fold in unrelated fixes — flag them and move on.
- If you don't know, say you don't know. A confidently wrong answer costs far more than a question.
- Verify before claiming. "Should work" is not verification: run it, or state plainly that you didn't.

When presenting options, always give all three:

1. **Advantages** — what it buys.
2. **Downsides** — the real cost, including what it forecloses later.
3. **Recommendation** — pick one and say why. Don't lay out a menu and abstain.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, root causes get fixed instead of papered over, and clarifying questions come before implementation rather than after mistakes.
