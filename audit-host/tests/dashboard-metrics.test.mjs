import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreFromData,
  derivedStatus,
  progressBarPercent,
  coverageRatioFromCache,
} from '../wwwroot/js/dashboard-metrics.js';

test('5eb078 benzeri: bulgular + düşük UI oranı — skor ve çubuk susturulmaz', () => {
  const job = { status: 'success' };
  const summary = {
    cache: {
      findingsBySeverity: { critical: 1, error: 1, warn: 6, info: 3 },
      totalElements: 13,
      testedElements: 6,
      failedElements: 0,
    },
  };
  const cat = derivedStatus(job, summary.cache);
  assert.equal(cat, 'partial');

  const ratio = coverageRatioFromCache(summary.cache);
  assert.ok(ratio < 0.5);

  const score = scoreFromData(job, summary);
  assert.equal(score, 29);

  const bar = progressBarPercent(job, cat, score);
  assert.equal(bar, Math.min(29, 78));
});

test('Bulgular yüksek ama UI otomasyon %50 altı — özet skor tavanı 55', () => {
  const job = { status: 'success' };
  const summary = {
    cache: {
      findingsBySeverity: {},
      totalElements: 10,
      testedElements: 4,
      failedElements: 0,
    },
  };
  const score = scoreFromData(job, summary);
  assert.equal(score, 55);
});

test('UI yeterince yüksek — bulgu cezası doğrudan yansır', () => {
  const job = { status: 'success' };
  const summary = {
    cache: {
      findingsBySeverity: { warn: 2 },
      totalElements: 10,
      testedElements: 8,
      failedElements: 0,
    },
  };
  const score = scoreFromData(job, summary);
  assert.equal(score, 88);
  const cat = derivedStatus(job, summary.cache);
  assert.equal(cat, 'success');
});
