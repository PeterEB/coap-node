var CoapNode = require('./lib/coap-node.js');

var coapNode = new CoapNode('nodeTest');

coapNode.on('ready', function (msg) {
    console.log('ready');
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
    5702: {'a': 1, 'b': 2},
    5703: { exec: function (val1, val2, cb) {
        console.log(val1 + val2);
        cb(null, 'good');
    }}
});

coapNode.initResrc(3303, 1, {
    5700: 89,
    5701: 'F'
});

coapNode.register('127.0.0.1', 5683, function (err, msg) {
    console.log(msg);
});
