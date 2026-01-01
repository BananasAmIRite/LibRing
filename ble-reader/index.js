const connectButton = document.getElementById('connect');
const ledOnButton = document.getElementById('led-on');
const ledOffButton = document.getElementById('led-off');
const disconnectButton = document.getElementById('disconnect');

let device;
let server;
let service;
let characteristic;

const serviceUuid = '00112233-4455-6677-8899-aabbccddeeff';
const characteristicUuid = '2d86686a-53dc-25b3-0c4a-f0e10c8dee20';

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
            // optionalServices: [serviceUuid],
        });

        console.log('Selected device:', device.name || 'Unknown');
        console.log('Device ID:', device.id);

        server = await device.gatt.connect();
        console.log('Connected to GATT server');

        service = await server.getPrimaryService(serviceUuid);
        console.log('Service found:', service.uuid);

        characteristic = await service.getCharacteristic(characteristicUuid);
        console.log('Characteristic found:', characteristic.uuid);

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
    device = null;
    server = null;
    service = null;
    characteristic = null;

    connectButton.disabled = false;
    ledOnButton.disabled = true;
    ledOffButton.disabled = true;
    disconnectButton.disabled = true;
}
