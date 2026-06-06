interface HandlerInput {
    dx: number;
    dy: number;
    sdx: number;
    sdy: number;
}

interface Handler {
    (state: Record<string, unknown>, input: HandlerInput): Record<string, unknown>;
}

export interface PFExplorerConfig {
    handlers: Record<string, Handler>;
    getState: () => Record<string, unknown>;
    keyboardListener?: boolean;
}

const ZERO_INPUT: HandlerInput = { dx: 0, dy: 0, sdx: 0, sdy: 0 };

export class PFExplorer {
    private readonly handlers: Record<string, Handler>;
    private readonly getState: () => Record<string, unknown>;
    private readonly handlerKeys: Record<string, string[]>;
    private readonly handlerInputs: Record<string, { mouse: boolean; scroll: boolean }>;
    private _overrides: Record<string, unknown>;
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _pointerLockChangeHandler: (() => void) | null;
    private currentHandlerIndex: number;
    private readonly handlerNames: string[];
    private _isFirstMouseMove: boolean;
    private _cardElement: HTMLDivElement | null;
    private _transientMessage: string | null;
    private _transientTimeout: ReturnType<typeof setTimeout> | null;
    private _seededKeys: Set<string>;

    constructor(config: PFExplorerConfig) {
        this.handlers = config.handlers;
        this.getState = config.getState;
        this.handlerNames = Object.keys(config.handlers);
        this.handlerKeys = this._buildHandlerKeys();
        this.handlerInputs = this._buildHandlerInputs();
        this._overrides = {};
        this.currentHandlerIndex = 0;

        this._mouseMoveHandler = null;
        this._wheelHandler = null;
        this._keyboardListener = null;
        this._pointerLockChangeHandler = null;
        this._isFirstMouseMove = true;
        this._cardElement = null;
        this._transientMessage = null;
        this._transientTimeout = null;
        this._seededKeys = new Set();

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
        if (this._transientTimeout !== null) {
            clearTimeout(this._transientTimeout);
            this._transientTimeout = null;
        }
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

    // Probe each handler to see which input axes it responds to: mouse (dx/dy)
    // and/or scroll (sdx/sdy). Used to phrase the editing prompt.
    private _buildHandlerInputs(): Record<string, { mouse: boolean; scroll: boolean }> {
        const base = this.getState();
        const inputs: Record<string, { mouse: boolean; scroll: boolean }> = {};
        for (const name of this.handlerNames) {
            const handler = this.handlers[name];
            const zero = JSON.stringify(handler(base, ZERO_INPUT));
            const mouse = JSON.stringify(handler(base, { dx: 1, dy: 1, sdx: 0, sdy: 0 })) !== zero;
            const scroll = JSON.stringify(handler(base, { dx: 0, dy: 0, sdx: 1, sdy: 1 })) !== zero;
            inputs[name] = { mouse, scroll };
        }
        return inputs;
    }

    private _editPrompt(): string {
        const name = this.handlerNames[this.currentHandlerIndex];
        const usage = this.handlerInputs[name];
        let prompt: string;
        if (usage?.scroll && !usage.mouse) {
            prompt = 'scroll';
        } else if (usage?.mouse && usage.scroll) {
            prompt = 'move the mouse and scroll';
        } else {
            prompt = 'move the mouse';
        }

        const hasModified = (this.handlerKeys[name] ?? []).some(
            (key) => key in this._overrides && !this._seededKeys.has(key),
        );
        if (hasModified) {
            prompt += ', backspace to reset';
        }
        return prompt;
    }

    private _mergedState(): Record<string, unknown> {
        return { ...this.getState(), ...this._overrides };
    }

    // Seed the active handler's keys from getState into the overrides so their
    // current values are visible. Seeded keys are tracked as unmodified and get
    // dropped again on handler switch / lock exit unless the user edits them.
    private _seedActiveHandler(): void {
        const name = this.handlerNames[this.currentHandlerIndex];
        if (name === undefined) {
            return;
        }
        const base = this.getState();
        for (const key of this.handlerKeys[name] ?? []) {
            if (key in this._overrides) {
                continue;
            }
            if (key in base) {
                this._overrides[key] = base[key];
                this._seededKeys.add(key);
            }
        }
        this._refreshCard();
    }

    // Drop seeded-but-unmodified keys from the overrides.
    private _clearSeeded(): void {
        for (const key of this._seededKeys) {
            delete this._overrides[key];
        }
        this._seededKeys.clear();
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
            this._seededKeys.delete(key);
        }
        this._refreshCard();
    }

