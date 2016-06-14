coap-node
========================
[![NPM](https://nodei.co/npm/coap-node.png?downloads=true)](https://nodei.co/npm/coap-node/)  

[![Build Status](https://travis-ci.org/PeterEB/coap-node.svg?branch=develop)](https://travis-ci.org/PeterEB/coap-node)
[![npm](https://img.shields.io/npm/v/coap-node.svg?maxAge=2592000)](https://www.npmjs.com/package/coap-node)
[![npm](https://img.shields.io/npm/l/coap-node.svg?maxAge=2592000)](https://www.npmjs.com/package/coap-node)

## Table of Contents

1. [Overview](#Overview)  
2. [Features](#Features)  
3. [Installation](#Installation)  
4. [Usage](#Usage)  
5. [Resources Planning](#Resources)  
6. [APIs and Events](#APIs)  
7. [Code Templates](#Templates)  


<a name="Overview"></a>
## 1. Overview

[**OMA Lightweight M2M**](http://technical.openmobilealliance.org/Technical/technical-information/release-program/current-releases/oma-lightweightm2m-v1-0) (LWM2M) is a resource constrained device management protocol relies on [**CoAP**](https://tools.ietf.org/html/rfc7252). And **CoAP** is an application layer protocol that allows devices to communicate with each other RESTfully over the Internet.  

**coap-node** is a module that aims to provide a simple way to build M2M/IoT client devices managed by a **coap-shepherd** server. This module follows [**IPSO**](http://www.ipso-alliance.org/smart-object-guidelines/) data model to well organize and define resources on a machine node. This document also provides [templates](#Templates) of many common devices defined by [IPSO Smart Objects starter pack 1.0](http://www.ipso-alliance.org/smart-object-guidelines/), i.e., temperature sensor, humidity sensor, light control. It is easy to add new Objects and Resources to fit your needs.  

###Acronyms and Abbreviations

* **Server**: LWM2M Server (server running with [coap-shepherd](https://github.com/PeterEB/coap-shepherd))  
* **Client** or **Client Device**: LWM2M Client (machine running with [coap-node](https://github.com/PeterEB/coap-node))  
* oid: identifier of an Object
* iid: identifier of an Object Instance
* rid: identifier of a Resource

<a name="Features"></a>
## 2. Features

* CoAP protocol  
* Based on [node-coap](https://github.com/mcollina/node-coap), a node.js CoAP client/server library  
* CoAP services at machine node is off-the-shelf  
* Hierarchical data model in Smart-Object-style (IPSO) let you easily create Resources on the Client Device  
* Client/server interaction through LWM2M-defined interfaces  

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side example (the following example is how you use `coap-node` on a machine node):

```js
var CoapNode = require('coap-node');
var cnode = new CoapNode('my_first_node');

// initialize your Resources
// oid = 'temperature', iid = 0
cnode.initResrc('temperature', 0, {
    sensorValue: 21,
    units: 'C'
});

// oid = 'temperature', iid = 1
cnode.initResrc('temperature', 1, {
    sensorValue: 70,
    units: 'F'
});

cnode.on('ready', function () {
    // If the start procedure completes successfully, 'ready' will be fired

    // register to a Server with its ip and port
    cnode.register('192.168.0.77', 5683, function (err, rsp) {
        console.log(rsp);      // { status: '2.05' }
    });
});


cnode.on('registered', function () {
    // If the registration procedure completes successfully, 'registered' will be fired

    // after registered, start your application
});

cnode.start();
```

Server-side example (please go to [coap-shepherd](https://github.com/PeterEB/coap-shepherd) document for details):

```js
var cnode = cserver.find('my_first_node');

cnode.read('/temperature/0/sensorValue', function (err, rsp) {
    console.log(rsp);      // { status: '2.05', data: 21 }
});

cnode.write('/temperature/1/sensorValue', function (err, rsp) {
    console.log(rsp);      // { status: '2.04' }
});
```

<a name="Resources"></a>
## 5. Resources Planning

With **coap-node**, all you have to do is to plan your Resources well on the machine. **coap-node** will automatically tackle the response things for you with respect to requests from a Server. **coap-node** is trying to lower down your effort of designing client nodes in a machine network.  

Use `initResrc(oid, iid, resrcs)` method to help you with initializing your Resources. A Resource value can be a  
[primitive value](#Resource_simple), an [object with read() method](#Resource_readable), an [object with write() method](#Resource_writeable), an [object with read() and write() methods](#Resource_both), and an [object with exec() method.](#Resource_executable).  

Here is the [tutorial about how to initialize your Resources](https://github.com/PeterEB/coap-node/blob/develop/docs/rsc_plan.md) on the client node. Here, I'm showing you some quick examples:  

<a name="Resource_simple"></a>
#### (1) Initialize a Resource as a primitive value

```js
cnode.initResrc('temperature', 0, {
    sensorValue: 21,    // Resource value is a number 21
    units: 'C'          // Resource value is a string 'C'
});
```

<a name="Resource_readable"></a>
#### (2) Initialize a Resource with read method

```js
cnode.initResrc('temperature', 0, {
    sensorValue: {
        read: function (cb) {
            var tempVal = gpio.read('gpio0');
            cb(null, tempVal);  // pass the read value, tempVal, to the callback cb
        }
    },
    units: 'C'
});
```

<a name="Resource_writeable"></a>
#### (3) Initialize a Resource with write method

```js
cnode.initResrc('lightCtrl', 0, {
    onOff: {
        write: function (val, cb) {
            gpio.write('led0', val);
            cb(null, val);
        }
    },
});
```

<a name="Resource_both"></a>
#### (4) Initialize a Resource with read and write methods

```js
cnode.initResrc('lightCtrl', 0, {
    onOff: {
        read: function (cb) {
            var val = gpio.read('led0');
            cb(null, val);
        },
        write: function (val, cb) {
            gpio.write('led0', val);
            cb(null, val);
        }
    },
});
```

<a name="Resource_executable"></a>
#### (5) Initialize a Resource with exec method

```js
function blinkLed(led, times) {
    // blink an led
}

cnode.initResrc('led', 0, {
    blink: {
        exec: function (t, cb) {
            if (typeof t !== 'number') {
                cb('4.00');  
            } else {
                blinkLed('led0', t);    // blink a led with t times
                cb(null);               // or cb('2.04');
            }
        }
    },
});
```

<a name="APIs"></a>
## 6. APIs and Events

* [new CoapNode()](#API_CoapNode)
* [start()](#API_start)
* [setDevAttrs()](#API_setDevAttrs)
* [initResrc()](#API_initResrc)
* [readResrc()](#API_readResrc)
* [writeResrc()](#API_writeResrc)
* [register()](#API_register)
* [deregister()](#API_deregister)
* Events: [ready](#EVT_ready), [registered](#EVT_registered), [updated](#EVT_updated), [deregistered](#EVT_deregistered), [announce](#announce), and [error](#EVT_error)

*************************************************
## CoapNode Class
Exposed by `require('coap-node')`.  
  
An instance of this class is denoted as **cnode** in this document. Configurations of connection are read from the `config.js` file in the root folder of the module.  

<a name="API_CoapNode"></a>
### new CoapNode(clientName[, devAttrs])
Create a new instance of CoapNode class.

**Arguments:**  

1. `clientName` (_String_): Name of the Client Device, it should be unique in the network.  
2. `devAttrs` (_Object_): Attributes of the Device. The following table shows the details of each property within devAttrs.  

    |  Property  | Type   | Required | Description |
    |------------|--------|----------|-------------|
    |  lifetime  | Number | optional | Registration will be removed by the server if a new registration or update from cnode is not received within `lifetime` seconds. Default is 86400 (seconds) |
    |  ip        | String | optional | Device ip address               |
    |  version   | String | optional | Minimum supported LWM2M version |

**Returns:**  

* (_Object_): cnode.

**Examples:** 

```js
var CoapNode = require('coap-node');

var cnode = new CoapNode('foo_name');
```

*************************************************
<a name="API_start"></a>
### start([devInfo, callback])

**Arguments:** 

1. `devInfo` (_Object_): Device information. There are 9 attributes of `devInfo` including `manuf`, `model`, `serial`, `firmware`, `devType`, `hwVer`, `swVer`, `availPwrSrc` and `pwrSrcVoltage`
2. `callback` (_Function_): `function (err, msg) { }`. Get called after the cnode started. `msg` is the message object with network information.  

**Returns:**  

* (none)

**Examples:** 

```js
// This event fired when the device started. 
cnode.on('ready', function () {
    console.log('ready');
});

var devInfo = {
    manuf: 'sivann',
    serial: 'c-0001',
    pwrSrcVoltage: '5V'
};

cnode.start(devInfo, function (err, msg) {
    console.log(msg);   // { ip: '192.168.1.117', mac: '00:0c:7f:5d:ac:2d', routeIp: '192.168.1.1' }
});
```

*************************************************
<a name="API_setDevAttrs"></a>
### setDevAttrs(attrs[, callback])
Set device attributes of the cnode and send an update request to the Server.

**Arguments:**  

1. `attrs` (_Object_): Device attributes.  

    |  Property  | Type   | Required |
    |------------|--------|----------|
    | lifetime   | Number | optional | 
    | ip         | String | optional |
    | version    | String | optional |

2. `callback` (_Function_): `function (err, rsp) { }`. Get called after the Server accomplishes the update. `rsp` is the response object with a status code to tell whether this operation is successful.  

    * `rsp.status` (_String_)  

        | rsp.status | Status                | Description                                                |
        |------------|-----------------------|------------------------------------------------------------|
        | '2.00'     | Ok                    | No device attribute update needed.                         |
        | '2.04'     | Changed               | Set device attributes operation is completed successfully. |
        | '4.00'     | Bad Request           | There is an unrecognized attribute in the update request.  |
        | '4.04'     | Not Found             | The device was not registered on the Server.               |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.                    |
        | '5.00'     | Internal Server Error | Something wrong with the Server.                           |

**Returns:**  

* (none)

**Examples:** 

```js
// This event fired when the device attributes updated (2.04). 
cnode.on('updated', function () {
    console.log('updated');
});

cnode.setDevAttrs({ lifetime: 12000 }, function (err, rsp) {
    console.log(rsp);   // { status: '2.04' }
});
```

*************************************************
<a name="API_initResrc"></a>
### initResrc(oid, iid, resrcs)
Initialize the Resources on cnode.  

**Arguments:**  

1. `oid` (_String_ | _Number_): Id of the Object that owns the Resources.  
2. `iid` (_String_ | _Number_): Id of the Object Instance that owns the Resources. It's common to use a number as `iid`, but using a string is also accepted.  
3. `resrcs` (_Object_): An object with **rid-value pairs** to describe the Resources. Each Resource is something that could be read, written, or executed remotely by a Server.  

**Note**: 
Please refer to [lwm2m-id](https://github.com/simenkid/lwm2m-id#5-table-of-identifiers) for all pre-defined IPSO/OMA-LWM2M identifiers. If the `oid` or `rid` is not a pre-defined id, **coap-node** will regard it as a private one.  

**Returns:**  

* (none)

**Examples:** 

* Resource is a simple value:

```js
// use oid and rids in string
cnode.initResrc('temperature', 1, {
    sensorValue: 70,
    units: 'F'
});

// use oid and rids in number
cnode.initResrc(3303, 1, {
    5700: 70,
    5701: 'F'
});

// oid and rids in string-numbers
cnode.initResrc('3303', 1, {
    '5700': 70,
    '5701': 'F'
});
```

* Resource value is read from particular operations:

```js
cnode.initResrc('dIn', 0, {
    dInState: {
        read: function (cb) {
            var val = gpio.read('gpio0');
            cb(null, val);
        }
    },
});
```

* Resource value should be written through particular operations:

```js
cnode.initResrc('dOut', 0, {
    dOutState: {
        write: function (val, cb) {
            gpio.write('gpio0', val);
            cb(null, val);
        }
    },
});
```

* Resource is an executable procedure that can be called remotely:

```js
cnode.initResrc('led', 0, {
    blink: {
        exec: function (t, cb) {
            blinkLed('led0', t);    // bink led0 for t times
            cb(null);               // cb(status), give `status` with 'null' or '2.04' if the operation succeeds.
        }
    },
});
```
*************************************************
<a name="API_readResrc"></a>
### readResrc(oid, iid, rid[, callback])
Read a value from the allocated Resource.  

**Arguments:**  

1. `oid` (_String_ | _Number_): Object id.  
2. `iid` (_String_ | _Number_): Object Instance id.  
3. `rid` (_String_ | _Number_): Resource id of the allocated Resource.  
4. `callback` (_Function_): `function (err, val) { }`, where `val` is the read result.  

    If the Resource is not a simple value and there has not a read method been initialized for it, the `val` passes to the callback will be a string '\_unreadable\_'. If the Resource is an executable resource, the `val` passes to the callback will be a string '\_exec\_'. If the Resource is not found, an error will be passed to first argument of the callback.  

**Returns:**  

* (none)

**Examples:** 

```js
cnode.readResrc('temperature', 0, 'sensorValue', function (err, val) {
    console.log(val);   // 21
});

cnode.readResrc('dIn', 0, 'dInState', function (err, val) {
    console.log(val);   // _unreadable_
});

cnode.readResrc('led', 0, 'blink', function (err, val) {
    console.log(val);   // _exec_
});
```
*************************************************
<a name="API_writeResrc"></a>
### writeResrc(oid, iid, rid, value[, callback])
Write a value to the allocated Resource.  

**Arguments:**  

1. `oid` (_String_ | _Number_): Object id.  
2. `iid` (_String_ | _Number_): Object Instance id.  
3. `rid` (_String_ | _Number_): Resource id.  
4. `value` (_Depends_): value to write to the allocated Resource.  
5. `callback` (_Function_): `function (err, val) { }`, where `val` is the written value.  

    If the Resource is not a simple value and there has not a write method been initialized for it, the `val` passes to the callback will be a string '\_unwritable\_'. If the Resource is an executable Resource, the `val` passes to the callback will be a string '\_exec\_'. If the allocated Resource is not found, an error will be passed to first argument of the callback.  

**Returns:**  

* (none)

**Examples:** 

```js
cnode.writeResrc('temperature', 0, 'sensorValue', 19, function (err, val) {
    console.log(val);   // 19
});

cnode.writeResrc('dOut', 0, 'dOutState', true, function (err, val) {
    console.log(val);   // _unwriteable_
});

cnode.writeResrc('led', 0, 'blink', 19, function (err, val) {
    console.log(val);   // _exec_
});
```
*************************************************
<a name="API_register"></a>
### register(ip, port[, callback])
Send a register request to the Server.  

**Arguments:**  

1. `ip` (_String_): Server ip address.  
2. `port` (_String_ | _Number_): Server port.  
3. `callback` (_Function_): `function (err, rsp) { }`, where `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)  

        | rsp.status | Status                | Description                                                               |
        |------------|-----------------------|---------------------------------------------------------------------------|
        | '2.01'     | Created               | Register operation is completed successfully.                             |
        | '2.04'     | Changed               | Re-registration and updating device attributes is completed successfully. |
        | '4.00'     | Bad Request           | Request packet has no clientName or objList attribute in it.              |
        | '4.05'     | Not Allowed           | The Server is not allowed for registration.                               |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.                                   |
        | '5.00'     | Internal Server Error | Something wrong with the Server.                                          |

**Returns:**  

* (none)

**Examples:** 

```js
// This event fired when the device registered (2.01).
cnode.on('registered', function () {
    console.log('registered');
});

cnode.register('127.0.0.1', 5683, function (err, rsp) {
    console.log(rsp);   // { status: '2.01' }
});
```

*************************************************
<a name="API_deregister"></a>
### deregister([callback])
Send a deregister request to the Server.  

**Arguments:**  

1. `callback` (_Function_): `function (err, rsp) { }`, where `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)

        | rsp.status | Status                | Description                                                |
        |------------|-----------------------|------------------------------------------------------------|
        | '2.02'     | Deleted               | Set device attributes operation is completed successfully. |
        | '4.04'     | Not Found             | The device was not registered to the Server.               |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.                    |
        | '5.00'     | Internal Server Error | Something wrong with the Server.                           |

**Returns:**  

* (none)

**Examples:** 

```js
// This event fired when the device deregistered (2.02).
cnode.on('deregistered', function () {
    console.log('deregistered');
});

cnode.deregister(function (err, rsp) {
    console.log(rsp);   // { status: '2.02' }
});
```

*************************************************
<a name="EVT_ready"></a>
### Event: 'ready'
`function () { }`
Fired when the Device started.  

*************************************************
<a name="EVT_registered"></a>
### Event: 'registered'
`function () { }`
Fired when the Device successfully registers to the Server.  

*************************************************
<a name="EVT_updated"></a>
### Event: 'updated'
`function () { }`
Fired when the Device attributes updated.  

*************************************************
<a name="EVT_deregistered"></a>
### Event: 'deregistered'
`function () { }`
Fired when the Device successfully deregisters from the Server.  

*************************************************
<a name="EVT_announce"></a>
### Event: 'announce'
`function (msg) { }`
Fired when there is an announce from the Server.  

* msg (_String_): the announce messages.

*************************************************
<a name="EVT_error"></a>
### Event: 'error'
`function (err) { }`
Fired when there is an error occurred.  

*************************************************

  
<br />

<a name="Templates"></a>
## 7. Code Templates

[Here is the document](https://github.com/PeterEB/coap-node/blob/develop/docs/templates.md) that provides you with many code templates of IPSO-defined devices. Each template gives the code snippet of how to initialize an Object Instance with its oid and iid, and lists every Resource the Object Instance may have.  

The following example shows how to create an **digital input** Object Instance. In the code snippet, commented lines are optional Resources. A phrase `< rid = 5500, R, Boolean >` tells the access permission and data type of a Resource.  
  
```js
// Create an Object Instance: Digital Input (oid = 3200 or 'dIn')

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

