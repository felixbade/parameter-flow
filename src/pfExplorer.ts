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
    storageKey?: string;
    title?: string;
}

const ZERO_INPUT: HandlerInput = { dx: 0, dy: 0, sdx: 0, sdy: 0 };
const DEFAULT_STORAGE_KEY = 'pf-explorer-overrides';

interface TrackedTouch {
    identifier: number;
    x: number;
    y: number;
}

export class PFExplorer {
    private handlers: Record<string, Handler>;
    private readonly getState: () => Record<string, unknown>;
    private handlerKeys: Record<string, string[]>;
    private handlerInputs: Record<string, { mouse: boolean; scroll: boolean }>;
    private _overrides: Record<string, unknown>;
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _pointerLockChangeHandler: (() => void) | null;
    private _touchStartHandler: ((event: TouchEvent) => void) | null;
    private _touchMoveHandler: ((event: TouchEvent) => void) | null;
    private _touchEndHandler: ((event: TouchEvent) => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];
    private _isFirstMouseMove: boolean;
    private _primaryTouch: TrackedTouch | null;
    private _secondaryTouch: TrackedTouch | null;
    private _touchActive: boolean;
    private _cardElement: HTMLDivElement | null;
    private _titleText: string | null;
    private _transientMessage: string | null;
    private _transientTimeout: ReturnType<typeof setTimeout> | null;
    private _seededKeys: Set<string>;
    private _storageKey: string | null;
    private _beforeUnloadHandler: (() => void) | null;

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
        this._touchStartHandler = null;
        this._touchMoveHandler = null;
        this._touchEndHandler = null;
        this._isFirstMouseMove = true;
        this._primaryTouch = null;
        this._secondaryTouch = null;
        this._touchActive = false;
        this._cardElement = null;
        this._titleText = config.title ?? null;
        this._transientMessage = null;
        this._transientTimeout = null;
        this._seededKeys = new Set();
        this._storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
        this._beforeUnloadHandler = null;

        this._load();

