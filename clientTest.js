var CoapNode = require('./lib/coap-node.js');

var coapNode = new CoapNode('nodeTest');

coapNode.on('registered', function () {
    console.log('registered');
});

coapNode.on('deregistered', function (msg) {
    console.log('deregistered');
});

coapNode.on('update', function (msg) {
    console.log('update');
});

coapNode.initResrc(3303, 0, {
    sensorValue: 21,
    units: 'C',
    5702: { 
        read: function (cb) {
            var time = new Date();
            cb(null, time.toString());
        }
    },
    5703: { 
        write: function (val, cb) {
            console.log('write ' + val);
            cb(null, val);
        }
    },
    5704: { 
        exec: function (val1, val2, cb) {
            console.log(val1 + ': Hello ' + val2 + '!');
            cb(null);
        }
    }
});

coapNode.initResrc(3303, 1, {
    5700: 89,
    5701: 'F'
});

coapNode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);
});


// setDevAttrs test
// setTimeout(function () {
//     coapNode.setDevAttrs({ lifetime: 85741 }, function (err, msg) {
//         console.log(msg);
//     });
// }, 10000);

// update test
// setTimeout(function () {
//     coapNode.update({ lifetime: 86400 }, function (err, msg) {
//         console.log(msg);
//     });
// }, 20000);

// deregister test
// setTimeout(function () {
//     coapNode.deregister(function (err, msg) {
//         console.log(msg);
//     });
// }, 30000);
