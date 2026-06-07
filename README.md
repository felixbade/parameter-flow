# Parameter Flow

![npm](https://img.shields.io/npm/v/parameter-flow)
![npm bundle size](https://img.shields.io/bundlephobia/min/parameter-flow)
![NPM](https://img.shields.io/npm/l/parameter-flow)

Tooling for parameter-based workflows.

The library has currently three main components, which are somewhat independent of each other:
- `TimelinePlayer`: A UI for time navigation.
- `PFExplorer`: A UI for exploring parameter combinations.
- `PFAnimation`: Math for animation interpolations. Very powerful but currently a bit hard to use.

### TimelinePlayer

- UI: progress bar, space bar to play/pause, mouse hover to seek, 0 to seek to the beginning.
- Events: `play`, `pause`, `seek`, `end`
- Properties: `currentTime`, `paused`, `duration`
- Methods: `play()`, `pause()`, `seek(time)`
- Simple and polished edge cases.

### PFExplorer

The main idea is to use pointer-locked mouse input to adjust parameters. This is the most ergonomic analog input widely available without additional hardware.

Another key idea is to use user-defined handlers to adjust parameters. For example, a camera panning handler can be made relative to the camera's current orientation. The unintuitive part is that these handlers take non-trivial effort to define, since they are application-specific scaffolding, but once wired, the exploration flow is insane. Intuitive handlers really level up the complexity that a human operator is able to comfortably navigate – a categorical unlock of algorithms that have rich inter-dependent parameters.

### PFAnimation

Quintic bezier curve workhorse. They allow very smooth (continuous second derivative) animation curves. The goal is to produce cinematic quality animations with minimal effort.

## Importing

### URL

```html
<script src="https://cdn.jsdelivr.net/npm/parameter-flow@0.4.1/dist/main.js"></script>
```

```javascript
const { TimelinePlayer } = ParameterFlow
```

### NPM
```sh
npm install parameter-flow
```

```javascript
import { TimelinePlayer } from 'parameter-flow'
```

See [examples/playback.html](examples/playback.html) for a complete example.

## `Player`

### Constructor
```javascript
const player = new Player({
    duration: 10,
});
```

- `duration`: The length of the timeline in seconds. Defaults to `Infinity`. When the current time reaches the duration, the player is automatically paused and an `end` event is dispatched.

### Properties
- `currentTime`: Returns the current playback time in seconds. Guaranteed to be between 0 and `duration`.
- `paused`: Returns a boolean indicating whether playback is currently paused.

### Methods
- `play()`: Starts playback from the current time position. Dispatches a `play` event. If the player is already playing or at the end, this does nothing.
- `pause()`: Pauses playback at the current time. Dispatches a `pause` event.
- `seek(time)`: Sets the playback position to the specified time in seconds. Dispatches a `seek` event with details about the time change.

### Events
The Player dispatches the following events:
- `play`: Fired when playback starts
- `pause`: Fired when playback is paused
- `seek`: Fired when the playback position changes, includes:
  - `detail.time`: New playback position
- `end`: Fired when playback reaches the end of the timeline. Note that this makes the player paused but does NOT dispatch a `pause` event.

## `TimelinePlayer`
Like `Player`, but with a UI for time navigation.

### Constructor
```javascript
const player = new TimelinePlayer({
    // Length of the timeline in seconds
    duration: 10,

    // Defaults to true. Set to false if you want to handle keyboard input yourself
    keyboardListener: true,
});
```

- `element`: The DOM element of the timeline player. Do `document.body.appendChild(player.element)` to add it to the page.
- Hovering over the timeline when it's paused will set the current time.
- Space will toggle pause.
- 0 will seek to the start and pause.

## Used by
- [64k quirks](https://github.com/felixbade/64k-quirks) (2026)
- [Grid Attack](https://github.com/Veikkosuhonen/Grid-Attack) (2025)

## Inspiration
- [Rocket](https://github.com/rocket/rocket)
- [Theatre.js](https://github.com/theatre-js/theatre)
- [Automaton](https://github.com/0b5vr/automaton)
- [Universal Game Controller](https://github.com/felixbade/universal-game-controller)