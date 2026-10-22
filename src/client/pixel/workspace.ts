import type { Net } from '../net';
import { store } from '../state';
import { openTerminal, type TerminalFind } from '../ui/terminal';
import { openChanges } from '../ui/changes';
import { h, type Modal, STATUS_LABEL } from '../ui/dom';
import { providerLabel, modelBadge } from '../ui/provider';
import { openServices } from '../ui/services';
import { remainingQuota } from './model';

export interface WorkspaceActions { message(id: string): void; home(id: string): void; pr(id: string): void }
export class AgentWorkspace {
  private modal: Modal | undefined;
  private id: string | null = null;
  private minimized: string | null = null;
  constructor(private net: Net, private actions: WorkspaceActions, private selected: (id: string | null) => void) {}
  close() { this.modal?.close(); this.modal = undefined; this.id = null; this.selected(null); }
  restore() { if (this.minimized && store.workers.has(this.minimized)) this.open(this.minimized); }
  open(workerId: string, find?: TerminalFind) {
    const worker = store.workers.get(workerId); if (!worker) return;
    if (this.id === workerId && this.modal?.el.isConnected) return;
    this.close(); this.minimized = null; this.id = workerId; this.selected(workerId);
    document.body.classList.remove('pixel-workspace-minimized');
    const modal = openTerminal(this.net, workerId, () => openChanges(this.net, workerId, () => this.open(workerId)), find, { fontSize: 12 });
    if (!modal) return;
    this.modal = modal; modal.el.classList.add('pixel-workspace'); modal.el.dataset.agentWorkspace = workerId;
    modal.backdrop.classList.add('pixel-workspace-backdrop');
    const originalClose = modal.close.bind(modal);
    modal.close = () => { unsubscribe(); this.selected(null); if (this.id === workerId) this.id = null; originalClose(); };
    const info = h('aside.pixel-workspace-info');
    const preview = h('section.pixel-preview.hidden', { 'aria-label': `${worker.name} browser preview` });
    const content = h('div.pixel-workspace-content');
    const terminal = modal.el.querySelector('.term-host')!; content.append(info, terminal, preview); modal.el.append(content);
    const tools = h('div.pixel-workspace-tools');
    const button = (label: string, run: () => void) => h('button.btn', { type: 'button', onclick: run }, label);
    const previews = () => {
      const services = store.services.items.filter(s => s.workerId === workerId);
      preview.replaceChildren(h('h3', {}, 'Browser preview'));
      if (!services.length) { preview.append(h('p', {}, 'No web service is reported for this worker.'), button('View services', openServices)); }
      else {
        preview.append(h('p.note', {}, 'Preview uses the existing localhost service tunnel. Open Services for the connection command. A service may also refuse embedding.'), button('Service tunnel instructions', openServices));
        for (const service of services) {
          const url = `${location.protocol}//localhost:${service.port}/`;
          preview.append(button(`Preview ${service.title || 'Web service'} :${service.port}`, () => {
            preview.querySelector('iframe')?.remove();
            preview.append(h('iframe', { src: url, title: `${worker.name} service on port ${service.port}`, sandbox: 'allow-scripts allow-forms allow-same-origin allow-downloads' }), h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Open in a new tab'));
          }));
        }
      }
      preview.classList.toggle('hidden'); modal.el.classList.toggle('with-preview', !preview.classList.contains('hidden'));
    };
    tools.append(
      button('Files & diffs', () => openChanges(this.net, workerId, () => this.open(workerId))),
      button('Message / task', () => this.actions.message(workerId)),
      button('Preview', previews), button('Resume', () => this.net.send({ t: 'worker.resume', workerId })),
      button('Pull request', () => this.actions.pr(workerId)), button('Send home', () => this.actions.home(workerId)),
      button('Minimize', () => { this.minimized = workerId; this.close(); document.body.classList.add('pixel-workspace-minimized'); }),
      button('Maximize', () => modal.el.classList.toggle('maximized')),
    );
    modal.el.insertBefore(tools, content);
    const refresh = () => {
      const w = store.workers.get(workerId); if (!w) return modal.close();
      const status = h('span.pixel-status', { 'data-status': w.status }, h('i.pixel-live-dot'), STATUS_LABEL[w.status] ?? w.status);
      const session = h('section.pixel-inspector-section', {}, h('h3', {}, 'Session'), h('dl', {}, h('dt', {}, 'Branch'), h('dd', {}, w.worktree?.branch ?? store.project?.branch ?? 'Not reported'), h('dt', {}, 'Worktree'), h('dd', {}, w.worktree?.path ?? store.project?.dir ?? 'Not reported'), h('dt', {}, 'Session'), h('dd', {}, w.sessionId ?? (w.kind === 'shell' ? 'Shared shell' : 'Not reported')), h('dt', {}, 'Reported tokens'), h('dd', {}, w.usage ? String(w.usage.input + w.usage.output + w.usage.cacheRead + w.usage.cacheWrite) : 'Not reported')));
      const limits = h('section.pixel-inspector-section', {}, h('h3', {}, 'Usage · Connected account'));
      if (w.provider === 'claude' && store.limits.windows.length) {
        for (const window of store.limits.windows) {
          const remaining = remainingQuota(window.pct);
          limits.append(h('div', {}, h('div.pixel-quota-row', {}, h('span', {}, window.label), h('strong', {}, remaining === null ? 'Unavailable' : `${Math.round(remaining)}% remaining`)), remaining === null ? null : h('progress', { value: remaining, max: 100, 'aria-label': `${window.label} remaining` })));
        }
        limits.append(h('small', {}, 'Account association is not exposed per worker.'));
      } else limits.append(h('small', {}, 'Subscription balance unavailable for this session.'));
      const terminalTab = button('Terminal', () => { modal.el.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus(); });
      info.replaceChildren(h('div.pixel-agent-heading', {}, h('span.pixel-human-avatar', { 'aria-hidden': 'true' }), h('div', {}, h('h2', {}, w.name), h('p', {}, w.kind === 'shell' ? 'Shared shell' : providerLabel(w.provider, store.project), w.kind === 'shell' ? '' : ` · ${modelBadge(w.provider, w.model, w.effort) ?? 'Default'}`))), status,
        h('nav.pixel-inspector-tabs', { 'aria-label': 'Agent workspace' }, h('span', {}, 'Overview'), terminalTab, button('Files', () => openChanges(this.net, workerId, () => this.open(workerId)))),
        h('section.pixel-inspector-section', {}, h('h3', {}, 'Current task'), h('p', {}, w.task?.name ?? 'No task assigned'), h('small', {}, w.task?.summary ?? w.prompt ?? 'Select Message / task to give this worker work.')), limits, session,
        h('div.pixel-inspector-actions', {}, h('button.pixel-button.primary', { type: 'button', onclick: () => modal.el.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus() }, 'Open Terminal'), h('button.pixel-button', { type: 'button', onclick: () => this.actions.message(workerId) }, 'Send Message'), h('button.pixel-button', { type: 'button', onclick: () => this.net.send({ t: 'worker.resume', workerId }) }, 'Resume'), h('button.pixel-button', { type: 'button', onclick: () => this.actions.home(workerId) }, 'Send Home')),
        h('p.note', { style: 'margin-top:12px;font-size:10px' }, 'Closing the workspace only detaches your viewer. The worker continues running.'));
    };
    const unsubs = [store.on('workers', refresh), store.on('limits', refresh)]; const unsubscribe = () => unsubs.forEach(off => off()); refresh();
  }
}