    private _clearActiveHandlerOverrides(): void {
        const name = this.handlerNames[this.currentHandlerIndex];
        for (const key of this.handlerKeys[name] ?? []) {
            delete this._overrides[key];
            this._seededKeys.delete(key);
        }
        if (document.pointerLockElement) {
            this._seedActiveHandler();
        } else {
            this._refreshCard();
        }
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
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    private _onHandlerSwitch(): void {
        this._clearSeeded();
        if (document.pointerLockElement) {
            this._seedActiveHandler();
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
            } else {
                this._clearSeeded();
            }
            this._refreshCard();
        }).bind(this);

        document.addEventListener('pointerlockchange', this._pointerLockChangeHandler);
    }

    private _round(value: unknown): unknown {
        if (typeof value === 'number') {
            return Number(value.toPrecision(14));
        }
        if (Array.isArray(value)) {
            return value.map((v) => this._round(v));
        }
        return value;
    }

    private async _copyOverrides(): Promise<void> {
        const rounded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(this._overrides)) {
            rounded[key] = this._round(value);
        }
        const dataStr = JSON.stringify(rounded, null, 2);
        try {
            await navigator.clipboard.writeText(dataStr);
            this._showTransient('copied!');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this._showTransient('copy failed');
        }
    }

    // Briefly override the card title with a status message, then revert.
    private _showTransient(message: string): void {
        this._transientMessage = message;
        if (this._transientTimeout !== null) {
            clearTimeout(this._transientTimeout);
        }
        this._transientTimeout = setTimeout(() => {
            this._transientMessage = null;
            this._transientTimeout = null;
            this._refreshCard();
        }, 1500);
        this._refreshCard();
    }

    private _setupCard(): void {
        const card = document.createElement('div');
        card.style.position = 'fixed';
        card.style.top = '16px';
        card.style.left = '16px';
        card.style.zIndex = '2147483646';
        card.style.pointerEvents = 'none';
        card.style.padding = '10px 14px';
        card.style.borderRadius = '14px';
        card.style.fontFamily = 'system-ui, sans-serif';
        card.style.fontSize = '13px';
        card.style.lineHeight = '1.4';
        card.style.color = 'hsl(0, 0%, 100%)';
        card.style.background = 'hsla(0, 0%, 0%, 0.65)';
        card.style.backdropFilter = 'blur(20px)';
        (card.style as any).webkitBackdropFilter = 'blur(20px)';
        card.style.boxShadow = '0 2px 8px hsla(0, 0%, 0%, 0.3)';
        card.style.minWidth = '250px';
        document.body.appendChild(card);
        this._cardElement = card;
        this._refreshCard();
    }

    private _formatValue(value: unknown): string {
        const rounded = this._round(value);
        if (Array.isArray(rounded)) {
            return rounded.map((v) => String(v)).join(', ');
        }
        return String(rounded);
    }

    private _refreshCard(): void {
        if (!this._cardElement) {
            return;
        }

        const card = this._cardElement;
        card.replaceChildren();

        const title = document.createElement('div');
        if (this._transientMessage !== null) {
            title.textContent = this._transientMessage;
        } else if (document.pointerLockElement !== null) {
            title.textContent = this._editPrompt();
        } else if (Object.keys(this._overrides).length === 0) {
            title.textContent = 'press enter to modify the parameters';
        } else {
            title.textContent = 'press E to copy changes';
        }
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
            const isEditing = isActive && document.pointerLockElement !== null;
            header.textContent = `${isActive ? '▶ ' : '  '}${name}`;
            header.style.fontFamily = 'ui-monospace, Menlo, monospace';
            header.style.fontSize = '15px';
            header.style.whiteSpace = 'pre';
            header.style.fontWeight = isActive ? '600' : '400';
            header.style.color = isEditing ? 'hsl(120, 50%, 50%)' : 'hsl(0, 0%, 80%)';
            header.style.opacity = isActive ? '1' : '0.6';
            section.appendChild(header);

            for (const key of this.handlerKeys[name] ?? []) {
                if (!(key in this._overrides)) {
                    continue;
                }
                const row = document.createElement('div');
                row.style.paddingLeft = '36px';
                row.style.fontSize = '12px';
                row.style.fontFamily = 'ui-monospace, monospace';
                row.style.whiteSpace = 'pre';
                row.style.opacity = '0.9';
                row.textContent = `${key}  ${this._formatValue(this._overrides[key])}`;
                section.appendChild(row);
            }

            card.appendChild(section);
        }
    }
}
