import { TimelinePlayer } from './timelinePlayer';

interface Handler {
    (state: Record<string, number>, ...args: any[]): void;
}

interface PFEditorConfig {
    duration: number;
    variables: Record<string, number>;
    handlers: Record<string, Handler>;
    keyboardListener?: boolean;
}

export class PFEditor {
    private state: Record<string, number>;
    private handlers: PFEditorConfig['handlers'];
    private timelinePlayer: TimelinePlayer;
    private _pointerLockMoveHandler: ((event: MouseEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];

    constructor(config: PFEditorConfig) {
        this.state = { ...config.variables };
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
                    currentHandler(this.state, {
                        dx: event.movementX,
                        dy: event.movementY
                    });
                }
            }
        }).bind(this);

        document.addEventListener('mousemove', this._pointerLockMoveHandler);
    }

    public getCurrentValues(): Record<string, number> {
        return { ...this.state };
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