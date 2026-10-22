import '../style.css';
import './pixel.css';
import { DESKS, STATIONS, STATION_AGENT, nextFreeSeat } from '../../shared/layout';
import { randomLook } from '../../shared/avatar';
import type { WorkerInfo } from '../../shared/protocol';
import { store, loadProfile, saveProfile, loadSettings, saveSettings } from '../state';
import { h, openModal, closeAllModals, onModalChange, toast, STATUS_LABEL } from '../ui/dom';
import { openPrompt, sendHomeDialog, confirmDialog } from '../ui/prompt';
import { openAsk } from '../ui/ask';
import { openBoard, type BoardActions } from '../ui/boards';
import { openQueue } from '../ui/queue';
import { openMeeting, type MeetingPreset } from '../ui/meeting';
import { openWhiteboard } from '../ui/whiteboard';
import { openElevator } from '../ui/elevator';
import { openBookshelf } from '../ui/bookshelf';
import { openServices } from '../ui/services';
import { openAccounts } from '../ui/accounts';
import { openTeam } from '../ui/team';
import { openSignIns } from '../ui/signins';
import { openSearch } from '../ui/search';
import { openSettings } from '../ui/settings';
import { openCharacter } from '../ui/character';
import { openChanges } from '../ui/changes';
import { openUsage, openAppearance } from './panels';
import { DesktopNotifier } from '../notify';
import { providerLabel, modelBadge } from '../ui/provider';
import { connectOffice } from './adapter';
import { AgentWorkspace } from './workspace';
import { PixelScene, type OfficeAction } from './scene';
import { readAppearance, isNight, type Point } from './model';

