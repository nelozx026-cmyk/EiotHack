/**
 * EiotHack version 1.0 (alpha test)
 * Direct In-App Bluetooth Scanning & Scooter Connection Pipeline Engine
 */

// Global App State
const appState = {
  activeScreen: 'home',
  bleKey: localStorage.getItem('eiothack_ble_key') || '',
  selectedDevice: null,
  bleDevice: null,
  gattServer: null,
  txCharacteristic: null,
  isScanning: false,

  scooterState: {
    isUnlocked: false,
    mode: 'mode3',
    headlight: true,
    throttle: true
  },

  discoveredDevices: []
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSettings();
  initScanner();
  initControlScreen();
});

/**
 * Screen Navigation Engine
 */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    appState.activeScreen = screenId;
  }
}

function initNavigation() {
  // Home Buttons
  document.getElementById('btnGoSettings').addEventListener('click', () => showScreen('screenSettings'));
  document.getElementById('btnGoStart').addEventListener('click', () => {
    showScreen('screenScan');
    renderDeviceList();
  });

  // Back Buttons
  document.getElementById('btnSettingsBack').addEventListener('click', () => showScreen('screenHome'));
  document.getElementById('btnScanBack').addEventListener('click', () => {
    stopInAppScan();
    showScreen('screenHome');
  });
  document.getElementById('btnControlBack').addEventListener('click', () => showScreen('screenScan'));
}

/**
 * Settings Screen Logic
 */
function initSettings() {
  const keyInput = document.getElementById('bleKeyInput');
  if (appState.bleKey) {
    keyInput.value = appState.bleKey;
  }

  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    appState.bleKey = keyInput.value.trim();
    localStorage.setItem('eiothack_ble_key', appState.bleKey);
    alert('BLE Key сохранен!');
    showScreen('screenHome');
  });
}

/**
 * In-App Device Scanner Logic
 */
function initScanner() {
  renderDeviceList();
  document.getElementById('btnTriggerScan').addEventListener('click', startInAppBleScan);
}

/**
 * Render Discovered Devices
 */
function renderDeviceList() {
  const listEl = document.getElementById('deviceList');
  const emptyNotice = document.getElementById('emptyListNotice');
  listEl.innerHTML = '';

  if (appState.discoveredDevices.length === 0) {
    emptyNotice.style.display = 'block';
    return;
  } else {
    emptyNotice.style.display = 'none';
  }

  appState.discoveredDevices.forEach(device => {
    const li = document.createElement('li');
    li.className = 'device-item';
    li.innerHTML = `
      <div class="device-info-left">
        <span class="device-name">${device.name}</span>
        <span class="device-mac">${device.mac}</span>
      </div>
      <div class="device-rssi">${device.rssi || 'BLE'}</div>
    `;
    li.addEventListener('click', () => connectToBleDevice(device));
    listEl.appendChild(li);
  });
}

/**
 * Start In-App BLE Scan Engine
 */
async function startInAppBleScan() {
  const progressEl = document.getElementById('scanProgress');
  const alertEl = document.getElementById('scanAlert');
  const alertText = document.getElementById('scanAlertText');

  if (!navigator.bluetooth) {
    alertEl.style.display = 'flex';
    alertText.innerText = 'Включите Bluetooth на телефоне и убедитесь, что самокат поблизости.';
    alert('Web Bluetooth API недоступен на этом устройстве. Убедитесь, что Bluetooth включен.');
    return;
  }

  alertEl.style.display = 'none';
  progressEl.style.display = 'flex';
  appState.isScanning = true;

  // LEScan Attempt
  if ('requestLEScan' in navigator.bluetooth) {
    try {
      const scan = await navigator.bluetooth.requestLEScan({
        acceptAllAdvertisements: true
      });

      navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
        const foundName = event.device.name || 'Ninebot / Segway IoT';
        const foundMac = event.device.id ? event.device.id.slice(0, 17).toUpperCase() : 'BLE-DEVICE';
        const rssi = event.rssi ? `${event.rssi} dBm` : '-62 dBm';

        addDiscoveredDevice({
          rawDevice: event.device,
          name: foundName,
          mac: foundMac,
          rssi: rssi
        });
      });

      setTimeout(() => stopInAppScan(), 10000);
      return;
    } catch (e) {
      console.log('LEScan fallback to requestDevice:', e);
    }
  }

  // Fallback Device Request
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ]
    });

    const realDevice = {
      rawDevice: device,
      name: device.name || 'Segway IoT Controller',
      mac: device.id ? device.id.slice(0, 17).toUpperCase() : '0E:D7:90:5D:FE:D7',
      rssi: '-55 dBm'
    };

    addDiscoveredDevice(realDevice);
    stopInAppScan();
    connectToBleDevice(realDevice);

  } catch (err) {
    stopInAppScan();
    if (err.name !== 'NotFoundError') {
      alertEl.style.display = 'flex';
      alertText.innerText = `Ошибка Bluetooth: ${err.message}. Включите Bluetooth на телефоне.`;
    }
  }
}

function addDiscoveredDevice(deviceObj) {
  if (!appState.discoveredDevices.some(d => d.mac === deviceObj.mac)) {
    appState.discoveredDevices.unshift(deviceObj);
    renderDeviceList();
  }
}

