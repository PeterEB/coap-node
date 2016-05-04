## Code Templates

This document provides you with code templates of many IPSO-defined devices [(Smart Objects starter pack 1.0)](http://www.ipso-alliance.org/smart-object-guidelines/). Just copy the templates you need to your code. Each template gives the code snippet of how to initialize an Object Instance with its oid and iid, and lists every Resource the Object Instance may have.  

* In the code snippet, commented lines are optional Resources. You are free to uncomment and define those optional Resources you like to use within an Object Instance.  

* A phrase `< rid number, access, data type { range or enum }, unit >` tells the number of resource id, access permission, and data type of a Resource.  

1. [Digital Input](#tmpl_digitalInput)  
2. [Digital Output](#tmpl_digitalOutput)  
3. [Analog Input](#tmpl_analogInput)  
4. [Analog Output](#tmpl_analogOutput)  
5. [Generic Sensor](#tmpl_genericSensor)  
6. [Illuminance Sensor](#tmpl_illumSensor)  
7. [Presence Sensor](#tmpl_presenceSensor)  
8. [Temperature Sensor](#tmpl_temperature)  
9. [Humidity Sensor](#tmpl_humidity)  
10. [Power Measurement](#tmpl_pwrMea)  
11. [Actuation](#tmpl_actuation)  
12. [Set Point](#tmpl_setPoint)  
13. [Load Control](#tmpl_loadCtrl)  
14. [Light Control](#tmpl_lightCtrl)  
15. [Power Control](#tmpl_pwrCtrl)  
16. [Accelerometer](#tmpl_accelerometer)  
17. [Magnetometer](#tmpl_magnetometer)  
18. [Barometer](#tmpl_barometer)  
  
********************************************
<a name="tmpl_digitalInput"></a>
### 01. Digital Input
  
```js
// 01. Digital Input (oid = 3200 or 'dIn')
cnode.initResrc('dIn', 0, {
    dInState: {                     // < rid = 5500, R, Boolean >
        read: function (cb) {}
    },
    // counter: ,                   // < rid = 5501,  R, Integer >
    // dInPolarity: ,               // < rid = 5502, RW, Boolean >
    // debouncePeriod: ,            // < rid = 5503, RW, Integer, ms >
    // edgeSelection: ,             // < rid = 5504, RW, Integer { 1: fall, 2: rise, 3: both } >
    // counterReset: ,              // < rid = 5505,  E, Opaque >
    // appType: ,                   // < rid = 5750, RW, String >
    // sensorType:                  // < rid = 5751,  R, String >
});
```
  
********************************************
<a name="tmpl_digitalOutput"></a>
### 02. Digital Output
  
```js
// 02. Digital Output (oid = 3201 or 'dOut')
cnode.initResrc('dOut', 0, {
    dOutState: {                    // < rid = 5550, RW, Boolean >
        read: function (cb) {},
        write: function (cb) {}
    },
    // dOutpolarity: ,              // < rid = 5551, RW, Boolean { 0: normal, 1: reversed } >
    // appType:                     // < rid = 5750, RW, String >
});
```
  
********************************************
<a name="tmpl_analogInput"></a>
### 03. Analog Input
  
```js
// 03. Analog Input (oid = 3202 or 'aIn')
cnode.initResrc('aIn', 0, {
    aInCurrValue: {                 // < rid = 5600, R, Float >
        read: function (cb) {}
    },
    // minMeaValue: ,               // < rid = 5601,  R, Float >
    // maxMeaValue: ,               // < rid = 5602,  R, Float >
    // minRangeValue: ,             // < rid = 5603,  R, Float >
    // maxRangeValue: ,             // < rid = 5604,  R, Float >
    // resetMinMaxMeaValues: ,      // < rid = 5605,  E, Opaque >
    // appType: ,                   // < rid = 5750, RW, String >
    // sensorType:                  // < rid = 5751,  R, String >
});
```
  
********************************************
<a name="tmpl_analogOutput"></a>
### 04. Analog Output
  
```js
// 04. Analog Output (oid = 3203 or 'aOut')
cnode.initResrc('aOut', 0, {
    aOutCurrValue: {                // < rid = 5650, RW, Float >
        read: function (cb) {},
        write: function (cb) {}
    },
    // minRangeValue: ,             // < rid = 5603,  R, Float >
    // maxRangeValue: ,             // < rid = 5604,  R, Float >
    // appType:                     // < rid = 5750, RW, String >
});
```
  
********************************************
<a name="tmpl_genericSensor"></a>
### 05. Generic Sensor
  
```js
// 05. Generic Sensor (oid = 3300 or 'generic')
cnode.initResrc('generic', 0, {
    sensorValue: {                  // < rid = 5700, R, Float >
        read: function (cb) {}
    },
    // units: ,                     // < rid = 5701,  R, String >
    // minMeaValue: ,               // < rid = 5601,  R, Float >
    // maxMeaValue: ,               // < rid = 5602,  R, Float >
    // minRangeValue: ,             // < rid = 5603,  R, Float >
    // maxRangeValue: ,             // < rid = 5604,  R, Float >
    // resetMinMaxMeaValues: ,      // < rid = 5605,  E, Opaque >
    // appType: ,                   // < rid = 5750, RW, String >
    // sensorType:                  // < rid = 5751,  R, String >
});
```
  
********************************************
<a name="tmpl_illumSensor"></a>
### 06. Illuminance Sensor
  
```js
// 06. Illuminance Sensor (oid = 3301 or 'illuminance')
cnode.initResrc('illuminance', 0, {
    sensorValue: {                  // < rid = 5700, R, Float >
        read: function (cb) {}
    },
    // units: ,                     // < rid = 5701, R, String >
    // minMeaValue: ,               // < rid = 5601, R, Float >
    // maxMeaValue: ,               // < rid = 5602, R, Float >
    // minRangeValue: ,             // < rid = 5603, R, Float >
    // maxRangeValue: ,             // < rid = 5604, R, Float >
    // resetMinMaxMeaValues:        // < rid = 5605, E, Opaque >
});
```
  
********************************************
<a name="tmpl_presenceSensor"></a>
### 07. Presence Sensor
  
```js
// 07. Presence Sensor (oid = 3302 or 'presence')
cnode.initResrc('presence', 0, {
    dInState: {                     // < rid = 5500, R, Boolean >
        read: function (cb) {}
    },
    // counter: ,                   // < rid = 5501,  R, Integer >
    // counterReset: ,              // < rid = 5505,  E, Opaque >
    // sensorType: ,                // < rid = 5751,  R, String >
    // busyToClearDelay: ,          // < rid = 5903, RW, Integer, ms >
    // clearToBusyDelay:            // < rid = 5904  RW, Integer, ms >
});
```
  
********************************************
<a name="tmpl_temperature"></a>
### 08. Temperature Sensor
  
```js
// 08. Temperature Sensor (oid = 3303 or 'temperature')
cnode.initResrc('temperature', 0, {
    sensorValue: {                  // < rid = 5700, R, Float >
        read: function (cb) {}
    },
    // units: ,                     // < rid = 5701, R, String >
    // minMeaValue: ,               // < rid = 5601, R, Float >
    // maxMeaValue: ,               // < rid = 5602, R, Float >
    // minRangeValue: ,             // < rid = 5603, R, Float >
    // maxRangeValue: ,             // < rid = 5604, R, Float >
    // resetMinMaxMeaValues:        // < rid = 5605, E, Opaque >
});
```
  
********************************************
<a name="tmpl_humidity"></a>
### 09. Humidity Sensor
  
```js
// 09. Humidity Sensor (oid = 3304 or 'humidity')
cnode.initResrc('humidity', 0, {
    sensorValue: {                  // < rid = 5700, R, Float >
        read: function (cb) {}
    },
    // units: ,                     // < rid = 5701, R, String >
    // minMeaValue: ,               // < rid = 5601, R, Float >
    // maxMeaValue: ,               // < rid = 5602, R, Float >
    // minRangeValue: ,             // < rid = 5603, R, Float >
    // maxRangeValue: ,             // < rid = 5604, R, Float >
    // resetMinMaxMeaValues:        // < rid = 5605, E, Opaque >
});
```
  
********************************************
<a name="tmpl_pwrMea"></a>
### 10. Power Measurement
  
```js
// 10. Power Measurement (oid = 3305 or 'pwrMea')
cnode.initResrc('pwrMea', 0, {
    instActivePwr: {                // < rid = 5800, R, Float, Wh >
        read: function (cb) {}
    },
    // minMeaActivePwr: ,           // < rid = 5801,  R, Float, W >
    // maxMeaActivePwr: ,           // < rid = 5802,  R, Float, W >
    // minRangeActivePwr: ,         // < rid = 5803,  R, Float, W >
    // maxRangeActivePwr: ,         // < rid = 5804,  R, Float, W >
    // cumulActivePwr: ,            // < rid = 5805,  R, Float, Wh >
    // activePwrCal: ,              // < rid = 5806,  W, Float, W >
    // instReactivePwr: ,           // < rid = 5810,  R, Float, VAR >
    // minMeaReactivePwr: ,         // < rid = 5811,  R, Float, VAR >
    // maxMeaReactivePwr: ,         // < rid = 5812,  R, Float, VAR >
    // minRangeReactivePwr: ,       // < rid = 5813,  R, Float, VAR >
    // maxRangeReactivePwr: ,       // < rid = 5814,  R, Float, VAR >
    // resetMinMaxMeaValues: ,      // < rid = 5605,  E, Opaque >
    // cumulReactivePwr: ,          // < rid = 5815,  R, Float, VARh >
    // reactivePwrCal: ,            // < rid = 5816,  W, Float, VAR >
    // pwrFactor: ,                 // < rid = 5820,  R, Float >
    // currCal: ,                   // < rid = 5821, RW, Float >
    // resetCumulEnergy: ,          // < rid = 5822,  E, Opaque >
});
```
  
********************************************
<a name="tmpl_actuation"></a>
### 11. Actuation
  
```js
// 11. Actuation (oid = 3306 or 'actuation')
cnode.initResrc('actuation', 0, {
    onOff: {                        // < rid = 5850, RW, Boolean { 0: off, 1: on } >
        read: function (cb) {},
        write: function (cb) {}
    },
    // dimmer: ,                    // < rid = 5851, RW, Integer { 0 ~ 100 }, % >
    // onTime: ,                    // < rid = 5852, RW, Integer, s >
    // mstateOut: ,                 // < rid = 5853, RW, String >
    // appType:                     // < rid = 5750, RW, String >
});
```
  
********************************************
<a name="tmpl_setPoint"></a>
### 12. Set Point
  
```js
// 12. Set Point (oid = 3308 or 'setPoint')
cnode.initResrc('setPoint', 0, {
    setPointValue: {                // < rid = 5900, RW, Float >
        read: function (cb) {},
        write: function (cb) {}
    },
    // colour: ,                    // < rid = 5706, RW, String >
    // units: ,                     // < rid = 5701,  R, String >
    // appType:                     // < rid = 5750, RW, String >
});
```
  
********************************************
<a name="tmpl_loadCtrl"></a>
### 13. Load Control
  
```js
// 13. Load Control (oid = 3310 or 'loadCtrl')
cnode.initResrc('loadCtrl', 0, {
    eventId: {                      // < rid = 5823, RW, String >
        read: function (cb) {},
        write: function (cb) {}
    },
    startTime: {                    // < rid = 5824, RW, Time >
        read: function (cb) {},
        write: function (cb) {}
    },
    durationInMin: {                // < rid = 5825, RW, Integer, min >
        read: function (cb) {},
        write: function (cb) {}
    },
    // criticalLevel: ,             // < rid = 5826, RW, Integer { 0: normal, 1: warning, 2: danger, 3: fatal } >
    // avgLoadAdjPct: ,             // < rid = 5827, RW, Integer { 0 ~ 100 }, % >
    // dutyCycle:                   // < rid = 5828, RW, Interger { 0 ~ 100 }, % >
});
```
  
********************************************
<a name="tmpl_lightCtrl"></a>
### 14. Light Control
  
```js
// 14. Light Control (oid = 3311 or 'lightCtrl')
cnode.initResrc('lightCtrl', 0, {
    onOff: {                        // < rid = 5850, RW, Boolean { 0: off, 1: on } >
        read: function (cb) {},
        write: function (cb) {}
    },
    // dimmer: ,                    // < rid = 5851, RW, Integer { 0 ~ 100 }, %  >
    // colour: ,                    // < rid = 5706, RW, String >
    // units: ,                     // < rid = 5701,  R, String >
    // onTime: ,                    // < rid = 5852, RW, Integer, s >
    // cumulActivePwr: ,            // < rid = 5805,  R, Float, Wh >
    // pwrFactor:                   // < rid = 5820,  R, Float >
});
```
  
********************************************
<a name="tmpl_pwrCtrl"></a>
### 15. Power Control
  
```js
// 15. Power Control (oid = 3312 or 'pwrCtrl')
cnode.initResrc('pwrCtrl', 0, {
    onOff: {                        // < rid = 5850, RW, Boolean { 0: off, 1: on } >
        read: function (cb) {},
        write: function (cb) {}
    },
    // dimmer: ,                    // < rid = 5851, RW, Integer { 0 ~ 100 }, % >
    // onTime: ,                    // < rid = 5852, RW, Integer, s >
    // cumulActivePwr: ,            // < rid = 5805,  R, Float, Wh >
    // pwrFactor:                   // < rid = 5820,  R, Float >
});
```
  
********************************************
<a name="tmpl_accelerometer"></a>
### 16. Accelerometer

```js
// 16. Accelerometer (oid = 3313 or 'accelerometer')
cnode.initResrc('accelerometer', 0, {
    xValue: {                       // < rid = 5702, R, Float >
        read: function (cb) {}
    },
    // yValue: ,                    // < rid = 5703, R, Float >
    // zValue: ,                    // < rid = 5704, R, Float >
    // units: ,                     // < rid = 5701, R, String >
    // minRangeValue: ,             // < rid = 5603, R, Float >
    // maxRangeValue:               // < rid = 5604, R, Float >
});
```
  
********************************************
<a name="tmpl_magnetometer"></a>
### 17. Magnetometer
  
```js
// 17. Magnetometer (oid = 3314 or 'magnetometer')
cnode.initResrc('magnetometer', 0, {
    xValue: {                       // < rid = 5702, R, Float >
        read: function (cb) {}
    },
    // yValue: ,                    // < rid = 5703, R, Float >
    // zValue: ,                    // < rid = 5704, R, Float >
    // units:,                      // < rid = 5701, R, String >
    // compassDir:                  // < rid = 5705, R, Float { 0 ~ 360 }, deg >
});
```
  
********************************************
<a name="tmpl_barometer"></a>
### 18. Barometer
  
```js
// 18. Barometer (oid = 3315 or 'barometer')
cnode.initResrc('barometer', 0, {
    sensorValue: {                  // < rid = 5700, R, Float >
        read: function (cb) {}
    },
    // units: ,                     // < rid = 5701, R, String >
    // minMeaValue: ,               // < rid = 5601, R, Float >
    // maxMeaValue: ,               // < rid = 5602, R, Float >
    // minRangeValue: ,             // < rid = 5603, R, Float >
    // maxRangeValue: ,             // < rid = 5604, R, Float >
    // resetMinMaxMeaValues:        // < rid = 5605, E, Opaque >
});
```

