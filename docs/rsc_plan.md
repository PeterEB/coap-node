Resources Planning Tutorial
========================

To initialize your Resources, use `initResrc(oid, iid, resrcs)` method, where parameters:
* `oid` is the the Object identifier
* `iid` is the Object Instance identifier
* `resrcs` is an object containing all Resources in this Object Instance. Each key in this object should be an `rid` and each value is its corresponding Resource value.  

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

If your Resource is a primitive value, it will be inherently readable and writable.

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