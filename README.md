coap-node
========================

## Table of Contents

1. [Overview](#Overview)    
2. [Features](#Features) 
3. [Installation](#Installation) 
4. [Usage](#Usage)
5. [Resources Planning](#Resources)
6. [APIs and Events](#APIs) 

<a name="Overview"></a>
## 1. Overview

<br />

[---- WAITING FOR REVISING, Ignore this section ----]

<br />

<br />

[**CoAP**](https://tools.ietf.org/html/rfc7252) is an application layer protocol based on RESTful intended to be used in resource constrained internet devices such as M2M or IoT that allows them to communicate interactively over the Internet. [**OMA Lightweight M2M**](http://technical.openmobilealliance.org/Technical/technical-information/release-program/current-releases/oma-lightweightm2m-v1-0) (LWM2M) is a resource constrained device management protocol relies on **CoAP**. 

[**coap-shepherd**](https://github.com/PeterEB/coap-shepherd) is an implementation of **CoAP** device management Server with Node.js that follows part of **LWM2M** specification to achieve machine network management.

**coap-node** is implemented as a client of **coap-shepherd**, aims to provide a simple way to build the M2M or IoT device. This module uses **IPSO** Smart Objects which defines application Objects using the LWM2M Object Model by [Smart Objects Guidelines](http://www.ipso-alliance.org/smart-object-guidelines/), so it is easy to add new Object and Resource as needed.

###Acronym

* oid: identifier of an Object
* iid: identifier of an Object Instance
* rid: identifier of a Resource

<a name="Features"></a>
## 2. Features

* CoAP protocol  
* Based on [node-coap](https://github.com/mcollina/node-coap) library  
* Ready to provide CoAP services at machine node  
* LWM2M interfaces for Client/Server interaction  
* Smart-Object-style (IPSO) and easy to create a Resource on a Client Device  

<br />

<br />

[---- END: WAITING FOR REVISING, Ignore this section ----]

<br />

<br />

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side example (the following example shows how you use `coap-node` on a machine node):

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

cnode.on('registered', function () {
    // If the registration procedure completes successfully, 'registered' will be fired

    // start your application
});

// register to a Server with its ip and port
cnode.register('127.0.0.1', 5683, function (err, rsp) {
    console.log(rsp);      // { status: '2.05' }
});
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

With **coap-node**, all you have to do is to plan your Resources well on your machine. **coap-node** will automatically tackle the response things for you with respect to requests from a Server. **coap-node** is trying to lower down your effort of designing client nodes in a machine network.  

Use `initResrc(oid, iid, resrcs)` method to help you with initializing your Resources. The parameters `oid` and `iid` are the Object id and Object Instance id, respectively. Parameter `resrcs` is an object containing all Resources in this Object Instance. Each key in `resrcs` object should be an `rid` and each value is its corresponding Resource value.  

A Resource value can be a  
(1) [Primitive value.](#Resource_simple)  
(2) [Object with `read()` method.](#Resource_readable) It's handy when you have to read a value with particular operations, e.g. reading from a gpio.  
(3) [Object with `write()` method.](#Resource_writeable) It's handy when you have to write a value with particular operations, e.g. write a value to a pwm output pin.  
(4) [Object with `read()` and `write` methods.](#Resource_both)  
(5) [Object with `exec()` method.](#Resource_executable) This helps you with designing remote procedure calls.  

Let me show you some examples:  

<a name="Resource_simple"></a>
### (1) Initialize a Resource as a primitive value

The Resource is a simple value which can be a number, a string, or a boolean.  

The following example gives an **Object Instance** (iid = 0) of an **Object** (oid = 'temperature'), and this Instance has two Resources, 'sensorValue' and 'units', in it.

```js
cnode.initResrc('temperature', 0, {
    sensorValue: 21,    // Resource value is a number 21
    units: 'C'          // Resource value is a string 'C'
});
```

**Note**:  
An IPSO Object is like a **Class**, and an IPSO Object Instance is an entity of such a Class. For example, when you have many 'temperature' sensors, you have to use an `iid` on each Object Instance to distinguish one entity from the other.  

<br />

If you want to change the Resource value, use API `writeResrc(oid, iid, rid, val)` to update it and **coap-node** will check whether it should report this change to the Server or not. This example shows you how to write a value to the Resource 'sensorValue':  

```js
var tempVal = gpio.read('gpio0');   // synchronously read a value from gpio
cnode.writeResrc('temperature', 0, 'sensorValue', tempVal);

// if you like to keep your 'sensorValue' updated, you have to poll 'gpio0' regularly 
// and write the latest read value to the Resource.
```

<a name="Resource_readable"></a>
### (2) Initialize a Resource with read method

If reading a value requires some particular operations, e.g. reading from a gpio, it would be better to initialize the Resource with this pattern. The good news is that each time a Server requests for the Resource, **coap-node** can always respond its latest value back by calling the read() method you gave, or you may have to poll the Resource as fast as possible to keep its value _really updated_.  

The signature of a read method is `function (cb)`, where `cb(err, val)` is an err-back function that you should call and pass the read value through its second argument `val` when your reading operation accomplishes. If any error occurs, pass the error through the first argument `err` to tell **coap-node** there is something bad happening.  

Let me show you an example:

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

If your Resource is an object with a read method, it will be inherently readable. When a Server requests for a Resource that is not readable, **coap-node** will respond back a special value of string '\_unreadable\_' along with a status code of '4.05'(Method Not Allowed) to the Server.  

<a name="Resource_writeable"></a>
### (3) Initialize a Resource with write method

The signature of a write method is `function (val, cb)`, where `val` is the value to wirte to this Resource and `cb(err, val)` is an err-back function that you should call and pass the written value through its second argument `val` when your writing operation accomplishes. If any error occurs, pass the error through the first argument `err`. Here is an example:  

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

If you initialize a Resource as an object with a write method, this Resource will be inherently writable. When a Server requests to write a value to an unwritable Resource, **coap-node** will respond back a status code of '4.05'(Method Not Allowed) to the Server.  


<a name="Resource_both"></a>
### (4) Initialize a Resource with read and write methods

If a Resource is readable and writable, then there should be both of read() and write() methods in your object:  

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
### (5) Initialize a Resource with exec method

Finally, an executable Resource. Executable Resource allows a Server to remotely call a procedure on the Client Device. You can define some procedure calls to fit your needs with executable Resources, e.g. to ask your Device to blink a LED for 100 times and to show warning signs on a screen or something.  

The signature of an exec method is `function (..., cb)`, the number of arguments depends on your own definition. The callback `cb(status)` is a function that you should call after its job is done. Parameter `status` is the status code you'd like to respond back to the Server. Give `status` with 'null' or '2.04' (Changed) if the operation succeeds. If any error occurs, give `status` with '4.00' (Bad Request) or a status code used in your application.  

Here is an example:

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

If a Server requests to read or write an executable Resource, **coap-node** will respond a status code of '4.05'(Method Not Allowed) to the Server. If a Server requests to execute a unexecutable Resource, **coap-node** will also respond back a status code of '4.05'(Method Not Allowed).  


<a name="APIs"></a>
## 6. APIs and Events

* [new CoapNode()](#API_CoapNode)
* [setDevAttrs()](#API_setDevAttrs)
* [initResrc()](#API_initResrc)
* [readResrc()](#API_readResrc)
* [writeResrc()](#API_writeResrc)
* [register()](#API_register)
* [deregister()](#API_deregister)
* Events: [registered](#EVT_registered), [updated](#EVT_updated), [deregistered](#EVT_deregistered), [announce](#announce), and [error](#EVT_error)

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
    | `lifetime` | Number | optional | Registration will be removed by the server if a new registration or update from cnode is not received within `lifetime` seconds. Default is 86400 (seconds) |
    | `ip`       | String | optional | Device ip address               |
    | `version`  | String | optional | Minimum supported LWM2M version |

**Returns:**  

* (none)

**Examples:** 

```js
var CoapNode = require('./lib/coap-node.js');

var cnode = new CoapNode('foo_name');
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

    If the Resource is not a simple value and there has not a read method been initialized for it, the `val` passes to the callback will be a string `\_unreadable\_`. If the Resource is an executable resource, the `val` passes to the callback will be a string `\_exec\_`. If the Resource is not found, an error will be passed to first argument of the callback.  

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

    If the Resource is not a simple value and there has not a write method been initialized for it, the `val` passes to the callback will be a string `\_unwritable\_`. If the Resource is an executable Resource, the `val` passes to the callback will be a string `\_exec\_`. If the allocated Resource is not found, an error will be passed to first argument of the callback.  

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
cnode.on('deregistered', function () {
    console.log('deregistered');
});

cnode.deregister(function (err, rsp) {
    console.log(rsp);   // { status: '2.02' }
});
```

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