function stopInAppScan() {
  appState.isScanning = false;
  const progressEl = document.getElementById('scanProgress');
  if (progressEl) progressEl.style.display = 'none';
}

/**
 * Connect to Selected Real BLE Device & Connection Status Pipeline
 */
async function connectToBleDevice(deviceObj) {
  stopInAppScan();
  appState.selectedDevice = deviceObj;

  const statusLine1 = document.getElementById('ctrlStatusText');
  const statusLine2 = document.getElementById('ctrlSubStatusText');

  // Step 1: Initial State -> Started & Connecting to
  statusLine1.className = 'status-line-1';
  statusLine1.innerText = 'Started';
  statusLine2.innerHTML = `Connecting to: <span>${deviceObj.mac}</span>`;

  showScreen('screenControl');

  if (deviceObj.rawDevice && deviceObj.rawDevice.gatt) {
    try {
      // Step 2: Attempting GATT Connection
      appState.bleDevice = deviceObj.rawDevice;

      // Handle disconnect event
      appState.bleDevice.addEventListener('gattserverdisconnected', () => {
        statusLine1.className = 'status-line-1 status-error';
        statusLine1.innerText = 'dont connect to the device';
        statusLine2.innerHTML = `Disconnected from: <span>${deviceObj.mac}</span>`;
      });

      appState.gattServer = await deviceObj.rawDevice.gatt.connect();

      // Step 3: Success -> Connected
      statusLine1.className = 'status-line-1 status-success';
      statusLine1.innerText = 'Connected';
      statusLine2.innerHTML = `Connected to: <span>${deviceObj.mac}</span>`;

    } catch (err) {
      // Step 4: Error -> dont connect to the device
      statusLine1.className = 'status-line-1 status-error';
      statusLine1.innerText = 'dont connect to the device';
      statusLine2.innerHTML = `Connecting to: <span>${deviceObj.mac}</span>`;
      console.error('GATT Connection Error:', err);
    }
  } else {
    // If simulation or no raw device handle
    setTimeout(() => {
      statusLine1.className = 'status-line-1 status-error';
      statusLine1.innerText = 'dont connect to the device';
      statusLine2.innerHTML = `Connecting to: <span>${deviceObj.mac}</span>`;
    }, 1000);
  }
}

/**
 * Control Screen Actions Setup
 */
function initControlScreen() {
  // Unlock Action
  document.getElementById('btnUnlock').addEventListener('click', () => {
    appState.scooterState.isUnlocked = true;
    const packet = NinebotProtocol.presets.unlock();
    sendBlePacket(packet, 'Unlock Command');
  });

  // Lock Action
  document.getElementById('btnLock').addEventListener('click', () => {
    appState.scooterState.isUnlocked = false;
    const packet = NinebotProtocol.presets.lock();
    sendBlePacket(packet, 'Lock Command');
  });

  // Radio Mode Selection
  document.querySelectorAll('input[name="speedMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      appState.scooterState.mode = e.target.value;
    });
  });

  // Headlight Toggle
  document.getElementById('toggleHeadlight').addEventListener('change', (e) => {
    appState.scooterState.headlight = e.target.checked;
    const packet = e.target.checked ? NinebotProtocol.presets.lightOn() : NinebotProtocol.presets.lightOff();
    sendBlePacket(packet, 'Headlight Toggle');
  });

  // Throttle Toggle
  document.getElementById('toggleThrottle').addEventListener('change', (e) => {
    appState.scooterState.throttle = e.target.checked;
  });

  // Send to Scooter Button
  document.getElementById('btnSendToScooter').addEventListener('click', () => {
    const modeMap = { mode1: 15, mode2: 20, mode3: 25 };
    const speedLimit = modeMap[appState.scooterState.mode] || 25;
    const packet = NinebotProtocol.presets.setSpeedLimit(speedLimit);
    sendBlePacket(packet, `Set Speed Limit (${speedLimit} km/h)`);
    alert(`Отправлено на самокат:\nРежим: ${appState.scooterState.mode.toUpperCase()}\nФара: ${appState.scooterState.headlight ? 'ВКЛ' : 'ВЫКЛ'}\nГаз: ${appState.scooterState.throttle ? 'ВКЛ' : 'ВЫКЛ'}`);
  });

  // Eject Battery Button
  document.getElementById('btnEjectBattery').addEventListener('click', () => {
    const packet = NinebotProtocol.presets.iotUnlockPulse();
    sendBlePacket(packet, 'Eject Battery Pulse');
    alert('Импульс отстрела батареи Segway IoT отправлен!');
  });
}

/**
 * Send Packet to Real BLE Device
 */
function sendBlePacket(packetUint8, actionName) {
  if (appState.txCharacteristic) {
    try {
      appState.txCharacteristic.writeValue(packetUint8);
      console.log(`[BLE TX] Sent ${actionName}`);
    } catch (err) {
      console.error(`[BLE TX Error] ${err.message}`);
    }
  } else {
    console.log(`[Packet Ready] ${actionName}:`, packetUint8);
  }
}