const lite = location.pathname.startsWith('/lite');
document.documentElement.classList.add('pixel-document');
document.body.classList.add('pixel-app'); if (lite) document.body.classList.add('lite-app');
let appearanceKey = 'agent-office.pixel.guest';
let prefs = readAppearance(null);
try { prefs = readAppearance(localStorage.getItem(appearanceKey)); } catch { /* browser storage is optional */ }
let settings = loadSettings();
const savedProfile = loadProfile(); store.profile = { name: savedProfile?.name ?? 'Guest', color: savedProfile?.color ?? '#569bd5', look: savedProfile?.look ?? randomLook() };
const shell = h('div.pixel-shell');
const sidebar = h('aside.pixel-sidebar', { 'aria-label': 'Office navigation' });
const main = h('main.pixel-main');
const top = h('header.pixel-topbar');
const connection = h('span.pixel-connection', { role: 'status' }, 'Connecting');
const workerCounts = h('div.pixel-counts');
const title = h('h1', {}, 'Your office, in focus.');
const floorNote = h('p', {}, 'Connecting to your projects…');
const projectSelect = h('select.pixel-project-select', { 'aria-label': 'Current project floor' });
const people = h('div.pixel-people', { 'aria-label': 'Online team members' });
const clock = h('span.pixel-clock');
const activity = h('div.pixel-activity');
const workerList = h('div.pixel-worker-list');
const sceneHost = h('section.pixel-scene-host');
const chatInput = h('input', { 'aria-label': 'Message your team', placeholder: 'Message your team…', maxlength: 500 });
const chatMessages = h('div.pixel-chat-log', { role: 'log', 'aria-live': 'polite' });
const button = (label: string, action: () => void, cls = '') => h('button', { type: 'button', class: `pixel-button ${cls}`, onclick: action }, label);
const iconPaths: Record<string, string> = {
  office: 'M3 21V3h12v18M15 9h6v12M6 7h6M6 11h6M6 15h6M6 19h6',
  floors: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  queue: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  agents: 'M5 7h14v13H5zM12 3v4M8 12h1M15 12h1M8 16h8M2 11v5M22 11v5',
  github: 'M9 19c-4 1-4-2-6-2M15 22v-4c0-1 0-2-1-2 5-1 7-3 7-6 0-2-1-3-2-4 0-1 0-3-1-4-2 0-3 1-4 2-2-1-4-1-6 0-1-1-2-2-4-2-1 1-1 3-1 4-1 1-2 2-2 4 0 3 2 5 7 6-1 1-1 2-1 3v3',
  meeting: 'M4 8h16v10H4zM8 3v3M16 3v3M8 20v2M16 20v2M1 10v6M23 10v6',
  whiteboard: 'M3 4h18v13H3zM12 17v5M8 22h8M7 9h10M7 12h6',
  usage: 'M4 20V10M10 20V4M16 20v-7M22 20V7',
  team: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21v-4c0-5 11-5 11 0v4M13 13c5-1 9 0 9 4v4',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l7 7',
  bell: 'M6 10c0-8 12-8 12 0v5l3 3H3l3-3zM9 21h6',
};
function icon(name: string) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', iconPaths[name] ?? iconPaths.office); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path); return svg; }
let scene: PixelScene | undefined;
const { net, voice } = connectOffice(up => { connection.textContent = up ? 'Live connection' : 'Reconnecting'; connection.classList.toggle('online', up); shell.classList.toggle('offline', !up); }, () => { workspace.close(); scene?.sync(); if (!store.floor) floors(); });
const notifier = new DesktopNotifier(() => settings.notify, id => workspace.open(id));
const workspace = new AgentWorkspace(net, { message: messageWorker, home: homeWorker, pr: openPr }, id => scene?.select(id));
function saveAppearance() { try { localStorage.setItem(appearanceKey, JSON.stringify(prefs)); } catch { toast('Appearance could not be saved in this browser', 'warn'); } applyAppearance(); }
function applyAppearance() { document.body.dataset.lighting = isNight(prefs.mode) ? 'night' : 'day'; document.body.dataset.density = prefs.density; scene?.sync(); }
function overlay(title: string, content: HTMLElement) { return openModal(h('div.modal.pixel-panel', { role: 'dialog', 'aria-label': title }, h('header', {}, h('h2', {}, title)), h('div.body', {}, content))); }
function only(action: () => void) { workspace.close(); closeAllModals(); action(); }
function focusWorker(id: string) { scene?.select(id); toast('Agent highlighted. Select their character or name to open the workspace.'); }
function floors() { openElevator({ net, ride: id => net.send({ t: 'floor.go', floor: id }) }); }
function stepFloor(direction: number) { const floors = store.floors.filter(f => !f.cloning); const index = floors.findIndex(f => f.id === store.floor); const next = floors[(index + direction + floors.length) % floors.length]; if (next) net.send({ t: 'floor.go', floor: next.id }); }
projectSelect.addEventListener('change', () => { if (projectSelect.value) net.send({ t: 'floor.go', floor: projectSelect.value }); });
function hire(deskId = nextFreeSeat(id => !!store.workerAtDesk(id))?.id) {
  if (!store.floor) return floors();
  if (!deskId) return toast('No free seat is available', 'warn');
  const occupied = store.workerAtDesk(deskId);
  if (occupied) return overlay('Occupied desk', h('div', {}, h('h3', {}, occupied.name), h('p', {}, occupied.task?.summary ?? occupied.activity ?? STATUS_LABEL[occupied.status]), button(`Select ${occupied.name}`, () => { closeAllModals(); workspace.open(occupied.id); })));
  const picker = overlay(`Hire at ${deskId}`, h('div.pixel-agent-list', {},
    button('Hire AI agent', () => { picker.close(); openPrompt({ title: `Hire Agent · ${deskId}`, allowEmpty: true, submitLabel: 'Hire agent', providerOption: true, worktreeOption: true, onSubmit: (prompt, opts) => net.send({ t: 'worker.spawn', deskId, prompt: prompt || undefined, ...opts }) }); }),
    button('Open shared shell', () => { picker.close(); net.send({ t: 'worker.spawn', deskId, kind: 'shell' }); }),
    h('p.note', {}, 'The original provider and worktree choices are available when hiring an AI agent. A shared shell opens a real terminal process, without model inference.'),
  ));
}
function messageWorker(id: string) { const w = store.workers.get(id); if (!w) return; openPrompt({ title: `Message ${w.name}`, subtitle: w.status === 'needs_input' ? 'Review the actual terminal prompt before answering.' : undefined, onSubmit: prompt => net.send({ t: 'worker.prompt', workerId: id, prompt }) }); }
function openPr(id: string) { const worker = store.workers.get(id); if (!worker?.worktree) return toast('This worker does not have its own worktree branch', 'warn'); confirmDialog('Create pull request?', 'This pushes the worker branch and asks the existing Office PR workflow to create a pull request.', 'Push and open PR', () => net.send({ t: 'worker.pr', workerId: id })); }
function homeWorker(id: string) {
  const w = store.workers.get(id); if (!w) return;
  if (w.worktree && !w.meeting) return sendHomeDialog({ workerId: id, name: w.name, where: w.deskId, worktree: w.worktree, ask: () => net.send({ t: 'worker.worktree', workerId: id }), onConfirm: cleanup => net.send({ t: 'worker.kill', workerId: id, cleanup }) });
  confirmDialog(`Send ${w.name} home?`, `This stops this worker for everyone${w.meeting ? ' and may stop its meeting' : ''}. Closing the workspace alone does not stop it.`, 'Send home', () => net.send({ t: 'worker.kill', workerId: id }));
}
function meeting(preset?: MeetingPreset) { openMeeting(net, { openTerminal: focusWorker, openPr }, preset); }
function ask(context: string, title: string) {
  const seat = nextFreeSeat(id => !!store.workerAtDesk(id));
  openAsk({ title, context, newDesk: seat?.id, workers: [...store.workers.values()], worktreeOption: true, providerOption: true, onSubmit: (prompt, to, worktree, provider, model, effort) => to ? net.send({ t: 'worker.prompt', workerId: to, prompt }) : seat && net.send({ t: 'worker.spawn', deskId: seat.id, prompt, worktree, provider, model, effort }) });
}
const boardActions: BoardActions = {
  assign: (prompt, title) => ask(prompt, title), ask,
  goToDesk: desk => { const worker = store.workerAtDesk(desk); if (worker) focusWorker(worker.id); },
  queue: (prompt, title, issue, provider, model, effort) => openPrompt({ title, initial: prompt, providerOption: true, onSubmit: (text, choice) => net.send({ t: 'queue.add', prompt: text, issue, provider: choice.provider ?? provider, model: choice.model ?? model, effort: choice.effort ?? effort }) }),
  pickUp: issue => net.send({ t: 'carry', issue: issue.number, title: issue.title }), meeting,
};
function originalSettings() { openSettings(net, settings, next => { settings = next; saveSettings(settings); }, () => openCharacter(false, p => { net.send({ t: 'profile', ...p }); }), () => {}, notifier, () => void logout()); }
async function logout() { voice.leaveVoice(); voice.stopShare(); await fetch('/api/logout', { method: 'POST' }); location.assign('/login?next=/pixel'); }
function team() {
  const content = h('div.pixel-team-content');
  const render = () => {
    const rows = store.me.admin && store.accounts ? store.accounts.accounts.map(a => ({ name: a.name, role: a.role, online: a.online, identity: 'Email not reported' })) : [...store.peers.values()].map(p => ({ name: p.name, role: p.id === store.you ? store.me.account?.role ?? 'admin' : 'Not reported', online: true, identity: 'Email not reported' }));
    const table = h('table.pixel-team-table', {}, h('thead', {}, h('tr', {}, ...['Name', 'Role', 'Status', 'Actions'].map(label => h('th', { scope: 'col' }, label)))), h('tbody', {}, ...rows.map(person => h('tr', {}, h('td', {}, h('div.pixel-team-person', {}, h('span.pixel-human-avatar', { 'aria-hidden': 'true' }), h('span', {}, h('strong', {}, person.name), h('small', {}, person.identity)))), h('td', {}, h('span.role', { class: person.role }, person.role)), h('td', {}, h('span.pixel-presence', { class: person.online ? '' : 'offline' }, h('i.pixel-live-dot'), person.online ? 'Online' : 'Offline')), h('td', {}, store.me.admin ? button('Manage', () => openAccounts(net)) : h('span', {}, '—'))))));
    content.replaceChildren(h('div.pixel-team-heading', {}, h('div', {}, h('h3', {}, 'Users'), h('p', {}, 'Manage team members and their access')), store.me.admin ? button('+ Invite User', () => openAccounts(net), 'primary') : h('span', {}, 'Member access')), table);
    if (!rows.length) content.append(h('p.note', {}, store.me.admin ? store.accounts ? 'No individual accounts yet. Use Invite User to create one.' : 'Loading account records…' : 'No connected users reported.'));
    if (store.me.admin) content.append(h('p.note', {}, 'Account permissions and invitation links are enforced by the original Office server.'));
  };
  const nav = h('nav.pixel-panel-nav', { 'aria-label': 'Team settings' }, button('Profile', profile), button('Users', render, 'active'), button('Projects', floors), button('Usage & Limits', () => openUsage(net, prefs, saveAppearance)), button('Appearance', () => openAppearance(prefs, saveAppearance, originalSettings)), button('Provider sign-ins', () => openSignIns(net)));
  const unsub = [store.on('peers', render), store.on('accounts', render), store.on('me', render)];
  const modal = openModal(h('div.modal.pixel-team-panel', { role: 'dialog', 'aria-label': 'Team Management' }, h('header', {}, h('h2', {}, 'Team Management')), h('div.pixel-team-layout', {}, nav, content), h('footer', {}, button('Connection invitations', () => openTeam(net)), button('Your provider sign-ins', () => openSignIns(net)))), { onClose: () => unsub.forEach(off => off()) });
  if (store.me.admin) net.send({ t: 'accounts.get' }); render(); return modal;
}

