import { Player } from './player.js';

export class TimelinePlayer extends Player {
    constructor(config = {}) {
        super();
        this.duration = config.duration || 10;
        this.bpm = config.bpm || 120;

        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
        }

        this.element = document.createElement('div');
        this.element.style.position = 'absolute';
        this.element.style.bottom = '0';
        this.element.style.left = '0';
        this.element.style.width = '100%';
        this.element.style.height = '50px';
        this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

        this.element.addEventListener('mousemove', ((event) => {
            if (this.paused) {
                const rect = this.element.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const position = x / rect.width * this.duration;
                this.seek(position);
            }
        }).bind(this));

        this.positionBar = document.createElement('div');
        this.positionBar.style.position = 'absolute';
        this.positionBar.style.top = '0';
        this.positionBar.style.width = '2px';
        this.positionBar.style.height = '100%';
        this.positionBar.style.backgroundColor = 'white';
        this.positionBar.style.pointerEvents = 'none';
        this.element.appendChild(this.positionBar);

        this._animate = this._animate.bind(this);
        this._animate();
    }

    _animate() {
        const position = this.currentTime / this.duration;
        this.positionBar.style.left = `${position * 100}%`;
        requestAnimationFrame(this._animate);
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
            } else if (event.code === 'Digit0') {
                event.preventDefault();
                this.pause();
                this.seek(0);
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    destroy() {
        if (this._keyboardListener) {
            window.removeEventListener('keydown', this._keyboardListener);
            this._keyboardListener = null;
        }
    }
}