        this._setupCard();
        this._setupPointerLockListener();
        this._setupTouchListener();
        this._setupBeforeUnloadListener();

        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
        }
    }

    public getOverrides(): Readonly<Record<string, unknown>> {
        return this._overrides;
    }

    // Set the card's top title (e.g. the name of the active base parameters).
    // Pass null/empty to hide it.
    public setTitle(title: string | null): void {
        this._titleText = title && title.length > 0 ? title : null;
        this._refreshCard();
    }

    // Swap the live handler set at runtime (e.g. when the active mode changes).
    // The card and keyboard navigation re-scope to the new handlers, but the
    // user's edited overrides persist and re-apply when a handler returns.
    public setHandlers(handlers: Record<string, Handler>): void {
        this.handlers = handlers;
        this.handlerNames = Object.keys(handlers);
        this.handlerKeys = this._buildHandlerKeys();
        this.handlerInputs = this._buildHandlerInputs();

        this._clearSeeded();

        this.currentHandlerIndex =
            this.handlerNames.length === 0
                ? 0
                : Math.min(this.currentHandlerIndex, this.handlerNames.length - 1);

        if (document.pointerLockElement) {
            this._seedActiveHandler();
        } else {
            this._refreshCard();
        }
    }

    public destroy(): void {
        this._save();
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
        if (this._touchStartHandler) {
            window.removeEventListener('touchstart', this._touchStartHandler);
            this._touchStartHandler = null;
        }
        if (this._touchMoveHandler) {
            window.removeEventListener('touchmove', this._touchMoveHandler);
            this._touchMoveHandler = null;
        }
        if (this._touchEndHandler) {
            window.removeEventListener('touchend', this._touchEndHandler);
            window.removeEventListener('touchcancel', this._touchEndHandler);
            this._touchEndHandler = null;
        }
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
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
        if ((!document.pointerLockElement && !this._touchActive) || this.handlerNames.length === 0) {
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

    private _setupBeforeUnloadListener(): void {
        this._beforeUnloadHandler = () => {
            this._save();
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }

    private _onHandlerSwitch(): void {
        this._clearSeeded();
        if (document.pointerLockElement) {
            this._seedActiveHandler();
        } else {
            this._refreshCard();
        }
    }

    private _handlerIndexFromTouchTarget(target: EventTarget | null): number | null {
        if (!(target instanceof Element) || !this._cardElement?.contains(target)) {
            return null;
        }

        const handlerElement = target.closest('[data-pf-explorer-handler-index]');
        if (!handlerElement) {
            return null;
        }

        const index = Number((handlerElement as HTMLElement).dataset.pfExplorerHandlerIndex);
        if (!Number.isInteger(index) || index < 0 || index >= this.handlerNames.length) {
            return null;
        }

        return index;
    }

    private _touchByIdentifier(touches: TouchList, identifier: number): Touch | null {
        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            if (touch.identifier === identifier) {
                return touch;
            }
        }

        return null;
    }

    private _resetTouchTracking(): void {
        this._touchActive = false;
        this._primaryTouch = null;
        this._secondaryTouch = null;
        this._clearSeeded();
        this._refreshCard();
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
            if (document.pointerLockElement) {
                // Stop horizontal scroll from triggering Chrome's
                // swipe-to-go-back navigation gesture while editing.
                event.preventDefault();
            }
            this._applyHandlerInput({
                dx: 0,
                dy: 0,
                sdx: event.deltaX,
                sdy: event.deltaY,
            });
        }).bind(this);

        document.addEventListener('wheel', this._wheelHandler, { passive: false });

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

    private _setupTouchListener(): void {
        this._touchStartHandler = ((event: TouchEvent) => {
            if (event.touches.length === 0) {
                return;
            }

            if (!this._touchActive) {
                const handlerIndex = this._handlerIndexFromTouchTarget(event.target);
                if (handlerIndex !== null && handlerIndex !== this.currentHandlerIndex) {
                    this.currentHandlerIndex = handlerIndex;
                    this._clearSeeded();
                }

                const primaryTouch = event.touches[0];
                this._touchActive = true;
                this._primaryTouch = {
                    identifier: primaryTouch.identifier,
                    x: primaryTouch.clientX,
                    y: primaryTouch.clientY,
                };
                this._secondaryTouch = null;
                this._seedActiveHandler();
            }

            if (this._secondaryTouch === null && event.touches.length >= 2) {
                const secondaryTouch = event.touches[1];
                if (secondaryTouch.identifier !== this._primaryTouch?.identifier) {
                    this._secondaryTouch = {
                        identifier: secondaryTouch.identifier,
                        x: secondaryTouch.clientX,
                        y: secondaryTouch.clientY,
                    };
                }
            }

            event.preventDefault();
        }).bind(this);

        this._touchMoveHandler = ((event: TouchEvent) => {
            if (!this._touchActive || this._primaryTouch === null) {
                return;
            }

            let dx = 0;
            let dy = 0;
            let sdx = 0;
            let sdy = 0;

            const primaryTouch = this._touchByIdentifier(event.touches, this._primaryTouch.identifier);
            if (primaryTouch) {
                dx = primaryTouch.clientX - this._primaryTouch.x;
                dy = primaryTouch.clientY - this._primaryTouch.y;
                this._primaryTouch = {
                    identifier: primaryTouch.identifier,
                    x: primaryTouch.clientX,
                    y: primaryTouch.clientY,
                };
            }

            if (this._secondaryTouch) {
                const secondaryTouch = this._touchByIdentifier(event.touches, this._secondaryTouch.identifier);
                if (secondaryTouch) {
                    sdx = this._secondaryTouch.x - secondaryTouch.clientX;
                    sdy = this._secondaryTouch.y - secondaryTouch.clientY;
                    this._secondaryTouch = {
                        identifier: secondaryTouch.identifier,
                        x: secondaryTouch.clientX,
                        y: secondaryTouch.clientY,
                    };
                }
            }

            this._applyHandlerInput({ dx, dy, sdx, sdy });
            event.preventDefault();
        }).bind(this);

        this._touchEndHandler = ((event: TouchEvent) => {
            if (!this._touchActive) {
                return;
            }

            if (this._primaryTouch && !this._touchByIdentifier(event.touches, this._primaryTouch.identifier)) {
                this._resetTouchTracking();
                return;
            }

            if (this._secondaryTouch && !this._touchByIdentifier(event.touches, this._secondaryTouch.identifier)) {
                this._secondaryTouch = null;
            }

            event.preventDefault();
        }).bind(this);

        window.addEventListener('touchstart', this._touchStartHandler, { passive: false });
        window.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
        window.addEventListener('touchend', this._touchEndHandler);
        window.addEventListener('touchcancel', this._touchEndHandler);
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

    private _persistableOverrides(): Record<string, unknown> {
        const overrides: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(this._overrides)) {
            if (!this._seededKeys.has(key)) {
                overrides[key] = value;
            }
        }
        return overrides;
    }

    private _save(): void {
        if (!this._storageKey) {
            return;
        }
        try {
            localStorage.setItem(this._storageKey, JSON.stringify({
                overrides: this._persistableOverrides(),
                handlerIndex: this.currentHandlerIndex,
            }));
        } catch (error) {
            console.error('PFExplorer save failed:', error);
        }
    }

    private _load(): void {
        if (!this._storageKey) {
            return;
        }
        try {
            const savedData = localStorage.getItem(this._storageKey);
            if (!savedData) {
                return;
            }
            const data = JSON.parse(savedData);
            if (data?.overrides && typeof data.overrides === 'object' && !Array.isArray(data.overrides)) {
                this._overrides = { ...data.overrides };
            }
            if (typeof data?.handlerIndex === 'number' && this.handlerNames.length > 0) {
                this.currentHandlerIndex = Math.min(
                    Math.max(0, data.handlerIndex),
                    this.handlerNames.length - 1,
                );
            }
        } catch (error) {
            console.error('PFExplorer load failed:', error);
        }
    }

    // True when at least one override key controlled by a currently visible
    // handler has been edited (not just seeded from the base values).
    private _hasVisibleModified(): boolean {
        for (const name of this.handlerNames) {
            for (const key of this.handlerKeys[name] ?? []) {
                if (key in this._overrides && !this._seededKeys.has(key)) {
                    return true;
                }
            }
        }
        return false;
    }

    private async _copyOverrides(): Promise<void> {
        // Only export keys controlled by the currently visible handlers; overrides
        // held in memory for other (swapped-out) handler sets are trimmed.
        const visibleKeys = new Set<string>();
        for (const name of this.handlerNames) {
            for (const key of this.handlerKeys[name] ?? []) {
                visibleKeys.add(key);
            }
        }
        const rounded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(this._overrides)) {
            if (!visibleKeys.has(key)) {
                continue;
            }
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
        card.style.border = '1px solid hsla(0, 0%, 100%, 0.08)';
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

        if (this._titleText !== null) {
            const heading = document.createElement('div');
            heading.textContent = this._titleText;
            heading.style.fontSize = '14px';
            heading.style.fontWeight = '600';
            heading.style.marginBottom = '8px';
            card.appendChild(heading);
        }

        for (let i = 0; i < this.handlerNames.length; i++) {
            const name = this.handlerNames[i];
            const section = document.createElement('div');
            section.style.marginBottom = '6px';

            const header = document.createElement('div');
            const isActive = i === this.currentHandlerIndex;
            const isEditing = isActive && document.pointerLockElement !== null;
            header.dataset.pfExplorerHandlerIndex = String(i);
            header.textContent = `${isActive ? '▶ ' : '  '}${name}`;
            header.style.fontFamily = 'ui-monospace, Menlo, monospace';
            header.style.fontSize = '15px';
            header.style.whiteSpace = 'pre';
            header.style.fontWeight = isActive ? '600' : '400';
            header.style.color = isEditing ? 'hsl(120, 50%, 50%)' : 'hsl(0, 0%, 80%)';
            header.style.opacity = isActive ? '1' : '0.6';
            header.style.pointerEvents = 'auto';
            header.style.touchAction = 'none';
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
                row.style.color = this._seededKeys.has(key) ? 'hsl(0, 0%, 50%)' : 'hsl(0, 0%, 100%)';
                row.textContent = `${key}  ${this._formatValue(this._overrides[key])}`;
                section.appendChild(row);
            }

            card.appendChild(section);
        }

        const tooltip = document.createElement('div');
        if (this._transientMessage !== null) {
            tooltip.textContent = this._transientMessage;
        } else if (document.pointerLockElement !== null) {
            tooltip.textContent = this._editPrompt();
        } else if (this._hasVisibleModified()) {
            tooltip.textContent = 'press E to copy changes';
        } else {
            tooltip.textContent = 'press enter to modify the parameters';
        }
        tooltip.style.fontSize = '11px';
        tooltip.style.opacity = '0.7';
        tooltip.style.marginTop = '8px';
        card.appendChild(tooltip);
    }
}
