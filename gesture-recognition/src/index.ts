import Chart from 'chart.js/auto';
import * as tf from '@tensorflow/tfjs';
import { connectToBLE, disconnectFromBLE, setNtfHandler } from './accelerometer/ble';
import { clearAccelPlot, initAccelChart, plotAccelData } from './plot';
import MLRecorder from './accelerometer/MLRecorder';

initAccelChart('accel-chart');

const recorder = new MLRecorder();
const handlers = recorder.getMLRecorderNtfHandler();

const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');
const plotBtn = document.getElementById('plot');
const stopPlotBtn = document.getElementById('stop-plot');
const stopClassifyBtn = document.getElementById('stop-plot-classify');
// const clearPlotBtn = document.getElementById('clear-plot');
const mlLabelInput = document.getElementById('ml-label') as HTMLInputElement;
const trainBtn = document.getElementById('train') as HTMLButtonElement;
const saveModelBtn = document.getElementById('save-model') as HTMLButtonElement;
const loadModelBtn = document.getElementById('load-model') as HTMLButtonElement;

connectBtn?.addEventListener('click', () => {
    connectToBLE();
});

disconnectBtn?.addEventListener('click', () => {
    disconnectFromBLE();
});

plotBtn?.addEventListener('click', () => {
    clearAccelPlot();
    handlers.start();
    setNtfHandler((a) => {
        plotAccelData(a);
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

// clearPlotBtn?.addEventListener('click', () => {});

trainBtn.addEventListener('click', () => {
    recorder.train();
});

saveModelBtn?.addEventListener('click', () => {
    recorder.saveModel();
});

loadModelBtn?.addEventListener('click', () => {
    console.log('inputting?');
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
    // Create a simple string output
    let output = '';
    for (const label in grouped) {
        output += `Label: ${label} (${grouped[label].length} samples)\n`;
        grouped[label].forEach((data, idx) => {
            // Only show number of points and timestamp of first/last
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
    // Display in a <pre> element or console
    let pre = document.getElementById('ml-data-list') as HTMLPreElement;
    if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'ml-data-list';
        document.body.appendChild(pre);
    }
    pre.textContent = output;
}

// Optionally, add a button to trigger this display
const showDataBtn = document.getElementById('show-ml-data');
showDataBtn?.addEventListener('click', displayMLRecorderDataList);

// Utility to display classification result
function displayClassificationResult(result: any) {
    let pre = document.getElementById('ml-classify-result') as HTMLPreElement;
    if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'ml-classify-result';
        document.body.appendChild(pre);
    }
    // If result is an array of objects with label/confidence, display sorted and bold top
    if (Array.isArray(result) && result.length && result[0].label && result[0].confidence !== undefined) {
        const sorted = [...result].sort((a, b) => b.confidence - a.confidence);
        let html = 'Classification Result:\n';
        sorted.forEach((item, idx) => {
            const line = `${item.label}: ${(item.confidence * 100).toFixed(1)}%`;
            html += idx === 0 ? `**${line}**\n` : `${line}\n`;
        });
        // Render bold using <b> in a <pre> (works in most browsers)
        pre.innerHTML = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    } else {
        pre.textContent =
            typeof result === 'string' ? result : `Classification Result:\n${JSON.stringify(result, null, 2)}`;
    }
}
