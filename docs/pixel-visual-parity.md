# Pixel Office visual verification

The redesign follows `01_Default_Pixel_Office.png` from the supplied visual pack. Its office-first composition is the primary target. The guide's sample people, account identities, activity and balances are illustrative; production displays backend state.

## Screenshot comparison

`scripts/pixel-e2e.mjs` captures the default office at 1536 x 508, selected workspace at 1672 x 775, and login/settings at 1672 x 941. These match the corresponding full-screen reference dimensions. The smaller usage, team, meeting, queue and whiteboard references are component crops; comparisons assess their panel structure, palette and controls within the running application.

| Screen | Matched treatment | Runtime differences |
| --- | --- | --- |
| Default office | 54px toolbar row, 138px navigation column, dark navy frame, blue active view, full-room pixel art, glass meeting room, boards, lounge, desks, plants, server corner, elevator, interaction labels | Names, counts and states come from actual workers and peers |
| Selected agent | Side inspector and bottom terminal dock; optional adjacent service preview | Only real discovered services appear; actions follow supported backend operations |
| Usage | Dark provider cards, remaining percentages, reset labels, explicit unmetered policy | Unsupported balances and account association remain unavailable |
| Team | Users table, role/status badges, invitation and management controls | No invented email addresses or unsupported viewer role; only original server roles |
| Settings | White panel, settings sidebar, blue segmented controls, scale slider, Save/Cancel | Only supported preferences are editable; original integration/budget controls remain accessible |
| Login | Left white form and pixel robot, blue sign-in/invitation actions, dusk office illustration | No invented online/activity counters before authentication |
| Meeting | Original meeting engine/form with the Pixel panel theme | Engine creates its supported meeting workers; reference-only participant controls are not simulated |
| Queue | Original persistent queue, status groups, provider selection and scheduler controls | Stored tasks determine rows and counts |
| Whiteboard | Original collaborative Excalidraw, white drawing surface, styled header | Saved drawings determine content |

The pack's `08_Whiteboard_Interaction.png` visually depicts a task queue, and `09_Task_Board_Interaction.png` depicts a whiteboard. Comparison follows their content.

`verification/redesign/layout.json` records the actual toolbar, sidebar and room bounds. The primary room begins at x=138, y=54 and fills the remaining viewport. The same capture asserts zero terminal and iframe elements. Six real idle shell PTYs supply the visual test's workers; there is no fabricated model activity. Production screenshots use the existing live floor instead.

## Assets and behavior

`src/client/public/assets/pixel/` contains generated room art, a transparent character atlas, login illustration and a code-native robot mark. The room has no embedded people, names, status badges or application controls. Canvas renders workers and people from the existing Store. DOM buttons provide keyboard/touch object interactions. The existing public static-asset path permits login artwork without exposing account or workspace data.

The first six desk positions follow the reference composition. Additional backend desks appear in an annex when occupied. No backend desk capacity is removed. Coffee uses the original Caffeine model and changes walking speed. The lounge opens actual shared chat and the original voice/screen-sharing controls. Other Office workflows continue through their original modules.

The terminal and inspector are created only after explicit worker selection. Preview requires an actual worker-owned service and explicit selection. Closing, minimizing, floor changes and view switches detach UI without killing workers.

## Validation

Type checking and production build pass. The final browser/protocol run passes 24 checks with no page errors. It covers authentication, two-user drawing edits, role enforcement, actual shell output after closing a workspace, discovered HTTP preview, queue persistence, extra desks, lounge chat, custom-model policy, settings cancellation, repeatable help, original Excalidraw/meeting/floor controls, mobile overflow and 3D/Lite worker preservation.

A repository regression run excluding `workers.test.ts` and `meetings.test.ts` passes 189 tests, including the six Pixel unit tests. A separate meeting run passes ten and reproduces the existing Windows path-separator assertion failure in one. The previously documented provider-executable worker fixture failures remain outside this frontend change. This is not a claim that the complete upstream suite passes.

Live external GitHub mutations, media transfer, and complete model-driven meetings have not been exhaustively retested. Their original modules and backend are retained. See `pixel-office-parity.md` for the broader functional audit.

## Live release check

Frontend asset deployment does not require a backend restart. The existing Office was separately found stopped during final validation, and its scheduled launcher was started again. A read-only browser check recorded no page errors and confirmed that worker `9256b66b99b5` retained its saved session after opening/closing the workspace and reloading Pixel; its final reported status was idle. A real terminal snapshot and actual Pro limits were received. No new model task was submitted by this check. The capture is recorded in `verification/pixel-redesign-live/result.json`.
