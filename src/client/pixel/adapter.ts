import { Net } from '../net';
import { store, lastSpot } from '../state';
import { closeAllModals, doingNow, readingNow, onDoingChange, onModalChange, toast } from '../ui/dom';
import { routeTerminalMessage, openTerminalFor } from '../ui/terminal';
import { routeChangesMessage, openChangesFor } from '../ui/changes';
import { routeTeamMessage } from '../ui/team';
import { routeAccountsMessage } from '../ui/accounts';
import { routePullMessage } from '../ui/pull';
import { routeElevatorMessage } from '../ui/elevator';
import { routeWhiteboardMessage } from '../ui/whiteboard';
import { routeWorktreeMessage } from '../ui/prompt';
import { openSignIns } from '../ui/signins';
import { Voice } from '../voice';

/** One connection and the original Store drive every view. No worker state is replicated here. */
export function connectOffice(onStatus: (up: boolean) => void, onFloor: () => void) {
  const net = new Net(() => store.profile, () => lastSpot());
  const voice = new Voice(net);
  net.onStatus(onStatus);
  const doing = () => net.send({ t: 'doing', what: doingNow(), reading: readingNow() });
  onDoingChange(doing); onModalChange(doing);
  net.onMessage(msg => {
    if (msg.t === 'floor.enter') closeAllModals();
    if (msg.t === 'welcome') voice.reset();
    store.apply(msg);
    routeTerminalMessage(msg); routeChangesMessage(msg); routeTeamMessage(msg);
    routeAccountsMessage(msg); routePullMessage(msg); routeElevatorMessage(msg);
    routeWorktreeMessage(msg); routeWhiteboardMessage(msg, net);
    if (msg.t === 'welcome') {
      const terminal = openTerminalFor(); if (terminal && store.workers.has(terminal)) net.send({ t: 'worker.attach', workerId: terminal });
      const changes = openChangesFor(); if (changes && store.workers.has(changes)) net.send({ t: 'changes.watch', workerId: changes });
      doing();
    }
    if (msg.t === 'floor.enter') onFloor();
    if (msg.t === 'welcome' || msg.t === 'peer.join' || msg.t === 'peer.leave' || msg.t === 'peer.update') voice.syncPeers();
    if (msg.t === 'rtc') void voice.handleSignal(msg.from, msg.data as never);
    if (msg.t === 'toast') toast(msg.text, msg.level);
    if (msg.t === 'signins.needed') openSignIns(net, msg.why);
  });
  return { net, voice };
}
