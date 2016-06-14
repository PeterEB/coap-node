var should = require('should'),
    _ = require('lodash'),
    shepherd = require('coap-shepherd');

var CoapNode = require('../lib/coap-node');

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

shepherd.on('error', function (err) {
    console.log(err);
});

node.on('error', function (err) {
    console.log(err);
});

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
        shepherd._net.port = 9042;
        shepherd._clientDefaultPort = 9043;

        it('start - shepherd', function (done) {
            shepherd.start(function () {
                done();
            });
        });

        node.port = 9043;

        it('register - node', function (done) {
            shepherd.permitJoin(300);

            node.start(function () {
                node.register('127.0.0.1', 9042, function (err, msg) {
                    if (msg.status === '2.01' || msg.status === '2.04') {
                        remoteNode = shepherd.find('utNode');
                        should(remoteNode._registered).be.eql(true);
                        done();
                    }
                });
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
                        sensorValue: 21,
                        units: 'C',
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
                            sensorValue: 21,
                            units: 'C',
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

        it('read - bad path', function (done) {
            remoteNode.read(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to write', function() {
        it('write - resource', function (done) {
            remoteNode.write('/temperature/0/sensorValue', 19, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('write - resource is unwriteable', function (done) {
            remoteNode.write('/temperature/0/5702', 'x', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('write - resource is exec', function (done) {
            remoteNode.write('/temperature/0/5704', 'x', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('write - instence', function (done) {
            var inst = {
                    5700: 21,
                    5701: 'C',
                    5703: 'x'
                };

            remoteNode.write('/temperature/0', inst, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('write - instence with unwriteable', function (done) {
            var inst = {
                    5700: 21,
                    5701: 'C',
                    5702: 'x',
                    5703: 'x',
                    5704: 'x'
                };

            remoteNode.write('/temperature/0', inst, function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('write - object', function (done) {
            var obj = {
                0: {
                        5700: 21,
                        5701: 'C',
                        5702: '2016/03/18',
                        5703: '_unreadable_',
                        5704: '_exec_'
                    }
                };

            remoteNode.write('/temperature', obj, function (err, msg) {
                if (err) done();
            });
        });

        it('write - bad path', function (done) {
            remoteNode.write(3303, 'x', function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to execute', function() {
        it('execute - resource with argus', function (done) {
            remoteNode.execute('/temperature/0/5704', ['peter', 'world'], function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        // it('execute - resource without argus', function (done) {
        //     remoteNode.execute('/temperature/0/5704', function (err, msg) {
        //         if (msg.status === '2.04') done();
        //     });
        // });

        it('execute - resource is unexecutable', function (done) {
            remoteNode.execute('/temperature/0/5702', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('execute - instence', function (done) {
            remoteNode.execute('/temperature/0', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - object', function (done) {
            remoteNode.execute('/temperature', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - bad path', function (done) {
            remoteNode.execute(3303, 'x', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - bad argus', function (done) {
            remoteNode.execute('/temperature/0/5703', 'x', function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to discover', function() {
        it('discover - resource', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 }
                };

            remoteNode.discover('/temperature/0/sensorValue', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql(result);
                    done();
                }
            });
        });

        it('discover - instence', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 },
                    resrcList: { 0: ['5702', '5703', '5704', 'sensorValue', 'units'] } 
                };
            
            remoteNode.discover('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql(result);
                    done();
                }
            });
        });

        it('discover - object', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 },
                    resrcList: { 0: ['5702', '5703', '5704', 'sensorValue', 'units'] } 
                };
            
            remoteNode.discover('/temperature', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql(result);
                    done();
                }
            });
        });

        it('discover - bad path', function (done) {
            remoteNode.discover(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to writeAttrs', function() {
        it('writeAttrs - resource', function (done) {
            var attrs = {
                pmin: 10,
                pmax: 90,
                gt: 0,
                lt: 100,
                stp: 0.5
            };

            remoteNode.writeAttrs('/temperature/0/sensorValue', attrs, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('writeAttrs - instence', function (done) {  
            var attrs = {
                pmin: 10,
                pmax: 90,
                gt: 0,
                lt: 100,
                stp: 0.5
            };
                    
            remoteNode.writeAttrs('/temperature/0', attrs, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('writeAttrs - object', function (done) {
            var attrs = {
                pmin: 10,
                pmax: 90,
                gt: 0,
                lt: 100,
                stp: 0.5
            };
            
            remoteNode.writeAttrs('/temperature', attrs, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('writeAttrs - bad path', function (done) {
            var attrs = {
                pmin: 10,
                pmax: 90,
                gt: 0,
                lt: 100,
                stp: 0.5
            };
            
            remoteNode.writeAttrs(3303, attrs, function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {
            remoteNode.writeAttrs('/temperature/0/sensorValue', 'x', function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {          
            remoteNode.writeAttrs('/temperature/0/sensorValue', [ 10 ], function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {
            var attrs = { x: 100 };
            
            remoteNode.writeAttrs('/temperature/0/sensorValue', attrs, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to observe', function() {
        it('observe - resource', function (done) {
            remoteNode.observe('/temperature/0/5702', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql('2016/03/18');
                    done();
                }
            });
        });

        it('observe - resource is unreadable', function (done) {
            remoteNode.observe('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.05') {
                    done();
                }
            });
        });

        it('observe - resource is exec', function (done) {
            remoteNode.observe('/temperature/0/5704', function (err, msg) {
                if (msg.status === '4.05') {
                    done();
                }
            });
        });

        it('observe - resource is observed', function (done) {
            remoteNode.observe('/temperature/0/5702', function (err, msg) {
                if (msg.status === '2.00') {
                    done();
                }
            });
        });

        it('observe - instence', function (done) {
            var reqObj = {
                    sensorValue: 21,
                    units: 'C',
                    5702: '2016/03/18',
                    5703: '_unreadable_',
                    5704: '_exec_'
                };

            remoteNode.observe('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') {
                    should(msg.data).be.eql(reqObj);
                    done();
                }
            });
        });

        it('observe - object', function (done) {
            remoteNode.observe('/temperature', function (err, msg) {
                if (msg.status === '4.05') 
                    done();
            });
        });

        it('observe - bad path', function (done) {
            remoteNode.observe(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to cancelObserve', function() {
        it('cancelObserve - resource', function (done) {
            remoteNode.cancelObserve('/temperature/0/5702', function (err, msg) {
                if (msg.status === '2.05') done();
            });
        });

        it('cancelObserve - resource is not observed', function (done) {
            remoteNode.cancelObserve('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.04') done();
            });
        });

        it('cancelObserve - instence', function (done) {
            remoteNode.cancelObserve('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') done();
            });
        });

        it('cancelObserve - object', function (done) {
            remoteNode.cancelObserve('/temperature', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('cancelObserve - bad path', function (done) {
            remoteNode.cancelObserve(3303, function (err, msg) {
                if (err) done();
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
