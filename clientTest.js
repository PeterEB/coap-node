var CoapNode = require('./index.js'),
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

var coapNode = new CoapNode('nodeTest', so);

coapNode.on('registered', function () {
    console.log('registered');
});

coapNode.on('deregistered', function (msg) {
    console.log('deregistered');
});

coapNode.on('updated', function (msg) {
    console.log('updated');
});

coapNode.on('error', function (err) {
    throw err;
    // console.log('error: ' + err);
});

coapNode.register('127.0.0.1', 5683, function (err, rsp) {
    console.log(rsp);
});

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

// setDevAttrs test
// setTimeout(function () {
//     coapNode.setDevAttrs({ lifetime: 85741 }, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 15000);

// update test
// setTimeout(function () {
//     coapNode._update({ lifetime: 86400 }, function (err, rsp) {
//         console.log(rsp);
//     });
// }, 20000);

// // deregister test
// setTimeout(function () {
//     coapNode.deregister(function (err, rsp) {
//         console.log(rsp);
//     });
// }, 30000);

setTimeout(function () {
    coapNode.checkOut(10, function (err, rsp) {
        console.log(rsp);
    });
}, 5000);

setTimeout(function () {
    coapNode.checkIn(function (err, rsp) {
        console.log(rsp);
    });
}, 15000);