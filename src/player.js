export class Player extends EventTarget {
    constructor() {
        super()
        this._currentTime = 0
        this._startTime = null
        this._paused = true
    }

    // Public getters for state
    get currentTime() {
        if (this._paused) {
            return this._currentTime
        } else {
            return (Date.now() - this._startTime) / 1000
        }
    }

    get paused() {
        return this._paused
    }

    // Play method
    play() {
        if (this._paused) {
            this._startTime = Date.now() - (this._currentTime * 1000)
            this._currentTime = null
            this._paused = false
            this.dispatchEvent(new Event('play'))
        }
    }

    // Pause method
    pause() {
        if (!this._paused) {
            this._currentTime = (Date.now() - this._startTime) / 1000
            this._startTime = null
            this._paused = true
            this.dispatchEvent(new Event('pause'))
        }
    }

    // Seek method
    seek(time) {
        if (typeof time !== 'number' || time < 0) {
            throw new Error('Seek time must be a non-negative number')
        }

        if (this._paused) {
            this._currentTime = time
        } else {
            this._startTime = Date.now() - (time * 1000)
        }

        this.dispatchEvent(new CustomEvent('seek', {
            detail: {
                time
            }
        }))
    }
}