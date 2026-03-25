# Branch Protection — Kurumsal Kurulum Rehberi

Bu doküman, `main` (veya `master`) dalı için kurumsal branch protection standartlarını tanımlar. Amaç; doğrudan push, kontrolsüz merge ve doğrulanmamış değişiklikleri engellemektir.

## Önerilen kurallar

- PR olmadan merge yok
- En az 1 onay (CODEOWNERS önerilir)
- Zorunlu status checks (CI)
- Non-fast-forward ve silme koruması
- “Strict” status checks (base branch güncel olmalı)

## GitHub CLI (rulesets)

Kurumsal ortamlarda rulesets tercih edilir. Aşağıdaki komut örnektir; check context isimlerini workflow’larınıza göre güncelleyin.

```bash
gh api repos/:owner/:repo/rulesets \
  -f name="main-protection" \
  -f target=branch \
  -f enforcement=active \
  -f conditions='{\"ref_name\":{\"include\":[\"refs/heads/main\"],\"exclude\":[]}}' \
  -f rules='[
    {\"type\":\"deletion\"},
    {\"type\":\"non_fast_forward\"},
    {\"type\":\"pull_request\",\"parameters\":{\"required_approving_review_count\":1,\"dismiss_stale_reviews_on_push\":true}},
    {\"type\":\"required_status_checks\",\"parameters\":{\"strict\":true,\"required_contexts\":[\"CI\"]}}
  ]'
```

## Web arayüzü

**Settings → Branches → Branch protection rules → Add rule**

## Notlar

- Org düzeyi rulesets kullanıyorsanız repo bazlı kuralları minimal tutun.
- Check isimleri case-sensitive olabilir; gerçek “check run” adlarını baz alın.

---

# Branch Protection — Enterprise Setup Guide

This document defines enterprise branch protection standards for the `main` (or `master`) branch. The goal is to prevent direct pushes, uncontrolled merges, and unverified changes.

## Recommended rules

- No merges without a PR
- At least 1 approval (CODEOWNERS recommended)
- Required status checks (CI)
- Non-fast-forward and deletion protection
- Strict status checks (base branch must be up-to-date)

## GitHub CLI (rulesets)

Rulesets are preferred in enterprise setups. The command below is an example; update required check contexts to match your workflows.

```bash
gh api repos/:owner/:repo/rulesets \
  -f name="main-protection" \
  -f target=branch \
  -f enforcement=active \
  -f conditions='{\"ref_name\":{\"include\":[\"refs/heads/main\"],\"exclude\":[]}}' \
  -f rules='[
    {\"type\":\"deletion\"},
    {\"type\":\"non_fast_forward\"},
    {\"type\":\"pull_request\",\"parameters\":{\"required_approving_review_count\":1,\"dismiss_stale_reviews_on_push\":true}},
    {\"type\":\"required_status_checks\",\"parameters\":{\"strict\":true,\"required_contexts\":[\"CI\"]}}
  ]'
```

## Web UI

**Settings → Branches → Branch protection rules → Add rule**

## Notes

- If you use org-level rulesets, keep repo-level rules minimal.
- Check names can be case-sensitive; use the actual check run names.
