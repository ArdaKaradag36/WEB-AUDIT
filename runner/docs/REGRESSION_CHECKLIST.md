# Regression checklist: visibility and scroll sampling

Use this checklist to verify that the auto UI audit changes behave as intended, especially on long or complex pages (e.g. nvi.gov.tr).

## Prerequisites

- Run the audit:  
  `npm run audit -- --url https://www.nvi.gov.tr/ --out reports/runs/yerel-<id>`
- Open the run’s `summary.json` and `ui-inventory.json` (or equivalent) for the run.

## Acceptance criteria

### 1. Visibility classification

- [ ] **NOT_VISIBLE** count is **lower** than in runs before the change (fewer elements incorrectly treated as “visible” then timed out).
- [ ] **OUT_OF_VIEWPORT_SCROLL_REQUIRED** count is **higher** on long pages (elements below the fold are classified as out-of-viewport instead of NOT_VISIBLE where they have a valid box).
- [ ] **TIMEOUT** count is **lower**; timeouts should only occur when the element was expected visible but did not become ready in time, not when the locator targeted a hidden node.

### 2. Coverage

- [ ] **TESTED_SUCCESS** and/or **attempted** count (elements with at least one attempt) **increase** compared to runs without scroll sampling, due to scroll sampling bringing more elements into view.
- [ ] **summary.byStatus** and **summary.byReasonCode** (and **topReasonCodes**) are present and consistent with the inventory.

### 3. Reason codes and evidence

- [ ] **No element** in the inventory has `tested === false` (or equivalent) with **missing** `reasonCode`.
- [ ] For elements with reasonCode **NOT_VISIBLE**, **OUT_OF_VIEWPORT_SCROLL_REQUIRED**, or **TIMEOUT**, **evidence** is present where applicable (e.g. box, viewport, displayNone, visibilityHidden, opacityZero, outOfViewport).
- [ ] Elements that get a fallback reasonCode (e.g. **UNKNOWN**) have **evidence.phase = "final-pass"**.

### 4. Generic selectors

- [ ] **NO_MEANINGFUL_CHANGE** from generic tag-only selectors (e.g. `css:button`, `css:a`) is **reduced**; such selectors are marked **SELECTOR_UNSTABLE** and skipped or deprioritized so that misclicks do not inflate NO_MEANINGFUL_CHANGE.

### 5. Determinism

- [ ] **Repeated runs** on the same URL (e.g. two runs on `https://www.nvi.gov.tr/`) produce **similar distributions** of byStatus and byReasonCode (no large, unexplained swings).

## Quick commands

```bash
# Run 1
npm run audit -- --url https://www.nvi.gov.tr/ --out reports/runs/yerel-1

# Run 2 (determinism check)
npm run audit -- --url https://www.nvi.gov.tr/ --out reports/runs/yerel-2

# Compare summary.json byStatus / byReasonCode between yerel-1 and yerel-2
```

## Optional: disable scroll sampling

To confirm that scroll sampling is responsible for the improvement, run with scroll steps set to 0 (if your config exposes it). You should see fewer attempted elements and lower TESTED_SUCCESS than with the default scroll steps.

---

## Overlay and A11Y (latest changes)

### 6. Overlay / INTERACTION_INTERCEPTED

- [ ] When a click is intercepted (e.g. cookie banner), **dismissOverlaysSafely** runs at most once per click; retry trial click once.
- [ ] If still intercepted, outcome is **INTERACTION_INTERCEPTED** with **evidence.overlayCandidatesCount** (number of overlay candidates detected).
- [ ] Overlay dismiss only clicks allowlisted button text (Accept, Kabul, Tamam, etc.); no destructive actions.

### 7. A11Y heuristic: WARN by default

- [ ] Without `--strict`, **UI.HEURISTICS.A11Y_NAMES** does **not** fail the run (status remains PASS); missing-name issues are reported in meta with **a11yWarn: true**.
- [ ] With `--strict`, A11Y heuristic can **FAIL** when missing-name count >= 10 (same as before).

### 8. Summary and unknowns

- [ ] **summary.uiCoverage.unknownReasonCount** is present and counts elements with reasonCode **UNKNOWN** (final-pass guardrail).
- [ ] No element is left without **reasonCode**; every SKIPPED/FAILED has **actionHint**, **confidence**, and **evidence** where applicable.

---

## OUT_OF_VIEWPORT + scroll metrics + budget (latest)

### 9. OUT_OF_VIEWPORT detection

- [ ] On long pages (e.g. **nvi.gov.tr**), **OUT_OF_VIEWPORT_SCROLL_REQUIRED** count is **> 0** (classification uses getBoundingClientRect + scrollY, not only boundingBox).
- [ ] Evidence for NOT_VISIBLE / OUT_OF_VIEWPORT includes **rect**, **scrollY**, and **computed style** where available.

### 10. Budget exhaustion (no UNKNOWN spam)

- [ ] When attempt budget is exhausted, elements are **SKIPPED** with **reasonCode = MAX_ATTEMPTS_REACHED** and **evidence.phase = "budget"** or **"final-pass"**.
- [ ] **unknownReasonCount** is **near zero** when budget is used (UNKNOWN only for truly unclassified; budget exhaustion is MAX_ATTEMPTS_REACHED).

### 11. scrollMetrics deterministic

- [ ] **newlyDiscoveredPerScrollStep** length equals **scrollSteps** (e.g. 6); array is pre-filled with 0 and updated per step.
- [ ] **summary.uiCoverage.newlyDiscoveredPerScrollStep** (and **skippedHiddenCount**, **skippedOutOfViewportCount**) are present and populated on long sites.

### 12. Attempt queue priority

- [ ] Attempt queue is ordered by: **IN_VIEWPORT + low-risk + stable selector** first, then **OUT_OF_VIEWPORT + same**, then **elementId**.
- [ ] **attemptedCountTotal** improves on long pages for the same budget (priority spends budget on visible/stable elements first).