function agents() {
  const list = h('div.pixel-agent-list');
  const render = () => list.replaceChildren(...[...store.workers.values()].map(w => button(`${w.name} · ${providerLabel(w.provider, store.project)} · ${STATUS_LABEL[w.status]}`, () => { closeAllModals(); workspace.open(w.id); })), button('Hire another agent', () => hire()));
  const unsub = store.on('workers', render); openModal(h('div.modal.pixel-panel', { role: 'dialog', 'aria-label': 'Agents' }, h('header', {}, h('h2', {}, 'Your agents')), h('div.body', {}, list)), { onClose: unsub }); render();
}
function show3D(feature: string) { overlay(feature, h('div', {}, h('p', {}, `${feature} remains available in the original 3D office. Your workers and projects stay in place when you switch views.`), h('a.pixel-button', { href: '/' }, 'Open 3D office'))); }
function screenSharing() {
  const body = h('div.body'), controls = h('div', { style: 'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap' });
  const log = h('div.pixel-chat-history', { role: 'log', 'aria-live': 'polite' });
  const input = h('input.pixel-chat-input', { 'aria-label': 'Message your team', placeholder: 'Message your team…', maxlength: 500 });
  const media = h('div');
  const renderChat = () => { log.replaceChildren(...store.chat.slice(-30).map(line => h('p', {}, h('strong', {}, `${line.name} `), line.text))); log.scrollTop = log.scrollHeight; };
  input.onkeydown = event => { if (event.key === 'Enter' && input.value.trim()) { net.send({ t: 'chat', text: input.value.trim() }); input.value = ''; } };
  const refresh = () => {
    controls.replaceChildren(button(voice.inVoice ? 'Leave voice' : 'Join voice', () => { if (voice.inVoice) { voice.leaveVoice(); refresh(); } else void voice.joinVoice().then(error => { if (error) toast(error, 'warn'); refresh(); }); }), button(voice.sharing ? 'Stop sharing' : 'Share screen', () => { if (voice.sharing) { voice.stopShare(); refresh(); } else void voice.startShare().then(error => { if (error) toast(error, 'warn'); refresh(); }); }));
    media.replaceChildren();
    for (const [id, stream] of voice.remoteScreens()) { const video = h('video', { autoplay: true, controls: true, playsinline: true, 'aria-label': `${store.peers.get(id)?.name ?? 'Team member'} screen`, style: 'max-width:100%' }); video.srcObject = stream; media.append(video); }
  };
  body.append(controls, log, input, h('p.note', { style: 'margin-top:10px' }, 'Voice and screen sharing use the original Office connections. Capture requires browser permission and a secure context.'), media);
  const off = store.on('chat', renderChat);
  openModal(h('div.modal.pixel-panel', { role: 'dialog', 'aria-label': 'Team Lounge' }, h('header', {}, h('h2', {}, 'Team Lounge · Chat & Voice')), body), { onClose: off }); renderChat(); refresh();
}

