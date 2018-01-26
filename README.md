# coap-node
Client node of lightweight M2M (LWM2M).

[![NPM](https://nodei.co/npm/coap-node.png?downloads=true)](https://nodei.co/npm/coap-node/)  

[![Build Status](https://travis-ci.org/PeterEB/coap-node.svg?branch=develop)](https://travis-ci.org/PeterEB/coap-node)
[![npm](https://img.shields.io/npm/v/coap-node.svg?maxAge=2592000)](https://www.npmjs.com/package/coap-node)
[![npm](https://img.shields.io/npm/l/coap-node.svg?maxAge=2592000)](https://www.npmjs.com/package/coap-node)

<br />

## Documentation  

Please visit the [Wiki](https://github.com/PeterEB/coap-node/wiki).

<br />

## Overview

[**OMA Lightweight M2M**](http://technical.openmobilealliance.org/Technical/technical-information/release-program/current-releases/oma-lightweightm2m-v1-0) (LWM2M) is a resource constrained device management protocol relies on [**CoAP**](https://tools.ietf.org/html/rfc7252). And **CoAP** is an application layer protocol that allows devices to communicate with each other RESTfully over the Internet.  

**coap-shepherd**, **coap-node** and **lwm2m-bs-server** modules aim to provide a simple way to build and manage a **LWM2M** machine network. 
* Server-side library: [**coap-shepherd**](https://github.com/PeterEB/coap-shepherd)
* Client-side library: **coap-node** (this module)
* Bootstrap server library: [**lwm2m-bs-server**](https://github.com/PeterEB/lwm2m-bs-server)
* [**A simple demo webapp**](https://github.com/PeterEB/quick-demo)

![coap-shepherd net](https://raw.githubusercontent.com/PeterEB/documents/master/coap-shepherd/media/lwm2m_net.png)  

### LWM2M Client: coap-node

* It is an implementation of LWM2M Client managed by a **coap-shepherd** Server.
* It follows most parts of **LWM2M** specification to meet the requirements of a machine network and devices management.
* It works well with [**Leshan**](https://github.com/eclipse/leshan).
* Support mulitple servers, factory bootstrap and client initiated bootstrap.
* It uses [smartobject](https://github.com/PeterEB/smartobject) as its fundamental of resource organizing on devices. **smartobject** can help you create smart objects with IPSO data model, and it also provides a scheme to help you abstract your hardware into smart objects. You may like to use **smartobject** to create many plugins for your own hardware or modules, i.e., temperature sensor, humidity sensor, light control. Here is a [tutorual of how to plan resources](https://github.com/PeterEB/smartobject/blob/master/docs/resource_plan.md) with smartobject.

<br />

## Installation

> $ npm install coap-node --save

<br />

## Usage

Client-side example (the following example is how you use `coap-node` on a machine node):

* Step 1: Resources initialzation.
```js
var SmartObject = require('smartobject');

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
```

* Step 2: Client device initialzation.
```js
var CoapNode = require('coap-node');

// Instantiate a machine node with a client name and your smart object
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

<br />

## License

Licensed under [MIT](https://github.com/PeterEB/coap-node/blob/master/LICENSE).
