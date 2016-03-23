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

* Communication based on CoAP protocol and library [node-coap](https://github.com/mcollina/node-coap)
* LWM2M interfaces for Client/Server interaction

<a name="Installation"></a>
## 3. Installation

> $ npm install coap-node --save

<a name="Usage"></a>
## 4. Usage

Client-side exmaple (the following example is how to use `coap-node`):

```js

```

Server-side example (please go to [coap-shepherd](https://github.com/PeterEB/coap-shepherd) document for details):

```js

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
Exposed by require('coap-node').

*************************************************
<a name="API_CoapNode"></a>
### new CoapNode(clientName)

**Arguments:**  

1. `clientName` (_String_):

**Returns:**  

* (none)

**Examples:** 

```js

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

```
*************************************************
<a name="API_readResrc"></a>
### readResrc(oid, iid, rid[, callback])

**Arguments:**  

1. `oid` (_String_ | _Number_):

2. `iid` (_String_ | _Number_):

3. `rid` (_String_ | _Number_):

4. `callback` (_Function_):

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

5. `callback` (_Function_):

**Returns:**  

* (none)

**Examples:** 

```js

```
*************************************************
<a name="API_register"></a>
### register(ip, port[, callback])

**Arguments:**  

1. `ip` (_String_):

2. `port` (_String_ | _Number_):

3. `callback` (_Function_):

**Returns:**  

* (none)

**Examples:** 

```js

```
*************************************************
<a name="API_setDevAttrs"></a>
### setDevAttrs(attrs[, callback])

**Arguments:**  

1. `attrs` (_Object_):

2. `callback` (_Function_):

**Returns:**  

* (none)

**Examples:** 

```js

```
*************************************************
<a name="API_deregister"></a>
### deregister([callback])

**Arguments:**  

1. `callback` (_Function_):

**Returns:**  

* (none)

**Examples:** 

```js

```
