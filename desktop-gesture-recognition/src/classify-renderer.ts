import { connectToBLE, disconnectFromBLE, setNtfHandler } from './lib/shared/accelerometer/ble';
import { clearAccelPlot, initAccelChart, plotAccelData } from './lib/shared/plot';
import ClassificationMLRecorder from './lib/classify/ClassificationMLRecorder';
import { debounce } from './lib/utils';

// Only initialize if classify page is present
const classifyPage = document.getElementById('page-classify');
if (classifyPage) {
    initAccelChart('classify-accel-chart');

    const recorder = new ClassificationMLRecorder();
    const handlers = recorder.getMLRecorderNtfHandler();

    const connectBtn = document.getElementById('classify-connect') as HTMLButtonElement;
    const disconnectBtn = document.getElementById('classify-disconnect') as HTMLButtonElement;
    const plotBtn = document.getElementById('classify-plot') as HTMLButtonElement;
    const stopPlotBtn = document.getElementById('classify-stop-plot') as HTMLButtonElement;
    const loadModelBtn = document.getElementById('classify-load-model') as HTMLButtonElement;

    let isConnected = false;
    let isModelLoaded = false;

    function updateButtonStates() {
        connectBtn.disabled = isConnected;
        disconnectBtn.disabled = !isConnected;
        plotBtn.disabled = !(isConnected && isModelLoaded);
        stopPlotBtn.disabled = !(isConnected && isModelLoaded);
    }

    updateButtonStates();

    connectBtn?.addEventListener('click', () => {
        connectToBLE();
        isConnected = true;
        updateButtonStates();
    });

    disconnectBtn?.addEventListener('click', () => {
        disconnectFromBLE();
        isConnected = false;
        updateButtonStates();
    });

    plotBtn?.addEventListener('click', () => {
        clearAccelPlot();
        setNtfHandler((a) => {
            plotAccelData(a);
            handlers.ntfHandler(a);
        });
        plotBtn.disabled = true;
        stopPlotBtn.disabled = false;
    });

    stopPlotBtn?.addEventListener('click', () => {
        setNtfHandler((a) => {});
        plotBtn.disabled = false;
        stopPlotBtn.disabled = true;
    });

    loadModelBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e: any) => {
            var files = e.target.files;
            recorder.loadModel(files).then(() => {
                isModelLoaded = true;
                updateButtonStates();
            });
        };
        input.click();
    });

    const CLASSIFICATION_CONFIDENCE_THRES = 0.8;

    function handleClassificationResult(result: any) {
        if (result.length == 0) throw new Error('No classification results');

        const sorted = [...result].sort((a, b) => b.confidence - a.confidence);

        const firstLabel = sorted[0].label;
        const firstConf = sorted[0].confidence;

        if (firstConf >= CLASSIFICATION_CONFIDENCE_THRES) {
            switch (firstLabel) {
                case 'circle-cw':
                    window.electronAPI.incrementSystemVolume(3);
                    break;
                case 'circle-ccw':
                    window.electronAPI.incrementSystemVolume(-3);
                    break;
                case 'horiz-tap':
                    debounce(1)(() => window.electronAPI.minimizeForegroundWindow());
                    break;
                case 'vert-tap':
                    debounce(1)(() => window.electronAPI.maximizeForegroundWindow());
                    break;
                default:
                    break;
            }
        }

        displayClassificationResult(result);
    }

    // Utility to display classification result
    function displayClassificationResult(result: any) {
        let pre = document.getElementById('classify-ml-classify-result') as HTMLPreElement;
        if (!pre) {
            pre = document.createElement('pre');
            pre.id = 'classify-ml-classify-result';
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

    recorder.setClassifyHandler((d) => handleClassificationResult(d));
}
