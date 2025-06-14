export class Player extends EventTarget {
    private _currentTime: number;
    private _startTime: number | null;
    private _paused: boolean;

    constructor() {
        super();
        this._currentTime = 0;
        this._startTime = null;
        this._paused = true;
    }

    get currentTime(): number {
        if (this._paused) {
            return this._currentTime;
        } else {
            return (Date.now() - this._startTime!) / 1000;
        }
    }

    get paused(): boolean {
        return this._paused;
    }

    play(): void {
        if (this._paused) {
            this._startTime = Date.now() - (this._currentTime * 1000);
            this._currentTime = 0;
            this._paused = false;
            this.dispatchEvent(new Event('play'));
        }
    }

    pause(): void {
        if (!this._paused) {
            this._currentTime = (Date.now() - this._startTime!) / 1000;
            this._startTime = null;
            this._paused = true;
            this.dispatchEvent(new Event('pause'));
        }
    }

    seek(time: number): void {
        if (typeof time !== 'number' || time < 0) {
            throw new Error('Seek time must be a non-negative number');
        }

        if (this._paused) {
            this._currentTime = time;
        } else {
            this._startTime = Date.now() - (time * 1000);
        }

        this.dispatchEvent(new CustomEvent('seek', {
            detail: {
                time
            }
        }));
    }
}