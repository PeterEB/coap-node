coap-node
========================

## Table of Contents

1. [Overiew](#Overiew)    
2. [Features](#Features) 
3. [Installation](#Installation) 
4. [Usage](#Usage)
5. [Resources Planning](#Resources)
6. [APIs and Events](#APIs) 

<a name="Overiew"></a>
## 1. Overview

[**CoAP**](https://tools.ietf.org/html/rfc7252) is an application layer protocol based on RESTful intended to be used in resource constrained internet devices such as M2M or IoT that allows them to communicate interactively over the Internet. [**OMA Lightweight M2M**](http://technical.openmobilealliance.org/Technical/technical-information/release-program/current-releases/oma-lightweightm2m-v1-0) (LWM2M) is a resource constrained device management protocol relies on **CoAP**. 

[**coap-shepherd**](https://github.com/PeterEB/coap-shepherd) is an implementation of **CoAP** device management Server with Node.js that follows part of **LWM2M** specification to achieve machine network management.

**coap-node** is implemented as a client of **coap-shepherd**, aims to provide a simple way to build the M2M or IoT device.

###Acronym

* oid: identifier of an Object
* iid: identifier of an Object Instance
* rid: indetifier of a Resource

<a name="Features"></a>
## 2. Features

* CoAP protocol
* Based on library [node-coap](https://github.com/mcollina/node-coap)
* LWM2M interfaces for Client/Server interaction
* Smart-Object-style (IPSO)

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side exmaple (the following example is how to use `coap-node`):

```js
var CoapNode = require('coap-node');

var cnode = new CoapNode('foo_name');

// Initialize the Resource that follows the IPSO definition
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

cnode.on('registered', function () {
    // If the registration procedure completes successfully, 'registered' will be fired
    // do your application here
});

// register to the server
cnode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);      // { status: '2.05' }
});
```

Server-side example (please go to [coap-shepherd](https://github.com/PeterEB/coap-shepherd) document for details):

```js
var cnode = shepherd.find('foo_name');

cnode.read('/temperature/0/sensorValue', function (err, msg) {
    console.log(msg);      // { status: '2.05', data: 21 }
});

cnode.write('/temperature/1/sensorValue', function (err, msg) {
    console.log(msg);      // { status: '2.04' }
});
```

<a name="Resources"></a>
## 5. Resources Planning



<a name="APIs"></a>
## 6. APIs and Events

* [new CoapNode()](#API_CoapNode)
* [initResrc()](#API_initResrc)
* [readResrc()](#API_readResrc)
* [writeResrc()](#API_writeResrc)
* [register()](#API_register)
* [setDevAttrs()](#API_setDevAttrs)
* [deregister()](#API_deregister)
* Events: [registered](#EVT_registered), [update](#EVT_update), [deregistered](#EVT_deregistered), [announce](#announce), and [error](#EVT_error)

*************************************************
## CoapNode Class
Exposed by require('coap-node'). All the client configuration is read from the `config.js` file in the root of the project. Such an instance is denoted as **cnode** in this document.

<a name="API_CoapNode"></a>
### new CoapNode(clientName[, devAttrs])
Create a new instance of CoapNode class.

**Arguments:**  

1. `clientName` (_String_): the name of Client device, it should be unique in the network. 

2. `devAttrs` (_Object_): describe information about the device. The following table shows the details of each property within devAttrs.

    |  Property  | Type   | Required | Description |
    |------------|--------|----------|-------------|
    | `lifetime` | Number | No       | the registration should be removed by the Server if a new registration or update is not received within this lifetime. default is 86400. Unit: seconds |
    | `ip`       | String | No       | device ip address               |
    | `version`  | String | No       | minimum supported LWM2M version |

**Returns:**  

* (none)

**Examples:** 

```js
var CoapNode = require('./lib/coap-node.js');

var cnode = new CoapNode('foo_name');
```
*************************************************
<a name="API_initResrc"></a>
### initResrc(oid, iid, resrcs)
Initialize the Resources on cnode.

**Arguments:**  

1. `oid` (_String_ | _Number_):

2. `iid` (_String_ | _Number_):

3. `resrcs` (_Object_):

**Returns:**  

* (none)

**Examples:** 

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

```
*************************************************
<a name="API_readResrc"></a>
### readResrc(oid, iid, rid[, callback])
Read value from the allocated Resource.

**Arguments:**  

1. `oid` (_String_ | _Number_): the Object id of the allocated Resource.

2. `iid` (_String_ | _Number_): the Object Instance id of the allocated Resource.

3. `rid` (_String_ | _Number_): the Resource id of the allocated Resource.

4. `callback` (_Function_): `function (err, val) { }` 

**Returns:**  

* (none)

**Examples:** 

```js
cnode.readResrc('temperature', 0, 'sensorValue', function (err, val) {
    console.log(val);   // 21
});

cnode.readResrc('dOut', 0, 'dOutState', function (err, val) {
    console.log(val);   // _unreadable_
});

cnode.readResrc('led', 0, 'blink', function (err, val) {
    console.log(val);   // _exec_
});
```
*************************************************
<a name="API_writeResrc"></a>
### writeResrc(oid, iid, rid, value[, callback])
Write the value to the allocated Resource.

**Arguments:**  

1. `oid` (_String_ | _Number_): Object id of the allocated Resource.

2. `iid` (_String_ | _Number_): Object Instance id of the allocated Resource.

3. `rid` (_String_ | _Number_): Resource id of the allocated Resource.

4. `value` (_Depends_): the value to write to the allocated Resource.

5. `callback` (_Function_): `function (err, val) { }`

**Returns:**  

* (none)

**Examples:** 

```js
cnode.writeResrc('temperature', 0, 'sensorValue', 19, function (err, val) {
    console.log(val);   // 19
});

cnode.writeResrc('dIn', 0, 'dInState', true, function (err, val) {
    console.log(val);   // _unwriteable__
});

cnode.writeResrc('led', 0, 'blink', 19, function (err, val) {
    console.log(val);   // _exec_
});
```
*************************************************
<a name="API_register"></a>
### register(ip, port[, callback])
Send register request to the Server.

**Arguments:**  

1. `ip` (_String_): ip address of the Server.

2. `port` (_String_ | _Number_): port of the Server listening.

3. `callback` (_Function_): `function (err, msg) { }` Get called after the registering procedure done. `msg` is response message object with status code:

    * `msg.status` (_String_): Status code of the response. The descriptions of status code are given in the following table.

        | msg.status | Status Code           | Description |
        |------------|-----------------------|-------------|
        | 2.01       | Created               | Register operation is completed successfully.                         |
        | 2.04       | Changed               | re-register and update device attributes is completed successfully.   |
        | 4.00       | Bad Requset           | There is not ClientName or Objlist attribute in the register request. |
        | 4.05       | Not Allowed           | The Server is not allowed for register operation.                     |
        | 4.08       | Timeout               | No response from the Server in 60 secs.                               |
        | 5.00       | Internal Server Error | The Server has some error.                                            |

**Returns:**  

* (none)

**Examples:** 

```js
cnode.on('registered', function () {
    console.log('registered');
});

cnode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);   // { status: '2.01' }
});
```
*************************************************
<a name="API_setDevAttrs"></a>
### setDevAttrs(attrs[, callback])
Set the device attributes of cnode and send update request to the Server.

**Arguments:**  

1. `attrs` (_Object_): device attributes.

    |  Property  | Type   | Required |
    |------------|--------|----------|
    | `lifetime` | Number | No       | 
    | `ip`       | String | No       |
    | `version`  | String | No       |

2. `callback` (_Function_): `function (err, msg) { }` Get called after the updating procedure done. `msg` is response message object with status code:

    * `msg.status` (_String_): Status code of the response. The descriptions of status code are given in the following table.

        | msg.status | Status Code           | Description |
        |------------|-----------------------|-------------|
        | 2.00       | Ok                    | No device attributes need to update.                       |
        | 2.04       | Changed               | Set device attributes operation is completed successfully. |
        | 4.00       | Bad Requset           | There is an unrecognized attribute in the update request.  |
        | 4.04       | Not Found             | The device was not registered on the Server.               |
        | 4.08       | Timeout               | No response from the Server in 60 secs.                    |
        | 5.00       | Internal Server Error | The Server has some error.                                 |

**Returns:**  

* (none)

**Examples:** 

```js
coapNode.on('update', function () {
    console.log('update');
});

coapNode.setDevAttrs({ lifetime: 12000 }, function (err, msg) {
    console.log(msg);   // { status: '2.04' }
});
```
*************************************************
<a name="API_deregister"></a>
### deregister([callback])
Send deregister request to the Server.

**Arguments:**  

1. `callback` (_Function_): `function (err, msg) { }` Get called after the deregistering procedure done. `msg` is response message object with status code:

    * `msg.status` (_String_): Status code of the response. The descriptions of status code are given in the following table.

        | msg.status | Status Code           | Description |
        |------------|-----------------------|-------------|
        | 2.02       | Deleted               | Set device attributes operation is completed successfully. |
        | 4.04       | Not Found             | The device was not registered on the Server.               |
        | 4.08       | Timeout               | No response from the Server in 60 secs.                    |
        | 5.00       | Internal Server Error | The Server has some error.                                 |

**Returns:**  

* (none)

**Examples:** 

```js
coapNode.on('deregistered', function () {
    console.log('deregistered');
});

coapNode.deregister(function (err, msg) {
    console.log(msg);   // { status: '2.02' }
});
```
*************************************************
<a name="EVT_registered"></a>
### Event: 'registered'
`function () { }`
Fired when the Device registered.

*************************************************
<a name="EVT_update"></a>
### Event: 'update'
`function () { }`
Fired when the Device attributes updated.

*************************************************
<a name="EVT_deregistered"></a>
### Event: 'deregistered'
`function () { }`
Fired when the Device deregistered.

*************************************************
<a name="EVT_announce"></a>
### Event: 'announce'
`function (msg) { }`
Fired when there is an announce from Server.

* msg (_String_): the announce messages.

*************************************************
<a name="EVT_error"></a>
### Event: 'error'
`function (err) { }`
Fired when there is an error occurred.
