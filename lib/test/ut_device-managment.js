var should = require('should'),
    _ = require('lodash'),
    shepherd = require('coap-shepherd');

var CoapNode = require('../coap-node');

var node = new CoapNode('utNode');

var remoteNode;

var iObj = {
    sensorValue: 21,
    units: 'C',
    5702: { 
        read: function (cb) {
            var time = '2016/03/18';
            cb(null, time);
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
};

describe('coap-node device-managment test', function() {
    this.timeout(15000);
    
    describe('coap-node tries to init resource', function() {
        it('initResrc - initResrc', function (done) {
            node.initResrc('temperature', 0, iObj);
            should(node.so.temperature[0]).be.eql(iObj);
            done();
        });

        it('initResrc - wrong oid', function (done) {
            (function () { return node.initResrc([], 0, iObj); }).should.throw();
            (function () { return node.initResrc({}, 0, iObj); }).should.throw();
            done();
        });

        it('initResrc - wrong resrc', function (done) {
            (function () { return node.initResrc('temperature', 0, 'x'); }).should.throw();
            (function () { return node.initResrc('temperature', 0, 1); }).should.throw();
            (function () { return node.initResrc('temperature', 0, []); }).should.throw();
            (function () { return node.initResrc('temperature', 0, function () {}); }).should.throw();
            done();
        });
    });

    describe('start connection test', function() {
        it('start - shepherd', function (done) {
            shepherd.start(function () {
                done();
            });
        });

        it('register - node', function (done) {
            node.register('127.0.0.1', '5683', function (err, msg) {
                if (msg.status === '2.01' || msg.status === '2.04') {
                    remoteNode = shepherd.find('utNode');
                    should(remoteNode._registered).be.eql(true);
                    done();
                }
            });
        });
    });

    describe('coap-shepherd tries to read', function() {
        it('read - resource', function (done) {
            remoteNode.read('/temperature/0/sensorValue', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql(21);
                    done();
                }
            });
        });

        it('read - resource is unreadable', function (done) {
            remoteNode.read('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.05') {
                    should(msg.data).be.eql('_unreadable_');
                    done();
                }
            });
        });

        it('read - resource is exec', function (done) {
            remoteNode.read('/temperature/0/5704', function (err, msg) {
                if (msg.status === '4.05') {
                    should(msg.data).be.eql('_exec_');
                    done();
                }
            });
        });

        it('read - instence', function (done) {
            remoteNode.read('/temperature/0', function (err, msg) {
                var inst = {
                        5700: 21,
                        5701: 'C',
                        5702: '2016/03/18',
                        5703: '_unreadable_',
                        5704: '_exec_'
                    };

                if (msg.status === '2.05') {
                    should(msg.data).be.eql(inst);
                    done();
                }
            });
        });

        it('read - object', function (done) {
            remoteNode.read('/temperature', function (err, msg) {
                var obj = {
                    0: {
                            5700: 21,
                            5701: 'C',
                            5702: '2016/03/18',
                            5703: '_unreadable_',
                            5704: '_exec_'
                        }
                    };

                if (msg.status === '2.05') {
                    should(msg.data).be.eql(obj);
                    done();
                }
            });
        });
    });

    describe('stop', function() {
        it('deregister - node', function (done) {
            node.deregister(function (err, msg) {
                if (msg.status === '2.02') {
                    done();
                }
            });
        });

        it('stop - shepherd', function (done) {
            shepherd.stop(function () {
                done();
            });
        });
    });

});
