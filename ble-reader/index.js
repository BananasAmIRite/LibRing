const connectButton = document.getElementById('connect');
const ledOnButton = document.getElementById('led-on');
const ledOffButton = document.getElementById('led-off');
const disconnectButton = document.getElementById('disconnect');
const startPlotButton = document.getElementById('start-plot');
const stopPlotButton = document.getElementById('stop-plot');

let device;
let server;
let service;
let characteristic;
let accelCharacteristic;
let plotInterval;
let chart;
let gravityChart;
let linearChart;
let worldChart;
let gravityState = null; // Track gravity state for filtering across readings

const serviceUuid = '00112233-4455-6677-8899-aabbccddeeff';
const characteristicUuid = '2d86686a-53dc-25b3-0c4a-f0e10c8dee20';
const accelCharacteristicUuid = 'f2909165-4ce5-8da2-4c10-8b38c19f65cc'; // Reversed byte order for BLE

/**
 * Processes a single accelerometer reading to separate Gravity from Linear Acceleration.
 * Maintains state across calls for proper filtering.
 * @param {Object} reading - Single reading object {x, y, z}
 * @param {number} alpha - Smoothing factor (0 < alpha < 1).
 * Default 0.8. Higher = smoother gravity, less responsive.
 * @returns {Object} - Object with:
 * { gravity: {x,y,z}, linear: {x,y,z}, world: {x,y,z}, worldRaw: {x,y,z} }
 * - gravity: Low-pass filtered gravity component
 * - linear: High-pass filtered linear acceleration (device frame)
 * - world: Linear acceleration rotated to world frame (gravity points down)
 * - worldRaw: Raw acceleration rotated to world frame (for visualization)
 */
function separateGravityAcceleration(reading, alpha = 0.8) {
    if (!reading) return null;

    // Initialize gravity state with the first reading if not yet initialized
    if (gravityState === null) {
        gravityState = {
            x: reading.x,
            y: reading.y,
            z: reading.z,
        };
    }

    // 1. Isolate Gravity using Low Pass Filter
    // Gravity[n] = alpha * Gravity[n-1] + (1 - alpha) * Raw[n]
    gravityState.x = alpha * gravityState.x + (1 - alpha) * reading.x;
    gravityState.y = alpha * gravityState.y + (1 - alpha) * reading.y;
    gravityState.z = alpha * gravityState.z + (1 - alpha) * reading.z;

    // 2. Isolate Linear Acceleration using High Pass Filter logic
    // Linear = Raw - Gravity
    const linear = {
        x: reading.x - gravityState.x,
        y: reading.y - gravityState.y,
        z: reading.z - gravityState.z,
    };

    // 3. Rotate the linear vectors so that gravity points down (world frame)
    // Calculate rotation matrix to align gravity vector with [0, 0, -1] (down)
    const gravityVec = math.matrix([gravityState.x, gravityState.y, gravityState.z]);
    const gravityMag = math.norm(gravityVec);

    let rotationMatrix;
    if (gravityMag < 0.01) {
        // Gravity vector is too small, use identity matrix
        rotationMatrix = math.identity(3);
    } else {
        // Normalize gravity vector
        const gravityNorm = math.divide(gravityVec, gravityMag);
        const target = math.matrix([0, 0, -1]); // Target: gravity pointing down

        // Calculate rotation axis (cross product)
        const axis = math.cross(gravityNorm, target);
        const axisMag = math.norm(axis);

        if (axisMag < 0.001) {
            // Vectors are already aligned (or opposite)
            const dot = math.dot(gravityNorm, target);
            if (dot > 0) {
                rotationMatrix = math.identity(3);
            } else {
                // 180 degree rotation around any perpendicular axis
                rotationMatrix = math.matrix([
                    [-1, 0, 0],
                    [0, -1, 0],
                    [0, 0, 1],
                ]);
            }
        } else {
            // Rodrigues' rotation formula
            const axisNorm = math.divide(axis, axisMag);
            const angle = Math.acos(math.dot(gravityNorm, target));

            const K = math.matrix([
                [0, -axisNorm.get([2]), axisNorm.get([1])],
                [axisNorm.get([2]), 0, -axisNorm.get([0])],
                [-axisNorm.get([1]), axisNorm.get([0]), 0],
            ]);

            const I = math.identity(3);
            const K2 = math.multiply(K, K);

            rotationMatrix = math.add(
                math.add(I, math.multiply(Math.sin(angle), K)),
                math.multiply(1 - Math.cos(angle), K2),
            );
        }
    }

    // Apply rotation to linear acceleration vector
    const linearVec = math.matrix([linear.x, linear.y, linear.z]);
    const worldVec = math.multiply(rotationMatrix, linearVec);

    const world = {
        x: worldVec.get([0]),
        y: worldVec.get([1]),
        z: worldVec.get([2]),
    };

    // Apply rotation to raw acceleration vector (for visualization)
    const rawVec = math.matrix([reading.x, reading.y, reading.z]);
    const worldRawVec = math.multiply(rotationMatrix, rawVec);

    const worldRaw = {
        x: worldRawVec.get([0]),
        y: worldRawVec.get([1]),
        z: worldRawVec.get([2]),
    };

    // Return distinct copies of the objects
    return {
        gravity: { x: gravityState.x, y: gravityState.y, z: gravityState.z },
        linear: { x: linear.x, y: linear.y, z: linear.z },
        world: world,
        worldRaw: worldRaw, // Raw acceleration rotated to world frame
    };
}