function object(id: OfficeAction) {
  only(() => {
    if (id === 'queue') openQueue(net, { openTerminal: focusWorker });
    else if (id === 'issues' || id === 'pulls') openBoard(id, net, boardActions);
    else if (id === 'meeting') meeting();
    else if (id === 'whiteboard') openWhiteboard(net);
    else if (id === 'floors') floors();
    else if (id === 'services') openServices();
    else if (id === 'docs') { if (store.floor) openBookshelf({ floor: store.floor, project: store.project?.name, repoUrl: store.project?.remote, onTurn: () => {} }); else floors(); }
    else if (id === 'dog') { net.send({ t: 'dog.pet' }); toast(`You pet ${store.dog?.name ?? 'the office dog'}`); }
    else if (id === 'gong') net.send({ t: 'gong' });
    else if (id === 'screen') screenSharing();
    else if (id === 'coffee') { const cups = scene?.coffee(); toast(`Coffee ready${cups ? ` · cup ${cups}` : ''}. Walking is quicker for a minute.`); }
    else if (id.startsWith('station-')) {
      const station = STATIONS.find(s => s.id === id)!; const who = STATION_AGENT[station.station!].name;
      openPrompt({ title: `Ask ${who}`, subtitle: 'This uses the original board-agent workflow. Select its character afterward to open its terminal.', onSubmit: prompt => net.send({ t: 'station.prompt', deskId: station.id, prompt }) });
    } else show3D(id === 'pictures' ? 'Wall pictures and decorations' : id === 'signs' ? 'Desk signs' : 'Original worlds and office expansion');
  });
}

