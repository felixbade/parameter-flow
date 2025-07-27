import { TimelinePlayer } from './timelinePlayer';
import { PFAnimation } from './pfAnimation';

interface Handler {
    (state: Parameters, ...args: any[]): Parameters;
}

interface Parameters {
    [key: string]: number;
}

interface PFEditorConfig {
    duration: number;
    variables: Parameters;
    handlers: Record<string, Handler>;
    keyboardListener?: boolean;
}

export class PFExplorer {
    private parameters!: Parameters;
    private handlers: PFEditorConfig['handlers'];
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];
    private _beforeUnloadHandler: (() => void) | null;
    private _initialValues: Parameters;
    private _isFirstMouseMove: boolean;

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
        this._beforeUnloadHandler = null;
        this._isFirstMouseMove = true;

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
            } else if (event.code === 'KeyE') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.exportParameters();
            } else if (event.code === 'KeyI') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.importParameters();
            } else if (event.code === 'Backspace') {
                event.preventDefault();
                this.resetEditingParameters();
                this.saveToLocalStorage();
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

                    const stateDelta = currentHandler(currentState, {
                        dx: event.movementX,
                        dy: event.movementY,
                        sdx: 0,
                        sdy: 0,
                    });

                    for (const [key, delta] of Object.entries(stateDelta)) {
                        const newValue = currentState[key] + delta;
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

                    const stateDelta = currentHandler(currentState, {
                        dx: 0,
                        dy: 0,
                        sdx: event.deltaX,
                        sdy: event.deltaY,
                    });

                    for (const [key, delta] of Object.entries(stateDelta)) {
                        const newValue = currentState[key] + delta;
                        this.parameters[key] = newValue;
                    }
                    this.saveToLocalStorage();
                }
            }
        }).bind(this);

        document.addEventListener('wheel', this._wheelHandler);
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
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    private exportParameters(): void {
        const dataStr = JSON.stringify(this.parameters, null, 2);
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
    }

    private importParameters(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const animationData = JSON.parse(e.target?.result as string);
                        this.loadParameters(animationData);
                    } catch (error) {
                        console.error('Failed to parse animation file:', error);
                    }
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