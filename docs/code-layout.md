# Client and server layout

The three document entry points share the Office backend. Vite builds `index.html`, `pixel.html`, and `lite.html`; authenticated routes in `src/server/server.ts` serve them. Login accepts only the local destinations `/`, `/pixel`, and `/lite`. Its default destination is Pixel.

| Path | Responsibility |
| --- | --- |
| `src/client/main.ts`, `world/` | Original 3D frontend and interactions |
| `src/client/pixel/main.ts` | Pixel and Lite navigation, shared workflow entry points |
| `src/client/pixel/adapter.ts` | Original Net connection, Store updates, shared modal message routing |
| `src/client/pixel/scene.ts` | Reference room art, live Canvas sprites, DOM interaction targets, movement |
| `src/client/pixel/model.ts` | Appearance validation, quota display rules, obstacle pathfinding |
| `src/client/pixel/workspace.ts` | Explicit agent terminal selection and opt-in service preview |
| `src/client/pixel/panels.ts` | Usage feed presentation, unmetered model display policy, appearance preferences |
| `src/client/pixel/login-design.ts` | Existing login form presentation and validated invitation navigation |
| `src/client/public/assets/pixel/` | Public static room art, character atlas, login art and robot mark |
| `src/client/ui/` | Shared terminals, boards, queue, meetings, Excalidraw, settings, accounts, sign-ins |
| `src/client/net.ts`, `state.ts` | Existing WebSocket transport and authoritative client store |
| `src/shared/protocol.ts` | Unchanged Office message contracts |
| `src/server/workers.ts`, `ptys.ts` | Existing worker lifecycle and terminal sessions |
| `src/server/services.ts` | Existing service discovery and worker ownership; includes Windows scans |
| `tests/pixel.test.ts` | Quota, preferences, and pathfinding regression tests |
| `scripts/pixel-e2e.mjs` | Isolated real-backend browser and protocol regression checks |

Closing or minimizing an agent workspace sends a terminal detach. Floor changes send `floor.go`. View navigation reloads a document. None of these UI actions sends a worker kill. Worker stop and PR creation remain explicit, confirmed operations.

Appearance preferences are stored per authenticated account name in browser local storage. They cannot change provider configuration or backend usage. Canvas sprites derive worker state from the shared Store; they do not schedule work or invent status changes.

The parity checklist owns runtime evidence and limitations. Keep it current when changing workflow integrations.
