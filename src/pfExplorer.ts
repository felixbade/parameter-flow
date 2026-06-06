interface HandlerInput {
    dx: number;
    dy: number;
    sdx: number;
    sdy: number;
}

interface Handler {
    (state: Record<string, unknown>, input: HandlerInput): Record<string, unknown>;
}

export interface NotifyEvent {
    type: 'copy' | 'reset' | 'handler' | 'error';
    ok: boolean;
    message: string;
}

export interface PFExplorerConfig {
    handlers: Record<string, Handler>;
    getState: () => Record<string, unknown>;
    keyboardListener?: boolean;
    notify?: false | ((event: NotifyEvent) => void);
}

const ZERO_INPUT: HandlerInput = { dx: 0, dy: 0, sdx: 0, sdy: 0 };

export class PFExplorer {
    private readonly handlers: Record<string, Handler>;
    private readonly getState: () => Record<string, unknown>;
    private readonly handlerKeys: Record<string, string[]>;
    private _overrides: Record<string, unknown>;
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _pointerLockChangeHandler: (() => void) | null;
    private currentHandlerIndex: number;
    private readonly handlerNames: string[];
    private _isFirstMouseMove: boolean;
    private _notify: false | ((event: NotifyEvent) => void) | undefined;
    private _toastElement: HTMLDivElement | null;
    private _toastTimeout: ReturnType<typeof setTimeout> | null;
    private _cardElement: HTMLDivElement | null;

