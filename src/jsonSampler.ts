export class JSONSampler {
    private _parameters: Record<string, number>;

    constructor(public parameters: Record<string, number>) {
        this._parameters = parameters;
    }

    getValuesAt(time: number): Record<string, number> {
        return this._parameters;
    }
}