import { TimelinePlayer } from './timelinePlayer';
import { PFAnimation } from './pfAnimation';

interface Handler {
    (state: Record<string, number>, ...args: any[]): Record<string, number>;
}

interface PFEditorConfig {
    duration: number;
    variables: Record<string, number>;
    handlers: Record<string, Handler>;
    keyboardListener?: boolean;
}

export class PFEditor {
    private animation: PFAnimation;
    private handlers: PFEditorConfig['handlers'];
    private timelinePlayer: TimelinePlayer;
    private _pointerLockMoveHandler: ((event: MouseEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];

    constructor(config: PFEditorConfig) {
        // Initialize animation with initial keyframes at time 0
        const initialKeyframes: Record<string, { time: number; value: number }[]> = {};
        for (const [key, value] of Object.entries(config.variables)) {
            initialKeyframes[key] = [{ time: 0, value }];
        }
        this.animation = new PFAnimation(initialKeyframes);

        this.handlers = config.handlers;
        this.handlerNames = Object.keys(config.handlers);
        this.currentHandlerIndex = 0;

        this.timelinePlayer = new TimelinePlayer(config);

        this._pointerLockMoveHandler = null;
        this._keyboardListener = null;

        this._setupPointerLockListener();

        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
        }
    }

    private _setupKeyboardListener(): void {
        const handleKeyPress = ((event: KeyboardEvent) => {
            if (event.code === 'Enter') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                } else {
                    document.body.requestPointerLock();
                }
            } else if (event.code === 'ArrowUp') {
                event.preventDefault();
                this.currentHandlerIndex = (this.currentHandlerIndex - 1 + this.handlerNames.length) % this.handlerNames.length;
                console.log('Active handler:', this.handlerNames[this.currentHandlerIndex]);
            } else if (event.code === 'ArrowDown') {
                event.preventDefault();
                this.currentHandlerIndex = (this.currentHandlerIndex + 1) % this.handlerNames.length;
                console.log('Active handler:', this.handlerNames[this.currentHandlerIndex]);
            } else if (event.code >= 'Digit1' && event.code <= 'Digit9') {
                event.preventDefault();
                const handlerIndex = parseInt(event.code.replace('Digit', '')) - 1;
                if (handlerIndex < this.handlerNames.length) {
                    this.currentHandlerIndex = handlerIndex;
                    console.log('Active handler:', this.handlerNames[this.currentHandlerIndex]);
                }
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    private _setupPointerLockListener(): void {
        this._pointerLockMoveHandler = ((event: MouseEvent) => {
            if (document.pointerLockElement && this.handlerNames.length > 0) {
                const currentHandlerName = this.handlerNames[this.currentHandlerIndex];
                const currentHandler = this.handlers[currentHandlerName];
                if (currentHandler) {
                    const currentState = this.getCurrentValues();

                    const stateDelta = currentHandler(currentState, {
                        dx: event.movementX,
                        dy: event.movementY
                    });

                    for (const [key, delta] of Object.entries(stateDelta)) {
                        const newValue = currentState[key] + delta;
                        this.animation.addOrUpdateKeyframe(key, this.timelinePlayer.currentTime, newValue);
                    }
                }
            }
        }).bind(this);

        document.addEventListener('mousemove', this._pointerLockMoveHandler);
    }

    public getCurrentValues(): Record<string, number> {
        return this.animation.getValuesAt(this.timelinePlayer.currentTime);
    }

    public get currentTime(): number {
        return this.timelinePlayer.currentTime;
    }

    public get element(): HTMLDivElement {
        return this.timelinePlayer.element;
    }

    public addEventListener(event: string, handler: (...args: any[]) => void): void {
        this.timelinePlayer.addEventListener(event, handler);
    }

    public destroy(): void {
        if (this._pointerLockMoveHandler) {
            document.removeEventListener('mousemove', this._pointerLockMoveHandler);
            this._pointerLockMoveHandler = null;
        }
        if (this._keyboardListener) {
            window.removeEventListener('keydown', this._keyboardListener);
            this._keyboardListener = null;
        }
        this.timelinePlayer.destroy();
    }
}