const logo = h('a.pixel-brand', { href: lite ? '/lite' : '/pixel' }, h('img', { src: '/assets/pixel/office-bot.svg', alt: '' }), h('span', {}, h('strong', {}, 'PIXEL AGENT OFFICE'), h('small', {}, 'COMMAND CENTER')));
const navItems: [string, string, () => void, string?][] = [
  ['office', 'Office', () => { closeAllModals(); workspace.close(); }, 'office'],
  ['queue', 'Tasks', () => object('queue'), 'queue'], ['agents', 'Agents', agents], ['floors', 'Projects', floors],
  ['github', 'GitHub', () => object('issues')], ['queue', 'Issues', () => object('issues'), 'sub'], ['queue', 'Pull Requests', () => object('pulls'), 'sub'],
  ['meeting', 'Meetings', () => object('meeting')], ['whiteboard', 'Whiteboard', () => object('whiteboard')],
  ['office', 'Services', () => object('services')], ['whiteboard', 'Documentation', () => object('docs')],
  ['usage', 'Usage & Limits', () => openUsage(net, prefs, saveAppearance)], ['team', 'Team', team], ['settings', 'Settings', () => openAppearance(prefs, saveAppearance, originalSettings)],
];
const nav = h('nav.pixel-nav');
navItems.forEach(([name, label, action, kind], index) => {
  const b = button(label, () => { only(action); sidebar.querySelectorAll('.active').forEach(el => el.classList.remove('active')); b.classList.add('active'); shell.classList.remove('sidebar-collapsed'); }, `${index === 0 ? 'active' : ''} ${kind === 'sub' ? 'pixel-subnav' : ''}`);
  b.dataset.navigation = label; b.prepend(icon(name));
  if (kind === 'queue') b.append(h('span.pixel-nav-count', { 'data-queue-count': '' }));
  nav.append(b);
});
sidebar.append(nav, h('div.pixel-sidebar-footer', {}, button('Explore 3D ↗', () => show3D('All original Office spaces'))));
function profile() { overlay('Your profile', h('div', {}, h('p', {}, store.me.account ? `${store.me.account.name} · ${store.me.account.role}` : 'Shared-password administrator session'), button('Edit character', () => openCharacter(false, p => net.send({ t: 'profile', ...p }))), button('Provider sign-ins', () => openSignIns(net)), button('Original settings', originalSettings), button('Sign out', () => void logout()))); }
const views = h('nav.pixel-view-switch', { 'aria-label': 'Interface view' }, ...[['/', '3D'], ['/pixel', 'Pixel'], ['/lite', 'Lite']].map(([url, label]) => h('a', { href: url, 'aria-current': (lite ? url === '/lite' : url === '/pixel') ? 'page' : null }, label)));
const collapse = button('☰', () => shell.classList.toggle('sidebar-collapsed'), 'pixel-menu-toggle'); collapse.setAttribute('aria-label', 'Toggle navigation');
const projectName = h('strong', {}, 'Connecting…');
const projectPicker = button('', floors, 'pixel-project-picker'); projectPicker.setAttribute('aria-label', 'Choose project'); projectPicker.append(h('span', {}, h('small', {}, 'Project'), projectName), h('span', {}, '⌄'));
const floorNumber = h('small', {}, 'Floor');
const floorControl = h('div.pixel-floor-picker', {}, button('‹', () => stepFloor(-1)), h('label', {}, floorNumber, projectSelect), button('›', () => stepFloor(1)));
floorControl.querySelector('button')!.setAttribute('aria-label', 'Previous floor'); floorControl.querySelectorAll('button')[1].setAttribute('aria-label', 'Next floor');
const searchButton = button('', () => only(() => openSearch(focusWorker)), 'pixel-search-button'); searchButton.append(icon('search'), h('span', {}, 'Search agents, tasks, files…'), h('kbd', {}, 'Ctrl+K')); searchButton.setAttribute('aria-label', 'Search agents, tasks, files');
const notifications = button('', () => only(() => {
  const list = h('div.pixel-alert-list', {}, ...[...store.workers.values()].filter(w => w.status === 'needs_input' || (w.status === 'done' && !w.acked)).map(w => button(`${w.name} · ${STATUS_LABEL[w.status]}`, () => focusWorker(w.id))));
  if (!list.children.length) list.append(h('p', {}, 'No agents need your attention.')); overlay('Notifications', list);
}), 'pixel-notifications'); notifications.setAttribute('aria-label', 'Notifications'); notifications.append(icon('bell'), h('span.pixel-alert-count'));
const lighting = button('', () => { prefs.mode = isNight(prefs.mode) ? 'day' : 'night'; saveAppearance(); }, 'pixel-lighting'); lighting.setAttribute('aria-label', 'Day / Night'); lighting.append(h('span', {}, '☀'), h('span', {}, 'Day / Night'));
const profileName = h('strong', {}, store.profile.name), profileRole = h('small', {}, 'Admin');
const profileButton = button('', profile, 'pixel-profile-button'); profileButton.setAttribute('aria-label', 'Profile'); profileButton.append(h('span.pixel-human-avatar'), h('span', {}, profileName, profileRole), h('span', {}, '⌄'));
const usageButton = button('Usage', () => only(() => openUsage(net, prefs, saveAppearance)), 'pixel-usage-button'); usageButton.prepend(h('i.pixel-live-dot'));
const onlineLabel = h('span.pixel-online-count');
top.append(logo, connection, collapse, projectPicker, floorControl, views, searchButton, h('div.pixel-online', {}, people, onlineLabel), usageButton, notifications, lighting, profileButton);
const sceneBar = h('div.pixel-scene-bar', {}, h('span', {}, 'Connection lost · reconnecting'), workerCounts);
const helpButton = button('?', () => onboard(true)); helpButton.setAttribute('aria-label', 'Office help');
const sceneBottom = h('div.pixel-scene-controls', {}, button('−', () => scene?.zoomBy(.85)), button('Fit', () => scene?.reset()), button('+', () => scene?.zoomBy(1.15)), helpButton);
sceneBottom.setAttribute('aria-label', 'Office view controls');
sceneHost.append(sceneBar);
if (lite) sceneHost.append(workerList); else { scene = new PixelScene(() => prefs, object, id => workspace.open(id), hire, move); sceneHost.append(scene.element); }
sceneHost.append(sceneBottom);
const liteHeader = h('div.pixel-lite-heading', {}, title, floorNote);
const page = h('div.pixel-page', {}, ...(lite ? [liteHeader] : []), sceneHost);
main.append(top, page, h('footer.pixel-statusbar', {}, clock, button('Restore selected workspace', () => workspace.restore())));
shell.append(sidebar, main); document.getElementById('pixel-root')!.append(shell);
onModalChange(open => { if (!open) { sidebar.querySelectorAll('.active').forEach(el => el.classList.remove('active')); sidebar.querySelector('[data-navigation="Office"]')?.classList.add('active'); scene?.select(null); } });

