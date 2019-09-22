// App for YIO remote.
// https://github.com/martonborzak/yio-remote/wiki/Homey-integration
// Tested with 78f3ab16-c622-4bd7-aebf-3ca981e41375

const Homey = require("homey");
const { HomeyAPI } = require("athom-api");
const WebSocket = require("ws");
const mdns = require("mdns-js");

const API_SERVICE_PORT = 8936;
const API_SERVICE_NAME = "yio2homeyapi";
const MESSAGE_CONNECTED = '{"type":"connected"}';
const MESSAGE_GETCONFIG = '{"type": "command","command": "get_config"}';

class YioApp extends Homey.App {
  // Get API control function
  getApi() {
    if (!this.api) {
      this.api = HomeyAPI.forCurrentHomey();
    }
    return this.api;
  }

  // Start MDNS advertisement.
  startMdns() {
    console.log(`Advertising service as  _${API_SERVICE_NAME}._tcp on port ${API_SERVICE_PORT}`);
    var service = mdns.createAdvertisement(mdns.tcp(API_SERVICE_NAME), API_SERVICE_PORT, {
      name: "hello",
      txt: {
        txtvers: "1"
      }
    });
    service.start();
  }

  // Start API Service.
  async startYioApiService() {
    const ApiService = new WebSocket.Server({ port: API_SERVICE_PORT });
    ApiService.on("connection", connection => {
      console.log("=======> ApiService incomming connection");
      connection.on("message", message => {
        console.log(`=======> Received message: ${message}`);
        this.messageHandler(connection, message);
      });
      connection.on("close", (reasonCode, description) => {
        connection = null;
      });
      connection.send(MESSAGE_CONNECTED);
      console.log(`<======= Send message: ${MESSAGE_CONNECTED}`);
      connection.send(MESSAGE_GETCONFIG);
      console.log(`<======= Send message: ${MESSAGE_GETCONFIG}`);
    });
  }

  async messageHandler(connection, message) {
    try {
      let jsonMessage = JSON.parse(message);
      if (jsonMessage.type && jsonMessage.type == "sendConfig") {
        for (let i in jsonMessage.devices) {
          const deviceId = jsonMessage.devices[i];
          console.log(`=======> MESSAGE Requesting data for deviceId:  ${deviceId}`);
          this.getDeviceState(connection, deviceId);
        }
      }
      if (jsonMessage.type && jsonMessage.type == "command") {
        ////{"command":"onoff","deviceId":"78f3ab16-c622-4bd7-aebf-3ca981e41375","type":"command","value":true}
        this.commandDeviceState(jsonMessage.deviceId, jsonMessage.command, jsonMessage.value);
      }
    } catch (e) {
      console.log(`ERROR: ${e}`);
    }
  }

  async commandDeviceState(deviceId, command, value) {
    let device = await this.api.devices.getDevice({ id: deviceId });
    if (command == "toggle") {
      command = "onoff";
      value = !device.capabilitiesObj.onoff.value;
      console.log(device.capabilitiesObj.onoff.value);
      console.log(typeof device.capabilitiesObj.onoff.value);
      console.log(value);
    }
    device
      .setCapabilityValue(command, value)
      .then(r => {
        console.log(r);
      })
      .catch(e => {
        console.log(e);
      });
    console.log(`>=>=>=>= Send Command to Device: ${device.name}`);
  }

  async getDeviceState(connection, deviceId) {
    let device = await this.api.devices.getDevice({ id: deviceId });
    let onoff = this.convHomeyYioOnOff(device);
    let response = `{"type":"command", "command":"send_states", "data":{"entity_id": "${deviceId}", "onoff": "${onoff}", "friendly_name": "${device.name}", "supported_features": []}}`;
    this.subscribeToDeviceEvents(connection, device);
    connection.send(response);
    console.log(`<======= Send message: ${response}`);
  }

  async subscribeToDeviceEvents(connection, device) {
    for (let i in device.capabilities) {
      console.log(`======== Device Capabilitie: ${device.capabilities[i]}`);
      if (["onoff", "dim", "light_saturation", "light_temperature", "light_hue"].includes(device.capabilities[i].split(".")[0])) {
        console.log("======== created listener for - " + device.capabilities[i]);
        let listenerEvents = async value => {
          console.log(`=======> notification.* "${device.capabilities[i]}" "${value}" "${device.name}".`);
          let cap = this.convertCapabilityHY(device.capabilities[i], value);
          const response = JSON.stringify({ type: "event", data: { entity_id: device.id, [cap.name]: cap.value } });
          //const response = `{"type": "event", "data": { "entity_id": "${device.id}", "${cap.name}": "${cap.value}"}}`;
          console.log(`<======= Send message: ${response}`);
          connection.send(response);
        };
        device.makeCapabilityInstance(device.capabilities[i], listenerEvents);
      }
    }
  }

  convertCapabilityHY(name, value) {
    let cap = { name, value };
    /*     if (name == "onoff") {
      cap.name = "state";
      if (value) {
        cap.value = "on";
      } else {
        cap.value = "off";
      }
    } else if (name == "dim") {
      cap.name = "brightness";
      cap.value = value * 100;
    } */
    return cap;
  }

  convHomeyYioOnOff(device) {
    if (device.capabilitiesObj.onoff.value) {
      return "on";
    } else {
      return "off";
    }
  }

  convYioHomeyOnOff(value) {
    if (value == "on") {
      return true;
    } else {
      return false;
    }
  }

  async startingServer() {}

  // On app init
  async onInit() {
    console.log("starting server");
    this.api = await this.getApi();

    this.startMdns();

    this.startYioApiService();

    let homeyDevicesAll = await this.api.devices.getDevices();
    console.log("");
    console.log("==== HOMEY DEVICE UUID LIST ====");
    for (let i in homeyDevicesAll) {
      const device = homeyDevicesAll[i];
      console.log(`deviceId:${device.id} name:${device.name}`);
    }
    console.log("================================");
    console.log("");
  }
}

module.exports = YioApp;
