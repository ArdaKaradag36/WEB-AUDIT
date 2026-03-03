# Visibility classification and scroll sampling

This document describes how the auto UI audit engine classifies element visibility and uses scroll sampling to increase coverage on long pages—without site-specific logic.

## Visibility classification

The engine distinguishes three outcomes for each candidate element:

| Classification | Meaning | reasonCode |
|----------------|---------|------------|
| **NOT_VISIBLE** | Element is detached, has no bounding box, or is hidden (e.g. `display:none`, `visibility:hidden`, `opacity:0`, or zero-size). | `NOT_VISIBLE` |
| **OUT_OF_VIEWPORT_SCROLL_REQUIRED** | Element has a valid box and is not hidden, but its box is outside the current viewport. | `OUT_OF_VIEWPORT_SCROLL_REQUIRED` |
| **VISIBLE_IN_VIEWPORT** | Element has a valid box, is not hidden, and is inside the viewport. | — (attempt proceeds) |

Implementation lives in `runner/src/auto/visibility.ts`:

- **getElementBox(locator)** – bounding box of the first match.
- **isElementDisplayHidden(locator)** – computed style flags (display, visibility, opacity).
- **isOutOfViewport(box, viewport)** – whether the box is outside the viewport (with a small tolerance).
- **classifyVisibility(locator, page)** – returns one of the three classifications and **evidence** (box, viewport, style flags).

Effects:

- **No false TIMEOUT for hidden elements.** If the locator resolves only to hidden or out-of-viewport nodes, the engine does not wait for visibility and then time out; it assigns `NOT_VISIBLE` or `OUT_OF_VIEWPORT_SCROLL_REQUIRED` and skips (or scrolls and retries where applicable).
- **Evidence** is stored on the element (e.g. in `ui-inventory.json`) so NOT_VISIBLE / OUT_OF_VIEWPORT / TIMEOUT outcomes can be inspected (box, viewport, `displayNone`, `visibilityHidden`, `opacityZero`, `outOfViewport`).

## Scroll sampling

After the initial attempt pass, the engine can run a **deterministic scroll sampling** pass so that elements that were classified as NOT_VISIBLE or OUT_OF_VIEWPORT at the top of the page get a second chance after scrolling.

- **Config** (in `AutoUiAuditConfig`):
  - **scrollSteps** – number of scroll positions (default `5`). Use `0` to disable.
  - **scrollStabilizationMs** – wait after each scroll before re-scanning (e.g. `300`).
  - **maxAttemptsPerScrollStep** – cap attempts per step (e.g. `30`) to keep runs bounded.
- **Behaviour**:
  - Scroll positions are computed as a fraction of `(document.scrollHeight - viewportHeight)` (e.g. 0%, 25%, 50%, 75%, 100%).
  - At each step the page is scrolled, then the engine waits `scrollStabilizationMs`.
  - Only elements that are still **SKIPPED** with reasonCode **NOT_VISIBLE** or **OUT_OF_VIEWPORT_SCROLL_REQUIRED** are re-evaluated.
  - For each such element, `buildLocator` is run again; if the result has no `reasonCode` (i.e. the element is now visible in viewport), a single fill or click attempt is run, respecting `maxAttemptsPerScrollStep` and the global **maxAttempts**.
- **Determinism**: fixed number of steps, fixed limits, and a stable order of elements ensure similar distributions across repeated runs on the same URL.

## Locator and generic selectors

- **Visible-first locator** (`buildLocator` in `actions.ts`): when a selector matches multiple nodes, the engine checks visibility of the first few matches. If exactly one is visible, that match is used; if none are visible, it returns NOT_VISIBLE or OUT_OF_VIEWPORT from `classifyVisibility`; if more than one is visible, it returns `SELECTOR_AMBIGUOUS`. This reduces wrong clicks on duplicate (e.g. mobile/desktop) nodes and avoids timeouts on hidden-only matches.
- **Generic tag selectors** (e.g. `css:button`, `css:a`, `css:div`): such selectors are marked **SELECTOR_UNSTABLE** (low confidence) and the engine does not rely on them for meaningful attempts when a more stable selector exists, reducing NO_MEANINGFUL_CHANGE from misclicks.

## Reporting

- **Summary** includes `byStatus`, `byReasonCode`, `topReasonCodes`, and `topActionableItems`.
- Per-element **evidence** for NOT_VISIBLE, OUT_OF_VIEWPORT_SCROLL_REQUIRED, and TIMEOUT includes box, viewport, and style flags when available.
- Any element that remains untested after all passes receives a reasonCode (e.g. `UNKNOWN`) with `evidence.phase = "final-pass"`.
