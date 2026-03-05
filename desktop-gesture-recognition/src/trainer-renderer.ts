// trainer-renderer.ts
// Placeholder for training workflow logic
import { connectToBLE, disconnectFromBLE, setNtfHandler } from './lib/shared/accelerometer/ble';
import { AccelChart } from './lib/shared/plot';
import MLRecorder from './lib/train/TrainingMLRecorder';
import { CircleDetector } from './lib/shared/detection/circleDetection';
import { TapDetector } from './lib/shared/detection/tapDetection';
import { separateGravityAndLinearAccel } from './lib/shared/ml/filters';
import { resampleAccelData } from './lib/shared/ml/preprocessing';

const trainPage = document.getElementById('page-train');
if (trainPage) {
    const chart = new AccelChart('train-accel-chart');
    // initAccelChart('train-accel-chart');

    const recorder = new MLRecorder();
    const handlers = recorder.getMLRecorderNtfHandler();

    const connectBtn = document.getElementById('train-connect');
    const disconnectBtn = document.getElementById('train-disconnect');
    const plotBtn = document.getElementById('train-plot');
    const stopPlotBtn = document.getElementById('train-stop-plot');
    const stopClassifyBtn = document.getElementById('train-stop-plot-classify');
    const stopCircleBtn = document.getElementById('train-stop-plot-circle');
    const stopTapBtn = document.getElementById('train-stop-plot-tap');
    const mlLabelInput = document.getElementById('train-ml-label') as HTMLInputElement;
    const trainBtn = document.getElementById('train-train') as HTMLButtonElement;
    const saveModelBtn = document.getElementById('train-save-model') as HTMLButtonElement;
    const loadModelBtn = document.getElementById('train-load-model') as HTMLButtonElement;

    connectBtn?.addEventListener('click', () => {
        connectToBLE();
    });

    disconnectBtn?.addEventListener('click', () => {
        disconnectFromBLE();
    });

    plotBtn?.addEventListener('click', () => {
        chart.clear();
        handlers.start();
        setNtfHandler((a) => {
            chart.plot(a);
            handlers.ntfHandler(a);
        });
        recorder.setCurrentLabel(mlLabelInput.value);
    });

    stopPlotBtn?.addEventListener('click', () => {
        handlers.stopAndTrain();
        setNtfHandler((a) => {});
        displayMLRecorderDataList(); // Auto-update data list on stop
    });

    stopClassifyBtn?.addEventListener('click', async () => {
        const val = await handlers.stopAndClassify();
        setNtfHandler((a) => {});
        displayClassificationResult(val);
        console.log(val);
    });

    stopCircleBtn?.addEventListener('click', async () => {
        await handlers.stopAndClassifyWith('circle');
        setNtfHandler((a) => {});
    });

    stopTapBtn?.addEventListener('click', async () => {
        await handlers.stopAndClassifyWith('tap');
        setNtfHandler((a) => {});
    });

    trainBtn?.addEventListener('click', () => {
        recorder.train();
    });

    saveModelBtn?.addEventListener('click', () => {
        recorder.saveModel();
    });

    loadModelBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e: any) => {
            var files = e.target.files;
            recorder.loadModel(files);
        };
        input.click();
    });

    // Utility to display all data points grouped by label
    function displayMLRecorderDataList() {
        const grouped: Record<string, any[]> = {};
        recorder.getData().forEach((item: any) => {
            const label = item.label || 'unlabeled';
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push(item.data);
        });
        let output = '';
        for (const label in grouped) {
            output += `Label: ${label} (${grouped[label].length} samples)\n`;
            grouped[label].forEach((data, idx) => {
                const nPoints = Array.isArray(data) ? data.length : 1;
                let firstTs = '',
                    lastTs = '';
                if (Array.isArray(data) && data.length > 0) {
                    firstTs = data[0].timestamp || '';
                    lastTs = data[data.length - 1].timestamp || '';
                } else if (data && data.timestamp) {
                    firstTs = lastTs = data.timestamp;
                }
                output += `  [${idx + 1}] Points: ${nPoints}, First: ${firstTs}, Last: ${lastTs}\n`;
            });
        }
        let pre = document.getElementById('train-ml-data-list') as HTMLPreElement;
        if (!pre) {
            pre = document.createElement('pre');
            pre.id = 'train-ml-data-list';
            document.body.appendChild(pre);
        }
        pre.textContent = output;
    }

    // Utility to display classification result
    function displayClassificationResult(result: any) {
        let pre = document.getElementById('train-ml-classify-result') as HTMLPreElement;
        if (!pre) {
            pre = document.createElement('pre');
            pre.id = 'train-ml-classify-result';
            document.body.appendChild(pre);
        }

        let maxConf = 0;
        let maxLabel = '';
        for (let vals of result) {
            if (vals.confidence > maxConf) {
                maxConf = vals.confidence;
                maxLabel = vals.label;
            }
        }

        // Modern Bootstrap progress bar display for results (no sorting)
        if (Array.isArray(result) && result.length && result[0].label && result[0].confidence !== undefined) {
            // Do not sort, use original order
            let html = '';
            result.forEach((item, idx) => {
                const isMax = item.label === maxLabel;
                const percent = (item.confidence * 100).toFixed(1);
                html += `
                        <div class="d-flex align-items-center ${false ? 'bg-primary bg-opacity-10 rounded-2 border border-primary' : ''} mb-1 p-1">
                            <span class="fw-semibold ${false ? 'text-primary' : ''}">${item.label}</span>
                            <div class="progress flex-grow-1 bg-dark mx-2" style="height: 1.1em; min-width: 80px;">
                                <div class="progress-bar ${isMax ? 'bg-primary' : 'bg-secondary'}" role="progressbar" style="width: ${percent}%" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div>
                            </div>
                            <span class="small ${false ? 'fw-bold text-primary' : ''}" style="min-width: 48px; text-align: right;">${percent}%</span>
                        </div>
                `;
            });
            pre.innerHTML = html;
        } else {
            pre.textContent =
                typeof result === 'string' ? result : `Classification Result:\n${JSON.stringify(result, null, 2)}`;
        }
    }
}
