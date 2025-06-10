# Parameter Flow

![npm](https://img.shields.io/npm/v/parameter-flow)
![npm bundle size](https://img.shields.io/bundlephobia/min/parameter-flow)
![NPM](https://img.shields.io/npm/l/parameter-flow)

A minimalistic yet powerful parameter timeline editor and runtime for web demos.

## Key features
- Everything is based on cubic bezier curves, making it possible to define the time derivates of parameters at control points in addition to their values. The end result looks very smooth and the runtime code is extremely small.
- Modifying the parameters is based on a pointer-locked mouse input, which is the best analog input widely available on desktop environments.
- Context-sensitive parameter adjustments: for example camera panning can be made relative to its current orientation, or scaled based on how close to an SDF surface it is.
- BPM-aware time navigation, meaning quantization that can be adjusted with hotkeys.
- Keyframes can have a before-value and an after-value, allowing snappy transitions between two smooth time spans.
- In-browser editor: no WebSocket hassle.
- LocalStorage-based state allows refreshing the page without losing edits.
- When moving to production, the localStorage state is downloaded as a json file, which can be embedded into the application.

## Key constraints
- Only one interpolation mode – although it is a very flexible one.
- No integrations to any specific tools.
- Does not control music directly, instead provides events for play/pause/seek.
- Parameters are fully configured from the code, i.e. they can't be added from the timeline editor.
- Time quantization happens only in the editor. The data format is continuous, and can't be converted into a spreadsheet/tracker format easily.

## `Player`

### Properties
- `currentTime`: Returns the current playback time in seconds.
- `paused`: Returns a boolean indicating whether playback is currently paused.

### Methods
- `play()`: Starts playback from the current time position. Dispatches a `play` event.
- `pause()`: Pauses playback at the current time. Dispatches a `pause` event.
- `seek(time)`: Sets the playback position to the specified time in seconds. Dispatches a `seek` event with details about the time change.

### Events
The Player dispatches the following events:
- `play`: Fired when playback starts
- `pause`: Fired when playback is paused
- `seek`: Fired when the playback position changes, includes:
  - `detail.time`: New playback position

### Example Usage
```javascript
const player = new Player();

player.addEventListener('play', () => {
    console.log('Playback started');
});

player.addEventListener('pause', () => {
    console.log('Playback paused');
});

player.addEventListener('seek', (e) => {
    console.log(`Seeked to ${e.detail.time}`);
});

// Start playback
player.play();

// Print current time after 2 seconds
setTimeout(() => {
    console.log(`Current time: ${player.currentTime}`);
}, 2000);

// Pause after 5 seconds
setTimeout(() => {
    player.pause();
}, 5000);

// Seek to 10 seconds
player.seek(10);
```

## Inspiration
- [Rocket](https://github.com/rocket/rocket)
- [Theatre.js](https://github.com/theatre-js/theatre)
- [Automaton](https://github.com/0b5vr/automaton)
- [Universal Game Controller](https://github.com/felixbade/universal-game-controller)