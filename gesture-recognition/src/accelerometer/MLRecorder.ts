import { data } from '@tensorflow/tfjs';
import { prepareClassificationData, prepareData, prepareTrainingData } from '../ml/preprocessing';
import { AccelDataPoint } from '../plot';
import { AccelNtfHandler } from './ble';
import { separateGravityAndLinearAccel, toWorldFrame } from '../ml/filters';
import { augmentByZRotation } from '../ml/datagen';

export default class DataRecorder {
    // RAW accel data (needs to be processed)
    private datapoints: { data: AccelDataPoint[]; label: string }[] = [];
    private currentLabel: string = '';
    private neuralNet!: ml5.NeuralNetwork;

    public constructor(private resampleSize: number = 50) {
        ml5.setBackend('webgpu');

        this.resetNetwork();
    }

    private resetNetwork() {
        this.neuralNet = ml5.neuralNetwork({
            task: 'classification',
            debug: true,
        });
    }

    public train() {
        this.resetNetwork();

        // train stuff

        // option 1
        const preppedData = prepareTrainingData(this.datapoints, this.resampleSize, 'ring-order');

        for (const d of preppedData) {
            console.log('added data: ', d.label, d.data);
            this.neuralNet.addData(d.data, [d.label]);
        }

        // this.neuralNet.normalizeData();

        this.neuralNet.train(() => {
            console.log('Training finished');
        });
    }

    public addPoint(data: AccelDataPoint[]) {
        this.datapoints.push({ data, label: this.currentLabel });
    }

    public setCurrentLabel(label: string) {
        this.currentLabel = label;
    }

    public getMLRecorderNtfHandler() {
        let recording = false;
        const accumData: AccelDataPoint[] = [];

        const startRecording = () => {
            recording = true;
        };

        const stopRecordingAndTrain = () => {
            recording = false;
            if (accumData.length == 0) return;
            console.log(`data: `, accumData);
            // separate gravity and accel for this series of data

            this.addPoint(accumData.slice());

            console.log(`Total Array: `, this.datapoints);

            // clear accumData
            accumData.splice(0, accumData.length);
        };

        const stopRecordingAndClassify = () =>
            new Promise((res, rej) => {
                recording = false;
                if (accumData.length == 0) return;
                console.log(`data: `, accumData);
                // separate gravity and accel for this series of data

                const prepped = prepareClassificationData(accumData, this.resampleSize);

                // clear accumData
                accumData.splice(0, accumData.length);

                this.neuralNet.classify(prepped, (d) => {
                    res(d);
                });
            });

        const handler: AccelNtfHandler = (d) => {
            if (!recording) return;
            accumData.push(d);
        };

        return {
            start: startRecording,
            stopAndTrain: stopRecordingAndTrain,
            stopAndClassify: stopRecordingAndClassify,
            ntfHandler: handler,
        };
    }

    public getData() {
        return this.datapoints;
    }

    public async saveModel() {
        if (!this.neuralNet) return;
        // Save model to local downloads
        await this.neuralNet.save();
    }

    public async loadModel(files: FileList | string) {
        if (!this.neuralNet) this.resetNetwork();
        // If files are provided (from file input), use them, else prompt user
        if (files) {
            await this.neuralNet.load(files);
        }
    }
}
