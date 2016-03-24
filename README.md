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



<a name="Features"></a>
## 2. Features

* LWM2M interfaces for Client/Server interaction
* Communication based on CoAP protocol and library [node-coap](https://github.com/mcollina/node-coap)
* Smart-Object-style ([IPSO](http://www.ipso-alliance.org/smart-object-guidelines/))

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side exmaple (the following example is how to use `coap-node`):

```js
var CoapNode = require('./lib/coap-node.js');

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

*************************************************
## CoapNode Class
Exposed by require('coap-node'). All the client configuration is read from the `config.js` file in the root of the project.

<a name="API_CoapNode"></a>
### new CoapNode(clientName)
Create a new instance of CoapNode class.

**Arguments:**  

1. `clientName` (_String_): the name of Client device, it should be unique in the network. 

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


**Arguments:**  

1. `oid` (_String_ | _Number_):

2. `iid` (_String_ | _Number_):

3. `rid` (_String_ | _Number_):

4. `callback` (_Function_): `function (err, val) { }`

**Returns:**  

* (none)

**Examples:** 

```js

```
*************************************************
<a name="API_writeResrc"></a>
### writeResrc(oid, iid, rid, value[, callback])


**Arguments:**  

1. `oid` (_String_ | _Number_):

2. `iid` (_String_ | _Number_):

3. `rid` (_String_ | _Number_):

4. `value` (_Depends_):

5. `callback` (_Function_): `function (err, val) { }`

**Returns:**  

* (none)

**Examples:** 

```js

```
*************************************************
<a name="API_register"></a>
### register(ip, port[, callback])


**Arguments:**  

1. `ip` (_String_): the Server ip address.

2. `port` (_String_ | _Number_): port of the Server listening.

3. `callback` (_Function_): `function (err, msg) { }`

**Returns:**  

* (none)

**Examples:** 

```js
cnode.on('registered', function () {
    console.log('registered');
});

cnode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);
});
```
*************************************************
<a name="API_setDevAttrs"></a>
### setDevAttrs(attrs[, callback])


**Arguments:**  

1. `attrs` (_Object_): device attributes.

    |  Property  | Type   | Required |
    |------------|--------|----------|
    | `ip`       | String | No       |
    | `lifetime` | Number | No       | 
    | `version`  | String | No       |

2. `callback` (_Function_): `function (err, msg) { }`

**Returns:**  

* (none)

**Examples:** 

```js
coapNode.on('update', function (msg) {
    console.log('update');
});

coapNode.setDevAttrs({ lifetime: 12000 }, function (err, msg) {
    console.log(msg);
});
```
*************************************************
<a name="API_deregister"></a>
### deregister([callback])


**Arguments:**  

1. `callback` (_Function_): `function (err, msg) { }`

**Returns:**  

* (none)

**Examples:** 

```js
coapNode.on('deregistered', function (msg) {
    console.log('deregistered');
});

coapNode.deregister(function (err, msg) {
    console.log(msg);
});
```
