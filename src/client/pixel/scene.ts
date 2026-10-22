import { DESKS, STATIONS, BEANBAGS, MEETING_SEATS } from '../../shared/layout';
import type { WorkerInfo } from '../../shared/protocol';
import { store } from '../state';
import { h, STATUS_LABEL } from '../ui/dom';
import { findPath, MAP, isNight, type Appearance, type Point, type Rect } from './model';

export type OfficeAction = 'queue' | 'issues' | 'pulls' | 'meeting' | 'whiteboard' | 'floors' | 'docs' | 'services' | 'screen' | 'coffee' | 'dog' | 'gong' | 'pictures' | 'signs' | 'expansion' | 'station-issues' | 'station-pulls' | 'station-queue';
interface ObjectDef extends Rect { id: OfficeAction; label: string; hint: string; kind: string }
export const OBJECTS: ObjectDef[] = [
  { id: 'issues', x: 175, y: 66, w: 130, h: 65, kind: 'board', label: 'GitHub Issues', hint: 'Open Issues' },
  { id: 'queue', x: 332, y: 66, w: 130, h: 65, kind: 'board', label: 'Task queue', hint: 'Open Task Queue' },
  { id: 'pulls', x: 489, y: 66, w: 130, h: 65, kind: 'board', label: 'Pull requests', hint: 'Open Pull Requests' },
  { id: 'floors', x: 700, y: 45, w: 110, h: 90, kind: 'elevator', label: 'Elevator', hint: 'Select Floor' },
  { id: 'services', x: 46, y: 180, w: 68, h: 112, kind: 'server', label: 'Operations', hint: 'View Services' },
  { id: 'docs', x: 46, y: 330, w: 68, h: 105, kind: 'shelf', label: 'Library', hint: 'Read Documentation' },
  { id: 'meeting', x: 715, y: 253, w: 170, h: 82, kind: 'table', label: 'Meeting room', hint: 'Start / Join Meeting' },
  { id: 'whiteboard', x: 683, y: 172, w: 210, h: 48, kind: 'whiteboard', label: 'Whiteboard', hint: 'Open Whiteboard' },
  { id: 'screen', x: 786, y: 443, w: 96, h: 48, kind: 'tv', label: 'Lounge TV', hint: 'Screen Sharing' },
  { id: 'coffee', x: 925, y: 441, w: 45, h: 55, kind: 'coffee', label: 'Coffee', hint: 'Get Coffee in 3D' },
  { id: 'dog', x: 647, y: 532, w: 40, h: 35, kind: 'dog', label: 'Office dog', hint: 'Pet Office Dog' },
  { id: 'gong', x: 927, y: 344, w: 40, h: 60, kind: 'gong', label: 'Merge gong', hint: 'Ring Gong' },
  { id: 'pictures', x: 885, y: 72, w: 58, h: 42, kind: 'picture', label: 'Gallery', hint: 'Picture controls in 3D' },
  { id: 'signs', x: 165, y: 542, w: 70, h: 26, kind: 'sign', label: 'Desk signs', hint: 'Edit signs in 3D' },
  { id: 'expansion', x: 890, y: 555, w: 80, h: 26, kind: 'sign', label: 'Explore', hint: 'Explore the full 3D office' },
  { id: 'station-issues', x: 216, y: 140, w: 46, h: 28, kind: 'kiosk', label: 'Issues assistant', hint: 'Ask Board Agent' },
  { id: 'station-queue', x: 373, y: 140, w: 46, h: 28, kind: 'kiosk', label: 'Queue assistant', hint: 'Ask Board Agent' },
  { id: 'station-pulls', x: 530, y: 140, w: 46, h: 28, kind: 'kiosk', label: 'PR assistant', hint: 'Ask Board Agent' },
];
export function seatPosition(id: string): Point {
  const index = DESKS.findIndex(d => d.id === id);
  if (index >= 0) return { x: [190, 290, 460, 560][index % 4], y: 219 + Math.floor(index / 4) * 80 };
  const station = OBJECTS.find(o => o.id === id);
  if (station) return { x: station.x + 23, y: station.y + 30 };
  const meeting = MEETING_SEATS.findIndex(d => d.id === id);
  if (meeting >= 0) return { x: meeting % 2 ? 895 : 705, y: 240 + Math.floor(meeting / 2) * 31 };
  const beanbag = Math.max(0, BEANBAGS.findIndex(d => d.id === id));
  return { x: 170 + (beanbag % 8) * 62, y: 563 + Math.floor(beanbag / 8) * 34 };
}
const obstacles = (): Rect[] => [
  ...DESKS.map(d => { const p = seatPosition(d.id); return { x: p.x - 32, y: p.y - 28, w: 72, h: 30 }; }),
  ...OBJECTS.filter(o => !['dog', 'signs', 'expansion'].includes(o.id)),
  { x: 672, y: 150, w: 8, h: 200 }, { x: 680, y: 355, w: 82, h: 8 }, { x: 850, y: 355, w: 62, h: 8 },
];
const statusColor: Record<string, string> = { working: '#61b9f3', starting: '#bca3ee', needs_input: '#f5bd67', done: '#6cd5ab', error: '#f08086', exited: '#98a5af', idle: '#aab8c8', paused: '#f5bd67' };
interface Sprite { at: Point; target: Point; path: Point[]; worker: WorkerInfo }

