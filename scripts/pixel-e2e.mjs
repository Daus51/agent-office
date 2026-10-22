// Integration checks against an isolated real Office backend. No provider inference is requested.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import WebSocket from 'ws';
import { loadConfig } from '../dist/server/server/config.js';
import { startServer } from '../dist/server/server/server.js';
import { Building } from '../dist/server/server/building.js';

const root = mkdtempSync(path.join(tmpdir(), 'pixel-office-e2e-'));
// The test runner may set SHELL to PowerShell; the original Windows shell path expects COMSPEC.
if (process.platform === 'win32') delete process.env.SHELL;
const shots = path.resolve(process.env.PIXEL_SCREENSHOTS || 'verification/pixel');
mkdirSync(shots, { recursive: true });
const password = randomBytes(24).toString('hex');
const cfg = loadConfig(['--home', root, '--port', '4717', '--password', password, '--no-open']);
const building = new Building(cfg.dataDir, path.join(root, 'projects'));
for (const name of ['alpha-project', 'beta-project']) {
  const dir = path.join(root, name); mkdirSync(dir);
  execFileSync('git', ['init', '-q', dir]);
  writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  execFileSync('git', ['-C', dir, 'add', 'README.md']);
  execFileSync('git', ['-C', dir, '-c', 'user.name=Office Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Initial test project']);
  building.ensureLocal(dir, 'isolated integration test');
}
const office = await startServer(cfg);
const base = 'http://127.0.0.1:4717';
const sockets = [];
let browser;
let passed = false;
const checks = [];
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
function wire(cookie, floor) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?name=Verifier&floor=${floor || ''}`, { headers: { Origin: base, Cookie: cookie } });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  const send = data => ws.send(JSON.stringify(data));
  const wait = async (predicate, start = 0) => {
    const until = Date.now() + 30000;
    while (Date.now() < until) { const value = messages.slice(start).find(predicate); if (value) return value; await new Promise(r => setTimeout(r, 50)); }
    throw new Error('Timed out waiting for Office protocol: ' + predicate.toString());
  };
  sockets.push(ws); return { ws, messages, send, wait };
}
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/pixel`);
  assert.ok(page.url().includes('/login?next=/pixel'));
  await page.screenshot({ path: path.join(shots, 'login.png'), fullPage: true });
  await page.locator('#password').fill(password);
  await page.locator('#submit').click();
  await page.getByLabel('Your name', { exact: true }).fill('Verifier');
  await page.getByRole('button', { name: 'Enter office', exact: true }).click();
  await page.getByText('Live connection', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  check('login returns to Pixel and connects to existing backend');
  assert.equal(await page.locator('.xterm, iframe').count(), 0);
  await page.locator('.pixel-nav').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Lighting', { exact: true }).selectOption('night');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(shots, 'office-night.png'), fullPage: true });
  check('default office has no terminal or browser preview');
  const cookies = await context.cookies();
  const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const a = wire(cookie); const welcome = await a.wait(m => m.t === 'welcome');
  assert.equal(welcome.floors.length, 2);
  const floor = welcome.floor;
  a.send({ t: 'accounts.invite', name: 'Pixel Member', role: 'member' });
  const invitation = await a.wait(m => m.t === 'accounts.invited');
  assert.ok(invitation.invite, invitation.error);
  const memberContext = await browser.newContext();
  const joined = await memberContext.request.post(`${base}/api/join`, { data: { token: invitation.invite.token, name: 'Pixel Member', password: randomBytes(20).toString('hex') } });
  assert.equal(joined.status(), 200);
  const memberCookie = (await memberContext.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
  const b = wire(memberCookie, floor); const memberWelcome = await b.wait(m => m.t === 'welcome');
  assert.equal(memberWelcome.me.admin, false);
  b.send({ t: 'accounts.invite', role: 'admin' });
  await b.wait(m => m.t === 'toast' && m.level === 'warn');
  a.send({ t: 'wb.open' }); b.send({ t: 'wb.open' });
  const shape = { id: 'pixel-integration-shape', type: 'rectangle', version: 1, versionNonce: 1, x: 30, y: 30, width: 100, height: 80 };
  a.send({ t: 'wb.update', elements: [shape] });
  await b.wait(m => m.t === 'wb.update' && m.elements.some(e => e.id === shape.id && e.version === 1));
  b.send({ t: 'wb.update', elements: [{ ...shape, version: 2, versionNonce: 2, x: 150 }] });
  await a.wait(m => m.t === 'wb.update' && m.elements.some(e => e.id === shape.id && e.version === 2));
  a.send({ t: 'wb.close' }); b.send({ t: 'wb.close' });
  check('two authenticated users collaborate on the real whiteboard; member cannot invite admins');
  a.send({ t: 'queue.limit', maxWorkers: 0 });
  a.send({ t: 'queue.add', title: 'Integration test task', prompt: 'Isolated queue persistence test' });
  await a.wait(m => m.t === 'queue' && m.state.tasks.some(t => t.title === 'Integration test task'));
  check('real scheduler accepts and stores queued task while paused');
  await page.locator('[data-object="queue"]').click();
  await page.getByText('Integration test task', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(shots, 'task-board.png'), fullPage: true });
  await page.keyboard.press('Escape');
  a.send({ t: 'worker.spawn', deskId: 'desk-1', kind: 'shell' });
  const update = await a.wait(m => m.t === 'worker.update');
  const worker = update.worker;
  await page.locator(`[data-object="worker-${worker.id}"]`).waitFor();
  assert.equal(await page.locator('.xterm').count(), 0);
  await page.locator(`[data-object="worker-${worker.id}"]`).click();
  await page.locator('.pixel-workspace .xterm').waitFor();
  await page.screenshot({ path: path.join(shots, 'agent-workspace.png'), fullPage: true });
  check('deliberate agent selection opens the correct live shell terminal');
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  assert.equal(await page.locator('.xterm').count(), 0);
  await page.getByRole('button', { name: 'Restore selected workspace', exact: true }).click();
  await page.locator('.pixel-workspace .xterm').waitFor();
  await page.keyboard.press('Escape');
  const marker = 'PIXEL_SHELL_STILL_RUNNING';
  const from = a.messages.length;
  a.send({ t: 'worker.attach', workerId: worker.id });
  await a.wait(m => m.t === 'term.snapshot' && m.workerId === worker.id, from);
  a.send({ t: 'term.input', workerId: worker.id, data: `echo ${marker}\r` });
  await a.wait(() => a.messages.slice(from).filter(m => m.workerId === worker.id && (m.t === 'term.data' || m.t === 'term.snapshot')).map(m => m.data).join('').includes(marker), from);
  check('closing and minimizing workspace preserve a responsive worker process');
  a.send({ t: 'term.input', workerId: worker.id, data: `node -e "require('http').createServer((q,s)=>s.end('Pixel live preview')).listen(4817,'127.0.0.1')"\r` });
  await a.wait(m => m.t === 'services' && m.state.items.some(s => s.workerId === worker.id && s.port === 4817));
  await page.locator(`[data-object="worker-${worker.id}"]`).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: /Preview .*:4817/ }).click();
  await page.frameLocator('.pixel-preview iframe').getByText('Pixel live preview', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(shots, 'agent-preview.png'), fullPage: true });
  await page.keyboard.press('Escape');
  check('worker-owned discovered service renders only after explicit preview selection');
  const select = page.getByLabel('Current project floor');
  const other = welcome.floors.find(f => f.id !== floor).id;
  await select.selectOption(other);
  await page.waitForFunction(id => document.querySelector('select.pixel-project-select').value === id, other);
  await select.selectOption(floor);
  await page.locator(`[data-object="worker-${worker.id}"]`).waitFor();
  await page.reload(); await page.getByText('Live connection', { exact: true }).waitFor();
  await page.locator(`[data-object="worker-${worker.id}"]`).waitFor();
  assert.equal(await page.locator('.xterm, iframe').count(), 0);
  check('floor switching and frontend reload preserve worker identity without reopening terminal');
  for (const [name, action] of [
    ['meeting', () => page.locator('[data-object="meeting"]').click()],
    ['whiteboard', () => page.locator('[data-object="whiteboard"]').click()],
    ['usage', () => page.getByRole('button', { name: 'Usage & Limits', exact: true }).click()],
    ['team', () => page.locator('.pixel-nav').getByRole('button', { name: 'Team', exact: true }).click()],
    ['settings', () => page.locator('.pixel-nav').getByRole('button', { name: 'Settings', exact: true }).click()],
    ['floors', () => page.locator('[data-object="floors"]').click()],
  ]) {
    await action(); await page.locator('#modal-root > *').waitFor();
    if (name === 'whiteboard') await page.locator('.excalidraw').waitFor();
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
    await page.keyboard.press('Escape'); check(`${name} opens original workflow`);
  }
  await page.getByRole('button', { name: 'Day / Night', exact: true }).click();
  assert.equal(await page.locator('body').getAttribute('data-lighting'), 'day');
  await page.screenshot({ path: path.join(shots, 'office-day.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(shots, 'mobile.png'), fullPage: true });
  check('mobile layout fits viewport');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${base}/lite`); await page.getByText('Live connection', { exact: true }).waitFor();
  assert.equal(await page.locator('.xterm, iframe').count(), 0);
  check('Lite uses same authenticated backend without auto terminal');
  await page.goto(`${base}/`); await page.locator('canvas').first().waitFor();
  check('original 3D entry still loads');
  assert.deepEqual(errors, []);
  passed = true;
  writeFileSync(path.join(shots, 'results.json'), JSON.stringify({ checks, errors, fixture: root }, null, 2));
} finally {
  for (const ws of sockets) ws.close();
  await browser?.close(); office.shutdown();
  setTimeout(() => process.exit(passed ? 0 : 1), 500);
}
