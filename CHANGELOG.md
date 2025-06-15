# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
