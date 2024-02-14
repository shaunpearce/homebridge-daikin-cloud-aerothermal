import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";
import { DaikinCloudPlatform } from "./platform";

export class DaikinCloudAirConditioningAccessory {
  /*private extraServices = {
        POWERFUL_MODE: 'Powerful mode',
        ECONO_MODE: 'Econo mode',
        STREAMER_MODE: 'Streamer mode',
        OUTDOUR_SILENT_MODE: 'Outdoor silent mode',
    };
*/
  private readonly name: string;
  private service: Service;
  private bypass = false; //we set this to true if we want to bypass on/off disable
  //private switchServicePowerfulMode = this.accessory.getService(this.extraServices.POWERFUL_MODE);
  //private switchServiceEconoMode = this.accessory.getService(this.extraServices.ECONO_MODE);
  //private switchServiceStreamerMode = this.accessory.getService(this.extraServices.STREAMER_MODE);
  //private switchServiceOutdoorSilentMode = this.accessory.getService(this.extraServices.OUTDOUR_SILENT_MODE);
  constructor(
    private readonly platform: DaikinCloudPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    //this.platform.log.info("all: ", accessory.context.device.getData())
    //this.platform.log.info("temp: ", accessory.context.device.getData('climateControlMainZone','consumptionData'))
    this.platform.log.info(
      `Registering accessory  ${DaikinCloudTemperatureAccessory.name}`
    );
    this.name = accessory.context.device.getData(
      "climateControlMainZone",
      "name"
    ).value;

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "Daikin")
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device.getData("gateway", "modelInfo").value
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device.getData("gateway", "serialNumber")
          ? accessory.context.device.getData("gateway", "serialNumber").value
          : "NOT_AVAILABLE"
      );

    //we specify here accessory service, in this case "HeaterCooler";
    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.handleActiveStateSet.bind(this))
      .onGet(this.handleActiveStateGet.bind(this));

    //current temperature = leaving water temperature
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({ minStep: 1, minValue: 0, maxValue: 70 })
      .onGet(this.handlePumpLeavingWaterTemperatureGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleTargetHeaterCoolerStateGet.bind(this))
      .onSet(this.handleTargetHeaterCoolerStateSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleCurrentHeaterCoolerStateGet.bind(this));

    //we use this for leaving water temp while heating
    this.service
      .getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature
      )
      .setProps({ minStep: 1, minValue: 25, maxValue: 55 })
      .onGet(this.handlePumpHeatingOffsetGet.bind(this))
      .onSet(this.handlePumpHeatingOffsetSet.bind(this));

    //   .setProps({ minStep: 1, minValue: -10, maxValue: 10 })

    this.service
      .getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature
      )
      .setProps({ minStep: 1, minValue: 7, maxValue: 22 })
      .onGet(this.handlePumpCoolingOffsetGet.bind(this));
  }

  async handleActiveStateGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const state = this.accessory.context.device.getData(
      "climateControlMainZone",
      "onOffMode"
    ).value;
    this.platform.log.info(`[${this.name}] GET ActiveState, state: ${state}`);
    return state === "on";
  }

  async handleActiveStateSet(value: CharacteristicValue) {
    if (this.platform.config.DisableOnOff && !this.bypass) {
      //do not switch on/off if this feature is disabled in settings...
      await this.platform.log.info(
        `Switching on/off disabled for[${this.name}]!.`
      );
      value = !value;
    }
    this.platform.log.info(`[${this.name}] SET ActiveState, state: ${value}`);
    const state = value as boolean;
    await this.accessory.context.device.setData(
      "climateControlMainZone",
      "onOffMode",
      state ? "on" : "off"
    );
    await this.accessory.context.device.updateData();
    //we wait a bit and update homekit state. This is necessary if switchin on/off is disabled
    setTimeout(() => {
      this.service.updateCharacteristic(
        this.platform.Characteristic.Active,
        state
      );
    }, 50);
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const temperature = this.accessory.context.device.getData(
      "climateControlMainZone",
      "sensoryData",
      "/outdoorTemperature"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET CurrentTemperature, temperature: ${temperature}`
    );
    return temperature;
  }

  async handlePumpLeavingWaterTemperatureGet(): Promise<CharacteristicValue> {
    //for my use it is leaing water temp
    await this.accessory.context.device.updateData();
    const temperature = this.accessory.context.device.getData(
      "climateControlMainZone",
      "sensoryData",
      "/leavingWaterTemperature"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET Leaving water Temperature, temperature: ${temperature}`
    );
    return temperature;
  }

  //handlePumpHeatingOffsetGet
  async handlePumpHeatingOffsetGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();

    const offset = this.accessory.context.device.getData(
      "climateControlMainZone",
      "temperatureControl",
      "/operationModes/heating/setpoints/leavingWaterTemperature"
    ).value;

    this.platform.log.info(
      `[${this.name}] GET CurrentPumpHeatingOffsetGet, offset: ${offset}`
    );
    return offset;
  }

  async handlePumpHeatingOffsetSet(value: CharacteristicValue) {
    //const temperature = Math.round(value as number * 2) / 2;
    const temperature = Math.round(value as number); //we want int - minstep
    //const temperature = value as number;
    //this.platform.Characteristic.TargetHeaterCoolerState.HEAT;//we may have this added, or it gent unresponsive
    this.platform.log.info(
      `[${this.name}] SET HeatingThresholdTemperature, temperature to: ${temperature}`
    );
    await this.accessory.context.device.setData(
      "climateControlMainZone",
      "temperatureControl",
      "/operationModes/heating/setpoints/leavingWaterTemperature",
      temperature
    );

    await this.accessory.context.device.updateData();
  }

  //handlePumpHeatingOffsetGet
  async handlePumpCoolingOffsetGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const offset = this.accessory.context.device.getData(
      "climateControlMainZone",
      "temperatureControl",
      "/operationModes/cooling/setpoints/leavingWaterTemperature"
    ).value;

    this.platform.log.info(
      `[${this.name}] GET CurrentPumpCoolingOffsetGet, offset: ${offset}`
    );
    return offset;
  }

  async handlePumpCoolingOffsetSet(value: CharacteristicValue) {
    //this.platform.log.info("Changing hot water threshold!!!")
    //const temperature = Math.round(value as number * 2) / 2;
    const temperature = Math.round(value as number); //we want int - minstep
    //const temperature = value as number;
    //this.platform.Characteristic.TargetHeaterCoolerState.HEAT;//we may have this added, or it gent unresponsive
    this.platform.log.info(
      `[${this.name}] SET CoolingThresholdTemperature, temperature to: ${temperature}`
    );
    await this.accessory.context.device.setData(
      "climateControlMainZone",
      "temperatureControl",
      "/operationModes/Cooling/setpoints/leavingWaterOffset",
      temperature
    );
    await this.accessory.context.device.updateData();
  }

  async handleTargetHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const operationMode = this.accessory.context.device.getData(
      "climateControlMainZone",
      "operationMode"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET TargetHeaterCoolerState, operationMode: ${operationMode}`
    );

    switch (operationMode) {
      case "cooling":
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
      case "heating":
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
      default:
        return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    }
  }

  async handleTargetHeaterCoolerStateSet(value: CharacteristicValue) {
    const operationMode = value as number;
    this.platform.log.info(
      `[${this.name}] SET TargetHeaterCoolerState, OperationMode to: ${value}`
    );
    let daikinOperationMode = "cooling";

    switch (operationMode) {
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        daikinOperationMode = "cooling";
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        daikinOperationMode = "heating";
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        daikinOperationMode = "auto";
        break;
    }
    this.bypass = true;
    this.platform.log.info(
      `[${this.name}] SET TargetHeaterCoolerState, daikinOperationMode to: ${daikinOperationMode}`
    );
    await this.accessory.context.device.setData(
      "climateControlMainZone",
      "operationMode",
      daikinOperationMode
    );
    await this.accessory.context.device.setData(
      "climateControlMainZone",
      "onOffMode",
      "on"
    );
    await this.accessory.context.device.updateData();
    this.bypass = false;
  }

  async handleCurrentHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const operationMode = this.accessory.context.device.getData(
      "climateControlMainZone",
      "operationMode"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET CurrentHeaterCoolerState, operationMode: ${operationMode}`
    );

    switch (operationMode) {
      case "cooling":
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      case "heating":
        return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      default:
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  getCurrentOperationMode() {
    return this.accessory.context.device.getData(
      "climateControlMainZone",
      "operationMode"
    ).value;
  }
}

