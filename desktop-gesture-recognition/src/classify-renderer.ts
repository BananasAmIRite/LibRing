import { connectToBLE, disconnectFromBLE, setNtfHandler } from './lib/shared/accelerometer/ble';
import { AccelChart } from './lib/shared/plot';
import ClassificationMLRecorder, { ClassifyHandlerData } from './lib/classify/ClassificationMLRecorder';
// import { GestureHandler } from './lib/classify/GestureHandler';

// Only initialize if classify page is present
const classifyPage = document.getElementById('page-classify');
if (classifyPage) {
    const chart = new AccelChart('classify-accel-chart');

    const recorder = new ClassificationMLRecorder();
    const handlers = recorder.getMLRecorderNtfHandler();

    // Initialize GestureHandler with registered gestures
    // const gestureHandler = new GestureHandler();

    // // Register gestures with their configurations
    // gestureHandler.registerGesture('circle-cw', {
    //     mode: 'continuous',
    //     cooldownMs: 100, // Rate limit volume changes
    //     minConfidence: 0.7,
    //     onTrigger: () => {
    //         // window.electronAPI.incrementSystemVolume(0.03);
    //         console.log('Circle CW gesture started');
    //     },
    //     onEnd: () => {
    //         console.log('Circle CW gesture ended');
    //     },
    // });

    // gestureHandler.registerGesture('circle-ccw', {
    //     mode: 'continuous',
    //     cooldownMs: 100,
    //     minConfidence: 0.7,
    //     onTrigger: () => {
    //         console.log('Circle CCW gesture started');
    //         // window.electronAPI.incrementSystemVolume(-0.03);
    //     },
    //     onEnd: () => {
    //         console.log('Circle CCW gesture ended');
    //     },
    // });

    // gestureHandler.registerGesture('double-tap', {
    //     mode: 'discrete',
    //     cooldownMs: 500, // Prevent accidental double-taps
    //     minConfidence: 0.85, // Higher threshold for discrete actions
    //     onTrigger: () => {
    //         console.log('double tap');
    //         // window.electronAPI.minimizeForegroundWindow();
    //     },
    // });

    // gestureHandler.registerGesture('vert-tap', {
    //     mode: 'discrete',
    //     cooldownMs: 500,
    //     minConfidence: 0.85,
    //     onTrigger: () => {
    //         console.log('vert tap');
    //         // window.electronAPI.maximizeForegroundWindow();
    //     },
    // });

    // Register idle to reset state when no gesture detected
    // gestureHandler.registerGesture('idle', {
    //     mode: 'discrete',
    //     cooldownMs: 0,
    //     minConfidence: 0,
    //     onTrigger: () => {
    //         gestureHandler.handleIdle();
    //     },
    // });

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
        connectToBLE().then(() => {
            isConnected = true;
            updateButtonStates();
        });
    });

    disconnectBtn?.addEventListener('click', () => {
        disconnectFromBLE().then(() => {
            isConnected = false;
            updateButtonStates();
        });
    });

    plotBtn?.addEventListener('click', () => {
        chart.clear();
        setNtfHandler((a) => {
            chart.plot(a);
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

    let lastDoubleTap = Date.now();
    let doubleTapConfirm = false;

    function handleClassificationResult({ results, segment }: ClassifyHandlerData) {
        if (!results || results.length === 0) return;

        // Pass to gesture handler for validation and action triggering
        // gestureHandler.handleClassification(results, segment);
        const highest = results[0].label;
        console.log(highest);

        if (highest === 'circle-cw') {
            window.electronAPI.incrementSystemVolume(0.03);
        } else if (highest === 'circle-ccw') {
            window.electronAPI.incrementSystemVolume(-0.03);
        } else if (highest === 'double-tap' && Date.now() - lastDoubleTap > 500) {
            if (doubleTapConfirm) {
                window.electronAPI.minimizeForegroundWindow();
                doubleTapConfirm = false;
            } else {
                doubleTapConfirm = true;
            }
            // window.electronAPI.setSystemVolume(100);
            lastDoubleTap = Date.now();
        }

        // Display results for debugging
        displayClassificationResult(results);
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

        // Show active gesture status
        // const activeGesture = gestureHandler.getActiveGesture();
        // const activeDuration = gestureHandler.getActiveGestureDuration();

        // Modern Bootstrap progress bar display for results (no sorting)
        if (Array.isArray(result) && result.length && result[0].label && result[0].confidence !== undefined) {
            // Do not sort, use original order
            let html = '';

            // Show active gesture indicator if present
            // if (activeGesture) {
            //     html += `<div class="alert alert-success py-1 mb-2">Active: <strong>${activeGesture}</strong> (${(activeDuration / 1000).toFixed(1)}s)</div>`;
            // }

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
