import type { Net } from '../net';
import { store } from '../state';
import { openTerminal, type TerminalFind } from '../ui/terminal';
import { openChanges } from '../ui/changes';
import { h, type Modal, STATUS_LABEL } from '../ui/dom';
import { providerLabel, modelBadge } from '../ui/provider';
import { openServices } from '../ui/services';

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
    const modal = openTerminal(this.net, workerId, () => openChanges(this.net, workerId, () => this.open(workerId)), find);
    if (!modal) return;
    this.modal = modal; modal.el.classList.add('pixel-workspace'); modal.el.dataset.agentWorkspace = workerId;
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
          preview.append(button(`Preview ${service.title || service.command} :${service.port}`, () => {
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
      button('Minimize', () => { this.minimized = workerId; this.close(); }),
      button('Maximize', () => modal.el.classList.toggle('maximized')),
    );
    modal.el.insertBefore(tools, content);
    const refresh = () => {
      const w = store.workers.get(workerId); if (!w) return modal.close();
      info.replaceChildren(h('span.pixel-eyebrow', {}, 'AGENT WORKSPACE'), h('h2', {}, w.name), h('span.pixel-status', { 'data-status': w.status }, STATUS_LABEL[w.status] ?? w.status), h('p', {}, w.task?.summary ?? w.prompt ?? 'No task assigned'), h('dl', {}, h('dt', {}, 'Provider / model'), h('dd', {}, w.kind === 'shell' ? 'Shared shell' : providerLabel(w.provider, store.project), w.kind === 'shell' ? '' : ' · ', w.kind === 'shell' ? '' : modelBadge(w.provider, w.model, w.effort) ?? 'Default'), h('dt', {}, 'Branch'), h('dd', {}, w.worktree?.branch ?? store.project?.branch ?? 'Not reported'), h('dt', {}, 'Worktree'), h('dd', {}, w.worktree?.path ?? store.project?.dir ?? 'Not reported'), h('dt', {}, 'Session'), h('dd', {}, w.sessionId ?? 'Starting'), h('dt', {}, 'Reported tokens'), h('dd', {}, w.usage ? String(w.usage.input + w.usage.output + w.usage.cacheRead + w.usage.cacheWrite) : 'Not reported')), h('p.note', {}, 'Closing this workspace only detaches your viewer. The worker continues running.'));
    };
    const unsubscribe = store.on('workers', refresh); refresh();
  }
}
