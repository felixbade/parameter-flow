interface ParameterSegment {
    startTime: number;
    endTime: number;
    startValue: number;
    endValue: number;
    startSpeed?: number;
    endSpeed?: number;
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
                if (parameter[0].startSpeed) {
                    values[key] -= parameter[0].startSpeed * (parameter[0].startTime - time);
                }
                continue;
            }

            // time > endTime of last segment
            const lastSegment = parameter[parameter.length - 1];
            if (time > lastSegment.endTime) {
                values[key] = lastSegment.endValue;
                if (lastSegment.endSpeed) {
                    values[key] += lastSegment.endSpeed * (time - lastSegment.endTime);
                }
                continue;
            }

            // time is between two segments
            const segment = parameter.find((p: ParameterSegment) => time >= p.startTime && time <= p.endTime);
            if (segment) {
                const duration = segment.endTime - segment.startTime;
                const t = (time - segment.startTime) / duration;

                const p0 = segment.startValue;
                const p3 = segment.endValue;
                const p1 = segment.startSpeed !== undefined
                    ? p0 + segment.startSpeed * duration / 3
                    : p0 + (p3 - p0) / 3;
                const p2 = segment.endSpeed !== undefined
                    ? p3 - segment.endSpeed * duration / 3
                    : p3 - (p3 - p0) / 3;

                const oneMinusT = 1 - t;
                values[key] = p0 * oneMinusT * oneMinusT * oneMinusT +
                    p1 * 3 * t * oneMinusT * oneMinusT +
                    p2 * 3 * t * t * oneMinusT +
                    p3 * t * t * t;
                continue;
            }

            // no segments or the segments are not ordered properly. either is illegal but just return 0
            values[key] = 0;
        }
        return values;
    }
}