export class PixelScene {
  readonly element = h('div.pixel-viewport', { 'aria-label': 'Interactive pixel office' });
  private stage = h('div.pixel-stage');
  private canvas = h('canvas.pixel-map', { width: MAP.width * 2, height: MAP.height * 2, 'aria-hidden': 'true' });
  private ctx = this.canvas.getContext('2d')!;
  private hits = h('div.pixel-hits');
  private buttons = new Map<string, HTMLButtonElement>();
  private sprites = new Map<string, Sprite>();
  private selected: string | null = null;
  private raf = 0;
  private last = 0;
  private fit = 1;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private drag: Point | null = null;
  private moved = false;
  private avatar: Point = { x: 620, y: 550 };
  private avatarPath: Point[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private resize: ResizeObserver;

  constructor(private prefs: () => Appearance, private action: (id: OfficeAction) => void, private agent: (id: string) => void, private hire: (seat: string) => void, private move: (at: Point) => void) {
    this.stage.append(this.canvas, this.hits); this.element.append(this.stage);
    this.ctx.scale(2, 2); this.ctx.imageSmoothingEnabled = false;
    for (const o of OBJECTS) this.objectButton(o.id, o.hint, o, () => this.action(o.id));
    for (const d of DESKS) { const p = seatPosition(d.id); this.objectButton(d.id, `Hire Agent at ${d.label}`, { x: p.x - 35, y: p.y - 28, w: 78, h: 48 }, () => this.hire(d.id)); }
    this.resize = new ResizeObserver(() => { this.fit = Math.min((this.element.clientWidth - 28) / MAP.width, (this.element.clientHeight - 28) / MAP.height); this.transform(); });
    this.resize.observe(this.element);
    this.element.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? .9 : 1.1)); }, { passive: false });
    this.element.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; this.drag = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y }; this.moved = false; this.element.setPointerCapture(e.pointerId); });
    this.element.addEventListener('pointermove', e => { if (!this.drag) return; const p = { x: e.clientX - this.drag.x, y: e.clientY - this.drag.y }; this.moved ||= Math.hypot(p.x - this.pan.x, p.y - this.pan.y) > 3; this.pan = p; this.transform(); });
    this.element.addEventListener('pointerup', e => {
      if (this.drag && !this.moved) { const r = this.canvas.getBoundingClientRect(); const target = { x: (e.clientX - r.left) * MAP.width / r.width, y: (e.clientY - r.top) * MAP.height / r.height }; this.avatarPath = findPath(this.avatar, target, obstacles()); }
      this.drag = null;
    });
    this.element.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || (e.target as HTMLElement).tagName !== 'CANVAS') return;
      e.preventDefault(); const dx = e.key === 'ArrowLeft' ? -32 : e.key === 'ArrowRight' ? 32 : 0, dy = e.key === 'ArrowUp' ? -32 : e.key === 'ArrowDown' ? 32 : 0;
      this.avatarPath = findPath(this.avatar, { x: this.avatar.x + dx, y: this.avatar.y + dy }, obstacles());
    });
    this.canvas.tabIndex = 0; this.canvas.setAttribute('aria-label', 'Walk through the office with arrow keys, or click an open pathway');
    this.sync(); this.frame(0);
  }
  select(id: string | null) { this.selected = id; this.hits.querySelectorAll('.selected').forEach(e => e.classList.remove('selected')); if (id) this.buttons.get(`worker-${id}`)?.classList.add('selected'); }
  setZoom(value: number) { this.zoom = Math.max(.7, Math.min(2.5, value)); this.transform(); }
  zoomBy(factor: number) { this.setZoom(this.zoom * factor); }
  reset() { this.pan = { x: 0, y: 0 }; this.zoom = 1; this.transform(); }
  private transform() { this.stage.style.transform = `translate(calc(-50% + ${this.pan.x}px),calc(-50% + ${this.pan.y}px)) scale(${Math.max(.1, this.fit) * this.zoom * this.prefs().scale})`; }
  private objectButton(id: string, label: string, rect: Rect, click: () => void) {
    const button = h('button.pixel-object', { type: 'button', 'aria-label': label, title: label, 'data-object': id });
    button.onclick = () => { this.hits.querySelectorAll('.selected').forEach(e => e.classList.remove('selected')); button.classList.add('selected'); click(); };
    Object.assign(button.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    button.append(h('span.pixel-tooltip', {}, label)); this.hits.append(button); this.buttons.set(id, button); return button;
  }
  sync() {
    for (const [id] of this.sprites) if (!store.workers.has(id)) { this.sprites.delete(id); this.buttons.get(`worker-${id}`)?.remove(); this.buttons.delete(`worker-${id}`); }
    for (const worker of store.workers.values()) {
      const target = seatPosition(worker.deskId); let sprite = this.sprites.get(worker.id);
      if (!sprite) { sprite = { at: { ...target }, target, path: [], worker }; this.sprites.set(worker.id, sprite); }
      if (sprite.target.x !== target.x || sprite.target.y !== target.y) { sprite.path = findPath(sprite.at, target, obstacles()); sprite.target = target; }
      sprite.worker = worker;
      const id = `worker-${worker.id}`;
      const button = this.buttons.get(id) ?? this.objectButton(id, '', { x: target.x - 18, y: target.y - 18, w: 48, h: 58 }, () => this.agent(worker.id));
      const label = `Open Agent Workspace: ${worker.name} · ${STATUS_LABEL[worker.status] ?? worker.status}`;
      button.setAttribute('aria-label', label); button.title = `${label}${worker.task?.summary ? ` · ${worker.task.summary}` : ''}`;
      button.classList.add('pixel-agent'); button.classList.toggle('selected', this.selected === worker.id);
      button.replaceChildren(h('span.pixel-agent-label', {}, worker.name, this.prefs().status ? h('small', {}, STATUS_LABEL[worker.status] ?? worker.status) : null), h('span.pixel-tooltip', {}, button.title));
    }
    for (const d of DESKS) {
      const worker = [...store.workers.values()].find(w => w.deskId === d.id); const button = this.buttons.get(d.id)!;
      button.setAttribute('aria-label', worker ? `View Desk: ${worker.name}` : `Hire Agent at ${d.label}`);
      button.onclick = () => this.hire(d.id);
    }
    this.hits.dataset.hints = this.prefs().hints;
    this.hits.classList.toggle('hide-names', !this.prefs().names); this.transform();
  }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || now - this.last < 1000 / 24) return;
    const dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
    const animate = this.prefs().animation && !this.prefs().reducedMotion && !this.reduced.matches;
    if (this.avatarPath.length) { this.advance(this.avatar, this.avatarPath, animate ? dt : 10); this.move(this.avatar); }
    for (const sprite of this.sprites.values()) {
      if (sprite.path.length && this.prefs().walking) this.advance(sprite.at, sprite.path, animate ? dt : 10);
      else if (!this.prefs().walking) sprite.at = { ...sprite.target };
      const button = this.buttons.get(`worker-${sprite.worker.id}`)!; button.style.left = `${sprite.at.x - 18}px`; button.style.top = `${sprite.at.y - 18}px`;
    }
    this.draw(animate ? now / 1000 : 0);
  };
  private advance(at: Point, path: Point[], dt: number) { const p = path[0]; if (!p) return; const distance = Math.hypot(p.x - at.x, p.y - at.y), step = dt * 100; if (distance <= step) { Object.assign(at, p); path.shift(); } else { at.x += (p.x - at.x) / distance * step; at.y += (p.y - at.y) / distance * step; } }
  private rect(x: number, y: number, w: number, h: number, color: string) { this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  private text(label: string, x: number, y: number, color = '#637781', size = 10) { this.ctx.fillStyle = color; this.ctx.font = `600 ${size}px ui-monospace,monospace`; this.ctx.textAlign = 'center'; this.ctx.fillText(label, x, y); }
  private plant(x: number, y: number) { this.rect(x - 8, y + 3, 16, 17, '#a58b6e'); this.rect(x - 10, y + 1, 20, 5, '#d4b395'); this.rect(x - 2, y - 24, 5, 28, '#547c65'); this.rect(x - 15, y - 16, 14, 9, '#75a181'); this.rect(x + 2, y - 26, 15, 10, '#8cb48d'); this.rect(x + 1, y - 9, 13, 8, '#618d70'); }
  private person(at: Point, color: string, status: string, time: number, name?: string) {
    const ctx = this.ctx, active = status === 'working', bob = time && active ? Math.round(Math.sin(time * 6)) : status === 'done' && time ? Math.round(Math.sin(time * 2)) : 0;
    ctx.save(); ctx.translate(Math.round(at.x), Math.round(at.y + bob));
    this.rect(-10, 23, 26, 5, '#00000016'); this.rect(-6, 14, 8, 10, '#354453'); this.rect(5, 14, 8, 10, '#354453');
    this.rect(-9, 0, 25, 17, color); this.rect(-13, 3 + (active ? bob * 2 : 0), 6, 12, '#e7b999'); this.rect(16, 3 - (active ? bob * 2 : 0), 6, 12, '#e7b999');
    this.rect(-7, -19, 20, 19, '#e7b999'); this.rect(-9, -24, 23, 9, '#3c3c49'); this.rect(-9, -15, 5, 9, '#3c3c49'); this.rect(0, -11, 3, 3, '#333948'); this.rect(9, -11, 3, 3, '#333948');
    if (this.prefs().status) { this.rect(16, -29, 17, 15, statusColor[status] ?? '#9eacb8'); this.text(status === 'needs_input' ? '?' : status === 'done' ? '✓' : active ? '…' : '·', 24, -18, '#183543', 12); }
    if (name) this.text(name, 4, 39, '#566776', 10); ctx.restore();
  }
  private draw(time: number) {
    const ctx = this.ctx, night = isNight(this.prefs().mode); ctx.clearRect(0, 0, MAP.width, MAP.height);
    this.rect(16, 37, 992, 578, '#00000028'); this.rect(16, 18, 992, 588, night ? '#333f48' : '#c6b6a2');
    for (let row = 0; row < 18; row++) for (let col = 0; col < 32; col++) {
      const x = 24 + col * 31, y = 43 + row * 31; if (y > 590) continue;
      this.rect(x, y, 30, 30, night ? ((row + col) % 3 ? '#52616b' : '#566670') : ((row + col) % 3 ? '#e0d1ba' : '#e8d9c2'));
      this.rect(x + 3, y + 15, 24, 1, night ? '#ffffff05' : '#bfa78720');
    }
    this.rect(24, 25, 976, 30, night ? '#273540' : '#d4dfe1'); this.rect(24, 52, 976, 8, '#83939b');
    for (const x of [55, 105, 640, 824, 950]) { this.rect(x, 29, 30, 20, night ? '#758ba7' : '#b6dce6'); this.rect(x + 14, 29, 2, 20, '#91a6b0'); }
    this.rect(144, 184, 493, 338, night ? '#6d7d7e' : '#f0e5d2'); this.rect(150, 190, 481, 326, night ? '#566a70' : '#e9ddc8');
    this.text('ENGINEERING STUDIO', 391, 181, night ? '#d5e1e5' : '#6d7b7d', 11);
    this.rect(673, 153, 242, 210, night ? '#405864' : '#d0e0df'); this.rect(681, 161, 226, 192, night ? '#56717a' : '#e4eddf');
    this.rect(672, 152, 5, 209, '#8cafb6'); this.rect(911, 152, 5, 209, '#8cafb6'); this.rect(677, 355, 85, 7, '#8cafb6'); this.rect(850, 355, 62, 7, '#8cafb6');
    this.text('MEETING ROOM', 797, 390, night ? '#d4e0e6' : '#678489', 11);
    if (this.prefs().furniture) {
      for (const object of OBJECTS) this.furniture(object, night, time);
      for (const desk of DESKS) {
        const p = seatPosition(desk.id), occupied = [...store.workers.values()].some(w => w.deskId === desk.id);
        this.rect(p.x - 24, p.y + 3, 53, 21, '#71848d'); this.rect(p.x - 16, p.y + 22, 35, 6, '#536775');
        this.rect(p.x - 35, p.y - 21, 81, 28, '#b69675'); this.rect(p.x - 35, p.y - 26, 81, 25, '#dec3a2');
        this.rect(p.x - 10, p.y - 40, 34, 24, '#3e5061'); this.rect(p.x - 7, p.y - 37, 28, 18, occupied ? '#7cc7d2' : '#91a6ad');
        this.rect(p.x + 4, p.y - 16, 6, 6, '#5b707e'); this.rect(p.x - 6, p.y - 8, 27, 5, '#d4dfe0');
        this.rect(p.x + 31, p.y - 19, 6, 8, '#e9e5dd'); this.text(desk.id.slice(5).padStart(2, '0'), p.x - 24, p.y - 9, '#8c795f', 8);
      }
      for (const [x, y] of [[58, 92], [975, 159], [648, 406], [960, 570], [54, 535]]) this.plant(x, y);
      this.rect(735, 513, 146, 40, '#6d8f92'); this.rect(729, 502, 157, 28, '#8aabad'); this.rect(727, 511, 16, 44, '#75999b'); this.rect(875, 511, 16, 44, '#75999b');
      for (const x of [751, 793, 835]) this.rect(x, 507, 35, 17, '#9ab9ba');
      this.rect(760, 568, 100, 22, '#c3aa89'); this.rect(777, 566, 27, 12, '#c5d4cc'); this.text('LOUNGE', 809, 608, '#71868b', 10);
    }
    for (const peer of store.peers.values()) if (store.onMyFloor(peer) && peer.id !== store.you) this.person({ x: 70 + (peer.x + 18) * 23, y: 80 + (peer.z + 13) * 17 }, peer.color, 'idle', 0, peer.name);
    this.person(this.avatar, store.profile.color, 'idle', 0, 'You');
    for (const s of this.sprites.values()) this.person(s.at, s.worker.color, s.worker.status, time);
    if (night) { ctx.fillStyle = '#10203925'; ctx.fillRect(24, 56, 976, 543); }
    this.text('CLICK A CHARACTER TO OPEN THEIR WORKSPACE', 391, 596, night ? '#b2c4d0' : '#8f8c80', 9);
  }
  private furniture(o: ObjectDef, night: boolean, time: number) {
    const { x, y, w, h: height } = o;
    if (o.kind === 'board' || o.kind === 'whiteboard') {
      this.rect(x + 2, y + 6, w, height, '#00000020'); this.rect(x, y, w, height, '#799399'); this.rect(x + 4, y + 4, w - 8, height - 8, o.kind === 'board' ? '#b6bba2' : '#f0f1df');
      for (let i = 0; i < 4; i++) this.rect(x + 12 + i * 26, y + 22, 20, 24, ['#f0df9e', '#a7d1c9', '#c2c8e7', '#edc8b5'][i]);
      this.text(o.label.toUpperCase(), x + w / 2, y + 15, '#42616a', 9);
    } else if (o.kind === 'elevator') {
      this.rect(x - 6, y - 5, w + 12, height + 9, '#869ba4'); this.rect(x, y, w, height, '#657c8d'); this.rect(x + 6, y + 8, w - 12, height - 8, '#a9b8bc'); this.rect(x + w / 2, y + 8, 3, height - 8, '#748b98');
      this.rect(x + 29, y - 10, 54, 16, '#304a5e'); this.text('FLOORS', x + w / 2, y + 1, '#a6e0c5', 9);
    } else if (o.kind === 'table') {
      this.rect(x, y + 6, w, height, '#8d9a91'); this.rect(x, y, w, height - 4, '#c9b59a'); this.rect(x + 6, y + 5, w - 12, height - 14, '#e0c8a6');
      for (const px of [x - 18, x + w + 5]) for (let i = 0; i < 3; i++) this.rect(px, y + i * 25 + 5, 14, 21, '#748d97');
      this.rect(x + 67, y + 26, 36, 24, '#597583'); this.rect(x + 72, y + 30, 26, 15, '#add3ca');
    } else if (o.kind === 'server') {
      this.rect(x, y, w, height, '#435c70'); for (let i = 0; i < 5; i++) { this.rect(x + 6, y + 8 + i * 19, w - 12, 14, '#2c4355'); this.rect(x + 12, y + 13 + i * 19, 5, 4, i === Math.floor(time) % 5 ? '#b9d5b2' : '#7db5b9'); this.rect(x + 28, y + 13 + i * 19, 23, 3, '#64838d'); }
    } else if (o.kind === 'shelf') {
      this.rect(x, y, w, height, '#9b8064'); for (let row = 0; row < 3; row++) { this.rect(x + 5, y + row * 32 + 5, w - 10, 25, '#765f51'); for (let i = 0; i < 6; i++) this.rect(x + 8 + i * 9, y + row * 32 + 10, 6, 20, ['#9eaec5', '#a9bea9', '#c4a48c'][i % 3]); }
    } else if (o.kind === 'tv') { this.rect(x, y, w, height, '#405565'); this.rect(x + 5, y + 5, w - 10, height - 10, night ? '#738fa7' : '#668393'); this.text('SCREEN SHARE', x + w / 2, y + 27, '#d1e1e4', 9); }
    else if (o.kind === 'coffee') { this.rect(x, y, w, height, '#405665'); this.rect(x + 5, y + 5, w - 10, 16, '#7b98a2'); this.rect(x + 13, y + 32, 15, 16, '#eee8df'); this.rect(x + 13, y + 31, 15, 3, '#98785c'); }
    else if (o.kind === 'dog') { this.rect(x + 4, y + 10, 32, 16, '#c79f77'); this.rect(x + 24, y, 18, 20, '#d7b58e'); this.rect(x + 23, y + 1, 7, 12, '#8e7057'); this.rect(x + 35, y + 7, 3, 3, '#3f4c54'); this.rect(x + 8, y + 24, 5, 9, '#a18468'); this.rect(x + 30, y + 24, 5, 9, '#a18468'); }
    else if (o.kind === 'gong') { this.rect(x + 1, y, 5, height, '#827466'); this.rect(x + w - 5, y, 5, height, '#827466'); this.rect(x, y, w, 5, '#827466'); this.rect(x + 6, y + 10, w - 12, 32, '#c5a66c'); this.rect(x + 16, y + 19, 10, 13, '#a78856'); }
    else if (o.kind === 'picture') { this.rect(x, y, w, height, '#c6aa86'); this.rect(x + 5, y + 5, w - 10, height - 10, '#c2d9d4'); this.rect(x + 9, y + 23, 25, 10, '#90ae9b'); this.rect(x + 32, y + 9, 9, 9, '#e7c77f'); }
    else if (o.kind === 'kiosk') { this.rect(x, y + 8, w, height - 8, '#a4bcb8'); this.rect(x + 12, y, 24, 14, '#547488'); this.rect(x + 15, y + 3, 18, 8, '#b2d4ce'); }
    else { this.rect(x, y, w, height, '#698496'); this.text(o.label.toUpperCase(), x + w / 2, y + 17, '#e7eee9', 9); }
  }
  dispose() { cancelAnimationFrame(this.raf); this.resize.disconnect(); this.element.remove(); }
}
