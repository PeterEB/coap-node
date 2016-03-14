var CoapNode = require('./lib/coap-node.js');

var coapNode = new CoapNode('nodeTest');

coapNode.on('registed', function () {
    console.log('registed');

    setInterval(function () {
        coapNode._dumpObj(3303, 0, function (err, data) {
            console.log(data);
        });
    }, 30000);
});

coapNode.on('deregisted', function (msg) {
    console.log('deregisted');
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

// setTimeout(function () {
//     coapNode.initResrc(3303, 1, {
//         5700: 89,
//         5701: 'F'
//     });

//     coapNode.setDevAttrs({}, function (err, msg) {
//         console.log(msg);
//     });
// }, 40000);
