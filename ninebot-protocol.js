/**
 * Ninebot & Segway IoT UART BLE Protocol Encoder / Decoder
 * Standard Frame: 55 AA [Len] [Src] [Dst] [Cmd] [Reg] [Payload...] [CRC_L] [CRC_H]
 */

const NinebotProtocol = {
  // Device Addresses
  ADDR: {
    BLE_APP: 0x3E,   // Phone / Web App BLE client
    ESC: 0x20,       // Motor ESC Controller
    BMS: 0x22,       // Battery Management System
    BLE_MODULE: 0x21,// Scooter Built-in BLE board
    IOT: 0x3D        // Segway IoT Box
  },

  // Commands
  CMD: {
    READ: 0x01,
    WRITE: 0x03,
    NOTIFY: 0x04
  },

  // Registers
  REG: {
    LOCK: 0x31,             // 0 = Unlocked, 1 = Locked
    LIGHT: 0x7C,            // Headlight status
    SPEED_LIMIT: 0x5E,      // Speed Limit Override
    BEEP: 0x7A,             // Buzzer sound trigger
    SERIAL_NO: 0x1A,        // Serial number register
    BATTERY_VOLT: 0x31,     // BMS Voltage
    BATTERY_SOC: 0x32,      // Battery percentage
    SPEED_CURRENT: 0x26,    // Current Realtime Speed
    IOT_HEARTBEAT: 0x80     // IoT Bypass Heartbeat
  },

  /**
   * Calculates 16-bit Ninebot Checksum (CRC)
   * Sum of (Length + Source + Target + Command + Register + Data), inverted ~Sum & 0xFFFF
   */
  calculateCRC(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    const crc = (~sum) & 0xFFFF;
    return [crc & 0xFF, (crc >> 8) & 0xFF];
  },

  /**
   * Encodes a command packet into Uint8Array ready for BLE TX characteristic
   */
  buildPacket(src, dst, cmd, reg, payload = []) {
    const payloadBytes = Array.isArray(payload) ? payload : [payload];
    const len = payloadBytes.length + 2; // Reg (1) + Cmd (1) + Payload len
    
    // Header 0x55 0xAA
    const header = [0x55, 0xAA];
    const body = [len, src, dst, cmd, reg, ...payloadBytes];
    const crc = this.calculateCRC(body);

    return new Uint8Array([...header, ...body, ...crc]);
  },

  /**
   * Parses incoming Ninebot 55 AA packet byte stream
   */
  parsePacket(uint8Array) {
    if (uint8Array.length < 9) return null;
    if (uint8Array[0] !== 0x55 || uint8Array[1] !== 0x5A && uint8Array[1] !== 0xAA) {
      return null;
    }

    const len = uint8Array[2];
    const src = uint8Array[3];
    const dst = uint8Array[4];
    const cmd = uint8Array[5];
    const reg = uint8Array[6];
    const payload = uint8Array.slice(7, 7 + len - 2);

    return {
      src,
      dst,
      cmd,
      reg,
      payload: Array.from(payload),
      rawHex: Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    };
  },

  // Ready-to-use Command Presets
  presets: {
    // Lock Scooter Command
    lock() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.LOCK,
        [0x01, 0x00]
      );
    },

    // Unlock Scooter Command
    unlock() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.LOCK,
        [0x00, 0x00]
      );
    },

    // Turn Light On
    lightOn() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.LIGHT,
        [0x02, 0x00]
      );
    },

    // Turn Light Off
    lightOff() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.LIGHT,
        [0x00, 0x00]
      );
    },

    // Beep Horn
    beep() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.BEEP,
        [0x01, 0x00]
      );
    },

    // Set Max Speed (e.g. 35 km/h)
    setSpeedLimit(kmh) {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.WRITE,
        NinebotProtocol.REG.SPEED_LIMIT,
        [kmh & 0xFF, 0x00]
      );
    },

    // Segway IoT Unlock Pulse
    iotUnlockPulse() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.IOT,
        NinebotProtocol.CMD.WRITE,
        0x05,
        [0xAA, 0x55, 0x01, 0x02]
      );
    },

    // Read Serial Number & Firmware
    readSerial() {
      return NinebotProtocol.buildPacket(
        NinebotProtocol.ADDR.BLE_APP,
        NinebotProtocol.ADDR.ESC,
        NinebotProtocol.CMD.READ,
        NinebotProtocol.REG.SERIAL_NO,
        [0x0E] // Length to read
      );
    }
  }
};
