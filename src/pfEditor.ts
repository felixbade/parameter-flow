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
        // Check for existing animation data in localStorage
        const savedAnimationData = this.loadFromLocalStorage();

        if (savedAnimationData && savedAnimationData.parameters) {
            // Use saved animation data
            this.animation = new PFAnimation(savedAnimationData.parameters);
        } else {
            // Initialize animation with initial keyframes at time 0
            const initialKeyframes: Record<string, { time: number; value: number }[]> = {};
            for (const [key, value] of Object.entries(config.variables)) {
                initialKeyframes[key] = [{ time: 0, value }];
            }
            this.animation = new PFAnimation(initialKeyframes);
        }

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
                    this.saveToLocalStorage();
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

    private loadAnimationData(animationData: any): void {
        if (animationData.parameters) {
            this.animation = new PFAnimation(animationData.parameters);
            this.timelinePlayer.seek(0);
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
            this.animation.removeKeyframe(parameter, currentTime);
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
}