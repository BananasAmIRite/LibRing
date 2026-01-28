import { separateGravityAndLinearAccel } from '../ml/filters';
import { prepareClassificationData, prepareTrainingData } from '../ml/preprocessing';
import { AccelDataPoint } from '../plot';
import { AccelNtfHandler } from './ble';

export default class DataRecorder {
    // RAW accel data (needs to be processed)
    private datapoints: AccelDataPoint[] = [];
    private neuralNet!: ml5.NeuralNetwork;
    private classifyHandler: (data: any) => void = () => {};

    public constructor(
        private resampleSize: number = 50,
        private sampleSize: number = 20, // number of actual samples to record over a sliding window on which to classify from,
        private ignoredAccelMagnitude: number = 0.5, // average accel magnitude for which we ignore the classification
    ) {
        ml5.setBackend('webgpu');

        this.resetNetwork();
    }

    private resetNetwork() {
        this.neuralNet = ml5.neuralNetwork({
            task: 'classification',
            debug: true,
        });
    }

    public getMLRecorderNtfHandler() {
        const handler: AccelNtfHandler = (d) => {
            this.datapoints.push(d);

            if (this.datapoints.length > this.sampleSize) {
                this.datapoints.shift(); // shift the last element out

                let avgAccelMagn = 0;
                let cnt = 0;

                for (const d of separateGravityAndLinearAccel(this.datapoints, 0.8).linear) {
                    avgAccelMagn += Math.hypot(d.x, d.y, d.z);
                    cnt++;
                }
                avgAccelMagn /= cnt;

                if (avgAccelMagn < this.ignoredAccelMagnitude) return; // accel magnitude too small

                const prepped = prepareClassificationData(this.datapoints, this.resampleSize);

                this.neuralNet.classify(prepped, (d) => {
                    this.classifyHandler(d);
                });
            }
        };

        return {
            ntfHandler: handler,
        };
    }

    public setClassifyHandler(handler: (data: any) => void) {
        this.classifyHandler = handler;
    }

    public getData() {
        return this.datapoints;
    }

    public async loadModel(files: FileList | string) {
        if (!this.neuralNet) this.resetNetwork();
        // If files are provided (from file input), use them, else prompt user
        if (files) {
            await this.neuralNet.load(files);
        }
    }
}
