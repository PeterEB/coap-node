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

**coap-node** is implemented as a client of **coap-shepherd**, aims to provide a simple way to build the M2M or IoT device. This module uses **IPSO** Smart Objects which defines application Objects using the LWM2M Object Model by [Smart Objects Guidelines](http://www.ipso-alliance.org/smart-object-guidelines/), so it is easy to add new Object and Resource as needed.

###Acronym

* oid: identifier of an Object
* iid: identifier of an Object Instance
* rid: indetifier of a Resource

<a name="Features"></a>
## 2. Features

* CoAP protocol  
* Based on [node-coap](https://github.com/mcollina/node-coap) library  
* Ready to provide CoAP services at machine node  
* LWM2M interfaces for Client/Server interaction  
* Smart-Object-style (IPSO) and easy to create a Resource on a Client Device  

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side exmaple (the following example is how to use `coap-node` on a machine node):

```js
var CoapNode = require('coap-node');
var cnode = new CoapNode('foo_name');

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
    // do your application here
});

// register to a Server with the server ip and port
cnode.register('127.0.0.1', 5683, function (err, rsp) {
    console.log(rsp);      // { status: '2.05' }
});
```

Server-side example (please go to [coap-shepherd](https://github.com/PeterEB/coap-shepherd) document for details):

```js
var cnode = cserver.find('foo_name');

cnode.read('/temperature/0/sensorValue', function (err, rsp) {
    console.log(rsp);      // { status: '2.05', data: 21 }
});

cnode.write('/temperature/1/sensorValue', function (err, rsp) {
    console.log(rsp);      // { status: '2.04' }
});
```

<a name="Resources"></a>
## 5. Resources Planning

The great benefit of using this module is that **coap-node** will handle responses to the requests from the Server, as long as your Resources is planning well. So all you need to do is using API `initResrc(oid, iid, resrcs)` to initialize Resources as you need on the Device, where `oid` and `iid` are the Object id and Object Instance id. `resrcs` is an object containing all Resources under the Object Instance. In `resrcs` object, each key is `rid` and its corresponding value is the Resource value. 

Resource value can be 

* [a definitely value.](#Resource_simple)

* [a object with `read` method.](#Resource_readable) Whenever the Server requests to read the Resource, the `read()` method will be called to read from the specified operation. 

* [a object with `write` method.](#Resource_writeable) Whenever the Server requests to write the Resource, the `write()` method will be called to write to the specified operation. 

* [a object with both of `read` and `write` methods.](#Resource_both)

* [a object with `exec` method.](#Resource_executable) Whenever the Server requests to execute the Resource, the `exec()` method will be called. 

The following description will tell you how to build them.

<a name="Resource_simple"></a>
### Initialize Resource as a definitely value

The most common Resource is a simple value. It can be a number, a string or a boolean. The following example is a temperature Object with Resources 'sensorValue' and 'units':

```js
cnode.initResrc('temperature', 0, {
    sensorValue: 21,
    units: 'C'
});
```

If you want to change the Resource value, you need to use API `writeResrc(oid, iid, rid, val)`. The following example show you how to write Resources 'sensorValue':

```js
var tempVal = gpio.read('gpio0');
cnode.writeResrc('temperature', 0, 'sensorValue', tempVal);
```

<a name="Resource_readable"></a>
### Initialize Resource with read method

It's easy to use this plan. You have to know the signature of `read` method is `function (cb)`, where `cb(err, val)` is an err-back function that you should call and pass the read value through its second argument `val` when your read operation accomplishes. If any error occurs, you can pass the error through the first argument `err`. Here is an exmaple:

```js
cnode.initResrc('temperature', 0, {
    sensorValue: {
        read: function (cb) {
            var tempVal = gpio.read('gpio0');
            cb(null, tempVal);
        }
    },
    units: 'C'
});
```

If you define Resource with read method, the Resource will be inherently readable. If the Server request to read a Resource that is not readable, it will get special value of string '\_unreadable\_' along with a status code of '4.05'(Method Not Allowed).

<a name="Resource_writeable"></a>
### Initialize Resource with write method

This plan is similar to readable Resource. The signature of `write` method is `function (val, cb)`, where `val` is the value to wirte to this Resource and `cb(err, val)` is an err-back function that you should call and pass the written value through its second argument `val` when your read operation accomplishes. If any error occurs, you can pass the error through the first argument `err`. Here is an exmaple:

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

If you define Resource with write method, the Resource will be inherently writeable. If the Server request to write a Resource that is not writeable, it will get a status code of '4.05'(Method Not Allowed).

<a name="Resource_both"></a>
### Initialize Resource with both of read and write method

If you want the Resource is both of readable and writable, you should give both of read and write methods to it:

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
### Initialize Resource with exec method

Finally, an executable Resource. Executable Resource allows Server to remotely call a procedure on the Device. You can define some procedure calls of you need in executable Resource. In this plan, the signature of `write` method is `function (..., cb)`, the number of arguments depends on your own definition. The `cb(status, data)` is a callback function that you should call, where `status` is the respond code to the requests from the Server. If the procedure operates successfully, you should give `status` 'null' or '2.04'(Changed). If any error occurs during the procedure, you should give `status` '4.00'(Bad Request) or your own definition. Here is an exmaple:

```js
function blinkLed (led, time) {
    //Let led blink
}

cnode.initResrc('led', 0, {
    blink: {
        exec: function (t, cb) {
            if (typeof t !== 'number') {
                cb('4.00', null);
            } else {
                blinkLed('led0', t);    // invoke the procedure
                cb(null, null);         // or cb('2.04', null);
            }

        }
    },
});
```

If the Server request to read or write an executable Resource, it will get a status code of '4.05'(Method Not Allowed). In contrast, If the Server request to execute a Resource that is not executable, it also get a status code of '4.05'(Method Not Allowed).

<a name="APIs"></a>
## 6. APIs and Events

* [new CoapNode()](#API_CoapNode)
* [initResrc()](#API_initResrc)
* [readResrc()](#API_readResrc)
* [writeResrc()](#API_writeResrc)
* [register()](#API_register)
* [setDevAttrs()](#API_setDevAttrs)
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

1. `clientName` (_String_): name of the Client Device, it should be unique in the network.  
2. `devAttrs` (_Object_): attributes of the Device. The following table shows the details of each property within devAttrs.  

    |  Property  | Type   | Required | Description |
    |------------|--------|----------|-------------|
    | `lifetime` | Number | optional | Registration will be removed by the server if a new registration or update is not received within `lifetime` seconds. Default is 86400 (seconds) |
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

1. `attrs` (_Object_): device attributes.  

    |  Property  | Type   | Required |
    |------------|--------|----------|
    | lifetime   | Number | optional | 
    | ip         | String | optional |
    | version    | String | optional |

2. `callback` (_Function_): `function (err, rsp) { }`. Get called after the updating procedure done. `rsp` is the response object with a status code to tell whether this operation is successful.  

    * `rsp.status` (_String_)  

        | rsp.status | Status                | Description                                                |
        |------------|-----------------------|------------------------------------------------------------|
        | '2.00'     | Ok                    | No device attribute update needed.                         |
        | '2.04'     | Changed               | Set device attributes operation is completed successfully. |
        | '4.00'     | Bad Requset           | There is an unrecognized attribute in the update request.  |
        | '4.04'     | Not Found             | The device was not registered on the Server.               |
        | '4.08'     | Timeout               | No response from the Server in 60 secs.                    |
        | '5.00'     | Internal Server Error | Something wrong with the Server.                           |

**Returns:**  

* (none)

**Examples:** 

```js
// [TBD] when will this event fire? when success (2.04)?
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

1. `oid` (_String_ | _Number_): id of the Object that owns the Resources.  
2. `iid` (_String_ | _Number_): id of the Object Instance that owns the Resources. It's common to use a number as `iid`, but using a string is also accepted.  
3. `resrcs` (_Object_): an object with rid-value pairs to describe the Resources. Each Resource is something that could be read, written, or executed remotely by a Server.  

Note: Please refer to [lwm2m-id](https://github.com/simenkid/lwm2m-id#5-table-of-identifiers) for all pre-defined IPSO/OMA-LWM2M ids. If the `oid` or `rid` is not a pre-defined id, **coap-node** will regard it as a private one.  

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
            cb(null, val)
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
            cb(null, val)
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
            cb(null, null)          // [TBD] no status for cb()?
        }
    },
});
```
*************************************************
<a name="API_readResrc"></a>
### readResrc(oid, iid, rid[, callback])
Read value from the allocated Resource.  

**Arguments:**  

1. `oid` (_String_ | _Number_): Object id.  
2. `iid` (_String_ | _Number_): Object Instance id.  
3. `rid` (_String_ | _Number_): Resource id of the allocated Resource.  
4. `callback` (_Function_): `function (err, val) { }`. `val` is the read result.  

    Note: If the Resource is not a simple value and there has no read method been initialized for it, the `val` passes to the callback will be a string `\_unreadable\_`. If the Resource is an executable resource, the `val` passes to the callback will be a string `\_exec\_`. If the Resource is not found, an error will be passed to fisrt argument of the callback.  

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
5. `callback` (_Function_): `function (err, val) { }`. `val` is the value written.  

    Note: If the Resource is not a simple value and there has no write method been initialized for it, the `val` passes to the callback will be a string `\_unwriteable\_`. If the Resource is an executable Resource, the `val` passes to the callback will be a string `\_exec\_`. If the allocated Resource is not found, an error will be passed to fisrt argument of the callback.  

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
3. `callback` (_Function_): `function (err, rsp) { }`. `rsp` is the response object with a status code to tell whether this request is successful.  

    * `rsp.status` (_String_)  

        | rsp.status | Status                | Description                                                               |
        |------------|-----------------------|---------------------------------------------------------------------------|
        | '2.01'     | Created               | Register operation is completed successfully.                             |
        | '2.04'     | Changed               | Re-registration and updating device attributes is completed successfully. |
        | '4.00'     | Bad Requset           | Request packet has no clientName or objList attribute in it.              |
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

cnode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);   // { status: '2.01' }
});
```

*************************************************
<a name="API_deregister"></a>
### deregister([callback])
Send a deregister request to the Server.  

**Arguments:**  

1. `callback` (_Function_): `function (err, rsp) { }` Get called after the deregistering procedure done. `msg` is response message object with status code:

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
<a name="EVT_updated"></a>
### Event: 'updated'
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

*************************************************
