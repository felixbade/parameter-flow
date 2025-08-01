# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- `PFAnimation` class that does quintic bezier interpolation between keyframes.
- `PFEditor` class that allows editing keyframes.
    - Custom handlers for editing parameters.
    - 1-9 selects the current handler.
    - Return enters pointer lock mode to edit parameter values.
    - Backspace deletes the current keyframe.
- Export and import by pressing `E` and `I` respectively.
- Animation state and player current time are saved to local storage and loaded on page load.
- 'H' toggles the timeline visibility.
- `PFExplorer` class that allows discovering parameter combinations without a timeline.

### Changed
- Renamed `examples/index.html` to `examples/playback.html`.
- Pressing space at the end will play again from the beginning.

## [0.4.1] - 2025-06-15

### Changed
- Seeking with mouse now requires holding the mouse button down.
- Clicking on the timeline will pause the player.

### Fixed
- `end` event is no longer scheduled when seeking during pause.

## [0.4.0] - 2025-06-15

### Changed
- `Player` class now has a `duration` property
    - `currentTime` can never exceed `duration`
    - `player` is automatically paused when it reaches the end
    - `player` dispatches `end` event when it reaches the end

## [0.3.0] - 2025-06-14

### Added
- CHANGELOG.md

### Changed
- Converted to TypeScript

## [0.2.0] - 2025-06-13

### Added
- `TimelinePlayer` class with a UI for controlling the player
    - DOM element for visualizing the timeline and current time
    - Space bar play/pause
    - Mouse hover seek
    - '0' to seek to beginning
- Example code

## [0.1.0] - 2025-06-10

### Added
- Initial project structure
- `Player` class with play/pause/seek functionality
