import { TimelinePlayer } from './timelinePlayer';
import { PFAnimation } from './pfAnimation';

interface ParameterKeyframe {
    time: number;
    value: number;
    speed?: number;
    acceleration?: number;
}

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
    private animation!: PFAnimation;
    private handlers: PFEditorConfig['handlers'];
    private timelinePlayer: TimelinePlayer;
    private _mouseMoveHandler: ((event: MouseEvent) => void) | null;
    private _wheelHandler: ((event: WheelEvent) => void) | null;
    private _keyboardListener: ((event: KeyboardEvent) => void) | null;
    private currentHandlerIndex: number;
    private handlerNames: string[];
    private _beforeUnloadHandler: (() => void) | null;
    private _initialValues: Record<string, number>;
    private _isFirstMouseMove: boolean;

    constructor(config: PFEditorConfig) {
        this._initialValues = { ...config.variables };

        const savedAnimationData = this.loadFromLocalStorage();

        if (savedAnimationData && savedAnimationData.parameters) {
            this.loadAnimation(savedAnimationData.parameters);
        } else {
            this.loadAnimation();
        }

        this.handlers = config.handlers;
        this.handlerNames = Object.keys(config.handlers);
        this.currentHandlerIndex = 0;

        this.timelinePlayer = new TimelinePlayer(config);

        const savedTime = this.loadCurrentTimeFromLocalStorage();
        if (savedTime !== null) {
            this.timelinePlayer.seek(savedTime);
        }

        this._mouseMoveHandler = null;
        this._wheelHandler = null;
        this._keyboardListener = null;
        this._beforeUnloadHandler = null;
        this._isFirstMouseMove = true;

        this._setupPointerLockListener();
        this._setupEventListeners();

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
            } else if (event.code === 'ArrowLeft') {
                event.preventDefault();
                this.navigateToPreviousKeyframe();
            } else if (event.code === 'ArrowRight') {
                event.preventDefault();
                this.navigateToNextKeyframe();
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
                this.exportAnimation();
            } else if (event.code === 'KeyI') {
                event.preventDefault();
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.importAnimation();
            } else if (event.code === 'Backspace') {
                event.preventDefault();
                this.deleteCurrentKeyframe();
                this.saveToLocalStorage();
            } else if (event.code === 'KeyH') {
                event.preventDefault();
                this.toggleTimelineVisibility();
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
                        this.animation.addOrUpdateKeyframe(key, this.timelinePlayer.currentTime, newValue);
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
                        this.animation.addOrUpdateKeyframe(key, this.timelinePlayer.currentTime, newValue);
                    }
                    this.saveToLocalStorage();
                }
            }
        }).bind(this);

        document.addEventListener('wheel', this._wheelHandler);
    }

    private _setupEventListeners(): void {
        this.timelinePlayer.addEventListener('pause', () => {
            this.saveCurrentTimeToLocalStorage();
        });

        this.timelinePlayer.addEventListener('seek', () => {
            this.saveCurrentTimeToLocalStorage();
        });

        this._beforeUnloadHandler = () => {
            this.saveCurrentTimeToLocalStorage();
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
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
        this.timelinePlayer.destroy();
    }

    private getEditedParameters() {
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

    private navigateToPreviousKeyframe() {
        const editedParameters = this.getEditedParameters();
        if (editedParameters.length === 0) {
            this.timelinePlayer.seek(0);
            return;
        }

        let closestPreviousTime = 0;

        // find the closest previous keyframe across all edited parameters
        for (const parameter of editedParameters) {
            const keyframes = this.animation.getClosestKeyframes(parameter, this.timelinePlayer.currentTime, this.timelinePlayer.duration);
            if (keyframes.previous > closestPreviousTime) {
                closestPreviousTime = keyframes.previous;
            }
        }

        this.timelinePlayer.seek(closestPreviousTime);
    }

    private navigateToNextKeyframe() {
        const editedParameters = this.getEditedParameters();
        if (editedParameters.length === 0) {
            this.timelinePlayer.seek(this.timelinePlayer.duration);
            return;
        }

        let closestNextTime = this.timelinePlayer.duration;

        // find the closest next keyframe across all edited parameters
        for (const parameter of editedParameters) {
            const keyframes = this.animation.getClosestKeyframes(parameter, this.timelinePlayer.currentTime, this.timelinePlayer.duration);
            if (keyframes.next < closestNextTime) {
                closestNextTime = keyframes.next;
            }
        }

        this.timelinePlayer.seek(closestNextTime);
    }

    private exportAnimation(): void {
        const animationData = {
            duration: this.timelinePlayer.duration,
            parameters: this.animation.parameters,
        };
        const dataStr = JSON.stringify(animationData, null, 2);
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
        // format: animation_2025-07-15_12-34-56.json
        link.download = `animation_${year}-${month}-${day}_${hour}-${minute}-${second}.json`;
        link.click();

        URL.revokeObjectURL(link.href);
    }

    private importAnimation(): void {
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
                        this.loadAnimationData(animationData);
                    } catch (error) {
                        console.error('Failed to parse animation file:', error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    private loadAnimation(parameters?: Record<string, ParameterKeyframe[]>): void {
        console.debug('Loading animation...');
        let keyframes: Record<string, ParameterKeyframe[]> = {};
        for (const [key, value] of Object.entries(this._initialValues)) {
            keyframes[key] = [{ time: 0, value }];
        }

        if (parameters) {
            // Clean up ghost parameters from other projects
            for (const key of Object.keys(parameters)) {
                if (key in this._initialValues) {
                    keyframes[key] = parameters[key];
                    console.debug('Loaded parameter:', key);
                } else {
                    console.debug('Skipping undefined parameter:', key);
                }
            }
        }

        this.animation = new PFAnimation(keyframes);

        console.debug('Animation loaded');
    }

    private loadAnimationData(animationData: any): void {
        if (animationData.parameters) {
            this.loadAnimation(animationData.parameters);
        } else {
            console.error('Invalid animation file format');
        }
    }

    private deleteCurrentKeyframe(): void {
        const editedParameters = this.getEditedParameters();
        if (editedParameters.length === 0) {
            return;
        }

        const currentTime = this.timelinePlayer.currentTime;

        for (const parameter of editedParameters) {
            const initialValue = this._initialValues[parameter];
            this.animation.removeKeyframe(parameter, currentTime, initialValue);
        }
        this.saveToLocalStorage();
    }

    private saveToLocalStorage(): void {
        const animationData = {
            duration: this.timelinePlayer.duration,
            parameters: this.animation.parameters,
        };
        localStorage.setItem('parameter-flow-animation', JSON.stringify(animationData));
    }

    private loadFromLocalStorage(): any | null {
        const savedData = localStorage.getItem('parameter-flow-animation');
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (error) {
                console.error('Failed to parse saved animation data from localStorage:', error);
                return null;
            }
        }
        return null;
    }

    private saveCurrentTimeToLocalStorage(): void {
        localStorage.setItem('pf-editor-current-time', this.timelinePlayer.currentTime.toString());
    }

    private loadCurrentTimeFromLocalStorage(): number | null {
        const savedTime = localStorage.getItem('pf-editor-current-time');
        if (savedTime) {
            const time = parseFloat(savedTime);
            if (!isNaN(time) && time >= 0 && time <= this.timelinePlayer.duration) {
                return time;
            }
        }
        return null;
    }

    private toggleTimelineVisibility(): void {
        const timelineElement = this.timelinePlayer.element;
        if (timelineElement.style.display === 'none') {
            timelineElement.style.display = '';
        } else {
            timelineElement.style.display = 'none';
        }
    }
}