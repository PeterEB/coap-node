var CoapNode = require('./lib/coap-node.js');

var coapNode = new CoapNode('nodeTest');

coapNode.on('ready', function (msg) {
    console.log('ready');

    setInterval(function () {
        coapNode._dumpObj(3303, 0, function (err, data) {
            console.log(data);
        });
    }, 30000);
});

coapNode.on('close', function (msg) {
    console.log('close');
});

coapNode.on('update', function (msg) {
    console.log('update');
});

coapNode.initResrc(3303, 0, {
    5700: 21,
    5701: 'C',
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
            console.log(val1 + val2);
            cb(null, 'good');
        }
    }
});



coapNode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg.status);
});

// setTimeout(function () {
//     coapNode.initResrc(3303, 1, {
//         5700: 89,
//         5701: 'F'
//     });
// }, 10000);

// setTimeout(function () {
//     coapNode.setDevAttrs({}, function (err, msg) {
//         console.log(msg);
//     });
// }, 20000);