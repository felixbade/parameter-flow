import { Player } from './player.js';

export class TimelinePlayer extends Player {
    constructor(config = {}) {
        super();
        this.duration = config.duration || 0;
        this.bpm = config.bpm || 120;

        // Add keyboard listener unless explicitly disabled
        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
        }
    }

    _setupKeyboardListener() {
        const handleKeyPress = ((event) => {
            if (event.code === 'Space') {
                event.preventDefault(); // Prevent page scroll
                if (this.paused) {
                    this.play();
                } else {
                    this.pause();
                }
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);

        // Store the listener for potential cleanup
        this._keyboardListener = handleKeyPress;
    }

    // Cleanup method to remove keyboard listener
    destroy() {
        if (this._keyboardListener) {
            window.removeEventListener('keydown', this._keyboardListener);
            this._keyboardListener = null;
        }
    }
}