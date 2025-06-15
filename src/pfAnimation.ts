interface ParameterKeyframe {
    time: number;
    value: number;
    speed?: number;
}

export class PFAnimation {
    private _parameters: Record<string, ParameterKeyframe[]>;

    constructor(public parameters: Record<string, ParameterKeyframe[]>) {
        this._parameters = parameters;
    }

    getValuesAt(time: number): Record<string, number> {
        // note: this assumes that the segments are sorted by startTime and no overlapping time spans
        const values: Record<string, number> = {};
        for (const key in this._parameters) {
            const parameter = this._parameters[key];

            // time <= startTime of first segment
            if (time <= parameter[0].time) {
                values[key] = parameter[0].value;
                if (parameter[0].speed) {
                    values[key] -= parameter[0].speed * (parameter[0].time - time);
                }
                continue;
            }

            // time >= endTime of last segment
            const lastSegment = parameter[parameter.length - 1];
            if (time >= lastSegment.time) {
                values[key] = lastSegment.value;
                if (lastSegment.speed) {
                    values[key] += lastSegment.speed * (time - lastSegment.time);
                }
                continue;
            }

            // time is between two segments
            // find last element that has item.time <= time
            const keyframeBefore = parameter.filter((p: ParameterKeyframe) => p.time <= time).pop();
            const keyframeAfter = parameter.filter((p: ParameterKeyframe) => p.time > time).shift();

            if (!keyframeBefore || !keyframeAfter) {
                // this shouldn't happen if the keyframes are sorted by time
                values[key] = 0;
                continue;
            }

            const t0 = keyframeBefore.time;
            const t1 = keyframeAfter.time;
            const duration = t1 - t0;
            const t = (time - t0) / duration;
            const v0 = keyframeBefore.value;
            const v1 = keyframeAfter.value;
            const d0 = keyframeBefore.speed;
            const d1 = keyframeAfter.speed;

            const p0 = v0;
            const p3 = v1;
            const p1 = d0 !== undefined
                ? v0 + d0 * duration / 3
                : v0 + (v1 - v0) / 3;
            const p2 = d1 !== undefined
                ? v1 - d1 * duration / 3
                : v1 - (v1 - v0) / 3;

            const oneMinusT = 1 - t;
            values[key] = p0 * oneMinusT * oneMinusT * oneMinusT +
                p1 * 3 * t * oneMinusT * oneMinusT +
                p2 * 3 * t * t * oneMinusT +
                p3 * t * t * t;
        }
        return values;
    }
}