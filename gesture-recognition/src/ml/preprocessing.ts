import { AccelDataPoint } from '../plot';
import { augmentByXRotation, augmentByZRotation } from './datagen';
import { toWorldFrame, separateGravityAndLinearAccel } from './filters';

/**
 * Resample a list of AccelDataPoint's to n evenly spaced points (linear interpolation).
 * Returns a new array of length n.
 */
export function resampleAccelData(data: AccelDataPoint[], n: number): AccelDataPoint[] {
    if (data.length === 0 || n <= 0) return [];
    if (data.length === 1) return Array(n).fill(data[0]);

    const result: AccelDataPoint[] = [];
    const lastIdx = data.length - 1;
    for (let i = 0; i < n; i++) {
        // Find fractional index in original data
        const t = (i * lastIdx) / (n - 1);
        const idx = Math.floor(t);
        const frac = t - idx;
        const a = data[idx];
        const b = data[Math.min(idx + 1, lastIdx)];
        // Linear interpolation for x, y, z
        result.push({
            x: a.x + (b.x - a.x) * frac,
            y: a.y + (b.y - a.y) * frac,
            z: a.z + (b.z - a.z) * frac,
            timestamp: a.timestamp, // Use timestamp from a (or interpolate if needed)
        });
    }
    return result;
}

// normalizes a family of accel data points
export function normalizeAccelData(data: AccelDataPoint[]) {
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let i = 0; i < data.length; i++) {
        maxX = Math.max(Math.abs(data[i].x), maxX);
        maxY = Math.max(Math.abs(data[i].y), maxY);
        maxZ = Math.max(Math.abs(data[i].z), maxZ);
    }

    let newData: AccelDataPoint[] = [];
    for (let i = 0; i < data.length; i++) {
        newData.push({
            x: data[i].x / maxX,
            y: data[i].y / maxY,
            z: data[i].z / maxZ,
            timestamp: data[i].timestamp,
        });
    }

    return newData;
}

export function flattenData(data: AccelDataPoint[]): number[] {
    const arr = [];
    for (let i = 0; i < data.length; i++) {
        arr.push(data[i].x);
        arr.push(data[i].y);
        arr.push(data[i].z);
    }
    return arr;
}

export function prepareData(d: AccelDataPoint[], resampleSize: number): number[] {
    return flattenData(normalizeAccelData(resampleAccelData(d, resampleSize)));
}

export type RingOrientationType = 'world-order' | 'ring-order';

export function prepareTrainingData(
    datapoints: { data: AccelDataPoint[]; label: string }[],
    resampleSize: number,
    type: RingOrientationType,
): { data: number[]; label: string }[] {
    // world order converts ring data into world frame FIRST, then augments z rotation so that the ring's training is fully orientation-independent
    if (type == 'world-order') {
        const worldData = datapoints.map((e) => ({
            label: e.label,
            data: toWorldFrame(separateGravityAndLinearAccel(e.data, 0.8)),
        }));

        const augmented = worldData.flatMap((e) =>
            augmentByZRotation(e.data, 8).map((a) => ({ label: e.label, data: a })),
        );

        console.log('augmented', augmented);

        const preppedData = augmented.map((e) => ({
            data: prepareData(e.data, resampleSize),
            label: e.label,
        }));

        return preppedData;
    } else {
        // ring order augments the linear component by x rotation (principle ring axis) so that all orientations of acceleration in the y-z plane (the plane of the ring) are accounted for, then converts into world frame to be trained on.
        // this makes it so the rotation of the ring inside its plane doesn't matter, but the world orientation does matter
        const linearData = datapoints.map((e) => ({
            label: e.label,
            data: separateGravityAndLinearAccel(e.data, 0.8),
        }));

        const augmentedByX = linearData.flatMap((e) =>
            augmentByXRotation(e.data.linear, 8).map((a) => ({
                label: e.label,
                data: { gravity: e.data.gravity, linear: a },
            })),
        );

        const worldFrame = augmentedByX.map((e) => ({
            label: e.label,
            data: toWorldFrame(e.data),
        }));

        const preppedData = worldFrame.map((e) => ({
            data: prepareData(e.data, resampleSize),
            label: e.label,
        }));

        return preppedData;
    }
}

export function prepareClassificationData(data: AccelDataPoint[], resampleSize: number) {
    const world = toWorldFrame(separateGravityAndLinearAccel(data, 0.8));

    return prepareData(world, resampleSize);
}