////////////XXXXXXXXXX
export class DaikinCloudWaterTankAccessory {
  private readonly name: string;
  private service: Service;
  //private switchServicePowerfulMode = this.accessory.getService(this.extraServices.POWERFUL_MODE);

  constructor(
    private readonly platform: DaikinCloudPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    //this.platform.log.info("all: ", accessory.context.device.getData())
    //this.platform.log.info("temp: ", accessory.context.device.getData('climateControlMainZone','consumptionData'))
    this.platform.log.info(
      `Registering accessory YYY ${DaikinCloudWaterTankAccessory.name}`
    );
    this.name =
      accessory.context.device.getData("domesticHotWaterTank", "name").value ||
      "Hot Water Tank";
    //this.name = DaikinCloudWaterTankAccessory.name;

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "Daikin")
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device.getData("gateway", "modelInfo").value
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device.getData("gateway", "serialNumber")
          ? accessory.context.device.getData("gateway", "serialNumber").value
          : "NOT_AVAILABLE"
      );

    //we specify here accessory service, in this case "HeaterCooler";
    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.handleActiveStateSet.bind(this))
      .onGet(this.handleActiveStateGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: platform.Characteristic.TargetHeatingCoolingState.HEAT,
        maxValue: platform.Characteristic.TargetHeatingCoolingState.HEAT,
      })
      .onGet(this.handleTargetHotWaterStateGet.bind(this))
      .onSet(this.handleTargetHotWaterStateSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleCurrentHotWaterStateGet.bind(this));

    this.service
      .getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature
      )
      .setProps({
        minStep: this.accessory.context.device.getData(
          "domesticHotWaterTank",
          "temperatureControl",
          "/operationModes/heating/setpoints/domesticHotWaterTemperature"
        ).minStep,
        minValue: this.accessory.context.device.getData(
          "domesticHotWaterTank",
          "temperatureControl",
          "/operationModes/heating/setpoints/domesticHotWaterTemperature"
        ).minValue,
        maxValue: this.accessory.context.device.getData(
          "domesticHotWaterTank",
          "temperatureControl",
          "/operationModes/heating/setpoints/domesticHotWaterTemperature"
        ).maxValue,
      })
      .onGet(this.handleHotWaterThresholdTemperatureGet.bind(this))
      .onSet(this.handleHotWaterThresholdTemperatureSet.bind(this));
  }

  async handleActiveStateGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const state = this.accessory.context.device.getData(
      "domesticHotWaterTank",
      "onOffMode"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET ActiveState, state: ${state}`
    );
    return state === "on";
  }

  async handleActiveStateSet(value: CharacteristicValue) {
    if (this.platform.config.DisableOnOff) {
      //do not switch on/off if this feature is disabled in settings...
      await this.platform.log.info(
        `Switching on/off disabled for[${this.name}]!.`
      );
      value = !value;
    }
    this.platform.log.info(`[${this.name}] SET ActiveState, state: ${value}`);
    const state = value as boolean;
    await this.accessory.context.device.setData(
      "domesticHotWaterTank",
      "onOffMode",
      state ? "on" : "off"
    );
    await this.accessory.context.device.updateData();
    //we wait a bit and update homekit state. This is necessary if switchin on/off is disabled
    setTimeout(() => {
      this.service.updateCharacteristic(
        this.platform.Characteristic.Active,
        state
      );
    }, 50);
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const temperature = this.accessory.context.device.getData(
      "domesticHotWaterTank",
      "sensoryData",
      "/tankTemperature"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET Current Hot Water Temperature, temperature: ${temperature}`
    );
    return temperature;
  }

  async handleHotWaterThresholdTemperatureGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const temperature = this.accessory.context.device.getData(
      "domesticHotWaterTank",
      "temperatureControl",
      "/operationModes/heating/setpoints/domesticHotWaterTemperature"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET HotWaterThresholdTemperature, temperature: ${temperature}`
    );
    return temperature;
  }

  async handleHotWaterThresholdTemperatureSet(value: CharacteristicValue) {
    //this.platform.log.info("Changing hot water threshold!!!")
    //const temperature = Math.round(value as number * 2) / 2;
    const temperature = Math.round(value as number); //we want int - minstep
    //const temperature = value as number;
    //this.platform.Characteristic.TargetHeaterCoolerState.HEAT;//we may have this added, or it gent unresponsive
    this.platform.log.info(
      `[${this.name}] SET HotWaterThresholdTemperature, temperature to: ${temperature}`
    );
    await this.accessory.context.device.setData(
      "domesticHotWaterTank",
      "temperatureControl",
      "/operationModes/heating/setpoints/domesticHotWaterTemperature",
      temperature
    );
    await this.accessory.context.device.updateData();
  }

  async handleTargetHotWaterStateGet(): Promise<CharacteristicValue> {
    return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    //we have only heeating, there is no need to check anything else,.,.
  }

  async handleCurrentHotWaterStateGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const operationMode = this.accessory.context.device.getData(
      "climateControlMainZone",
      "operationMode"
    ).value;
    this.platform.log.info(
      `[${this.name}] GET CurrentHeaterCoolerState, operationMode: ${operationMode}`
    );

    switch (operationMode) {
      case "cooling":
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      case "heating":
        return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      default:
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  async handleTargetHotWaterStateSet(value: CharacteristicValue) {
    //const operationMode = value as number;
    this.platform.log.info(
      `[${this.name}] SET TargetHotWaterState, OperationMode to: ${value}`
    );

    //this.platform.log.info(`[${this.name}] SET TargetHotWaterState, daikinOperationMode to: ${daikinOperationMode}`);
    await this.accessory.context.device.setData(
      "domesticHotWaterTank",
      "onOffMode",
      "on"
    );
    await this.accessory.context.device.updateData();
  }

  getCurrentOperationMode() {
    return this.accessory.context.device.getData(
      "climateControlMainZone",
      "operationMode"
    ).value;
  }
}

export class DaikinCloudTemperatureAccessory {
  private readonly name: string;
  private service: Service;
  //private switchServicePowerfulMode = this.accessory.getService(this.extraServices.POWERFUL_MODE);
  //private switchServiceEconoMode = this.accessory.getService(this.extraServices.ECONO_MODE);
  //private switchServiceStreamerMode = this.accessory.getService(this.extraServices.STREAMER_MODE);
  //private switchServiceOutdoorSilentMode = this.accessory.getService(this.extraServices.OUTDOUR_SILENT_MODE);

  constructor(
    private readonly platform: DaikinCloudPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    //this.platform.log.info("all: ", accessory.context.device.getData())
    //this.platform.log.info(`Registering accessory ${DaikinCloudTemperatureAccessory.name}`)
    //this.platform.log.info("temp: ", accessory.context.device.getData('climateControlMainZone','consumptionData'))

    //this.name = accessory.context.device.getData('climateControlMainZone', 'name').value;
    this.name = DaikinCloudTemperatureAccessory.name;
    this.platform.log.info(`Registering accessory ${this.name}`);

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "Daikin")
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device.getData("gateway", "modelInfo").value
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device.getData("gateway", "serialNumber")
          ? accessory.context.device.getData("gateway", "serialNumber").value
          : "NOT_AVAILABLE"
      );

    //we specify here accessory service, in this case "HeaterCooler";
    this.service =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    await this.accessory.context.device.updateData();
    const temperature = this.accessory.context.device.getData(
      "climateControlMainZone",
      "sensoryData",
      "/outdoorTemperature"
    ).value;
    this.platform.log.debug(
      `[${this.name}] GET CurrentTemperature, temperature: ${temperature}`
    );
    return temperature;
  }
}