    constructor(config: PFExplorerConfig) {
        this.handlers = config.handlers;
        this.getState = config.getState;
        this.handlerNames = Object.keys(config.handlers);
        this.handlerKeys = this._buildHandlerKeys();
        this._overrides = {};
        this.currentHandlerIndex = 0;

        this._mouseMoveHandler = null;
        this._wheelHandler = null;
        this._keyboardListener = null;
        this._pointerLockChangeHandler = null;
        this._isFirstMouseMove = true;
        this._notify = config.notify;
        this._toastElement = null;
        this._toastTimeout = null;
        this._cardElement = null;

        this._setupCard();
        this._setupPointerLockListener();

        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
        }
    }

    public getOverrides(): Readonly<Record<string, unknown>> {
        return this._overrides;
    }

    public destroy(): void {
        if (this._mouseMoveHandler) {
            document.removeEventListener('mousemove', this._mouseMoveHandler);
            this._mouseMoveHandler = null;
        }
        if (this._wheelHandler) {
            document.removeEventListener('wheel', this._wheelHandler);
            this._wheelHandler = null;
        }
        if (this._keyboardListener) {
            window.removeEventListener('keydown', this._keyboardListener);
            this._keyboardListener = null;
        }
        if (this._pointerLockChangeHandler) {
            document.removeEventListener('pointerlockchange', this._pointerLockChangeHandler);
            this._pointerLockChangeHandler = null;
        }
        if (this._toastTimeout !== null) {
            clearTimeout(this._toastTimeout);
            this._toastTimeout = null;
        }
        if (this._toastElement?.parentNode) {
            this._toastElement.parentNode.removeChild(this._toastElement);
        }
        this._toastElement = null;
        if (this._cardElement?.parentNode) {
            this._cardElement.parentNode.removeChild(this._cardElement);
        }
        this._cardElement = null;
    }

    private _buildHandlerKeys(): Record<string, string[]> {
        const base = this.getState();
        const keys: Record<string, string[]> = {};
        for (const name of this.handlerNames) {
            const handler = this.handlers[name];
            keys[name] = Object.keys(handler(base, ZERO_INPUT));
        }
        return keys;
    }

    private _mergedState(): Record<string, unknown> {
        return { ...this.getState(), ...this._overrides };
    }

    private _seedActiveHandler(): void {
        const name = this.handlerNames[this.currentHandlerIndex];
        const handler = this.handlers[name];
        if (!handler) {
            return;
        }

        const base = this.getState();
        const paramKeys = Object.keys(handler(this._mergedState(), ZERO_INPUT));
        for (const key of paramKeys) {
            if (key in base) {
                this._overrides[key] = base[key];
            }
        }
        this._refreshCard();
    }

    private _applyHandlerInput(input: HandlerInput): void {
        if (!document.pointerLockElement || this.handlerNames.length === 0) {
            return;
        }

        const name = this.handlerNames[this.currentHandlerIndex];
        const handler = this.handlers[name];
        if (!handler) {
            return;
        }

        const delta = handler(this._mergedState(), input);
        for (const [key, value] of Object.entries(delta)) {
            this._overrides[key] = value;
        }
        this._refreshCard();
    }

    private _clearActiveHandlerOverrides(): void {
        const name = this.handlerNames[this.currentHandlerIndex];
        for (const key of this.handlerKeys[name] ?? []) {
            delete this._overrides[key];
        }
        this._refreshCard();
    }

    private _setupKeyboardListener(): void {
        const handleKeyPress = ((event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                } else {
                    document.body.requestPointerLock();
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.currentHandlerIndex = (this.currentHandlerIndex - 1 + this.handlerNames.length) % this.handlerNames.length;
                this._onHandlerSwitch();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.currentHandlerIndex = (this.currentHandlerIndex + 1) % this.handlerNames.length;
                this._onHandlerSwitch();
            } else if (event.key >= '1' && event.key <= '9') {
                event.preventDefault();
                const handlerIndex = parseInt(event.key) - 1;
                if (handlerIndex < this.handlerNames.length) {
                    this.currentHandlerIndex = handlerIndex;
                    this._onHandlerSwitch();
                }
            } else if (event.key === 'e' || event.key === 'E') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                void this._copyOverrides();
            } else if (event.key === 'Backspace') {
                event.preventDefault();
                this._clearActiveHandlerOverrides();
                this.emitNotify({ type: 'reset', ok: true, message: 'Reset parameters' });
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    private _onHandlerSwitch(): void {
        if (document.pointerLockElement) {
            this._seedActiveHandler();
            this.notifyActiveHandler();
        } else {
            this._refreshCard();
        }
    }

    private _setupPointerLockListener(): void {
        this._mouseMoveHandler = ((event: MouseEvent) => {
            if (this._isFirstMouseMove) {
                this._isFirstMouseMove = false;
                return;
            }

            this._applyHandlerInput({
                dx: event.movementX,
                dy: event.movementY,
                sdx: 0,
                sdy: 0,
            });
        }).bind(this);

        document.addEventListener('mousemove', this._mouseMoveHandler);

        this._wheelHandler = ((event: WheelEvent) => {
            this._applyHandlerInput({
                dx: 0,
                dy: 0,
                sdx: event.deltaX,
                sdy: event.deltaY,
            });
        }).bind(this);

        document.addEventListener('wheel', this._wheelHandler);

        this._pointerLockChangeHandler = (() => {
            if (document.pointerLockElement) {
                this._isFirstMouseMove = true;
                this._seedActiveHandler();
                this.notifyActiveHandler();
            } else {
                this.dismissToast();
            }
            this._refreshCard();
        }).bind(this);

        document.addEventListener('pointerlockchange', this._pointerLockChangeHandler);
    }

    private async _copyOverrides(): Promise<void> {
        const dataStr = JSON.stringify(this._overrides, null, 2);
        try {
            await navigator.clipboard.writeText(dataStr);
            this.emitNotify({ type: 'copy', ok: true, message: 'Copied to clipboard' });
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.emitNotify({ type: 'error', ok: false, message: 'Clipboard copy failed' });
        }
    }

    private _setupCard(): void {
        const card = document.createElement('div');
        card.style.position = 'fixed';
        card.style.top = '16px';
        card.style.left = '16px';
        card.style.zIndex = '2147483646';
        card.style.pointerEvents = 'none';
        card.style.padding = '10px 14px';
        card.style.borderRadius = '10px';
        card.style.fontFamily = 'system-ui, sans-serif';
        card.style.fontSize = '13px';
        card.style.lineHeight = '1.4';
        card.style.color = '#fff';
        card.style.background = 'rgba(0, 0, 0, 0.75)';
        card.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        card.style.minWidth = '200px';
        document.body.appendChild(card);
        this._cardElement = card;
        this._refreshCard();
    }

    private _formatValue(value: unknown): string {
        if (typeof value === 'number') {
            return value.toFixed(4);
        }
        if (Array.isArray(value)) {
            return value.map((v) => (typeof v === 'number' ? v.toFixed(3) : String(v))).join(', ');
        }
        return String(value);
    }

    private _refreshCard(): void {
        if (!this._cardElement) {
            return;
        }

        const card = this._cardElement;
        card.replaceChildren();

        const title = document.createElement('div');
        title.textContent = 'press E to copy changes';
        title.style.fontSize = '11px';
        title.style.opacity = '0.7';
        title.style.marginBottom = '8px';
        card.appendChild(title);

        for (let i = 0; i < this.handlerNames.length; i++) {
            const name = this.handlerNames[i];
            const section = document.createElement('div');
            section.style.marginBottom = '6px';

            const header = document.createElement('div');
            const isActive = i === this.currentHandlerIndex;
            header.textContent = `${isActive ? '▶ ' : '  '}${name}`;
            header.style.fontWeight = isActive ? '600' : '400';
            header.style.opacity = isActive ? '1' : '0.6';
            section.appendChild(header);

            for (const key of this.handlerKeys[name] ?? []) {
                if (!(key in this._overrides)) {
                    continue;
                }
                const row = document.createElement('div');
                row.style.paddingLeft = '14px';
                row.style.fontSize = '12px';
                row.style.opacity = '0.9';
                row.textContent = `${key}  ${this._formatValue(this._overrides[key])}`;
                section.appendChild(row);
            }

            card.appendChild(section);
        }
    }

    private notifyActiveHandler(): void {
        if (this.handlerNames.length === 0) {
            return;
        }
        if (this.currentHandlerIndex < 0 || this.currentHandlerIndex >= this.handlerNames.length) {
            return;
        }
        const handlerName = this.handlerNames[this.currentHandlerIndex];
        console.log('Active handler:', handlerName);
        if (!document.pointerLockElement) {
            return;
        }
        this.emitNotify({ type: 'handler', ok: true, message: `Editing ${handlerName}` });
    }

    private emitNotify(event: NotifyEvent): void {
        if (this._notify === false) {
            return;
        }
        if (typeof this._notify === 'function') {
            this._notify(event);
            return;
        }
        this.showToast(event);
    }

    private showToast(event: NotifyEvent): void {
        if (!this._toastElement) {
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.top = '16px';
            toast.style.right = '16px';
            toast.style.zIndex = '2147483647';
            toast.style.pointerEvents = 'none';
            toast.style.padding = '8px 14px';
            toast.style.borderRadius = '10px';
            toast.style.fontFamily = 'system-ui, sans-serif';
            toast.style.fontSize = '13px';
            toast.style.lineHeight = '1.2';
            toast.style.color = '#fff';
            toast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
            document.body.appendChild(toast);
            this._toastElement = toast;
        }

        const toast = this._toastElement;
        toast.textContent = event.message;
        toast.style.background = event.ok ? '#2e7d32' : '#c62828';

        if (this._toastTimeout !== null) {
            clearTimeout(this._toastTimeout);
        }
        this._toastTimeout = setTimeout(() => {
            if (this._toastElement?.parentNode) {
                this._toastElement.parentNode.removeChild(this._toastElement);
            }
            this._toastElement = null;
            this._toastTimeout = null;
        }, 1500);
    }

    private dismissToast(): void {
        if (this._toastTimeout !== null) {
            clearTimeout(this._toastTimeout);
            this._toastTimeout = null;
        }
        if (this._toastElement?.parentNode) {
            this._toastElement.parentNode.removeChild(this._toastElement);
        }
        this._toastElement = null;
    }
}
