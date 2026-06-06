# PFExplorer

`PFExplorer` is a minimal human interface for **parameter overrides**. It enables rapid exploration of parameter combinations using a pointer-locked mouse.

It does not help with animation or persistence.

## Philosophy

PFExplorer covers a single axis: **human ↔ parameters**.

- **HID** (human input device): pointer lock, mouse move, wheel, handler keys (to navigate between handlers).
- **HOD** (human output device): the overlay card and clipboard copy.

### Ownership vs reference

The explorer **owns** only session-local interface state:

- `_overrides` — the values the user has edited this session.
- pointer lock, keyboard routing, the UI that shows the state.

The explorer **references** (never owns) two caller-provided capabilities:

| Provided by caller | Explorer's relationship                                       |
| ------------------ | ------------------------------------------------------------- |
| `handlers`         | Invokes them on input; does not define |
| `getState`         | Pulls current base values at edit time    |

Same pattern on both sides: the **caller owns the truth** (the live parameter
values and the handler logic), while the **explorer owns HCI so the human can work with the deltas fluently**.

The caller needs to merge the overrides with the base values every frame:

```js
const values = { ...getState(), ...explorer.getOverrides() };
```

### Data model

A single in-memory store:

```ts
_overrides: Record<string, unknown>; // only keys the user has edited
```

Pull model: the explorer calls `getState()` when editing starts and overlays its
own overrides before running a handler.

Backspace clears the overrides that the current handler modifies — it runs the
handler with a zero input and removes the keys it returns, then re-captures fresh
values from `getState()`.

## Out of scope

The explorer intentionally does **not** handle:

- **Persistence** — no `localStorage`, no autosave, no `beforeunload`. This would get complicated when interfacing with the timeline. A copy to clipboard is provided as convenience, but saves to files or merging with the timeline is out of scope.
- **Animation** – edited values become static if the caller does `{ ...getCurrentValues(), ...getOverrides() }`.

## API

### Construction

```ts
interface PFExplorerConfig {
  handlers: Record<string, Handler>;
  getState: () => Record<string, unknown>; // required — base values at edit time
  keyboardListener?: boolean;              // default true
}

new PFExplorer(config);
```

- `handlers` — named absolute handlers, `(state, input) => delta`. `input` is
  `{ dx, dy, sdx, sdy }`. Running a handler with zero input reveals which keys it
  controls (used for card grouping and Backspace).
- `getState` — returns the current base values for every key the handlers might
  touch. Called only during editing.
- `keyboardListener` — set `false` to disable the built-in key bindings.

### Methods

```ts
getOverrides(): Readonly<Record<string, unknown>>;     // edited keys only
setHandlers(handlers: Record<string, Handler>): void;  // swap the live handler set
destroy(): void;                                       // remove listeners + DOM
```

Edited keys are `Object.keys(getOverrides())`; there is no separate accessor.

#### `setHandlers`

Swaps the live handler set at runtime, e.g. when changing scenes. Modified parameters persist, but in export they are trimmed based on the currently visible handlers.


### Keyboard

| Key          | Action                                                      |
| ------------ | ---------------------------------------------------------- |
| Enter        | toggle pointer lock                                        |
| ArrowUp/Down | cycle the active handler                                   |
| 1–9          | select a handler by index                                 |
| E            | copy overrides to the clipboard as flat JSON              |
| Backspace    | clear the active handler's keys from the overrides         |

### Copy format

Flat JSON of the current overrides, no wrapper:

```json
{ "scale": 2.1, "rotX": 0.4 }
```

The explorer does not namespace; the paste destination decides how to use the
keys.

Only keys controlled by the currently visible handlers are exported.

