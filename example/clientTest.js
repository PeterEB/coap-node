var CoapNode = require('../index.js'),
    SmartObject = require('smartobject');

var so = new SmartObject();

so.init(3303, 0, {
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

so.init(3303, 1, {
    5700: 70,
    5701: 'F'
});

var coapNode = new CoapNode('coap-node-test', so, { lifetime: 300 });

coapNode.on('registered', function () {
    console.log('registered');
});

coapNode.on('deregistered', function (msg) {
    console.log('deregistered');
});

coapNode.on('login', function (msg) {
    console.log('login');
});

coapNode.on('logout', function (msg) {
    console.log('logout');
});

coapNode.on('offline', function (msg) {
    console.log('offline');
});

coapNode.on('reconnect', function (msg) {
    console.log('reconnect');
});

coapNode.on('error', function (err) {
    console.log(err);
});

coapNode.register('leshan.eclipse.org', 5683, function (err, rsp) {
    console.log(rsp);
});

// coapNode.register('127.0.0.1', 5683, function (err, rsp) {
//     console.log(rsp);
// });

// setInterval(function () {
//     so.read(3303, 0, 5702, function () {});
// }, 3000);

// setTimeout(function () {
//     coapNode.register('127.0.0.1', 5683, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 5000);

// setTimeout(function () {
//     coapNode.register('127.0.0.1', 5683, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 10000);

// update test
// setTimeout(function () {
//     coapNode.update({ lifetime: 85741 }, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 15000);

// // deregister test
// setTimeout(function () {
//     coapNode.deregister(function (err, rsp) {
//         console.log(rsp);
//     });
// }, 20000);

// setTimeout(function () {
//     coapNode.checkout(10, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 5000);

// setTimeout(function () {
//     coapNode.checkin(function (err, rsp) {
//         console.log(rsp);
//     });
// }, 15000);
