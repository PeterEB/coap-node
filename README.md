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
5. [APIs and Events](#APIs)  


<a name="Overview"></a>
## 1. Overview

[**OMA Lightweight M2M**](http://technical.openmobilealliance.org/Technical/technical-information/release-program/current-releases/oma-lightweightm2m-v1-0) (LWM2M) is a resource constrained device management protocol relies on [**CoAP**](https://tools.ietf.org/html/rfc7252). And **CoAP** is an application layer protocol that allows devices to communicate with each other RESTfully over the Internet.  

* **coap-node** is a module that aims to provide a simple way to build **LWM2M** client devices managed by a **coap-shepherd** server. 
* It follows most parts of **LWM2M** specification to meet the requirements of a machine network and devices management.
* It uses [smartobject](https://github.com/PeterEB/smartobject) as its fundamental of resource organizing on devices. **smartobject** can help you create smart objects with IPSO data model, and it also provides a scheme to help you abstract your hardware into smart objects. You may like to use **smartobject** to create many plugins for your own hardware or modules, i.e., temperature sensor, humidity sensor, light control. Here is a [tutorual of how to plan resources](https://github.com/PeterEB/smartobject/blob/master/docs/resource_plan.md) with smartobject.

###Acronyms and Abbreviations

* **Server**: LWM2M Server (server running with [coap-shepherd](https://github.com/PeterEB/coap-shepherd))  
* **Client** or **Client Device**: LWM2M Client (machine running with [coap-node](https://github.com/PeterEB/coap-node))  
* **cnode**: instance of CoapNode Class  
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
var CoapNode = require('coap-node'),
    SmartObject = require('smartobject');

/*********************************************/
/*   Smart Object: Resources Initialzation   */
/*********************************************/
// initialize Resources that follow IPSO definition
var so = new SmartObject();

// initialize your Resources
// oid = 'temperature', iid = 0
so.init('temperature', 0, {
    sensorValue: 21,
    units: 'C'
});

// oid = 'lightCtrl', iid = 0
so.init('lightCtrl', 0, {
    onOff: false
});

/*********************************************/
/*   Client Device Initialzation             */
/*********************************************/
// Instantiate a machine node with your smart object
var cnode = new CoapNode('my_first_node', so);

cnode.on('registered', function () {
    // If the registration procedure completes successfully, 'registered' will be fired

    // after registered, start your application
});

// register to a Server with its ip and port
cnode.register('192.168.0.77', 5683, function (err, rsp) {
    console.log(rsp);      // { status: '2.05' }
});
```

Server-side example (please go to [coap-shepherd](https://github.com/PeterEB/coap-shepherd) document for details):

```js
var cnode = cserver.find('my_first_node');

cnode.read('/temperature/0/sensorValue', function (err, rsp) {
    console.log(rsp);      // { status: '2.05', data: 21 }
});

cnode.write('/lightCtrl/0/onOff', true, function (err, rsp) {
    console.log(rsp);      // { status: '2.04' }
});
```

<a name="APIs"></a>
## 5. APIs and Events

* [new CoapNode()](#API_CoapNode)
* [getSmartObject()](#API_getSmartObject)
* [register()](#API_register)
* [deregister()](#API_deregister)
* [update()](#API_update)
* [checkout()](#API_checkout)
* [checkin()](#API_checkin)
* Events
    * [registered](#EVT_registered), [deregistered](#EVT_deregistered)
    * [login](#EVT_login), [logout](#EVT_logout), [offline](#EVT_offline), [reconnect](#EVT_reconnect)
    * [announce](#EVT_announce)
    * [error](#EVT_error)

*************************************************
## CoapNode Class
Exposed by `require('coap-node')`.  
  
An instance of this class is denoted as **cnode** in this document. Configurations of connection are read from the `config.js` file in the `lib` folder of the module.  

<a name="API_CoapNode"></a>
### new CoapNode(clientName, so[, devAttrs])
Create a new instance of CoapNode class.

**Arguments:**  

1. `clientName` (_String_): Name of the Client Device, it should be unique in the network.  
2. `so` (_Object_): An smart object that holds all Resources on the device. This object should be an instance of the [SmartObject](https://github.com/PeterEB/smartobject) class.
3. `devAttrs` (_Object_): Attributes of the Device. The following table shows the details of each property within devAttrs.  

    |  Property  | Type   | Required | Description |
    |------------|--------|----------|-------------|
    |  lifetime  | Number | optional | Registration will be removed by the server if a new registration or update from cnode is not received within `lifetime` seconds. Default is 86400 (seconds) |
    |  version   | String | optional | Minimum supported LWM2M version |

**Returns:**  

* (_Object_): cnode.

**Examples:** 

```js
var CoapNode = require('coap-node'),
    SmartObject = require('smartobject');

var so = new SmartObject();

so.init('temperature', 0, {
    sensorValue: 21,
    units: 'C'
});

var cnode = new CoapNode('foo_name', so);
```

*************************************************
<a name="API_getSmartObject"></a>
### getSmartObject()
Get SmartObject on the cnode.  

**Arguments:**  

1. none

**Returns:**  

* (_Object_): SmartObject.

**Examples:** 

```js
cnode.getSmartObject();

/*
SmartObject {
    ...
}
*/
```

*************************************************
<a name="API_register"></a>
### register(ip, port[, callback])
Send a register request to the Server. When succeeds, cnode will fire a `registered` event and a `login` event. After successfully register, cnode will select a free UDP port to communicate with the Server.

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
cnode.on('registered', function () {
    console.log('cnode registered to the Server');
});

cnode.register('127.0.0.1', 5683, function (err, rsp) {
    console.log(rsp);   // { status: '2.01' }
});
```

*************************************************
<a name="API_deregister"></a>
### deregister([callback])
Send a deregister request to the Server. The Server will remove the cnode from the registry. When succeeds, cnode will fire a `deregistered` event and a `logout` event. 

**Arguments:**  

1. `callback` (_Function_): `function (err, rsp) { }`, where `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)

        | rsp.status | Status                | Description                               |
        |------------|-----------------------|-------------------------------------------|
        | '2.02'     | Deleted               | The device was successfully deregistered. |
        | '4.04'     | Not Found             | The device was not found on the Server.   |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.   |
        | '5.00'     | Internal Server Error | Something wrong with the Server.          |

**Returns:**  

* (none)

**Examples:** 

```js
cnode.on('deregistered', function () {
    console.log('cnode deregistered form the Server');
});

cnode.deregister(function (err, rsp) {
    console.log(rsp);   // { status: '2.02' }
});
```

*************************************************
<a name="API_update"></a>
### update(attrs[, callback])
Set device attributes of the cnode and send an update request to the Server. After each successfully update, cnode will change the Client UDP port that communicate with the Server.

**Arguments:**  

1. `attrs` (_Object_): Device attributes.  

    |  Property  | Type   | Required |
    |------------|--------|----------|
    | lifetime   | Number | optional | 
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
cnode.update({ lifetime: 12000 }, function (err, rsp) {
    console.log(rsp);   // { status: '2.04' }
});
```

*************************************************
<a name="API_checkout"></a>
### checkout([duration, ][callback])
Send a checkout request to inform the Server that this cnode is going to sleep. When succeeds, cnode will fire a `logout` event. 

* After received a successful acknowledgement, device can use power saving mode, or even power off.
* If cnode checks out with a given duration, for example 300 seconds, the Server knows this cnode is going to sleep and expects that this cnode will wake up and check in at 300 seconds later. If cnode does not check in, the Server will take it as an offline Client.
* If cnode checks out without the duration, the Server knows this cnode is going to sleep but has no idea about when it will wake up and check in again. The Server will always take it as a sleeping Client, until cnode check in.
* Note: After successfully checkout, cnode will not only stop reporting but also clear all the report settings. The Server should re-issue the observeReq(), when the Client goes online again, if needed.

**Arguments:**  

1. `duration` (_Number_): How many seconds from now that this cnode will check in again. 

2. `callback` (_Function_): `function (err, rsp) { }`, where `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)

        | rsp.status | Status                | Description                                  |
        |------------|-----------------------|----------------------------------------------|
        | '2.04'     | Changed               | The device was successfully checkout.        |
        | '4.04'     | Not Found             | The device was not registered to the Server. |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.      |
        | '5.00'     | Internal Server Error | Something wrong with the Server.             |

**Returns:**  

* (none)

**Examples:** 

```js
cnode.on('logout', function () {
    console.log('cnode has logged out from the network.');
});

cnode.checkout(30, function (err, rsp) {
    console.log(rsp);   // { status: '2.04' }
});
```

*************************************************
<a name="API_checkin"></a>
### checkin([callback])
Send a checkin request to inform the Server that this cnode wake up from sleep. When succeeds, cnode will fire a `login` event. 

**Arguments:**  

1. `callback` (_Function_): `function (err, rsp) { }`, where `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)

        | rsp.status | Status                | Description                                  |
        |------------|-----------------------|----------------------------------------------|
        | '2.04'     | Changed               | The device was successfully checkin.         |
        | '4.04'     | Not Found             | The device was not registered to the Server. |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.      |
        | '5.00'     | Internal Server Error | Something wrong with the Server.             |

**Returns:**  

* (none)

**Examples:** 

```js
cnode.on('login', function () {
    console.log('cnode has logged in the network.');
});

cnode.checkin(function (err, rsp) {
    console.log(rsp);   // { status: '2.04' }
});
```

*************************************************
<a name="EVT_registered"></a>
### Event: 'registered'
`function () { }`
Fired when the cnode successfully registers to the Server.  

*************************************************
<a name="EVT_deregistered"></a>
### Event: 'deregistered'
`function () { }`
Fired when the cnode successfully deregisters from the Server.  

*************************************************
<a name="EVT_login"></a>
### Event: 'login'
`function () { }`
Fired when the cnode connects and login to the Server successfully.  

*************************************************
<a name="EVT_logout"></a>
### Event: 'logout'
`function () { }`
Fired when the cnode disconnects and logout from the Server successfully.  

*************************************************
<a name="EVT_offline"></a>
### Event: 'offline'
`function () { }`
Fired when the cnode loses its connection to the Server.  

*************************************************
<a name="EVT_reconnect"></a>
### Event: 'reconnect'
`function () { }`
Fired when the cnode starts to reconnect to the Server..  

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
