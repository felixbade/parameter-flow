import { Player } from './player';

interface TimelinePlayerConfig {
    duration: number;
    bpm?: number;
    keyboardListener?: boolean;
}

export class TimelinePlayer extends Player {
    public bpm: number;
    public element: HTMLDivElement;
    public positionBar: HTMLDivElement;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _handleMouseMove: ((event: MouseEvent) => void) | null;
    private _handleMouseUp: (() => void) | null;
    private _isDragging: boolean;

    constructor(config: TimelinePlayerConfig = { duration: 10 }) {
        super(config);
        this.bpm = config.bpm || 120;
        this._keyboardListener = null;
        this._handleMouseMove = null;
        this._handleMouseUp = null;
        this._isDragging = false;

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

        const mouseSeek = ((event: MouseEvent) => {
            const rect = this.element.getBoundingClientRect();
            // TODO: consider cursor element's width
            const x = event.clientX - rect.left;
            const position = x / rect.width * this.duration;
            this.seek(position);
        }).bind(this);

        this._handleMouseMove = ((event: MouseEvent) => {
            if (this._isDragging) {
                mouseSeek(event);
            }
        }).bind(this);

        const handleMouseDown = ((event: MouseEvent) => {
            this._isDragging = true;
            this.pause();
            mouseSeek(event);
        }).bind(this);

        this._handleMouseUp = (() => {
            this._isDragging = false;
        }).bind(this);

        this.element.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', this._handleMouseMove);
        window.addEventListener('mouseup', this._handleMouseUp);

        this.positionBar = document.createElement('div');
        this.positionBar.style.position = 'absolute';
        this.positionBar.style.top = '0';
        this.positionBar.style.width = '2px';
        this.positionBar.style.transform = 'translateX(-50%)';
        this.positionBar.style.height = '100%';
        this.positionBar.style.backgroundColor = 'white';
        this.positionBar.style.pointerEvents = 'none';
        this.element.appendChild(this.positionBar);

        this._animate = this._animate.bind(this);
        this._animate();
    }

    private _animate(): void {
        const position = this.currentTime / this.duration;
        // TODO: consider cursor element's width
        this.positionBar.style.left = `${position * 100}%`;
        requestAnimationFrame(this._animate);
    }

    private _setupKeyboardListener(): void {
        const handleKeyPress = ((event: KeyboardEvent) => {
            if (event.code === 'Space') {
                event.preventDefault(); // Prevent page scroll
                if (this.paused) {
                    this.play();
                } else {
                    this.pause();
                }
            } else if (event.code === 'Digit0') {
                this.pause();
                this.seek(0);
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    public destroy(): void {
        if (this._keyboardListener) {
            window.removeEventListener('keydown', this._keyboardListener);
            this._keyboardListener = null;
        }
        if (this._handleMouseMove) {
            window.removeEventListener('mousemove', this._handleMouseMove);
            this._handleMouseMove = null;
        }
        if (this._handleMouseUp) {
            window.removeEventListener('mouseup', this._handleMouseUp);
            this._handleMouseUp = null;
        }
    }
}