const noble = require('@abandonware/noble');

// Wait for Bluetooth adapter to be ready
noble.on('stateChange', (state) => {
    console.log('Bluetooth adapter state:', state);

    if (state === 'poweredOn') {
        console.log('Starting BLE scan...');
        noble.startScanning(
            [
                // 'generic_access', // 0x1800
                // 'generic_attribute', // 0x1801
                // 'device_information', // 0x180A
                // 'battery_service', // 0x180F
                // 'heart_rate', // 0x180D
                // 'health_thermometer', // 0x1809
                // 'environmental_sensing', // 0x181A
                // '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
                // '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
                // '0000180a-0000-1000-8000-00805f9b34fb',
                'fef5',
            ],
            false
        ); // Scan for all devices, don't allow duplicates
    } else {
        console.log('Stopping scan...');
        noble.stopScanning();
    }
});

// Handle discovered devices
noble.on('discover', async (peripheral) => {
    if (peripheral.advertisement.localName != 'TEST') return;
    console.log('\n--- Device Found ---');
    console.log('Address:', peripheral.address);
    console.log('Local Name:', peripheral.advertisement.localName || 'Unknown');
    console.log('RSSI:', peripheral.rssi);
    console.log('Connectable:', peripheral.connectable);

    // Log manufacturer data if available
    if (peripheral.advertisement.manufacturerData) {
        console.log('Manufacturer Data:', peripheral.advertisement.manufacturerData.toString('hex'));
    }

    // // Log service UUIDs if available
    if (peripheral.advertisement.serviceUuids && peripheral.advertisement.serviceUuids.length > 0) {
        console.log('Service UUIDs:', peripheral.advertisement.serviceUuids);
    }

    await peripheral.connectAsync();
    console.log('Connected');

    const { services, characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();

    console.log(services);
    // Find the service with UUID 0x3000
    const targetService = services.find((service) => service.uuid === '00112233445566778899aabbccddeeff');

    if (!targetService) {
        console.log('Service 00112233445566778899aabbccddeeff not found');
        await peripheral.disconnectAsync();
        return;
    }

    console.log('Found service 00112233445566778899aabbccddeeff');

    // Find the characteristic with UUID 0x3a00
    const targetCharacteristic = characteristics.find(
        (char) =>
            char._serviceUuid === '00112233445566778899aabbccddeeff' && char.uuid === '2d86686a53dc25b30c4af0e10c8dee20'
    );

    if (!targetCharacteristic) {
        console.log(
            'Characteristic 2d86686a53dc25b30c4af0e10c8dee20 not found in service 00112233445566778899aabbccddeeff'
        );
        await peripheral.disconnectAsync();
        return;
    }

    console.log('Found characteristic 2d86686a53dc25b30c4af0e10c8dee20');
    console.log('Characteristic properties:', targetCharacteristic.properties);

    // if (targetCharacteristic.properties.includes('notify')) {
    //     targetCharacteristic.on('data', (data, isNotification) => {
    //         console.log('Received data (hex):', data.toString('hex'));
    //         console.log('Received data (bytes):', Array.from(data));

    //         // // Parse as accelerometer data if length is appropriate
    //         // if (data.length >= 6) {
    //         //     const x = data.readInt16LE(0);
    //         //     const y = data.readInt16LE(2);
    //         //     const z = data.readInt16LE(4);
    //         //     console.log('Parsed values - X:', x, 'Y:', y, 'Z:', z);
    //         // }
    //     });

    //     await new Promise((resolve, reject) => {
    //         targetCharacteristic.subscribe((error) => {
    //             if (error) {
    //                 console.error('Subscribe error:', error);
    //                 reject(error);
    //             } else {
    //                 console.log('Successfully subscribed to notifications');
    //                 resolve();
    //             }
    //         });
    //     });
    // }

    if (targetCharacteristic.properties.includes('read')) {
        const data = await new Promise((resolve, reject) => {
            targetCharacteristic.read((error, data) => {
                if (error) {
                    console.log(error);
                    reject(error);
                } else resolve(data);
            });
        });

        console.log(`data: ${data}`);
    } else {
        console.log('Characteristic does not support read operation');
    }

    if (targetCharacteristic.properties.includes('write')) {
        const dataToWrite = Buffer.from([1]); // Boolean 1
        await new Promise((resolve, reject) => {
            targetCharacteristic.write(dataToWrite, false, (error) => {
                if (error) {
                    console.error('Write error:', error);
                    return reject(error);
                }
                console.log('Wrote: ' + dataToWrite.toString('hex'));
                resolve();
            });
        });
    } else {
        console.log('Characteristic does not support write operation');
    }

    await peripheral.disconnectAsync();
});

// Handle scan start
noble.on('scanStart', () => {
    console.log('BLE scan started successfully');
});

// Handle scan stop
noble.on('scanStop', () => {
    console.log('BLE scan stopped');
});

// Stop scanning after 10 seconds
setTimeout(() => {
    console.log('\nStopping scan...');
    noble.stopScanning();
    process.exit(0);
}, 20000);
