# UI coverage report schema (product-level)

## Per-element fields (ui-inventory.json)

Every element in `elements[]` includes:

```json
{
  "elementId": "el-0-button-0",
  "type": "button",
  "tagName": "button",
  "humanName": "Submit",
  "pageUrl": "https://example.com",
  "visible": true,
  "enabled": true,
  "recommendedSelectors": [
    { "strategy": "role", "role": "button", "name": "Submit", "exact": false, "preferred": true },
    { "strategy": "css", "css": "button[type=\"submit\"]", "preferred": false }
  ],
  "recommendedSelectorsLegacy": [
    { "strategy": "role", "selector": "getByRole('button', { name: 'Submit' })", "preferred": true },
    { "strategy": "css", "selector": "button[type=\"submit\"]", "preferred": false }
  ],
  "tested": false,
  "status": "SKIPPED",
  "reasonCode": "ALLOWLIST_REQUIRED",
  "actionHint": "Add selector or label to click allowlist if this action is intended in safe mode.",
  "confidence": 0.9,
  "fixSuggestion": "Use --click-allowlist or AUDIT_CLICK_ALLOWLIST for this control.",
  "evidence": {},
  "riskLevel": "needs_allowlist",
  "attempts": []
}
```

- **status**: `TESTED_SUCCESS` | `SKIPPED` | `ATTEMPTED_FAILED` | `ATTEMPTED_NO_EFFECT`
- **reasonCode**: Required when status ≠ TESTED_SUCCESS (e.g. NOT_VISIBLE, DISABLED, ALLOWLIST_REQUIRED, SELECTOR_AMBIGUOUS, TIMEOUT, NO_MEANINGFUL_CHANGE, UNKNOWN, …)
- **actionHint**: What to do next (from reason taxonomy)
- **confidence**: 0..1
- **evidence**: Optional { selectorStrategy, matchedCount, exceptionMessage, … }

## Summary aggregates (summary.json → uiCoverage)

```json
{
  "uiCoverage": {
    "totalElements": 35,
    "testedElements": 5,
    "skippedElements": 18,
    "failedElements": 2,
    "attemptedNoEffectElements": 3,
    "topSkipReasons": [
      { "reason": "ALLOWLIST_REQUIRED", "count": 6 },
      { "reason": "NOT_VISIBLE", "count": 5 },
      { "reason": "NO_MEANINGFUL_CHANGE", "count": 3 }
    ],
    "byStatus": {
      "TESTED_SUCCESS": 5,
      "SKIPPED": 18,
      "ATTEMPTED_FAILED": 2,
      "ATTEMPTED_NO_EFFECT": 3
    },
    "byReasonCode": {
      "ALLOWLIST_REQUIRED": 6,
      "NOT_VISIBLE": 5,
      "NO_MEANINGFUL_CHANGE": 3,
      "TIMEOUT": 2
    },
    "topReasonCodes": [
      { "reasonCode": "ALLOWLIST_REQUIRED", "count": 6 },
      { "reasonCode": "NOT_VISIBLE", "count": 5 }
    ],
    "topActionableItems": [
      {
        "elementId": "el-2-button-2",
        "reasonCode": "ALLOWLIST_REQUIRED",
        "actionHint": "Add selector or label to click allowlist if this action is intended in safe mode."
      }
    ],
    "actionableGaps": 28
  }
}
```

## Gaps (gaps.json)

Each gap has status, reasonCode, actionHint, confidence, evidence, fixSuggestion:

```json
{
  "gaps": [
    {
      "elementId": "el-2-button-2",
      "type": "button",
      "humanName": "Submit",
      "pageUrl": "https://example.com",
      "status": "SKIPPED",
      "reasonCode": "ALLOWLIST_REQUIRED",
      "actionHint": "Add selector or label to click allowlist if this action is intended in safe mode.",
      "confidence": 0.9,
      "fixSuggestion": "Use --click-allowlist or AUDIT_CLICK_ALLOWLIST for this control.",
      "evidence": {},
      "why": "Add selector or label to click allowlist if this action is intended in safe mode.",
      "recommendedSelectors": [],
      "recommendedScript": "import { test, expect } from '@playwright/test'; ...",
      "riskLevel": "needs_allowlist"
    }
  ]
}
```

## Regression checklist

- [ ] **No element missing reasonCode**: Every element with `tested=false` has `reasonCode` (and status) set.
- [ ] **allowlist_required reduced**: Only submit/destructive/auth/external links get ALLOWLIST_REQUIRED; benign buttons are attempted or get another reasonCode.
- [ ] **attempt_failed rare and with exception evidence**: ATTEMPTED_FAILED is used only when an attempt threw; reasonCode is TIMEOUT/DETACHED_FROM_DOM/INTERACTION_INTERCEPTED/UNKNOWN; evidence includes exceptionMessage.
- [ ] **Deterministic reasonCode distribution**: Same site and config produce stable byReasonCode/status counts.
