import type { AgentProvider, WorkerInfo } from '../../shared/protocol';

export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Appearance {
  mode: 'day' | 'night' | 'auto';
  scale: number;
  animation: boolean;
  walking: boolean;
  furniture: boolean;
  names: boolean;
  status: boolean;
  hints: 'full' | 'minimal' | 'off';
  density: 'comfortable' | 'compact';
  reducedMotion: boolean;
  unlimitedModels: string[];
}
export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'auto', scale: 1, animation: true, walking: true, furniture: true,
  names: true, status: true, hints: 'full', density: 'comfortable', reducedMotion: false, unlimitedModels: [],
};
export function remainingQuota(used: number | undefined): number | null {
  return typeof used === 'number' && Number.isFinite(used) ? Math.max(0, Math.min(100, 100 - used)) : null;
}
export function isNight(mode: Appearance['mode'], hour = new Date().getHours()): boolean {
  return mode === 'night' || (mode === 'auto' && (hour < 7 || hour >= 19));
}
export function unlimitedKey(provider: AgentProvider | undefined, model: string | undefined): string | null {
  return provider === 'opencode' && model ? `opencode:${model}` : null;
}
export function unlimitedFor(worker: Pick<WorkerInfo, 'provider' | 'model'>, appearance: Appearance): boolean {
  const key = unlimitedKey(worker.provider, worker.model);
  return key !== null && appearance.unlimitedModels.includes(key);
}
export function readAppearance(raw: string | null): Appearance {
  const value: Appearance = { ...DEFAULT_APPEARANCE, unlimitedModels: [] };
  try {
    const saved = JSON.parse(raw ?? '{}');
    if (!saved || typeof saved !== 'object') return value;
    if (['day', 'night', 'auto'].includes(saved.mode)) value.mode = saved.mode;
    if (typeof saved.scale === 'number' && Number.isFinite(saved.scale)) value.scale = Math.max(.6, Math.min(2, saved.scale));
    for (const key of ['animation', 'walking', 'furniture', 'names', 'status', 'reducedMotion'] as const) if (typeof saved[key] === 'boolean') value[key] = saved[key];
    if (['full', 'minimal', 'off'].includes(saved.hints)) value.hints = saved.hints;
    if (['comfortable', 'compact'].includes(saved.density)) value.density = saved.density;
    if (Array.isArray(saved.unlimitedModels)) value.unlimitedModels = saved.unlimitedModels.filter((s: unknown): s is string => typeof s === 'string' && s.startsWith('opencode:')).slice(0, 100);
  } catch { /* Invalid browser preferences use defaults. */ }
  return value;
}
export const MAP = { width: 1400, height: 455, cell: 16 };
export function inside(p: Point, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}
/** Bounded four-way BFS on a small office grid. Unreachable targets never cross furniture. */
export function findPath(start: Point, end: Point, obstacles: Rect[], width = MAP.width, height = MAP.height): Point[] {
  const size = MAP.cell, cols = Math.ceil(width / size), rows = Math.ceil(height / size);
  const cell = (p: Point) => ({ x: Math.max(0, Math.min(cols - 1, Math.floor(p.x / size))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y / size))) });
  const a = cell(start), b = cell(end), key = (p: Point) => p.y * cols + p.x;
  const queue = [a], parents = new Map<number, number>([[key(a), -1]]);
  for (let i = 0; i < queue.length && i < cols * rows; i++) {
    const p = queue[i];
    if (key(p) === key(b)) {
      const path: Point[] = [];
      for (let at = key(p); at !== -1; at = parents.get(at) ?? -1) path.push({ x: (at % cols + .5) * size, y: (Math.floor(at / cols) + .5) * size });
      return path.reverse();
    }
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows || parents.has(key(next))) continue;
      const center = { x: (next.x + .5) * size, y: (next.y + .5) * size };
      if (obstacles.some(r => inside(center, r, 3))) continue;
      parents.set(key(next), key(p)); queue.push(next);
    }
  }
  return [];
}
