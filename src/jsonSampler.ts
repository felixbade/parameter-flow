interface ParameterSegment {
    startTime: number;
    endTime: number;
    startValue: number;
    endValue: number;
}

export class JSONSampler {
    private _parameters: Record<string, ParameterSegment[]>;

    constructor(public parameters: Record<string, ParameterSegment[]>) {
        this._parameters = parameters;
    }

    getValuesAt(time: number): Record<string, number> {
        // note: this assumes that the segments are sorted by startTime and no overlapping time spans
        const values: Record<string, number> = {};
        for (const key in this._parameters) {
            const parameter = this._parameters[key];

            // time < startTime of first segment
            if (time < parameter[0].startTime) {
                values[key] = parameter[0].startValue;
                continue;
            }

            // time > endTime of last segment
            if (time > parameter[parameter.length - 1].endTime) {
                values[key] = parameter[parameter.length - 1].endValue;
                continue;
            }

            // time is between two segments
            const segment = parameter.find((p: ParameterSegment) => time >= p.startTime && time <= p.endTime);
            if (segment) {
                const t = (time - segment.startTime) / (segment.endTime - segment.startTime);
                values[key] = segment.startValue + (segment.endValue - segment.startValue) * t;
                continue;
            }

            // no segments or the segments are not ordered properly. either is illegal but just return 0
            values[key] = 0;
        }
        return values;
    }
}