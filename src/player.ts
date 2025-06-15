export class Player extends EventTarget {
    public duration: number;
    private _currentTime: number;
    private _startTime: number | null;
    private _paused: boolean;
    private _endTimeout: number | null;

    constructor(config: { duration?: number } = {}) {
        super();
        this._currentTime = 0;
        this._startTime = null;
        this._paused = true;
        this.duration = config.duration ?? Infinity;
        this._endTimeout = null;
    }

    get currentTime(): number {
        if (this._paused) {
            return Math.min(this._currentTime, this.duration);
        } else {
            return Math.min((Date.now() - this._startTime!) / 1000, this.duration);
        }
    }

    get paused(): boolean {
        // this condition is necessary because there is nothing setting
        // `_paused` to true when the player reaches the end
        return this._paused || this.currentTime >= this.duration;
    }

    private _setupEndTimeout(): void {
        if (this._endTimeout !== null) {
            window.clearTimeout(this._endTimeout);
            this._endTimeout = null;
        }

        if (this.duration !== Infinity) {
            const timeUntilEnd = (this.duration - this.currentTime) * 1000;
            this._endTimeout = window.setTimeout(() => {
                this._currentTime = this.duration;
                this._startTime = null;
                this._paused = true;
                this.dispatchEvent(new Event('end'));
            }, timeUntilEnd);
        }
    }

    play(): void {
        if (this._paused && this.currentTime < this.duration) {
            this._startTime = Date.now() - (this._currentTime * 1000);
            this._currentTime = 0;
            this._paused = false;
            this.dispatchEvent(new Event('play'));
            this._setupEndTimeout();
        }
    }

    pause(): void {
        if (!this._paused) {
            this._currentTime = (Date.now() - this._startTime!) / 1000;
            this._startTime = null;
            this._paused = true;
            this.dispatchEvent(new Event('pause'));

            if (this._endTimeout !== null) {
                window.clearTimeout(this._endTimeout);
                this._endTimeout = null;
            }
        }
    }

    seek(time: number): void {
        if (typeof time !== 'number') {
            throw new Error('Seek time must be a number');
        }

        time = Math.max(0, Math.min(time, this.duration));

        if (this.paused) {
            // because when the player reaches the end, it will be paused automatically
            // in `get paused`, but nothing sets `_paused` to true.
            // note that here we are testing against `this.paused`, not `this._paused`.
            this._paused = true;

            this._currentTime = time;
        } else {
            this._startTime = Date.now() - (time * 1000);
        }

        this.dispatchEvent(new CustomEvent('seek', {
            detail: {
                time
            }
        }));

        this._setupEndTimeout();
    }
}