// Helper function to create chart configuration
function createChartConfig(title) {
    return {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'X-axis',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.1,
                },
                {
                    label: 'Y-axis',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.1,
                },
                {
                    label: 'Z-axis',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Acceleration (g)',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                    },
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                title: {
                    display: true,
                    text: title,
                },
            },
        },
    };
}

// Initialize Charts
const ctx = document.getElementById('accelChart').getContext('2d');
chart = new Chart(ctx, createChartConfig('Raw Acceleration'));

const gravityCtx = document.getElementById('gravityChart').getContext('2d');
gravityChart = new Chart(gravityCtx, createChartConfig('Gravity Component'));

const linearCtx = document.getElementById('linearChart').getContext('2d');
linearChart = new Chart(linearCtx, createChartConfig('Linear Acceleration (Device Frame)'));

const worldCtx = document.getElementById('worldChart').getContext('2d');
worldChart = new Chart(worldCtx, createChartConfig('Linear Acceleration (World Frame)'));

// Initialize 3D Ring Visualization
window.addEventListener('load', () => {
    if (window.RingVisualization) {
        window.RingVisualization.init();
    }
});

connectButton.addEventListener('click', async () => {
    try {
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth API is not supported in this browser');
            alert('Web Bluetooth API is not supported in this browser');
            return;
        }

        console.log('Requesting Bluetooth devices...');
        device = await navigator.bluetooth.requestDevice({
            // acceptAllDevices: true,
            filters: [{ name: 'TEST' }],
            optionalServices: [serviceUuid],
        });

        console.log('Selected device:', device.name || 'Unknown');
        console.log('Device ID:', device.id);

        server = await device.gatt.connect();
        console.log('Connected to GATT server');

        service = await server.getPrimaryService(serviceUuid);
        console.log('Service found:', service.uuid);

        characteristic = await service.getCharacteristic(characteristicUuid);
        console.log('Characteristic found:', characteristic.uuid);

        // Try to get accelerometer characteristic
        try {
            accelCharacteristic = await service.getCharacteristic(accelCharacteristicUuid);
            console.log('Accelerometer characteristic found:', accelCharacteristic.uuid);
            startPlotButton.disabled = false;
        } catch (error) {
            console.warn('Accelerometer characteristic not found:', error);
            accelCharacteristic = null;
        }

        connectButton.disabled = true;
        ledOnButton.disabled = false;
        ledOffButton.disabled = false;
        disconnectButton.disabled = false;

        device.addEventListener('gattserverdisconnected', onDisconnected);
    } catch (error) {
        console.error('Error connecting to device:', error);
    }
});

ledOnButton.addEventListener('click', async () => {
    if (!characteristic) {
        return;
    }
    try {
        const data = new Uint8Array([1]);
        await characteristic.writeValue(data);
        console.log('Wrote 1 to characteristic');
    } catch (error) {
        console.error('Error writing to characteristic:', error);
    }
});

ledOffButton.addEventListener('click', async () => {
    if (!characteristic) {
        return;
    }
    try {
        const data = new Uint8Array([0]);
        await characteristic.writeValue(data);
        console.log('Wrote 0 to characteristic');
    } catch (error) {
        console.error('Error writing to characteristic:', error);
    }
});

disconnectButton.addEventListener('click', async () => {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    } else {
        onDisconnected();
    }
});

function onDisconnected() {
    console.log('Disconnected from device');

    // Stop notifications if active
    if (accelCharacteristic) {
        try {
            accelCharacteristic.removeEventListener('characteristicvaluechanged', handleAccelNotification);
        } catch (error) {
            console.warn('Error removing notification listener:', error);
        }
    }

    // Reset gravity state
    gravityState = null;

    device = null;
    server = null;
    service = null;
    characteristic = null;
    accelCharacteristic = null;

    connectButton.disabled = false;
    ledOnButton.disabled = true;
    ledOffButton.disabled = true;
    disconnectButton.disabled = true;
    startPlotButton.disabled = true;
    stopPlotButton.disabled = true;
}

