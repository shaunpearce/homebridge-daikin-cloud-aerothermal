# Homebridge Daikin Heat Pump Cloud plugin

This Homebrige plugin connects to the Daikin Cloud and loads your Heat Pump devices to be controled via Homebridge and Homekit.

## This plugin will:

- Create a heat pump accesory, that will show current leaving water temperature, heating/cooling mode, offset
- Create a hot water tank accessory, that will show target temperature & current water tank temperature
- Create a temperature accessory that will show current outdoor temperature measured by outdoor heatpump device
  ![IMG_3066](https://github.com/shaunpearce/homebridge-daikin-cloud-aerothermal/assets/20327897/2eaf06f1-b47f-4121-91c9-dfb29d36d494)
  The plugin supports some basic Daikin airco settings:
- Current room temperature
- Set airco to cooling, heating or auto + the required temperature\*\*
- Set the fan speed
- Swing mode (if supported by your device)
- Enable special modes (if supported by your device and enabled in config):
  - powerful mode
  - econo mode
  - streamer mode
  - outdoor silent mode
  - indoor silent/quiet mode

\*\* HomeKit does not support all operation modes of Daikin (for example dry and fan only).

![IMG_7664](https://user-images.githubusercontent.com/657797/166705724-03255e67-252e-480e-9b4f-5cbc33aa9527.jpeg) ![IMG_7665](https://user-images.githubusercontent.com/657797/166705729-748e878a-dfd6-431a-923d-6287ce012bd8.jpeg)

## Important: NEW Daikin API

Since 2.0.0 this plugin uses the new Daikin API, this comes with some challenges. The most important one: you can only do 200 calls per day.
We'll need to see how this plugin can help prevent hitting this limit and in the same time be accurate.

### Polling for data

Because of the rate limit we have to be wary with calls to the Daikin API.
For this the current polling logic is as follows:

- We poll for new data every 15 minutes by default (set via `updateIntervalInMinutes` config parameter)
- When you do an update (for example set the target temperature) we'll do a force update so the new status is represented correctly

### Access token or Refresh token is revoked

If something is wrong with your access of refresh token you will need to authorise again. You can do this by deleting the `.
daikin-controller-cloud-tokenset` file from your Homebridge storage directory, you can find this path in the Homebridge UI System Information widget.

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
            "platform": "DaikinCloud",
            "clientId": "<clientId>",
            "clientSecret": "<clientSecret>",
            "oidcCallbackServerBindAddr": "<127.0.0.1>",
            "callbackServerExternalAddress": "<redirectUri address>",
            "callbackServerPort": "<redirectUri port>",
            "showExtraFeatures": false, // boolean, default: false
            "excludedDevicesByDeviceId": [], // array of strings, find you deviceId in the logs when homekit starts
            "updateIntervalInMinutes": 15, // how fast do you want Daikin to poll for new Device data, default: 15
        }
    ]
}
```

### Get config parameters

The following parameters are required:

- clientId
- clientSecret
- callbackServerExternalAddress
- callbackServerPort

First 2 values you will get when you set up your App in the Daikin Europe Developer Portal. The last 2 values make the Redirect URI where the Daikin
Cloud API will send the tokens to.

#### Create an App in the Daikin Europe Developer Portal

1. Go to https://developer.cloud.daikineurope.com/
2. In the upper right corner click your name and select "My Apps"
3. Click "+ New App"
4. Fill in your application name, auth strategy (Onecta OIDC) and redirect URI (see "callbackServerExternalAddress and callbackServerPort" below)
5. Click create

You will receive a Client ID and Client Secret (keep it with you, you'll only see it once). The Redirect URI is the one you entered in step 4.

#### callbackServerExternalAddress and callbackServerPort

This plugin uses daikin-controller-cloud. This package will set up a small https server where the Authentication flow will finish, so it can get the
required tokens. Because the server is running in our Homebridge instance the callbackServerExternalAddress will match the one of your Homebridge instance, the port is any free port.

For example is you are running Homebridge on a Raspberry Pi with IP `192.168.0.160` and port `51826`, the callbackServerExternalAddress will be `192.168.0.160`.
The callbackServerPort can be `51827` (or any other free port). Once you have both you can also construct the Redirect URI you need to configure your Daikin
app: `https://<callbackServerExternalAddress>:<callbackServerPort>`. For this example: `https://192.168.0.160:51826`

#### oidcCallbackServerBindAddr

This is the address the http server binds to, this is often just localhost: `127.0.0.1` or `0.0.0.0`

## Fan speed

You can change the fan speed from the accessory settings screen.

Daikin fan speeds are expressed in a number from 1 to many, for example 1 to 5. In Home you need to express the fan speed in a percentage from 1% to 100%.

Example: if you have a Daikin airco with fan speed 1 to 5, you need to set the fan speed to 50% in Home to set the fan speed to 3 on your airco.

![IMG_7678](https://user-images.githubusercontent.com/657797/166897048-2152619a-f270-4b64-9740-5bceac310f19.jpeg)

## Swing mode

If your Daikin device support it you can enable swing mode from the accessory settings screen.

If your device supports vertical and horizontal swing both will be started and stopped. Via the Daikin app you can also have a silent swing, this is not yet supported because you can't select this from the Home app.

![IMG_8954](https://user-images.githubusercontent.com/657797/175316496-a5338659-ecc1-4023-8a4b-2ec6b0adaf9b.PNG)

## Control extra features (showExtraFeatures: true)

By default, this plugin creates a default [HeaterCooler Service](https://developers.homebridge.io/#/service/HeaterCooler) with the above possibilities. If you want you can add `showExtraFeatures: true` to the config. This will create extra switches to enable more special modes of your Daikin (if available).

Supported:

- Streamer mode
- Econo mode
- Powerful mode
- Outdoor silent mode
- Indoor silent/quiet mode

Extra info and example: https://github.com/JeroenVdb/homebridge-daikin-cloud/issues/8#issuecomment-1188128335

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

## Tested with devices

Devices supported by Daikin Onecta app: https://www.daikin.eu/en_us/product-group/control-systems/onecta/connectable-units.html

- BRP069C4x
- BRP069A8x
- BRP069A78 - Altherma heatpump, we import this as a HeaterCooler [(to be validated)](https://github.com/JeroenVdb/homebridge-daikin-cloud/issues/30)

## Development

In HomeKit you expose an accessory which has one or more services, available services are:

- https://developer.apple.com/documentation/homekit/hmservice/accessory_service_types (HomeKit docs)
- https://developers.homebridge.io/#/service (Homebridge)

Each service has one or more characteristics, check both HomeKit and Homebridge docs to find out which are compatible.
A service can have multiple child services, for example a HeaterCooler service can also have multiple Switch services. But not all services can be combined.
Use HomeKit Accessory Simulator to find out which are compatible or via the HomeKit docs you can also find links from the service to other services.

### Local

For running a local Homebridge setup: https://github.com/oznu/homebridge-config-ui-x#installation-instructions

```
sudo hb-service start
sudo hb-service stop
```

UI: http://localhost:8581

## Credits

This project is forked from https://github.com/FrAcTi0N/homebridge-daikin-cloud-heat-pump, which in turn was forked from https://github.com/JeroenVdb/homebridge-daikin-cloud, so special credits go to @FrAcTi0N and @JeroenVdb

Credits for the Daikin Cloud API goes to @Apollon77 for https://github.com/Apollon77/daikin-controller-cloud
