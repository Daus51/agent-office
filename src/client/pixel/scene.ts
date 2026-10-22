import { DESKS, BEANBAGS, MEETING_SEATS } from '../../shared/layout';
import type { WorkerInfo } from '../../shared/protocol';
import { Caffeine } from '../caffeine';
import { store } from '../state';
import { h, STATUS_LABEL } from '../ui/dom';
import { findPath, MAP, type Appearance, type Point, type Rect } from './model';

export type OfficeAction = 'queue' | 'issues' | 'pulls' | 'meeting' | 'whiteboard' | 'floors' | 'docs' | 'services' | 'screen' | 'coffee' | 'dog' | 'gong' | 'pictures' | 'signs' | 'expansion' | 'station-issues' | 'station-pulls' | 'station-queue';
interface OfficeObject extends Rect { id: OfficeAction; title: string; verb: string; compact?: boolean }
export const OBJECTS: OfficeObject[] = [
  { id: 'queue', x: 54, y: 16, w: 244, h: 138, title: 'Task Board', verb: 'Open Task Queue' },
  { id: 'issues', x: 324, y: 16, w: 116, h: 139, title: 'GitHub Boards', verb: 'Open Issues / PRs' },
  { id: 'pulls', x: 443, y: 48, w: 111, h: 107, title: 'Pull Requests', verb: 'Open Pull Requests', compact: true },
  { id: 'meeting', x: 609, y: 16, w: 241, h: 158, title: 'Meeting Room', verb: 'Start Meeting' },
  { id: 'whiteboard', x: 900, y: 18, w: 210, h: 139, title: 'Whiteboard', verb: 'Open Whiteboard' },
  { id: 'floors', x: 1242, y: 18, w: 137, h: 164, title: 'Elevator', verb: 'Go to Floor' },
  { id: 'coffee', x: 32, y: 184, w: 174, h: 103, title: 'Coffee Corner', verb: 'Get Coffee' },
  { id: 'docs', x: 1030, y: 184, w: 151, h: 100, title: 'Docs Shelf', verb: 'Read Documentation' },
  { id: 'services', x: 1216, y: 241, w: 178, h: 98, title: 'Operations', verb: 'View Services' },
  { id: 'screen', x: 116, y: 323, w: 351, h: 125, title: 'Team Lounge', verb: 'Open Chat / Voice' },
  { id: 'gong', x: 1140, y: 342, w: 111, h: 106, title: 'Merge Gong', verb: 'Ring Gong' },
  { id: 'dog', x: 274, y: 386, w: 52, h: 33, title: 'Office companion', verb: 'Pet Office Dog', compact: true },
  { id: 'station-issues', x: 337, y: 151, w: 42, h: 21, title: 'Issues assistant', verb: 'Ask Board Agent', compact: true },
  { id: 'station-pulls', x: 459, y: 151, w: 42, h: 21, title: 'PR assistant', verb: 'Ask Board Agent', compact: true },
  { id: 'station-queue', x: 134, y: 145, w: 42, h: 23, title: 'Queue assistant', verb: 'Ask Board Agent', compact: true },
];
const frontSeats: Point[] = [
  { x: 330, y: 253 }, { x: 497, y: 253 }, { x: 680, y: 253 }, { x: 886, y: 253 },
  { x: 678, y: 392 }, { x: 870, y: 392 },
];
export function seatPosition(id: string): Point {
  const index = DESKS.findIndex(d => d.id === id);
  if (index >= 0) return frontSeats[index] ?? { x: 270 + ((index - 6) % 5) * 212, y: 554 + Math.floor((index - 6) / 5) * 130 };
  const station = OBJECTS.find(o => o.id === id);
  if (station) return { x: station.x + station.w / 2, y: station.y + station.h };
  const meeting = MEETING_SEATS.findIndex(d => d.id === id);
  if (meeting >= 0) return { x: 652 + (meeting % 4) * 46, y: meeting < 4 ? 100 : 145 };
  const bean = Math.max(0, BEANBAGS.findIndex(d => d.id === id));
  return { x: 148 + (bean % 6) * 43, y: 352 + Math.floor(bean / 6) * 47 };
}
const statusColors: Record<string, string> = { working: '#02dfad', starting: '#7b9dff', needs_input: '#ffbe46', done: '#02dfad', exited: '#8294ac', offline: '#8294ac', idle: '#49d4e7' };
interface Sprite { at: Point; target: Point; path: Point[]; worker: WorkerInfo }
export class PixelScene {
  readonly element = h('div.pixel-viewport', { 'aria-label': 'Interactive pixel office' });
  private stage = h('div.pixel-stage');
  private room = h('img.pixel-room-image', { src: '/assets/pixel/office-room.png', alt: '', draggable: false });
  private canvas = h('canvas.pixel-map', { width: MAP.width * 2, height: 760 * 2, tabindex: 0, 'aria-label': 'Walk through the office with arrow keys, or click an open pathway' });
  private ctx = this.canvas.getContext('2d')!;
  private atlas = new Image();
  private hits = h('div.pixel-hits');
  private buttons = new Map<string, HTMLButtonElement>();
  private sprites = new Map<string, Sprite>();
  private selected: string | null = null;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private fit = 1;
  private zoom = 1;
  private contain = false;
  private pan = { x: 0, y: 0 };
  private drag: Point | null = null;
  private moved = false;
  private avatar: Point = { x: 1190, y: 307 };
  private avatarPath: Point[] = [];
  private caffeine = new Caffeine();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private resize: ResizeObserver;
  private height = MAP.height;

