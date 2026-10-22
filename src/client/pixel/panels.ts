import { store } from '../state';
import type { Net } from '../net';
import { h, openModal } from '../ui/dom';
import { fmtReset } from '../ui/limits';
import { DEFAULT_APPEARANCE, remainingQuota, unlimitedFor, unlimitedKey, type Appearance } from './model';

function providerHeading(name: string, mark: string) {
  return h('div.pixel-provider-heading', {}, h('span.provider-mark', { 'aria-hidden': 'true' }, mark), h('h3', {}, name));
}
function quotaPolicy(prefs: Appearance, changed: () => void) {
  const known = [...new Set([...prefs.unlimitedModels.map(m => m.slice('opencode:'.length)), ...[...store.workers.values()].filter(w => w.provider === 'opencode' && w.model).map(w => w.model!)])];
  const model = h('input', { type: 'text', required: true, maxlength: 200, placeholder: 'provider/model-name', 'aria-label': 'OpenCode model ID' }); model.value = known[0] ?? '';
  const unlimited = h('input', { type: 'checkbox' }); unlimited.checked = prefs.unlimitedModels.includes(`opencode:${model.value}`);
  const error = h('p', { role: 'alert' });
  const form = h('form.modal.pixel-panel', {}, h('header', {}, h('h2', {}, 'My custom model')), h('div.pixel-policy-form', {}, h('p', {}, 'Use your existing OpenCode model connection. Declare whether your own model has no subscription quota.'), h('label.pixel-field', {}, 'OpenCode model ID', model), h('label.pixel-check', {}, unlimited, 'My model has no subscription quota'), h('p.note', {}, 'This sets a display policy. Provider endpoint and authentication remain in the existing OpenCode configuration. It does not create a connection or disable provider enforcement.'), error), h('footer', {}, h('button.btn.primary', { type: 'submit' }, 'Save model policy')));
  const modal = openModal(form);
  form.addEventListener('submit', event => {
    event.preventDefault(); const id = model.value.trim();
    if (!id || /\s/.test(id)) { error.textContent = 'Enter the exact configured OpenCode model ID.'; return; }
    const key = unlimitedKey('opencode', id)!;
    prefs.unlimitedModels = unlimited.checked ? [...new Set([...prefs.unlimitedModels, key])] : prefs.unlimitedModels.filter(v => v !== key);
    changed(); modal.close();
  });
}
export function openUsage(net: Net, prefs: Appearance, changed: () => void) {
  const body = h('div.body.pixel-usage');
  const render = () => {
    const state = store.limits, workers = [...store.workers.values()].filter(w => w.kind === 'agent');
    const claude = h('section.pixel-account-card.claude', {}, providerHeading(`Claude ${state.plan ? state.plan[0].toUpperCase() + state.plan.slice(1) : ''}`, 'AI'));
    claude.append(h('span.pixel-eyebrow', {}, store.me.account ? 'YOUR CONNECTED ACCOUNT' : 'OFFICE SUBSCRIPTION'));
    if (!state.windows.length) claude.append(h('p.pixel-unavailable', {}, 'Usage balance unavailable'));
    for (const window of state.windows) {
      const remaining = remainingQuota(window.pct);
      const progress = h('progress', { value: remaining ?? 0, max: 100, 'aria-label': `${window.label} remaining` });
      if (/week/i.test(window.label)) progress.classList.add('weekly');
      claude.append(h('div', {}, h('div.pixel-quota-row', {}, h('b', {}, window.label), h('strong', {}, remaining === null ? 'Unavailable' : `${Math.round(remaining)}% remaining`)), remaining === null ? null : progress, h('p.reset-note', {}, window.resetsAt ? `Resets ${fmtReset(window.resetsAt)}` : 'Reset not reported')));
    }
    claude.append(h('p.note', {}, state.at ? `Read ${new Date(state.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. One balance across the connected account's sessions.` : 'Waiting for the provider limits feed.'), h('p.note', {}, 'Account identity and worker-to-account association are not reported by this feed.'));
    const codex = h('section.pixel-account-card.codex', {}, providerHeading('ChatGPT / Codex', '◎'), h('span.pixel-eyebrow', {}, 'SUBSCRIPTION'), h('p.pixel-unavailable', {}, 'Usage balance unavailable'), h('p.note', {}, 'The connected Office backend does not expose a Codex subscription balance. Token totals are not a remaining allowance.'));
    const opencode = workers.filter(w => w.provider === 'opencode');
    const declared = prefs.unlimitedModels.map(v => v.slice('opencode:'.length));
    const custom = h('section.pixel-account-card.custom', {}, providerHeading('My Custom Model', '▤'), h('span.pixel-eyebrow', {}, 'OPENCODE'));
    if (declared.length) {
      custom.append(h('p.pixel-unlimited', {}, '∞ Unlimited'), h('p.note', {}, 'User-configured quota policy'));
      for (const model of declared) custom.append(h('p', {}, model));
    } else custom.append(h('p.pixel-unavailable', {}, 'Usage balance unavailable'));
    for (const worker of opencode) custom.append(h('p', {}, `${worker.name} · ${worker.model ?? 'default model'}${unlimitedFor(worker, prefs) ? ' · Unlimited' : ''}`));
    custom.append(h('p.note', {}, opencode.length ? 'Model session reported. Connection capacity is not reported.' : 'No active OpenCode model is reported.'), h('button.btn', { type: 'button', onclick: () => quotaPolicy(prefs, () => { changed(); render(); }) }, 'Manage model'));
    body.replaceChildren(claude, codex, custom);
    const others = workers.filter(w => w.provider === 'custom');
    if (others.length) body.append(h('section.pixel-account-card', {}, providerHeading('Other Models', '✦'), h('p.pixel-unavailable', {}, 'Usage balance unavailable'), ...others.map(w => h('p', {}, `${w.name} · ${w.model ?? 'default model'}`)), h('p.note', {}, 'Connection and subscription balances are not exposed by this adapter.')));
  };
  const nav = h('nav.pixel-panel-nav', { 'aria-label': 'Usage navigation' }, h('button.pixel-button.active', { type: 'button', onclick: render }, '◴  Usage'), h('button.pixel-button', { type: 'button', onclick: () => quotaPolicy(prefs, () => { changed(); render(); }) }, '+  My Model'));
  const refresh = h('button.btn', { type: 'button', onclick: () => net.send({ t: 'limits.refresh' }) }, '↻ Refresh All');
  const unsub = [store.on('limits', render), store.on('workers', render)];
  openModal(h('div.modal.pixel-usage-panel', { role: 'dialog', 'aria-label': 'Agent Usage & Limits' }, h('header', {}, h('div', {}, h('h2', {}, 'Agent Usage & Limits'), h('p.note', {}, 'View your AI provider usage, limits and availability')), refresh), h('div.pixel-usage-layout', {}, nav, body)), { onClose: () => unsub.forEach(fn => fn()) }); render();
}