const coordValToG = (coord, sens) => {
    let sensMultiplier = 0;
    // find sens multiplier in milli-Gs
    switch (sens) {
        case 0:
            sensMultiplier = 1;
            break;
        case 1:
            sensMultiplier = 2;
            break;
        case 2:
            sensMultiplier = 4;
            break;
        case 3:
        default:
            sensMultiplier = 8;
            break;
    }
    // convert to G's and apply multiplier
    return sensMultiplier * 0.001 * coord;
};

function handleAccelNotification(event) {
    try {
        const value = event.target.value;

        const sens = value.getInt8(6, true);

        // Parse accelerometer data
        let x, y, z;
        x = coordValToG(value.getInt16(0, false) >> 4, sens);
        y = coordValToG(value.getInt16(2, false) >> 4, sens);
        z = coordValToG(value.getInt16(4, false) >> 4, sens);

        const reading = { x, y, z };

        // Process the single reading through the stateful filter
        const processed = separateGravityAcceleration(reading, 0.99);

        const timestamp = new Date().toLocaleTimeString();

        // Update Raw Acceleration chart
        chart.data.labels.push(timestamp);
        chart.data.datasets[0].data.push(x);
        chart.data.datasets[1].data.push(y);
        chart.data.datasets[2].data.push(z);

        // Update Gravity chart
        gravityChart.data.labels.push(timestamp);
        gravityChart.data.datasets[0].data.push(processed.gravity.x);
        gravityChart.data.datasets[1].data.push(processed.gravity.y);
        gravityChart.data.datasets[2].data.push(processed.gravity.z);

        // Update Linear Acceleration (Device Frame) chart
        linearChart.data.labels.push(timestamp);
        linearChart.data.datasets[0].data.push(processed.linear.x);
        linearChart.data.datasets[1].data.push(processed.linear.y);
        linearChart.data.datasets[2].data.push(processed.linear.z);

        // Update Linear Acceleration (World Frame) chart
        worldChart.data.labels.push(timestamp);
        worldChart.data.datasets[0].data.push(processed.world.x);
        worldChart.data.datasets[1].data.push(processed.world.y);
        worldChart.data.datasets[2].data.push(processed.world.z);

        // Keep only last 50 data points
        const maxDataPoints = 50;
        [chart, gravityChart, linearChart, worldChart].forEach((c) => {
            if (c.data.labels.length > maxDataPoints) {
                c.data.labels.shift();
                c.data.datasets[0].data.shift();
                c.data.datasets[1].data.shift();
                c.data.datasets[2].data.shift();
            }
        });

        // Update all charts without animation for better performance
        chart.update('none');
        gravityChart.update('none');
        linearChart.update('none');
        worldChart.update('none');

        // Update 3D visualization with gravity and linear acceleration in device frame
        if (window.RingVisualization) {
            window.RingVisualization.updateOrientation(processed.gravity);
            window.RingVisualization.updatePosition({
                gravity: processed.gravity,
                linear: processed.linear,
            }); // Pass both vectors in device coordinates
        }

        console.log(`Raw: X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);
        console.log(
            `Gravity: X: ${processed.gravity.x.toFixed(2)}, Y: ${processed.gravity.y.toFixed(2)}, Z: ${processed.gravity.z.toFixed(2)}`,
        );
        console.log(
            `Linear: X: ${processed.linear.x.toFixed(2)}, Y: ${processed.linear.y.toFixed(2)}, Z: ${processed.linear.z.toFixed(2)}`,
        );
        console.log(
            `World: X: ${processed.world.x.toFixed(2)}, Y: ${processed.world.y.toFixed(2)}, Z: ${processed.world.z.toFixed(2)}`,
        );
    } catch (error) {
        console.error('Error processing accelerometer notification:', error);
    }
}

startPlotButton.addEventListener('click', async () => {
    if (!accelCharacteristic) {
        console.error('Accelerometer characteristic not available');
        return;
    }

    try {
        startPlotButton.disabled = true;
        stopPlotButton.disabled = false;

        // Reset gravity state for fresh filter initialization
        gravityState = null;

        // Reset ring position in visualization
        if (window.RingVisualization) {
            window.RingVisualization.resetPosition();
        }

        // Subscribe to notifications
        await accelCharacteristic.startNotifications();
        console.log('Started accelerometer notifications');

        // Add event listener for notifications
        accelCharacteristic.addEventListener('characteristicvaluechanged', handleAccelNotification);
    } catch (error) {
        console.error('Error starting notifications:', error);
        startPlotButton.disabled = false;
        stopPlotButton.disabled = true;
    }
});

stopPlotButton.addEventListener('click', async () => {
    if (!accelCharacteristic) {
        return;
    }

    try {
        // Remove event listener
        accelCharacteristic.removeEventListener('characteristicvaluechanged', handleAccelNotification);

        // Stop notifications
        await accelCharacteristic.stopNotifications();
        console.log('Stopped accelerometer notifications');

        startPlotButton.disabled = false;
        stopPlotButton.disabled = true;
    } catch (error) {
        console.error('Error stopping notifications:', error);
    }
});