  constructor(private prefs: () => Appearance, private action: (id: OfficeAction) => void, private agent: (id: string) => void, private hire: (seat: string) => void, private move: (at: Point) => void) {
    this.stage.append(this.room, this.canvas, this.hits); this.element.append(this.stage);
    this.ctx.scale(2, 2); this.ctx.imageSmoothingEnabled = false;
    this.atlas.onload = () => { this.dirty = true; }; this.atlas.src = '/assets/pixel/people-atlas.png';
    for (const object of OBJECTS) this.objectButton(object);
    for (const desk of DESKS) this.deskButton(desk.id);
    const hireZone = h('button.pixel-object.pixel-hire-zone', { type: 'button', 'data-object': 'hire-desk', 'aria-label': 'Hire Agent at an empty desk' }, h('span.pixel-empty-plus', {}, '+'), h('span.pixel-object-label', {}, h('strong', {}, 'Empty Desk'), h('span', {}, h('i.pixel-live-dot'), 'Hire Agent')));
    this.position(hireZone, { x: 953, y: 353, w: 115, h: 56 }); hireZone.onclick = () => { const seat = DESKS.find(d => !store.workerAtDesk(d.id)); if (seat) this.hire(seat.id); }; this.hits.append(hireZone); this.buttons.set('hire-desk', hireZone);
    this.resize = new ResizeObserver(() => this.transform()); this.resize.observe(this.element);
    this.element.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? .92 : 1.08)); }, { passive: false });
    this.element.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.drag = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y }; this.moved = false; this.element.setPointerCapture(e.pointerId);
    });
    this.element.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const p = { x: e.clientX - this.drag.x, y: e.clientY - this.drag.y };
      this.moved ||= Math.hypot(p.x - this.pan.x, p.y - this.pan.y) > 4; this.pan = p; this.transform();
    });
    this.element.addEventListener('pointerup', e => {
      if (this.drag && !this.moved) {
        const rect = this.stage.getBoundingClientRect();
        this.avatarPath = findPath(this.avatar, { x: (e.clientX - rect.left) * MAP.width / rect.width, y: (e.clientY - rect.top) * this.height / rect.height }, this.obstacles(), MAP.width, this.height);
      }
      this.drag = null;
    });
    this.canvas.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); const x = e.key === 'ArrowLeft' ? -32 : e.key === 'ArrowRight' ? 32 : 0, y = e.key === 'ArrowUp' ? -32 : e.key === 'ArrowDown' ? 32 : 0;
      this.avatarPath = findPath(this.avatar, { x: this.avatar.x + x, y: this.avatar.y + y }, this.obstacles(), MAP.width, this.height);
    });
    this.sync(); this.frame(0);
  }
  coffee() { this.caffeine.drink(performance.now() / 1000); return this.caffeine.cups; }
  select(id: string | null) { this.selected = id; this.hits.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); if (id) this.buttons.get(`worker-${id}`)?.classList.add('selected'); this.dirty = true; }
  setZoom(value: number) { this.zoom = Math.max(.5, Math.min(2.5, value)); this.transform(); }
  zoomBy(factor: number) { this.setZoom(this.zoom * factor); }
  reset() { this.contain = true; this.pan = { x: 0, y: 0 }; this.zoom = 1; this.transform(); }
  private transform() {
    const factors = [this.element.clientWidth / MAP.width, this.element.clientHeight / this.height];
    this.fit = this.contain ? Math.min(...factors) : Math.max(...factors);
    this.stage.style.height = `${this.height}px`;
    this.stage.style.transform = `translate(calc(-50% + ${this.pan.x}px),calc(-50% + ${this.pan.y}px)) scale(${Math.max(.1, this.fit) * this.zoom * this.prefs().scale})`;
  }
  private obstacles(): Rect[] {
    return [ ...OBJECTS.filter(o => !o.compact && o.id !== 'screen' && o.id !== 'meeting'), ...[...this.sprites.values()].map(s => ({ x: s.at.x - 12, y: s.at.y - 10, w: 24, h: 22 })),
      { x: 609, y: 12, w: 8, h: 160 }, { x: 844, y: 12, w: 8, h: 160 }, { x: 612, y: 169, w: 74, h: 5 }, { x: 773, y: 169, w: 73, h: 5 }, { x: 650, y: 105, w: 152, h: 28 },
      ...DESKS.map(d => { const p = seatPosition(d.id); return { x: p.x - 58, y: p.y - 52, w: 115, h: 36 }; }),
      { x: 0, y: 0, w: MAP.width, h: 12 }, { x: 0, y: this.height - 8, w: MAP.width, h: 8 }, { x: 0, y: 0, w: 8, h: this.height }, { x: MAP.width - 8, y: 0, w: 8, h: this.height } ];
  }
  private position(button: HTMLElement, rect: Rect) { Object.assign(button.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }); }
  private objectButton(object: OfficeObject) {
    const button = h('button.pixel-object', { type: 'button', 'data-object': object.id, 'aria-label': object.verb, title: object.verb });
    button.classList.toggle('compact-object', !!object.compact);
    const label = h('span.pixel-object-label', {}, h('strong', {}, object.title), h('span', {}, h('i.pixel-live-dot'), object.verb));
    button.append(label); this.position(button, object);
    button.onclick = () => { this.select(null); button.classList.add('selected'); this.action(object.id); };
    this.hits.append(button); this.buttons.set(object.id, button);
  }
  private deskButton(id: string) {
    const p = seatPosition(id), index = DESKS.findIndex(d => d.id === id);
    const button = h('button.pixel-object.pixel-desk', { type: 'button', 'data-object': id, 'aria-label': `Hire Agent at ${DESKS[index].label}`, title: `Hire Agent at ${DESKS[index].label}` });
    button.append(h('span.pixel-empty-plus', {}, '+'), h('span.pixel-object-label', {}, h('strong', {}, 'Empty Desk'), h('span', {}, h('i.pixel-live-dot'), 'Hire Agent')));
    this.position(button, { x: p.x - 65, y: p.y - 54, w: 130, h: 91 }); button.onclick = () => this.hire(id);
    this.hits.append(button); this.buttons.set(id, button);
  }
  sync() {
    const hireZone = this.buttons.get('hire-desk'); if (hireZone) hireZone.hidden = !DESKS.some(d => !store.workerAtDesk(d.id));
    for (const [id] of this.sprites) if (!store.workers.has(id)) { this.sprites.delete(id); this.buttons.get(`worker-${id}`)?.remove(); this.buttons.delete(`worker-${id}`); }
    const annex = [...store.workers.values()].some(w => DESKS.findIndex(d => d.id === w.deskId) >= 6);
    this.height = annex ? 760 : MAP.height;
    for (const worker of store.workers.values()) {
      const target = seatPosition(worker.deskId); let sprite = this.sprites.get(worker.id);
      if (!sprite) { sprite = { at: { ...target }, target, path: [], worker }; this.sprites.set(worker.id, sprite); }
      if (sprite.target.x !== target.x || sprite.target.y !== target.y) {
        sprite.path = findPath(sprite.at, target, this.obstacles().filter(r => !((r.x + r.w / 2) === sprite!.at.x && (r.y + r.h / 2) === sprite!.at.y)), MAP.width, this.height);
        sprite.target = target;
      }
      sprite.worker = worker;
      const id = `worker-${worker.id}`;
      let button = this.buttons.get(id);
      if (!button) {
        button = h('button.pixel-object.pixel-agent', { type: 'button', 'data-object': id });
        button.onclick = () => this.agent(worker.id); this.hits.append(button); this.buttons.set(id, button);
      }
      button.setAttribute('aria-label', `Open Agent Workspace: ${worker.name} · ${STATUS_LABEL[worker.status] ?? worker.status}`);
      button.title = `${worker.name} · ${STATUS_LABEL[worker.status] ?? worker.status}${worker.task?.name ? ` · ${worker.task.name}` : ''}`;
      button.dataset.status = worker.status; button.classList.toggle('selected', this.selected === worker.id);
      button.replaceChildren(h('span.pixel-agent-label', {}, h('i', { style: `background:${statusColors[worker.status] ?? '#8294ac'}` }), worker.name), h('span.pixel-agent-bubble', {}, worker.status === 'needs_input' ? '!' : worker.status === 'working' ? '…' : worker.status === 'done' ? '✓' : '·'), h('span.pixel-tooltip', {}, button.title));
      this.position(button, { x: sprite.at.x - 26, y: sprite.at.y - 44, w: 52, h: 70 });
    }
    for (const desk of DESKS) {
      const index = DESKS.indexOf(desk), worker = store.workerAtDesk(desk.id), button = this.buttons.get(desk.id)!;
      button.hidden = index >= 6 && !annex;
      button.classList.toggle('occupied', !!worker);
      button.setAttribute('aria-label', worker ? `View Desk: ${worker.name}` : `Hire Agent at ${desk.label}`);
      button.querySelector('.pixel-object-label strong')!.textContent = worker ? worker.name : 'Empty Desk';
    }
    this.hits.dataset.hints = this.prefs().hints;
    this.hits.classList.toggle('hide-names', !this.prefs().names);
    this.hits.classList.toggle('hide-status', !this.prefs().status);
    this.room.hidden = !this.prefs().furniture;
    this.element.dataset.annex = String(annex); this.transform(); this.dirty = true;
  }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || now - this.last < 1000 / 24) return;
    const dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
    const animate = this.prefs().animation && !this.prefs().reducedMotion && !this.reduced.matches;
    let moving = this.avatarPath.length > 0;
    if (moving) { this.advance(this.avatar, this.avatarPath, animate ? dt * this.caffeine.speed(now / 1000) : 10); this.move(this.avatar); }
    for (const sprite of this.sprites.values()) {
      if (sprite.path.length && this.prefs().walking) { this.advance(sprite.at, sprite.path, animate ? dt : 10); moving = true; }
      else if (!this.prefs().walking) sprite.at = { ...sprite.target };
      const button = this.buttons.get(`worker-${sprite.worker.id}`)!; button.style.left = `${sprite.at.x - 26}px`; button.style.top = `${sprite.at.y - 44}px`;
    }
    if (this.dirty || moving || (animate && [...this.sprites.values()].some(s => s.worker.status === 'working'))) {
      this.draw(animate ? now / 1000 : 0); this.dirty = false;
    }
  };
  private advance(at: Point, path: Point[], dt: number) {
    const point = path[0]; if (!point) return;
    const distance = Math.hypot(point.x - at.x, point.y - at.y), step = dt * 85;
    if (distance <= step) { Object.assign(at, point); path.shift(); }
    else { at.x += (point.x - at.x) / distance * step; at.y += (point.y - at.y) / distance * step; }
  }
  private person(at: Point, seed: string, seated: boolean, time = 0, working = false) {
    if (!this.atlas.complete || !this.atlas.naturalWidth) return;
    const variant = [...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
    const width = this.atlas.naturalWidth / 4, height = this.atlas.naturalHeight / 2;
    const bob = working && time ? Math.round(Math.sin(time * 5)) : 0;
    this.ctx.drawImage(this.atlas, variant * width, seated ? 0 : height, width, height, at.x - 36, at.y - 54 + bob, 72, 90);
  }
  private text(text: string, x: number, y: number, color = '#192a40', size = 13) {
    this.ctx.fillStyle = color; this.ctx.font = `600 ${size}px 'Segoe UI',sans-serif`; this.ctx.textAlign = 'center'; this.ctx.fillText(text, x, y);
  }
  private draw(time: number) {
    const ctx = this.ctx; ctx.clearRect(0, 0, MAP.width, 760);
    if (!this.prefs().furniture) {
      ctx.fillStyle = '#c0aa8d'; ctx.fillRect(0, 0, MAP.width, this.height);
      ctx.strokeStyle = '#ac9577'; ctx.beginPath(); for (let x = 0; x < MAP.width; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, this.height); } for (let y = 0; y < this.height; y += 32) { ctx.moveTo(0, y); ctx.lineTo(MAP.width, y); } ctx.stroke();
    }
    if (this.height > MAP.height) {
      ctx.fillStyle = '#c6ad8b'; ctx.fillRect(0, MAP.height, MAP.width, this.height - MAP.height);
      this.text('ADDITIONAL WORKSPACES', MAP.width / 2, 488, '#35485b');
      for (const desk of DESKS.slice(6)) { const p = seatPosition(desk.id); ctx.fillStyle = '#e3bc84'; ctx.fillRect(p.x - 68, p.y - 55, 136, 39); ctx.fillStyle = '#15344e'; ctx.fillRect(p.x - 35, p.y - 78, 70, 35); ctx.fillStyle = '#4e8dba'; ctx.fillRect(p.x - 31, p.y - 74, 62, 27); ctx.fillStyle = '#243442'; ctx.fillRect(p.x - 23, p.y - 8, 46, 26); }
    }
    if (this.prefs().furniture) {
      this.text('TASKS', 176, 46, '#24364b', 15);
      for (const [i, label] of ['To Do', 'Doing', 'Review', 'Done'].entries()) this.text(label, 92 + i * 56, 67, '#24364b', 11);
      this.text('Issues', 382, 54); this.text('Pull Requests', 499, 54);
    }
    for (const sprite of this.sprites.values()) this.person(sprite.at, sprite.worker.id, true, time, sprite.worker.status === 'working');
    const placed = [this.avatar];
    for (const peer of store.peers.values()) if (store.onMyFloor(peer) && peer.id !== store.you) {
      const at = { x: 120 + (peer.x + 18) * 32, y: 190 + (peer.z + 13) * 8 };
      for (let attempt = 0; attempt < 6 && placed.some(p => Math.hypot(p.x - at.x, p.y - at.y) < 30); attempt++) at.x = Math.min(MAP.width - 35, at.x + 31);
      placed.push(at); this.person(at, peer.id, false);
    }
    if (store.you) this.person(this.avatar, store.you, false);
  }
  dispose() { cancelAnimationFrame(this.raf); this.resize.disconnect(); this.element.remove(); }
}
