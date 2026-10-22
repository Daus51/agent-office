import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APPEARANCE, findPath, inside, isNight, readAppearance, remainingQuota, unlimitedFor } from '../src/client/pixel/model.js';

test('subscription remaining is used percentage inverted, bounded, and never guessed', () => {
  assert.equal(remainingQuota(23), 77);
  assert.equal(remainingQuota(0), 100);
  assert.equal(remainingQuota(100), 0);
  assert.equal(remainingQuota(120), 0);
  assert.equal(remainingQuota(-10), 100);
  assert.equal(remainingQuota(undefined), null);
  assert.equal(remainingQuota(NaN), null);
  assert.equal(remainingQuota(Infinity), null);
});

test('unlimited requires an explicit model policy and the existing OpenCode adapter', () => {
  const prefs = { ...DEFAULT_APPEARANCE, unlimitedModels: ['opencode:local/test'] };
  assert.equal(unlimitedFor({ provider: 'opencode', model: 'local/test' }, prefs), true);
  assert.equal(unlimitedFor({ provider: 'opencode', model: 'other/test' }, prefs), false);
  assert.equal(unlimitedFor({ provider: 'claude', model: 'local/test' }, prefs), false);
  assert.equal(unlimitedFor({ provider: 'custom', model: 'local/test' }, prefs), false);
  assert.equal(unlimitedFor({ provider: 'opencode', model: undefined }, prefs), false);
});

test('appearance rejects malformed preferences without changing real provider state', () => {
  assert.deepEqual(readAppearance('{invalid'), DEFAULT_APPEARANCE);
  assert.equal(readAppearance('{"scale":100}').scale, 2);
  assert.equal(readAppearance('{"scale":-1}').scale, .6);
  const prefs = readAppearance('{"mode":"invalid","animation":"false","unlimitedModels":[null,3,"claude:pro","opencode:local/model"]}');
  assert.equal(prefs.mode, 'auto');
  assert.equal(prefs.animation, true);
  assert.deepEqual(prefs.unlimitedModels, ['opencode:local/model']);
});

test('automatic day and night follow the reader clock; explicit preferences win', () => {
  assert.equal(isNight('auto', 6), true);
  assert.equal(isNight('auto', 7), false);
  assert.equal(isNight('auto', 18), false);
  assert.equal(isNight('auto', 19), true);
  assert.equal(isNight('day', 23), false);
  assert.equal(isNight('night', 12), true);
});

test('paths go around office furniture and remain on the walkable grid', () => {
  const wall = { x: 32, y: 0, w: 16, h: 64 };
  const path = findPath({ x: 8, y: 8 }, { x: 88, y: 8 }, [wall], 112, 96);
  assert.ok(path.length > 6, 'walking takes a detour around the wall');
  for (const point of path) assert.equal(inside(point, wall, 3), false);
  for (let i = 1; i < path.length; i++) assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 16);
});

test('unreachable destinations do not teleport through blocked furniture', () => {
  assert.deepEqual(findPath({ x: 8, y: 8 }, { x: 88, y: 8 }, [{ x: 32, y: 0, w: 16, h: 96 }], 112, 96), []);
});
