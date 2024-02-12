# Homebridge Daikin Heat Pump Cloud plugin

This Homebrige plugin connects to the Daikin Cloud and loads your Heat Pump devices to be controled via Homebridge and Homekit.

## This plugin will:

- Create a heat pump accesory, that will show current leaving water temperature, heating/cooling mode, offset
- Create a hot water tank accessory, that will show target temperature & current water tank temperature
- Create a temperature accessory that will show current outdoor temperature measured by outdoor heatpump device
  ![IMG_3066](https://github.com/shaunpearce/homebridge-daikin-cloud-aerothermal/assets/20327897/2eaf06f1-b47f-4121-91c9-dfb29d36d494)


## You will be able to:

- Turn on/off heat pump or water tank
- Change Heat Pump mode (heating/cooling)
- Set temperature offset for heating/cooling
![IMG_3067](https://github.com/shaunpearce/homebridge-daikin-cloud-aerothermal/assets/20327897/60ba2e04-550b-4b53-b1a4-06a8db46a42e)


- Set temperature offset for hot watwer tank
 ![IMG_3068](https://github.com/shaunpearce/homebridge-daikin-cloud-aerothermal/assets/20327897/e17eb419-a734-43bc-9885-ce28ff972ad2)

## Plugin settings

- You can disable on/off function
- You can disable hot water tank accessory (may be needed, if you don't own hot water tank device)
- You can disable outdoor temperature settings (may be needed, if you don't own hot water tank device)

## Limitations

Daikin doesn't provide target Heater/Cooler temperature. So the temperature shown in this accessory is current leaving water temperature & target temperature is offset.

Current acessory state doesnt reflect if your device is idle/heating/cooling, because daikin doesn't provide this information (we only know the target state).

Even if you set "Disable on/off switch", you are still able to switch devices on/off in homebridge accessory page (it works fine in ios home).

## Config

Add config object to the platform array in your Homebridge `config.json`.

```
{
    "bridge": {
        ...
    },
    "accessories": [],
    "platforms": [
        {
            "username": "<username>",
            "password": "<password>",
            "platform": "DaikinCloudAerothermal",
            "HotWaterTank": false, // true or false (boolean), default: false
            "OutdoorTemperature": true, // true or false (boolean), default: true
            "DisableOnOff": false //  true or false (boolean), default false
        }
    ]
}
```

## Tested with devices

- EHVX08S23EJ6V (BRP069A78 wifi module)

## Development

For running a local Homebridge setup: https://github.com/oznu/homebridge-config-ui-x#installation-instructions

## Credits

This project is forked from https://github.com/FrAcTi0N/homebridge-daikin-cloud-heat-pump, which in turn was forked from https://github.com/JeroenVdb/homebridge-daikin-cloud, so special credits go to @FrAcTi0N and @JeroenVdb

Credits for the Daikin Cloud API goes to @Apollon77 for https://github.com/Apollon77/daikin-controller-cloud
