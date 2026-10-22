import { store } from '../state';
import type { Net } from '../net';
import { h, openModal } from '../ui/dom';
import { fmtReset } from '../ui/limits';
import { remainingQuota, unlimitedFor, unlimitedKey, type Appearance } from './model';

export function openUsage(net: Net, prefs: Appearance, changed: () => void) {
  const body = h('div.body.pixel-usage');
  const render = () => {
    const state = store.limits;
    const workers = [...store.workers.values()].filter(w => w.kind === 'agent');
    const claude = h('section.pixel-account-card', {}, h('div.pixel-eyebrow', {}, 'SHARED SUBSCRIPTION'), h('h3', {}, `Claude ${state.plan ?? ''}`), h('p.note', {}, 'One balance for the connected account, shared across its sessions. Worker token totals are not subscription allowances.'));
    if (!state.windows.length) claude.append(h('p.pixel-unavailable', {}, 'Usage balance unavailable'));
    for (const window of state.windows) {
      const pct = remainingQuota(window.pct);
      claude.append(h('div', {}, h('div.pixel-quota-row', {}, h('b', {}, window.label), h('strong', {}, pct === null ? 'Unavailable' : `${Math.round(pct)}% remaining`)), pct === null ? null : h('progress', { value: pct, max: 100, 'aria-label': `${window.label} remaining` }), h('p.note', {}, window.resetsAt ? `Resets ${fmtReset(window.resetsAt)} · ${new Date(window.resetsAt).toLocaleString()}` : 'Reset time not reported')));
    }
    claude.append(h('p.note', {}, state.at ? `Read at ${new Date(state.at).toLocaleString()}. Account identity is not exposed by this limits feed.` : 'Waiting for the provider limits feed.'), h('p.note', {}, `Visible Claude workers: ${workers.filter(w => w.provider === 'claude').map(w => w.name).join(', ') || 'None'}. Their account association is not reported by the worker API.`));
    body.replaceChildren(claude);
    for (const provider of ['codex', 'opencode', 'custom'] as const) {
      const running = workers.filter(w => w.provider === provider);
      if (!running.length && provider !== 'codex') continue;
      const card = h('section.pixel-account-card', {}, h('div.pixel-eyebrow', {}, 'PROVIDER'), h('h3', {}, provider === 'codex' ? 'Codex / ChatGPT' : provider === 'opencode' ? 'OpenCode / your model' : 'Custom provider'), h('p', {}, 'Usage balance unavailable'));
      for (const worker of running) card.append(h('p', {}, `${worker.name} · ${worker.model ?? 'default model'} · ${unlimitedFor(worker, prefs) ? '∞ Unlimited (user-configured quota policy)' : 'Usage balance unavailable'}`));
      card.append(h('p.note', {}, 'Connection health is not reported by this provider feed. Session usage remains available in each agent workspace.'));
      body.append(card);
    }
    const models = new Map(workers.flatMap(w => { const key = unlimitedKey(w.provider, w.model); return key ? [[key, w.model!] as const] : []; }));
    if (models.size) {
      const section = h('section.pixel-account-card', {}, h('h3', {}, 'My own model'), h('p.note', {}, 'Declare no subscription quota only for your own server. This changes the display, not the provider adapter or limits.'));
      for (const [key, model] of models) {
        const check = h('input', { type: 'checkbox' }); check.checked = prefs.unlimitedModels.includes(key);
        check.addEventListener('change', () => { prefs.unlimitedModels = check.checked ? [...new Set([...prefs.unlimitedModels, key])] : prefs.unlimitedModels.filter(k => k !== key); changed(); render(); });
        section.append(h('label.pixel-check', {}, check, `${model} has no subscription quota`));
      }
      body.append(section);
    }
  };
  const refresh = h('button.btn', { type: 'button', onclick: () => net.send({ t: 'limits.refresh' }) }, 'Refresh limits');
  const unsub = [store.on('limits', render), store.on('workers', render)];
  openModal(h('div.modal.pixel-panel', { role: 'dialog', 'aria-label': 'Agent Usage & Limits' }, h('header', {}, h('h2', {}, 'Agent Usage & Limits'), refresh), body), { onClose: () => unsub.forEach(fn => fn()) });
  render();
}

export function openAppearance(prefs: Appearance, changed: () => void, original: () => void) {
  const body = h('div.body.pixel-preferences');
  const select = (label: string, values: string[], value: string, update: (s: string) => void) => {
    const input = h('select', { 'aria-label': label }, ...values.map(v => h('option', { value: v }, v))); input.value = value;
    input.addEventListener('change', () => { update(input.value); changed(); }); body.append(h('label.pixel-field', {}, label, input));
  };
  select('Lighting', ['day', 'night', 'auto'], prefs.mode, value => prefs.mode = value as Appearance['mode']);
  select('Hover hints', ['full', 'minimal', 'off'], prefs.hints, value => prefs.hints = value as Appearance['hints']);
  select('UI density', ['comfortable', 'compact'], prefs.density, value => prefs.density = value as Appearance['density']);
  const scale = h('input', { type: 'range', min: .6, max: 2, step: .1, value: prefs.scale, 'aria-label': 'Pixel scale' });
  scale.addEventListener('input', () => { prefs.scale = Number(scale.value); changed(); }); body.append(h('label.pixel-field', {}, 'Pixel scale', scale));
  for (const [key, title] of [['animation', 'Animate live statuses'], ['walking', 'Walking animations'], ['furniture', 'Show furniture'], ['names', 'Agent name labels'], ['status', 'Agent status indicators'], ['reducedMotion', 'Reduce motion']] as const) {
    const input = h('input', { type: 'checkbox' }); input.checked = prefs[key];
    input.addEventListener('change', () => { prefs[key] = input.checked; changed(); }); body.append(h('label.pixel-check', {}, input, title));
  }
  body.append(h('p.note', {}, 'Appearance is saved for this user in this browser. Automatic lighting uses your local clock. System reduced-motion settings are also respected.'));
  openModal(h('div.modal.pixel-panel', { role: 'dialog', 'aria-label': 'Pixel appearance' }, h('header', {}, h('h2', {}, 'Pixel appearance')), body, h('footer', {}, h('button.btn', { type: 'button', onclick: original }, 'Open original Office settings'))));
}
