interface ParameterKeyframe {
    time: number;
    value: number;
    speed?: number;
    acceleration?: number;
}

export class PFAnimation {
    private _parameters: Record<string, ParameterKeyframe[]>;

    constructor(public parameters: Record<string, ParameterKeyframe[]>) {
        this._parameters = parameters;
    }

    getValuesAt(time: number): Record<string, number> {
        // note: this assumes that the segments are sorted by time
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
            const d0 = keyframeBefore.speed ?? 0;
            const d1 = keyframeAfter.speed ?? 0;
            const a0 = keyframeBefore.acceleration ?? 0;
            const a1 = keyframeAfter.acceleration ?? 0;

            // Calculate quintic Bezier control points
            const p0 = v0;
            const p5 = v1;

            // First derivative control points
            const p1 = d0 !== undefined
                ? v0 + d0 * duration / 5
                : v0 + (v1 - v0) / 5;
            const p4 = d1 !== undefined
                ? v1 - d1 * duration / 5
                : v1 - (v1 - v0) / 5;

            // Second derivative control points
            const p2 = a0 !== undefined
                ? p1 + a0 * duration * duration / 20
                : p1 + (p4 - p1) / 3;
            const p3 = a1 !== undefined
                ? p4 - a1 * duration * duration / 20
                : p4 - (p4 - p1) / 3;

            // Quintic Bezier curve calculation
            const oneMinusT = 1 - t;
            const oneMinusT2 = oneMinusT * oneMinusT;
            const oneMinusT3 = oneMinusT2 * oneMinusT;
            const oneMinusT4 = oneMinusT3 * oneMinusT;
            const oneMinusT5 = oneMinusT4 * oneMinusT;
            const t2 = t * t;
            const t3 = t2 * t;
            const t4 = t3 * t;
            const t5 = t4 * t;

            values[key] = p0 * oneMinusT5 +
                p1 * 5 * t * oneMinusT4 +
                p2 * 10 * t2 * oneMinusT3 +
                p3 * 10 * t3 * oneMinusT2 +
                p4 * 5 * t4 * oneMinusT +
                p5 * t5;
        }
        return values;
    }
}