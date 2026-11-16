# D-004 Modal and sheet use the native dialog element

Status: accepted for M3, owner may overrule. Date: 2026-11-15.

## Context
Modals and sheets must trap focus, close on Escape, hide the page from screen readers, and return focus to the trigger. A payment in flight must be able to block dismissal.

## Options checked
| Option | For | Against |
|--------|-----|---------|
| Native `<dialog>` with `showModal()` | The browser does the focus trap, Escape, top layer, inert background and focus return. Little code, so fewer bugs | jsdom 31 has no `showModal()`, so tests stand in for the browser API. Real browser behavior cannot be checked in the build container (no browser) |
| Custom `div role="dialog"` with our own focus trap | Fully testable in jsdom | We would own an accessibility feature that browsers already ship and test. More code, more ways to get it wrong |
| A headless UI library | Well tested | New dependency, bundle cost, ownership of styling anyway |

## Decision
Native `<dialog>`. Component `Dialog` is controlled (`open`, `onClose`). Without `showModal` (very old browsers, jsdom) it falls back to the `open` attribute, so content still shows.

## Consequences
- No exit animation in M3 (enter animation only). Adding one means delaying `close()`, which is the part most likely to break focus return. Revisit with a real browser available.
- Scroll lock is `html[data-scroll-locked]`. Nested dialogs are not supported.
- Not verified here: Escape, focus trap, focus return, backdrop click in a real browser. First thing to check on a phone.