export function openAppearance(prefs: Appearance, changed: () => void, original: () => void) {
  const draft: Appearance = { ...prefs, unlimitedModels: [...prefs.unlimitedModels] };
  const content = h('div.pixel-preferences'); const nav = h('nav.pixel-panel-nav', { 'aria-label': 'Settings sections' });
  let section = 'General';
  const select = (label: string, values: string[], value: string, update: (value: string) => void) => {
    const input = h('select', { 'aria-label': label }, ...values.map(v => h('option', { value: v }, v))); input.value = value; input.onchange = () => update(input.value);
    return h('label.pixel-field', {}, label, input);
  };
  const segmented = (label: string, values: string[], value: string, update: (value: string) => void) => {
    const group = h('div.pixel-segment', { role: 'group', 'aria-label': label });
    values.forEach(v => { const b = h('button', { type: 'button', class: v === value ? 'active' : '', 'aria-pressed': v === value, onclick: () => { update(v); group.querySelectorAll('button').forEach(button => { const active = button === b; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); } }, v[0].toUpperCase() + v.slice(1)); group.append(b); });
    return h('label.pixel-field', {}, label, group);
  };
  const render = () => {
    content.replaceChildren(h('h3', {}, section), h('p', {}, section === 'General' ? 'Basic workspace settings and preferences.' : 'Customize your Pixel Agent Office experience.'));
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.textContent === section));
    if (section === 'General') {
      const project = h('input', { readonly: true, value: store.project?.name ?? 'Choose a project in the elevator', 'aria-label': 'Workspace name' });
      const branch = h('input', { readonly: true, value: store.project?.branch ?? 'Not reported', 'aria-label': 'Project branch' });
      content.append(h('div.pixel-preferences-grid', {}, h('label.pixel-field', {}, 'Workspace', project), h('label.pixel-field', {}, 'Current branch', branch)), h('p.note', {}, 'Projects and floors keep their existing Office names and storage. Use the elevator to select a different project.'));
    }
    if (section === 'General' || section === 'Appearance') {
      const scale = h('input', { type: 'range', min: .6, max: 2, step: .1, value: draft.scale, 'aria-label': 'Pixel scale' }); scale.oninput = () => { draft.scale = Number(scale.value); };
      content.append(h('h3', {}, 'Appearance'), h('p', {}, 'Theme, pixel scale and workspace density.'), h('div.pixel-preferences-grid', {}, segmented('Lighting', ['day', 'night', 'auto'], draft.mode, value => { draft.mode = value as Appearance['mode']; }), h('label.pixel-field', {}, 'Pixel scale', scale), segmented('UI density', ['compact', 'comfortable'], draft.density, value => { draft.density = value as Appearance['density']; }), select('Hover hints', ['full', 'minimal', 'off'], draft.hints, value => { draft.hints = value as Appearance['hints']; })));
    }
    if (section === 'Office Behavior' || section === 'Appearance') {
      content.append(h('img.pixel-setting-preview', { src: '/assets/pixel/office-room.png', alt: 'Office appearance preview' }));
      for (const [key, title] of [['animation', 'Animate actual worker statuses'], ['walking', 'Walking animations'], ['furniture', 'Show office furniture'], ['names', 'Agent name labels'], ['status', 'Agent status indicators'], ['reducedMotion', 'Reduce motion']] as const) {
        const checkbox = h('input', { type: 'checkbox' }); checkbox.checked = draft[key]; checkbox.onchange = () => { draft[key] = checkbox.checked; }; content.append(h('label.pixel-check', {}, checkbox, title));
      }
    }
    if (section === 'Agent Integrations') content.append(h('p', {}, 'Provider sign-ins, defaults, notifications, budgets and terminal settings use the existing Office controls.'), h('button.btn.primary', { type: 'button', onclick: original }, 'Open original Office settings'));
    content.append(h('p.note', {}, 'Appearance is saved for your account in this browser. Automatic lighting follows your local clock. System reduced-motion settings are respected.'));
  };
  for (const label of ['General', 'Appearance', 'Office Behavior', 'Agent Integrations']) nav.append(h('button.pixel-button', { type: 'button', onclick: () => { section = label; render(); } }, label));
  const cancel = h('button.btn', { type: 'button' }, 'Cancel');
  const save = h('button.btn.primary', { type: 'button' }, 'Save Changes');
  const reset = h('button.btn', { type: 'button', onclick: () => { Object.assign(draft, DEFAULT_APPEARANCE, { unlimitedModels: [...prefs.unlimitedModels] }); render(); } }, 'Reset to Default');
  const modal = openModal(h('div.modal.pixel-appearance', { role: 'dialog', 'aria-label': 'Pixel appearance' }, h('header', {}, h('div', {}, h('h2', {}, 'Settings'), h('p', {}, 'Customize your Pixel Agent Office experience'))), h('div.pixel-appearance-layout', {}, nav, content), h('footer', {}, reset, h('span', { style: 'flex:1' }), cancel, save)));
  cancel.onclick = () => modal.close(); save.onclick = () => { Object.assign(prefs, draft); changed(); modal.close(); }; render();
}
