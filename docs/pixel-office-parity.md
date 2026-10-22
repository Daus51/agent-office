# Pixel Office behavior and verification

Pixel Office uses the existing Office authentication, WebSocket, storage, workers, and workflow modules. Open `/pixel`, `/lite`, or `/` on the same server. Login defaults to Pixel; the view switch retains access to the original 3D frontend.

This audit uses installed revision `be21aaa6cd72a211408c6bd018db97ee9c6d2614` as its baseline. That revision contains no Lite entry, AGENTS.md, contribution guide, or code-layout document. Lite is an additive list view.

## Verified coverage

Checks ran on Windows on 2026-10-22. Browser means the isolated backend and Edge automation in `scripts/pixel-e2e.mjs`; unit means `tests/pixel.test.ts`. Reusing a module alone does not establish runtime parity.

| Capability | Integration | Evidence and scope |
| --- | --- | --- |
| Login and sessions | Existing API and cookies | Browser: sign-in returns to Pixel and connects |
| Default office | Canvas and DOM hit areas | Browser: zero terminals or iframes before selection |
| Worker workspace | Original terminal module | Browser: correct shell selected and live output received |
| Close and minimize | Terminal detach | Browser: commands execute after closing; minimize/restore work |
| Floors and reload | Original elevator and floor.go | Browser: two real Git repositories, same worker after switching/reload |
| Service preview | Existing ownership discovery; Windows scans added | Browser: worker starts HTTP service; discovery attributes it; explicit iframe selection loads its content |
| Queue | Original scheduler and queue UI | Protocol/browser: paused scheduler stores task; queue displays it |
| Whiteboard | Original Excalidraw module | Browser: editor loads; protocol: two authenticated users exchange edits |
| Team and roles | Original accounts API and authorization | Invited member joins; server rejects member creating administrator invitation |
| Meetings | Original meeting module | Browser: meeting interface opens. Live model discussion and completion not tested |
| Usage | Existing PlanLimits feed | Unit: bounded 100 minus used; unavailable values remain unknown. Browser: panel opens |
| Shared quotas | One connected-account limits card | Source: no per-worker balance multiplication; missing account association is explicit |
| Unlimited model | OpenCode adapter and explicit display policy | Unit: exact, explicitly declared OpenCode model only |
| Appearance | Browser preferences and Canvas | Browser: night/day changes and 390px layout; unit: sanitization and clock boundaries |
| Movement | Bounded grid pathfinding | Unit: furniture detour and unreachable target. Character collision avoidance not implemented |
| Original 3D | Original entry/world modules | Browser: Canvas entry loads without page errors. Full gameplay not retested |
| Lite | Same adapter and workflows, agent list | Browser: connects without implicit terminal or preview |

## Integrations with limited verification

These controls use existing modules, but the isolated test does not establish their external effects:

| Integration | Current scope |
| --- | --- |
| AI hiring | Live PC2 browser check hired Claude through the desk form, read README, and finished with PIXEL_LIVE_CHECK_OK. Provider/worktree combinations beyond this check remain untested |
| Queue execution | Same scheduler; test pauses inference, so model completion is untested |
| GitHub issues, PRs, assignment, merge | Original boards/actions; live mutations untested |
| Files, diffs, worktrees, cleanup | Original Changes and send-home dialogs; user worktrees untouched by tests |
| Sign-ins and revocation | Original forms/handlers; interactive authorization remains user-controlled |
| Voice and screen sharing | Original WebRTC; permission and secure context required; media transfer untested |
| Search, bookshelf, notifications, budgets | Original modules; complete behavior not retested |
| Dog and gong | Original protocol operations; no audiovisual parity claim |
| Coffee | Original Caffeine model boosts Pixel walking speed |
| Games, exterior, pictures, signs | Labeled route to original 3D |

## Usage and preview limits

The limits feed does not expose verified provider account identity or worker-to-account links. The panel says so and shows one balance for the connected account. Claude windows come from the backend feed. Missing windows remain unavailable. Codex, OpenCode, and custom balances are never derived from token or cost totals. An explicit Unlimited declaration changes display only.

Preview lists only services attributed to the selected worker. A browser on another computer needs the original service tunnel described in Services. There is no arbitrary URL proxy. HTTPS offices can encounter mixed-content restrictions for HTTP localhost services, and services can refuse framing. Detached Windows services without a discoverable ancestor are not attributed by guesswork.

The current frontend uses reference-derived room art and a transparent character atlas, with live Canvas actors and accessible DOM controls. Furniture visibility is visual; interaction buttons remain accessible. Paths avoid furniture and worker positions; pixel projection separates overlapping peer sprites. Unsupported 3D interactions remain labeled. See pixel-visual-parity.md for the current visual verification.

## Validation

```sh
npm run typecheck
npm run build
node --import tsx --test tests/pixel.test.ts
node scripts/pixel-e2e.mjs
```

Type checking and production build passed. Six Pixel unit checks and the current twenty-four browser/protocol checks passed, with no browser page errors. The integration script creates temporary repositories and an isolated Office home; it requests no provider inference and uses no production credentials. Edge and free ports 4717/4817 are required. Screenshots and successful `results.json` go to the Git-ignored `verification/pixel/` directory.

The full `npm test` attempt emitted 201 passing and 20 failing results, then retained open handles and was terminated. This is not a passing suite. An unmodified baseline reproduces the worker fixture timeout and a meeting assertion requiring Unix path separators. Other failures include provider executable fixtures. Baseline reproduction does not establish that every failure has the same cause. No full cross-platform suite pass is claimed.

Screenshots cover login, both lighting modes, workspace, real preview, queue, meeting form, Excalidraw, usage, team, settings, elevator and mobile. They show isolated test data.

## PC2 deployment evidence

PC2 serves the release on port 4700 with its existing Office home and projects. A fresh pre-deployment check found no active workers. The original source and a copy of its launcher remain available for rollback. The signed-in Windows account has an AgentOffice-Pixel scheduled task for startup at logon; signing out of Windows does not provide unattended service hosting.

The bounded live check in `verification/pixel-live/result.json` recorded no page errors, worker `9256b66b99b5` reaching done, an established Claude session, no implicit workspace after hiring, and explicit workspace selection. Its terminal screenshot shows the requested success marker. The completed worker remains available for inspection.

A read-only live WebSocket check returned the Pro limits feed with 7% used for the five-hour window and 8% used for the week, corresponding to 93% and 92% remaining at that observation. These are dated observations, not fixed allowances or current balances. Account identity and worker association remain unavailable in the feed.
