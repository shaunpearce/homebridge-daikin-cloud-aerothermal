import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { DaikinCloudAirConditioningAccessory } from "./accessory";
import { DaikinCloudTemperatureAccessory } from "./accessory";
import { DaikinCloudWaterTankAccessory } from "./accessory";

import { DaikinCloudController } from "daikin-controller-cloud";
import path from "path";
import fs from "fs";

import type * as Device from "./../node_modules/daikin-controller-cloud/lib/device.js";
import type * as DaikinCloud from "./../node_modules/daikin-controller-cloud/index.js";

import { StringUtils } from "./utils/strings";

const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;

export type DaikinCloudAccessoryContext = {
  device: Device;
};

export class DaikinCloudPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory<DaikinCloudAccessoryContext>[] =
    [];

  public readonly storagePath: string = "";
  public controller: DaikinCloudController;

  public readonly updateIntervalDelay = ONE_MINUTE * 15;
  public updateInterval: NodeJS.Timeout | undefined;
  public forceUpdateTimeout: NodeJS.Timeout | undefined;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);

    this.storagePath = api.user.storagePath();
    this.updateIntervalDelay =
      ONE_MINUTE * (this.config.updateIntervalInMinutes || 15);

    this.controller = new DaikinCloudController({
      oidcClientId: this.config.clientId,
      oidcClientSecret: this.config.clientSecret,
      oidcCallbackServerBindAddr: this.config.oidcCallbackServerBindAddr,
      oidcCallbackServerExternalAddress:
        this.config.callbackServerExternalAddress,
      oidcCallbackServerPort: this.config.callbackServerPort,
      oidcTokenSetFilePath: path.resolve(
        this.storagePath,
        ".daikin-controller-cloud-tokenset"
      ),
      oidcAuthorizationTimeoutS: 60 * 5,
    });

    this.api.on("didFinishLaunching", async () => {
      this.controller.on("authorization_request", (url) => {
        this.log.warn(`
          Please navigate to ${url} to start the authorization flow. If it is the first time you open this url you will need to accept a security warning.
          
          Important: Make sure your Daikin app Redirect URI is set to ${url} in the Daikin Developer Portal.
        `);
      });

      this.controller.on("rate_limit_status", (rateLimitStatus) => {
        if (
          rateLimitStatus.remainingDay &&
          rateLimitStatus.remainingDay <= 20
        ) {
          this.log.warn(
            `[Rate limit remaining calls] Rate limit almost reached, you only have ${rateLimitStatus.remainingDay} calls left today`
          );
        }
        this.log.debug(
          `[Rate limit remaining calls] today: ${rateLimitStatus.remainingDay}/${rateLimitStatus.limitDay} -- this minute: ${rateLimitStatus.remainingMinute}/${rateLimitStatus.limitMinute}`
        );
      });

      await this.discoverDevices();
      this.startUpdateDevicesInterval();
    });
  }

  configureAccessory(
    accessory: PlatformAccessory<DaikinCloudAccessoryContext>
  ) {
    this.log.info("Loading accessory from cache:", accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices() {
    let devices: Device[] = [];

    this.log.info(
      "---------- Daikin info for debugging reasons --------------------"
    );

    try {
      devices = await this.controller.getCloudDevices();
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Failed to get cloud devices from Daikin Cloud: ${error.message}`;
        this.log.error(error.message);
      }
    }

    devices.forEach((device) => {
      this.log.info("Device found with id: " + device.getId() + " Data:");
      this.log.info(
        "    name: " + device.getData("climateControlMainZone", "name").value
      );
      this.log.info("    last updated: " + device.getLastUpdated());
      this.log.info(
        "    modelInfo: " + device.getData("gateway", "modelInfo").value
      );
      this.log.info("    show Hot Water Tank: " + this.config.HotWaterTank);
      this.log.info(
        "    show Outdoor Temperature: " + this.config.OutdoorTemperature
      );
      this.log.info("    disabled On/Off switch: " + this.config.DisableOnOff);
      this.log.info("\n");

      let uuid = this.api.hap.uuid.generate(device.getId());

      let existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );
      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);
        new DaikinCloudAirConditioningAccessory(this, existingAccessory);
      } else {
        this.log.info(
          "Adding new accessory:",
          device.getData("climateControlMainZone", "name").value
        );
        const accessory = new this.api.platformAccessory(
          device.getData("climateControlMainZone", "name").value ||
            "Climate Control",
          uuid
        );
        accessory.context.device = device;
        new DaikinCloudAirConditioningAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }

      uuid = this.api.hap.uuid.generate(device.getId() + "2");
      existingAccessory =
        this.accessories.find((accessory) => accessory.UUID === uuid) ||
        undefined;
      if (this.config.HotWaterTank) {
        if (existingAccessory) {
          this.log.info(
            "Restoring existing accessory from cache:",
            existingAccessory.displayName
          );
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          new DaikinCloudWaterTankAccessory(this, existingAccessory);
        } else {
          this.log.info(
            "Adding new accessory:",
            device.getData("domesticHotWaterTank", "name").value || "Hot Water"
          );
          const accessory = new this.api.platformAccessory(
            device.getData("domesticHotWaterTank", "name").value || "Hot Water",
            uuid
          );
          accessory.context.device = device;
          new DaikinCloudWaterTankAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);
        }
      } else if (existingAccessory) {
        this.log.info("Removing accessory:", existingAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          existingAccessory,
        ]);
      }

      const type = "Outdoor Daikin";
      uuid = this.api.hap.uuid.generate(device.getId() + type);
      existingAccessory =
        this.accessories.find((accessory) => accessory.UUID === uuid) ||
        undefined;
      if (this.config.OutdoorTemperature) {
        if (existingAccessory) {
          this.log.info(
            `Restoring existing accessory ${type} from cache:`,
            existingAccessory.displayName
          );
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          new DaikinCloudTemperatureAccessory(this, existingAccessory);
        } else {
          this.log.info(`Adding new accessory: ${type}`);
          const accessory = new this.api.platformAccessory(type, uuid);
          accessory.context.device = device;
          new DaikinCloudTemperatureAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);
        }
      } else if (existingAccessory) {
        this.log.info("Removing accessory:", existingAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          existingAccessory,
        ]);
      }
    });

    this.log.info(
      "---------- End Daikin info for debugging reasons ---------------"
    );
  }

  private async updateDevices() {
    this.log.debug("Update devices data");
    await this.controller.updateAllDeviceData();
  }

  forceUpdateDevices(delay: number = ONE_SECOND * 60) {
    this.log.debug(
      `Force update devices data (delay: ${delay}, update pending: ${this.forceUpdateTimeout})`
    );

    clearInterval(this.updateInterval);
    clearTimeout(this.forceUpdateTimeout);

    this.forceUpdateTimeout = setTimeout(async () => {
      await this.updateDevices();
      this.startUpdateDevicesInterval();
    }, delay);
  }

  private startUpdateDevicesInterval() {
    this.log.debug(
      `Starting update devices interval every ${
        this.updateIntervalDelay / ONE_MINUTE
      } minutes`
    );
    this.updateInterval = setInterval(async () => {
      await this.updateDevices();
    }, this.updateIntervalDelay);
  }

  private getPrivacyFriendlyConfig(config: PlatformConfig): object {
    return {
      ...config,
      clientId: StringUtils.mask(config.clientId),
      clientSecret: StringUtils.mask(config.clientSecret),
      excludedDevicesByDeviceId: config.excludedDevicesByDeviceId.map(
        (deviceId) => StringUtils.mask(deviceId)
      ),
    };
  }
}

// import {
//   API,
//   DynamicPlatformPlugin,
//   Logger,
//   PlatformAccessory,
//   PlatformConfig,
//   Service,
//   Characteristic,
// } from "homebridge";

// <<<<<<< HEAD
// import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
// import { DaikinCloudAirConditioningAccessory } from "./accessory";
// import { DaikinCloudTemperatureAccessory } from "./accessory";
// import { DaikinCloudWaterTankAccessory } from "./accessory";

// import DaikinCloudController from "daikin-controller-cloud";
// import path from "path";
// import fs from "fs";

// import type * as Device from "./../node_modules/daikin-controller-cloud/lib/device.js";
// import type * as DaikinCloud from "./../node_modules/daikin-controller-cloud/index.js";

// export class DaikinCloudPlatform implements DynamicPlatformPlugin {
//   public readonly Service: typeof Service = this.api.hap.Service;
//   public readonly Characteristic: typeof Characteristic =
//     this.api.hap.Characteristic;

//   public readonly accessories: PlatformAccessory[] = [];

//   public readonly storagePath: string = "";
// =======
// import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
// import {DaikinClimateControlEmbeddedId, daikinAirConditioningAccessory} from './daikinAirConditioningAccessory';

// import {DaikinCloudController} from 'daikin-controller-cloud/dist/index.js';

// import {daikinAlthermaAccessory} from './daikinAlthermaAccessory';
// import {resolve} from 'node:path';
// import {DaikinCloudDevice} from 'daikin-controller-cloud/dist/device';
// import {StringUtils} from './utils/strings';

// const ONE_SECOND = 1000;
// const ONE_MINUTE = ONE_SECOND * 60;

// export type DaikinCloudAccessoryContext = {
//     device: DaikinCloudDevice;
// };

// export class DaikinCloudPlatform implements DynamicPlatformPlugin {
//     public readonly Service: typeof Service;
//     public readonly Characteristic: typeof Characteristic;

//     public readonly accessories: PlatformAccessory<DaikinCloudAccessoryContext>[] = [];

//     public readonly storagePath: string = '';
//     public controller: DaikinCloudController;

//     public readonly updateIntervalDelay = ONE_MINUTE * 15;
//     public updateInterval: NodeJS.Timeout | undefined;
//     public forceUpdateTimeout: NodeJS.Timeout | undefined;
// >>>>>>> upstream/main

//   constructor(
//     public readonly log: Logger,
//     public readonly config: PlatformConfig,
//     public readonly api: API
//   ) {
//     this.log.debug("Finished initializing platform:", this.config.name);

// <<<<<<< HEAD
//     this.storagePath = api.user.storagePath();

//     this.api.on("didFinishLaunching", () => {
//       log.debug("Executed didFinishLaunching callback");
//       this.discoverDevices(this.config.username, this.config.password);
//     });
//   }

//   configureAccessory(accessory: PlatformAccessory) {
//     this.log.info("Loading accessory from cache:", accessory.displayName);
//     this.accessories.push(accessory);
//   }

//   async discoverDevices(username: string, password: string) {
//     let devices: Device[] = [];

//     this.log.info(
//       "---------- Daikin info for debugging reasons --------------------"
//     );

//     try {
//       devices = await this.getCloudDevices(username, password);
//     } catch (error) {
//       if (error instanceof Error) {
//         error.message = `Failed to get cloud devices from Daikin Cloud: ${error.message}`;
//         this.log.error(error.message);
//       }
//     }

//     devices.forEach((device) => {
//       this.log.info("Device found with id: " + device.getId() + " Data:");
//       this.log.info(
//         "    name: " + device.getData("climateControlMainZone", "name").value
//       );
//       this.log.info("    last updated: " + device.getLastUpdated());
//       this.log.info(
//         "    modelInfo: " + device.getData("gateway", "modelInfo").value
//       );
//       //this.log.info('    config.showExtraFeatures: ' + this.config.showExtraFeatures);
//       this.log.info("    show Hot Water Tank: " + this.config.HotWaterTank);
//       this.log.info(
//         "    show Outdoor Temperature: " + this.config.OutdoorTemperature
//       );
//       this.log.info("    disabled On/Off switch: " + this.config.DisableOnOff);
//       this.log.info("\n");

//       //we add Heater/Cooler
//       let uuid = this.api.hap.uuid.generate(device.getId());

//       let existingAccessory = this.accessories.find(
//         (accessory) => accessory.UUID === uuid
//       );
//       if (existingAccessory) {
//         this.log.info(
//           "Restoring existing accessory from cache:",
//           existingAccessory.displayName
//         );
//         existingAccessory.context.device = device;
//         this.api.updatePlatformAccessories([existingAccessory]);
//         new DaikinCloudAirConditioningAccessory(this, existingAccessory);
//       } else {
//         this.log.info(
//           "Adding new accessory:",
//           device.getData("climateControlMainZone", "name").value
//         );
//         const accessory = new this.api.platformAccessory(
//           device.getData("climateControlMainZone", "name").value ||
//             "Climate Control",
//           uuid
//         );
//         //this.log.info("acc info", accessory);
//         accessory.context.device = device;
//         new DaikinCloudAirConditioningAccessory(this, accessory);
//         this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
//           accessory,
//         ]);
//       }

//       //water tank accessory, if available...

//       uuid = this.api.hap.uuid.generate(device.getId() + "2"); //we need different but valid uuid
//       //let uuid2 = "xx123";
//       //let uuid2 = uuid + "2";
//       existingAccessory =
//         this.accessories.find((accessory) => accessory.UUID === uuid) ||
//         undefined;
//       if (this.config.HotWaterTank) {
//         if (existingAccessory) {
//           this.log.info(
//             "Restoring existing accessory from cache:",
//             existingAccessory.displayName
//           );
//           existingAccessory.context.device = device;
//           this.api.updatePlatformAccessories([existingAccessory]);
//           new DaikinCloudWaterTankAccessory(this, existingAccessory);
//         } else {
//           this.log.info(
//             "Adding new accessory:",
//             device.getData("domesticHotWaterTank", "name").value || "Hot Water"
//           );
//           const accessory = new this.api.platformAccessory(
//             device.getData("domesticHotWaterTank", "name").value || "Hot Water",
//             uuid
//           );
//           //this.log.info("acc info", accessory);
//           accessory.context.device = device;
//           new DaikinCloudWaterTankAccessory(this, accessory);
//           this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
//             accessory,
//           ]);
// =======
//         this.Service = this.api.hap.Service;
//         this.Characteristic = this.api.hap.Characteristic;
//         this.storagePath = api.user.storagePath();
//         this.updateIntervalDelay = ONE_MINUTE * (this.config.updateIntervalInMinutes || 15);
//         this.controller = new DaikinCloudController({
//             oidcClientId: this.config.clientId,
//             oidcClientSecret: this.config.clientSecret,
//             oidcCallbackServerBindAddr: this.config.oidcCallbackServerBindAddr,
//             oidcCallbackServerExternalAddress: this.config.callbackServerExternalAddress,
//             oidcCallbackServerPort: this.config.callbackServerPort,
//             oidcTokenSetFilePath: resolve(this.storagePath, '.daikin-controller-cloud-tokenset'),
//             oidcAuthorizationTimeoutS: 60 * 5,
//         });

//         this.api.on('didFinishLaunching', async () => {
//             this.controller.on('authorization_request', (url) => {
//                 this.log.warn(`
//                     Please navigate to ${url} to start the authorisation flow. If it is the first time you open this url you will need to accept a security warning.

//                     Important: Make sure your Daikin app Redirect URI is set to ${url} in the Daikin Developer Portal.
//                 `);
//             });

//             this.controller.on('rate_limit_status', (rateLimitStatus) => {
//                 if (rateLimitStatus.remainingDay && rateLimitStatus.remainingDay <= 20) {
//                     this.log.warn(`[Rate limit remaining calls] Rate limit almost reached, you only have ${rateLimitStatus.remainingDay} calls left today`);
//                 }
//                 this.log.debug(`[Rate limit remaining calls] today: ${rateLimitStatus.remainingDay}/${rateLimitStatus.limitDay} -- this minute: ${rateLimitStatus.remainingMinute}/${rateLimitStatus.limitMinute}`);
//             });

//             await this.discoverDevices(this.controller);
//             this.startUpdateDevicesInterval();

//         });
//     }

//     public configureAccessory(accessory: PlatformAccessory<DaikinCloudAccessoryContext>) {
//         this.log.info('Loading accessory from cache:', accessory.displayName);
//         this.accessories.push(accessory);
//     }

//     private async discoverDevices(controller: DaikinCloudController) {
//         let devices: DaikinCloudDevice[] = [];

//         this.log.info('--- Daikin info for debugging reasons (enable Debug Mode for more logs) ---');

//         this.log.debug('[Config] User config', this.getPrivacyFriendlyConfig(this.config));

//         try {
//             devices = await controller.getCloudDevices();
//         } catch (error) {
//             if (error instanceof Error) {
//                 error.message = `Failed to get cloud devices from Daikin Cloud: ${error.message}`;
//                 this.log.error(error.message);
//             }
// >>>>>>> upstream/main
//         }
//       } else if (existingAccessory) {
//         //we remove already added accessory
//         this.log.info("Removing accessory:", existingAccessory.displayName);
//         this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
//           existingAccessory,
//         ]);
//       }

// <<<<<<< HEAD
//       //Outdoor temp
//       const type = "Outdoor Daikin";
//       uuid = this.api.hap.uuid.generate(device.getId() + type); //we need different but valid uuid
//       existingAccessory =
//         this.accessories.find((accessory) => accessory.UUID === uuid) ||
//         undefined;
//       if (this.config.OutdoorTemperature) {
//         if (existingAccessory) {
//           this.log.info(
//             `Restoring existing accessory ${type} from cache:`,
//             existingAccessory.displayName
//           );
//           existingAccessory.context.device = device;
//           this.api.updatePlatformAccessories([existingAccessory]);
//           new DaikinCloudTemperatureAccessory(this, existingAccessory);
//         } else {
//           this.log.info(`Adding new accessory: ${type}`);
//           const accessory = new this.api.platformAccessory(type, uuid);
//           //this.log.info("acc info", accessory);
//           accessory.context.device = device;
//           new DaikinCloudTemperatureAccessory(this, accessory);
//           this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
//             accessory,
//           ]);
//         }
//       } else if (existingAccessory) {
//         //we remove already added accessory
//         this.log.info("Removing accessory:", existingAccessory.displayName);
//         this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
//           existingAccessory,
//         ]);
//       }
//       //}
//     });

//     this.log.info(
//       "---------- End Daikin info for debugging reasons ---------------"
//     );
//   }

//   async getCloudDevices(username: string, password: string): Promise<Device[]> {
//     const daikinCloud = await this.initiateDaikinCloudController(
//       username,
//       password
//     );
//     const devices: Device[] = await daikinCloud.getCloudDevices();

//     this.log.info(`Found ${devices.length} devices in your Daikin Cloud`);

//     if (devices.length === 0) {
//       return devices;
//     }

//     //const cloudDetails = await daikinCloud.getCloudDeviceDetails();
//     //this.log.info(JSON.stringify(cloudDetails));

//     return devices;
//   }

//   async initiateDaikinCloudController(username, password) {
//     let tokenSet;
//     const options = {
//       logger: this.log.info, // optional, logger function used to log details depending on loglevel
//       logLevel: "info", // optional, Loglevel of Library, default 'warn' (logs nothing by default)
//       proxyOwnIp: "192.168.xxx.xxx", // required, if proxy needed: provide own IP or hostname to later access the proxy
//       proxyPort: 8888, // required: use this port for the proxy and point your client device to this port
//       proxyWebPort: 8889, // required: use this port for the proxy web interface to get the certificate and start Link for login
//       proxyListenBind: "0.0.0.0", // optional: set this to bind the proxy to a special IP, default is '0.0.0.0'
//       proxyDataDir: this.storagePath, // Directory to store certificates and other proxy relevant data to
//       communicationTimeout: 10000, // Amount of ms to wait for request and responses before timeout
//       communicationRetries: 3, // Amount of retries when connection timed out
//     };

//     const tokenFile = path.join(this.storagePath, "daikincloudtokenset.json");
//     this.log.info(`Write/read Daikin Cloud tokenset from ${tokenFile}`);

//     if (fs.existsSync(tokenFile)) {
//       try {
//         this.log.debug(`Daikin Cloud tokenset found at ${tokenFile}`);
//         tokenSet = JSON.parse(fs.readFileSync(tokenFile).toString());
//       } catch (e) {
//         this.log.debug(`Daikin Cloud could not get tokenset: ${e}`);
//       }
//     }

//     const daikinCloud: DaikinCloud = new DaikinCloudController(
//       tokenSet,
//       options
//     );

//     daikinCloud.on("token_update", (tokenSet) => {
//       this.log.info(
//         `UPDATED Daikin Cloud tokenset, use for future and wrote to ${tokenFile}`
//       );
//       fs.writeFileSync(tokenFile, JSON.stringify(tokenSet));
//     });

//     try {
//       await daikinCloud.login(username, password);
//     } catch (error) {
//       if (error instanceof Error) {
//         error.message = `Failed to login to Daikin Cloud with ${username}: ${error.message}`;
//       }
//       throw error;
// =======
//         devices.forEach(device => {
//             try {
//                 const uuid = this.api.hap.uuid.generate(device.getId());
//                 const climateControlEmbeddedId: DaikinClimateControlEmbeddedId = device.getDescription().deviceModel === 'Altherma' ? 'climateControlMainZone' : 'climateControl';
//                 const name: string = device.getData(climateControlEmbeddedId, 'name', undefined).value;
//                 const deviceModel: string = device.getDescription().deviceModel;

//                 const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

//                 if (this.isExcludedDevice(this.config.excludedDevicesByDeviceId, uuid)) {
//                     this.log.info(`Device with id ${uuid} is excluded, don't add accessory`);
//                     if (existingAccessory) {
//                         this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
//                     }
//                     return;
//                 }

//                 if (existingAccessory) {
//                     this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
//                     existingAccessory.context.device = device;
//                     this.api.updatePlatformAccessories([existingAccessory]);

//                     if (deviceModel === 'Altherma') {
//                         new daikinAlthermaAccessory(this, existingAccessory);
//                     } else {
//                         new daikinAirConditioningAccessory(this, existingAccessory);
//                     }

//                 } else {
//                     this.log.info('Adding new accessory:', name);
//                     const accessory = new this.api.platformAccessory<DaikinCloudAccessoryContext>(name, uuid);
//                     accessory.context.device = device;

//                     if (deviceModel === 'Altherma') {
//                         new daikinAlthermaAccessory(this, accessory);
//                     } else {
//                         new daikinAirConditioningAccessory(this, accessory);
//                     }

//                     this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
//                 }
//             } catch (error) {
//                 // eslint-disable-next-line no-console
//                 console.error(error);

//                 if (error instanceof Error) {
//                     this.log.error(`Failed to create HeaterCooler accessory from device, only HeaterCooler is supported at the moment: ${error.message}, device JSON: ${JSON.stringify(device)}`);
//                 }
//             }
//         });

//         this.log.info('--------------- End Daikin info for debugging reasons --------------------');
//     }

//     private async updateDevices() {
//         this.log.debug('Update devices data');
//         await this.controller.updateAllDeviceData();
//     }

//     forceUpdateDevices(delay: number = ONE_SECOND * 60) {
//         this.log.debug(`Force update devices data (delay: ${delay}, update pending: ${this.forceUpdateTimeout})`);

//         clearInterval(this.updateInterval);
//         clearTimeout(this.forceUpdateTimeout);

//         this.forceUpdateTimeout = setTimeout(async () => {
//             await this.updateDevices();
//             this.startUpdateDevicesInterval();
//         }, delay);
//     }

//     private startUpdateDevicesInterval() {
//         this.log.debug(`Starting update devices interval every ${this.updateIntervalDelay / ONE_MINUTE} minutes`);
//         this.updateInterval = setInterval(async () => {
//             await this.updateDevices();
//         }, this.updateIntervalDelay);
//     }

//     private isExcludedDevice(excludedDevicesByDeviceId: Array<string>, deviceId: string): boolean {
//         return typeof excludedDevicesByDeviceId !== 'undefined' && excludedDevicesByDeviceId.includes(deviceId);
//     }

//     private getPrivacyFriendlyConfig(config: PlatformConfig): object {
//         return {
//             ...config,
//             clientId: StringUtils.mask(config.clientId),
//             clientSecret: StringUtils.mask(config.clientSecret),
//             excludedDevicesByDeviceId: config.excludedDevicesByDeviceId.map(deviceId => StringUtils.mask(deviceId)),
//         };
// >>>>>>> upstream/main
//     }

//     return daikinCloud;
//   }
// }
