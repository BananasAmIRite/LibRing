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

const serviceUuid = '00112233-4455-6677-8899-aabbccddeeff';
const characteristicUuid = '2d86686a-53dc-25b3-0c4a-f0e10c8dee20';
const accelCharacteristicUuid = 'f2909165-4ce5-8da2-4c10-8b38c19f65cc'; // Reversed byte order for BLE

// Initialize Chart
const ctx = document.getElementById('accelChart').getContext('2d');
chart = new Chart(ctx, {
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
                    text: 'Acceleration',
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
        },
    },
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

        console.log('Sensitivity:', sens);

        // Parse accelerometer data
        let x, y, z;
        x = coordValToG(value.getInt16(0, false) >> 4, sens);
        y = coordValToG(value.getInt16(2, false) >> 4, sens);
        z = coordValToG(value.getInt16(4, false) >> 4, sens);

        console.log(`Accel - X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);

        // Add data to chart
        const timestamp = new Date().toLocaleTimeString();
        chart.data.labels.push(timestamp);
        chart.data.datasets[0].data.push(x);
        chart.data.datasets[1].data.push(y);
        chart.data.datasets[2].data.push(z);

        // Keep only last 30 data points
        if (chart.data.labels.length > 30) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
            chart.data.datasets[2].data.shift();
        }

        chart.update('none'); // Update without animation for better performance
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
