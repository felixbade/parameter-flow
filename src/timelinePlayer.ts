import { Player } from './player';

interface TimelinePlayerConfig {
    duration: number;
    bpm?: number;
    keyboardListener?: boolean;
    storageKey?: string;
}

export class TimelinePlayer extends Player {
    public bpm: number;
    public element: HTMLDivElement;
    public positionBar: HTMLDivElement;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _handleMouseMove: ((event: MouseEvent) => void) | null;
    private _handleMouseUp: (() => void) | null;
    private _isDragging: boolean;
    private _storageKey: string;
    private _persistHandler: (() => void) | null;
    private _beforeUnloadHandler: (() => void) | null;

    constructor(config: TimelinePlayerConfig = { duration: 10 }) {
        super(config);
        this.bpm = config.bpm || 120;
        this._keyboardListener = null;
        this._handleMouseMove = null;
        this._handleMouseUp = null;
        this._isDragging = false;
        this._storageKey = config.storageKey || 'pf-timeline-current-time';
        this._persistHandler = null;
        this._beforeUnloadHandler = null;

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

        this._setupPersistence();
    }

    private _setupPersistence(): void {
        const savedTime = this._loadCurrentTime();
        if (savedTime !== null) {
            this.seek(savedTime);
        }

        this._persistHandler = (() => {
            this._saveCurrentTime();
        }).bind(this);
        this.addEventListener('pause', this._persistHandler);
        this.addEventListener('seek', this._persistHandler);
        this.addEventListener('end', this._persistHandler);

        // capture position even while playing (e.g. refresh mid-playback)
        this._beforeUnloadHandler = (() => {
            this._saveCurrentTime();
        }).bind(this);
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }

    private _saveCurrentTime(): void {
        try {
            localStorage.setItem(this._storageKey, this.currentTime.toString());
        } catch (error) {
            console.error('Failed to save timeline current time to localStorage:', error);
        }
    }

    private _loadCurrentTime(): number | null {
        try {
            const savedTime = localStorage.getItem(this._storageKey);
            if (savedTime === null) {
                return null;
            }
            const time = parseFloat(savedTime);
            if (!isNaN(time) && time >= 0 && time <= this.duration) {
                return time;
            }
        } catch (error) {
            console.error('Failed to load timeline current time from localStorage:', error);
        }
        return null;
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
                    if (this.currentTime >= this.duration) {
                        this.seek(0);
                    }
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
        if (this._persistHandler) {
            this.removeEventListener('pause', this._persistHandler);
            this.removeEventListener('seek', this._persistHandler);
            this.removeEventListener('end', this._persistHandler);
            this._persistHandler = null;
        }
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }
}