function move(at: Point) { const x = Math.max(-17, Math.min(17, (at.x - 120) / 32 - 18)), z = Math.max(-12, Math.min(12, (at.y - 190) / 8 - 13)); net.send({ t: 'move', x, y: 0, z, rotY: 0, moving: false }); }
function render() {
  profileName.textContent = store.me.account?.name ?? store.profile.name;
  profileRole.textContent = store.me.account?.role ?? 'Admin';
  projectName.textContent = store.project?.name ?? 'Choose project';
  const floorIndex = store.floors.findIndex(f => f.id === store.floor);
  floorNumber.textContent = floorIndex >= 0 ? `Floor ${floorIndex + 1}` : 'Floor';
  onlineLabel.textContent = `${store.peers.size} online`;
  sidebar.querySelector('[data-queue-count]')!.textContent = String(store.queue.tasks.filter(t => t.status === 'queued').length);
  title.textContent = store.project ? `${store.project.name}, in focus.` : 'Your office, in focus.';
  floorNote.textContent = store.project ? `${store.currentFloor()?.repo ?? store.project.dir}  /  ${store.project.branch ?? 'No branch reported'}` : 'Choose a project in the elevator to get started.';
  const existingValue = projectSelect.value; projectSelect.replaceChildren(...store.floors.filter(f => !f.cloning).map(f => h('option', { value: f.id }, `${f.name}${f.waiting ? ` · ${f.waiting} waiting` : ''}`))); projectSelect.value = store.floor ?? existingValue;
  const workers = [...store.workers.values()]; const busy = workers.filter(w => w.status === 'working' || w.status === 'starting').length, waiting = workers.filter(w => w.status === 'needs_input').length;
  const attention = workers.filter(w => w.status === 'needs_input' || (w.status === 'done' && !w.acked)).length;
  const alertCount = notifications.querySelector<HTMLElement>('.pixel-alert-count')!; alertCount.textContent = attention ? String(attention) : ''; alertCount.hidden = !attention;
  workerCounts.replaceChildren(h('span', {}, `${workers.length} agents`), h('span', { class: 'working' }, `${busy} working`), h('span', { class: 'waiting' }, `${waiting} need input`));
  people.replaceChildren(...[...store.peers.values()].slice(0, 4).map(p => h('button.pixel-face', { type: 'button', title: `${p.name} · human`, 'aria-label': `Team member ${p.name}`, style: `--person:${p.color}`, onclick: team }, p.name.slice(0, 2).toUpperCase())));
  scene?.sync();
  workerList.replaceChildren(...workers.map(w => button(`${w.name} · ${providerLabel(w.provider, store.project)} · ${STATUS_LABEL[w.status]}${w.task ? ` · ${w.task.name}` : ''}`, () => workspace.open(w.id))), button('+ Hire agent', () => hire()));
  activity.replaceChildren(...workers.slice(0, 5).map(w => h('button.pixel-activity-row', { type: 'button', onclick: () => workspace.open(w.id) }, h('span.pixel-status-dot', { 'data-status': w.status }), h('strong', {}, w.name), h('span', {}, w.task?.name ?? w.activity ?? STATUS_LABEL[w.status]), h('small', {}, STATUS_LABEL[w.status]))));
  if (!workers.length) activity.append(h('p.pixel-empty', {}, 'A fresh canvas for your team.', h('small', {}, 'Hire your first agent or add work to the task queue.')));
  document.title = `${waiting ? `(${waiting}) ` : ''}${store.project?.name ?? 'Agent Office'} · ${lite ? 'Lite' : 'Pixel'}`;
  notifier.sync(store.workers);
}
for (const topic of ['workers', 'floors', 'floor', 'project', 'peers', 'queue', 'meeting', 'me'] as const) store.on(topic, render);
store.on('me', () => { const key = `agent-office.pixel.${store.me.account?.name ?? 'shared'}`; if (key !== appearanceKey) { appearanceKey = key; try { prefs = readAppearance(localStorage.getItem(key)); } catch { prefs = readAppearance(null); } applyAppearance(); } });
store.on('chat', () => { chatMessages.replaceChildren(...store.chat.slice(-3).map(c => h('p', {}, h('b', {}, c.name, ' '), c.text))); chatMessages.scrollTop = chatMessages.scrollHeight; });
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && chatInput.value.trim()) { net.send({ t: 'chat', text: chatInput.value.trim() }); chatInput.value = ''; } });
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); only(() => openSearch(focusWorker)); } });
const updateClock = () => { clock.textContent = new Date().toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }); if (prefs.mode === 'auto') applyAppearance(); }; updateClock(); setInterval(updateClock, 60_000);
function onboard(show = false) {
  if (!show) return;
  main.querySelector('.pixel-onboarding')?.remove();
  const dismiss = () => { try { localStorage.setItem('agent-office.pixel.onboarded', '1'); } catch { /* optional preference */ } card.remove(); };
  const card = h('aside.pixel-onboarding', { role: 'region', 'aria-label': 'Pixel Office tips' }, h('b', {}, 'Welcome to your Pixel Office'), h('p', {}, 'Select an agent for their terminal. Boards, the meeting room, whiteboard, and elevator open the real Office workflows. Usage and Team are in the navigation.'), button('Got it', dismiss)); main.append(card);
}
async function start() {
  const who = await fetch('/api/whoami', { credentials: 'same-origin' }); if (who.status === 401) { location.assign(`/login?next=${lite ? '/lite' : '/pixel'}`); return; }
  if (!who.ok) { toast('Could not verify your session. Reconnect and try again.', 'error'); return; }
  if (!savedProfile) {
    const input = h('input', { 'aria-label': 'Your name', required: true, maxlength: 24, placeholder: 'Your name' });
    const form = h('form.modal.pixel-panel', {}, h('header', {}, h('h2', {}, 'Make yourself at home')), h('div.body', {}, h('label.pixel-field', {}, 'Your name', input), h('p', {}, 'Choose a name for human presence and shared terminals. Your authenticated account permissions stay the same.')), h('footer', {}, h('button.btn.primary', { type: 'submit' }, 'Enter office')));
    const modal = openModal(form, { escCloses: false, backdropCloses: false });
    form.addEventListener('submit', event => { event.preventDefault(); if (!input.value.trim()) return; store.profile.name = input.value.trim(); saveProfile(store.profile); modal.close(); net.connect(); onboard(); });
  } else { net.connect(); onboard(); }
}
applyAppearance(); render(); void start().catch(error => toast(`Could not connect: ${String(error)}`, 'error'));
