import { TimelinePlayer } from './timelinePlayer';
import { PFAnimation } from './pfAnimation';

interface Handler {
    (state: Parameters, ...args: any[]): Parameters;
}

interface Parameters {
    [key: string]: number;
}

export interface NotifyEvent {
    type: 'export' | 'import' | 'reset' | 'error' | 'handler';
    ok: boolean;
    message: string;
}

interface PFEditorConfig {
    duration: number;
    variables: Parameters;
    handlers: Record<string, Handler>;
    keyboardListener?: boolean;
    clipboard?: boolean;
    notify?: false | ((event: NotifyEvent) => void);
}

export class PFExplorer {
    private parameters!: Parameters;
    private handlers: PFEditorConfig['handlers'];
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private _pointerLockChangeHandler: (() => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];
    private _beforeUnloadHandler: (() => void) | null;
    private _initialValues: Parameters;
    private _isFirstMouseMove: boolean;
    private _useClipboard: boolean;
    private _notify: false | ((event: NotifyEvent) => void) | undefined;
    private _toastElement: HTMLDivElement | null;
    private _toastTimeout: ReturnType<typeof setTimeout> | null;

    constructor(config: PFEditorConfig) {
        this._initialValues = { ...config.variables };

        const savedParameters = this.loadFromLocalStorage();

        if (savedParameters) {
            this.loadParameters(savedParameters);
        } else {
            this.loadParameters();
        }

        this.handlers = config.handlers;
        this.handlerNames = Object.keys(config.handlers);
        this.currentHandlerIndex = 0;

        this._mouseMoveHandler = null;
        this._wheelHandler = null;
        this._keyboardListener = null;
        this._pointerLockChangeHandler = null;
        this._beforeUnloadHandler = null;
        this._isFirstMouseMove = true;
        this._useClipboard = config.clipboard === true;
        this._notify = config.notify;
        this._toastElement = null;
        this._toastTimeout = null;

        this._setupPointerLockListener();

        if (config.keyboardListener !== false) {
            this._setupKeyboardListener();
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
                this.notifyActiveHandler();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.currentHandlerIndex = (this.currentHandlerIndex + 1) % this.handlerNames.length;
                this.notifyActiveHandler();
            } else if (event.key >= '1' && event.key <= '9') {
                event.preventDefault();
                const handlerIndex = parseInt(event.key) - 1;
                if (handlerIndex < this.handlerNames.length) {
                    this.currentHandlerIndex = handlerIndex;
                    this.notifyActiveHandler();
                }
            } else if (event.key === 'e' || event.key === 'E') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.exportParameters();
            } else if (event.key === 'i' || event.key === 'I') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.importParameters();
            } else if (event.key === 'Backspace') {
                event.preventDefault();
                this.resetEditingParameters();
                this.saveToLocalStorage();
                this.emitNotify({ type: 'reset', ok: true, message: 'Reset parameters' });
            }
        }).bind(this);

        window.addEventListener('keydown', handleKeyPress);
        this._keyboardListener = handleKeyPress;
    }

    private _setupPointerLockListener(): void {
        this._mouseMoveHandler = ((event: MouseEvent) => {
            // Discard the first mouse move event to avoid large initial movement values.
            // Not sure if this is a bug in Chrome, but when reloading often, it's confusing.
            if (this._isFirstMouseMove) {
                this._isFirstMouseMove = false;
                return;
            }

            if (document.pointerLockElement && this.handlerNames.length > 0) {
                const currentHandlerName = this.handlerNames[this.currentHandlerIndex];
                const currentHandler = this.handlers[currentHandlerName];
                if (currentHandler) {
                    const currentState = this.getCurrentValues();

                    const newValues = currentHandler(currentState, {
                        dx: event.movementX,
                        dy: event.movementY,
                        sdx: 0,
                        sdy: 0,
                    });

                    for (const [key, newValue] of Object.entries(newValues)) {
                        this.parameters[key] = newValue;
                    }
                    this.saveToLocalStorage();
                }
            }
        }).bind(this);

        document.addEventListener('mousemove', this._mouseMoveHandler);

        this._wheelHandler = ((event: WheelEvent) => {
            if (document.pointerLockElement && this.handlerNames.length > 0) {
                const currentHandlerName = this.handlerNames[this.currentHandlerIndex];
                const currentHandler = this.handlers[currentHandlerName];
                if (currentHandler) {
                    const currentState = this.getCurrentValues();

                    const newValues = currentHandler(currentState, {
                        dx: 0,
                        dy: 0,
                        sdx: event.deltaX,
                        sdy: event.deltaY,
                    });

                    for (const [key, newValue] of Object.entries(newValues)) {
                        this.parameters[key] = newValue;
                    }
                    this.saveToLocalStorage();
                }
            }
        }).bind(this);

        document.addEventListener('wheel', this._wheelHandler);

        this._pointerLockChangeHandler = (() => {
            if (document.pointerLockElement) {
                this.notifyActiveHandler();
            }
        }).bind(this);

        document.addEventListener('pointerlockchange', this._pointerLockChangeHandler);
    }

    private resetEditingParameters(): void {
        const handlerEditingParameters = this.getEditedParameters();

        for (const parameter of handlerEditingParameters) {
            this.parameters[parameter] = this._initialValues[parameter];
        }
    }

    private getEditedParameters(): string[] {
        if (this.handlerNames.length === 0) {
            return [];
        }

        const currentHandlerName = this.handlerNames[this.currentHandlerIndex];
        const currentHandler = this.handlers[currentHandlerName];
        if (!currentHandler) {
            return [];
        }

        const stateDelta = currentHandler(this.getCurrentValues(), { dx: 0, dy: 0 });

        return Object.keys(stateDelta);
    }

    public getCurrentValues(): Parameters {
        return this.parameters;
    }

    public get element(): HTMLDivElement {
        console.warn('PFExplorer does not have an element – this method is only provided for compatibility with PFEditor')
        return document.createElement('div');
    }

    public addEventListener(event: string, handler: (...args: any[]) => void): void {
        console.warn('PFExplorer does not have events – this method is only provided for compatibility with PFEditor');
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
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
        if (this._toastTimeout !== null) {
            clearTimeout(this._toastTimeout);
            this._toastTimeout = null;
        }
        if (this._toastElement && this._toastElement.parentNode) {
            this._toastElement.parentNode.removeChild(this._toastElement);
        }
        this._toastElement = null;
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
            if (this._toastElement && this._toastElement.parentNode) {
                this._toastElement.parentNode.removeChild(this._toastElement);
            }
            this._toastElement = null;
            this._toastTimeout = null;
        }, 1500);
    }

    private serializeParameters(): string {
        return JSON.stringify({
            variables: this.parameters,
        }, null, 2);
    }

    private parseAndLoadParameters(text: string): void {
        try {
            const data = JSON.parse(text);
            if (data.variables) {
                this.loadParameters(data.variables);
                this.emitNotify({ type: 'import', ok: true, message: 'Imported parameters' });
            } else if (data.parameters) {
                console.error('PFExplorer does not support PFAnimation format');
                this.emitNotify({ type: 'error', ok: false, message: 'Unsupported animation format' });
            } else {
                console.error('Invalid file format (no `variables` key)');
                this.emitNotify({ type: 'error', ok: false, message: 'Invalid file (no variables)' });
            }
        } catch (error) {
            console.error('Invalid file format (JSON decode error)');
            this.emitNotify({ type: 'error', ok: false, message: 'Invalid file (JSON error)' });
        }
    }

    private async exportParameters(): Promise<void> {
        const dataStr = this.serializeParameters();
        if (this._useClipboard) {
            await navigator.clipboard.writeText(dataStr);
            console.log('PFExplorer parameters copied to clipboard');
            this.emitNotify({ type: 'export', ok: true, message: 'Copied to clipboard' });
            return;
        }

        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        // format: parameters_2025-07-15_12-34-56.json
        link.download = `parameters_${year}-${month}-${day}_${hour}-${minute}-${second}.json`;
        link.click();

        URL.revokeObjectURL(link.href);
        this.emitNotify({ type: 'export', ok: true, message: 'Downloaded' });
    }

    private async importParameters(): Promise<void> {
        if (this._useClipboard) {
            try {
                const text = await navigator.clipboard.readText();
                this.parseAndLoadParameters(text);
            } catch (error) {
                console.error('Failed to read from clipboard:', error);
                this.emitNotify({ type: 'error', ok: false, message: 'Clipboard read failed' });
            }
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.parseAndLoadParameters(e.target?.result as string);
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    private loadParameters(parameters?: Parameters): void {
        console.debug('Loading parameters...');
        let cleanedParameters: Parameters = {};
        for (const [key, value] of Object.entries(this._initialValues)) {
            cleanedParameters[key] = value;
        }

        if (parameters) {
            // Clean up ghost parameters from other projects
            for (const key of Object.keys(parameters)) {
                if (key in this._initialValues) {
                    cleanedParameters[key] = parameters[key];
                    console.debug('Loaded parameter:', key);
                } else {
                    console.debug('Skipping undefined parameter:', key);
                }
            }
        }

        this.parameters = cleanedParameters;

        console.debug('Parameters loaded');
    }

    private saveToLocalStorage(): void {
        localStorage.setItem('parameter-flow-parameters', JSON.stringify(this.parameters));
    }

    private loadFromLocalStorage(): any | null {
        const savedData = localStorage.getItem('parameter-flow-parameters');
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (error) {
                console.error('Failed to parse saved parameter data from localStorage:', error);
                return null;
            }
        }
        return null;
    }
}