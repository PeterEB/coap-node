var expect = require('chai').expect,
    _ = require('busyman'),
    fs = require('fs'),
    SmartObject = require('smartobject'),
    shepherd = require('coap-shepherd');

var CoapNode = require('../lib/coap-node');

var so = new SmartObject();
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

so.init('temperature', 0, iObj);

var node = new CoapNode('utNode', so),
    remoteNode;

shepherd.on('error', function (err) {
    console.log(err);
});

node.on('error', function (err) {
    console.log(err);
});

describe('coap-node device-managment test', function() {
    this.timeout(15000);

    describe('start connection test', function() {
        it('reset database', function (done) {
            var dbPath = '../lib/database/coap.db';
            fs.exists(dbPath, function (isThere) {
                if (isThere) { fs.unlink(dbPath); }
                done();
            });
        });

        it('start - shepherd', function (done) {
            shepherd.start(function () {
                done();
            });
        });

        it('register - node', function (done) {
            shepherd.permitJoin(300);

            var devRegHdlr = function (msg) {
                    switch(msg.type) {
                        case 'registered':
                            if (msg.data.clientName === 'utNode') {
                                shepherd.removeListener('ind', devRegHdlr);
                                remoteNode = shepherd.find('utNode');
                                expect(remoteNode._registered).to.be.true;
                                done(); 
                            }
                            break;
                        default:
                            break;
                    }
                };

            shepherd.on('ind', devRegHdlr);

            node.register('127.0.0.1', 5683, function (err, msg) {});
        });
    });

    describe('coap-shepherd tries to read', function() {
        it('read - resource', function (done) {
            remoteNode.readReq('/temperature/0/sensorValue', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(21);
                    done();
                }
            });
        });

        it('read - resource is unreadable', function (done) {
            remoteNode.readReq('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.05') {
                    expect(msg.data).to.be.eql('_unreadable_');
                    done();
                }
            });
        });

        it('read - resource is exec', function (done) {
            remoteNode.readReq('/temperature/0/5704', function (err, msg) {
                if (msg.status === '4.05') {
                    expect(msg.data).to.be.eql('_exec_');
                    done();
                }
            });
        });

        it('read - instence', function (done) {
            remoteNode.readReq('/temperature/0', function (err, msg) {
                var inst = {
                        sensorValue: 21,
                        units: 'C',
                        5702: '2016/03/18',
                        5703: '_unreadable_',
                        5704: '_exec_'
                    };

                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(inst);
                    done();
                }
            });
        });

        it('read - object', function (done) {
            remoteNode.readReq('/temperature', function (err, msg) {
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
                    expect(msg.data).to.be.eql(obj);
                    done();
                }
            });
        });

        it('read - bad path', function (done) {
            remoteNode.readReq(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to write', function() {
        it('write - resource', function (done) {
            remoteNode.writeReq('/temperature/0/sensorValue', 19, function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        it('write - resource is unwriteable', function (done) {
            remoteNode.writeReq('/temperature/0/5702', 'x', function (err, msg) {
                console.log(msg);
                if (msg.status === '4.05') done();
            });
        });

        it('write - resource is exec', function (done) {
            remoteNode.writeReq('/temperature/0/5704', 'x', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('write - instence', function (done) {
            var inst = {
                    5700: 21,
                    5701: 'C',
                    5703: 'x'
                };

            remoteNode.writeReq('/temperature/0', inst, function (err, msg) {
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

            remoteNode.writeReq('/temperature/0', inst, function (err, msg) {
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

            remoteNode.writeReq('/temperature', obj, function (err, msg) {
                if (err) done();
            });
        });

        it('write - bad path', function (done) {
            remoteNode.writeReq(3303, 'x', function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to execute', function() {
        it('execute - resource with argus', function (done) {
            remoteNode.executeReq('/temperature/0/5704', ['peter', 'world'], function (err, msg) {
                if (msg.status === '2.04') done();
            });
        });

        // it('execute - resource without argus', function (done) {
        //     remoteNode.execute('/temperature/0/5704', function (err, msg) {
        //         if (msg.status === '2.04') done();
        //     });
        // });

        it('execute - not allowed argus', function (done) {
            remoteNode.executeReq('/temperature/0/5703', [ ' ' ], function (err, msg) {
                if (msg.status === '4.00') done();
            });
        });

        it('execute - resource is unexecutable', function (done) {
            remoteNode.executeReq('/temperature/0/5702', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('execute - instence', function (done) {
            remoteNode.executeReq('/temperature/0', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - object', function (done) {
            remoteNode.executeReq('/temperature', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - bad path', function (done) {
            remoteNode.executeReq(3303, 'x', function (err, msg) {
                if (err) done();
            });
        });

        it('execute - bad argus', function (done) {
            remoteNode.executeReq('/temperature/0/5703', 'x', function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to discover', function() {
        it('discover - resource', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 }
                };

            remoteNode.discoverReq('/temperature/0/sensorValue', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(result);
                    done();
                }
            });
        });

        it('discover - instence', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 },
                    resrcList: { 0: ['5702', '5703', '5704', 'sensorValue', 'units'] } 
                };
            
            remoteNode.discoverReq('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(result);
                    done();
                }
            });
        });

        it('discover - object', function (done) {
            var result = { 
                    attrs: { pmin: 0, pmax: 60 },
                    resrcList: { 0: ['5702', '5703', '5704', 'sensorValue', 'units'] } 
                };
            
            remoteNode.discoverReq('/temperature', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(result);
                    done();
                }
            });
        });

        it('discover - bad path', function (done) {
            remoteNode.discoverReq(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to writeAttrs', function() {
        it('writeAttrs - resource', function (done) {
            var attrs = {
                pmin: 5,
                pmax: 90,
                gt: 0,
                lt: 100,
                stp: 0.5
            };

            remoteNode.writeAttrsReq('/temperature/0/sensorValue', attrs, function (err, msg) {
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
                    
            remoteNode.writeAttrsReq('/temperature/0', attrs, function (err, msg) {
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
            
            remoteNode.writeAttrsReq('/temperature', attrs, function (err, msg) {
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
            
            remoteNode.writeAttrsReq(3303, attrs, function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {
            remoteNode.writeAttrsReq('/temperature/0/sensorValue', 'x', function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {          
            remoteNode.writeAttrsReq('/temperature/0/sensorValue', [ 10 ], function (err, msg) {
                if (err) done();
            });
        });

        it('writeAttrs - bad attrs', function (done) {
            var attrs = { x: 100 };
            
            remoteNode.writeAttrsReq('/temperature/0/sensorValue', attrs, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to observe', function() {
        it('observe - resource', function (done) {
            var devNotifyHdlr = function (msg) {
                    switch(msg.type) {
                        case 'notify':
                            if (msg.data.device === 'utNode') {
                                expect(msg.data.path).to.be.eql('/temperature/0/units');
                                expect(msg.data.value).to.be.eql('F');
                                shepherd.removeListener('ind', devNotifyHdlr);
                                done(); 
                            }
                            break;
                        default:
                            break;
                    }
                };

            shepherd.on('ind', devNotifyHdlr);

            remoteNode.observeReq('/temperature/0/units', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql('C');
                    remoteNode.writeReq('/temperature/0/units', 'F', function (err, msg) {});
                }
            });
        });

        it('observe - resource is unreadable', function (done) {
            remoteNode.observeReq('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.05') {
                    done();
                }
            });
        });

        it('observe - resource is exec', function (done) {
            remoteNode.observeReq('/temperature/0/5704', function (err, msg) {
                if (msg.status === '4.05') {
                    done();
                }
            });
        });

        it('observe - resource is observed', function (done) {
            remoteNode.observeReq('/temperature/0/units', function (err, msg) {
                if (msg.status === '2.00') {
                    done();
                }
            });
        });

        it('observe - instence', function (done) {
            var reqObj = {
                    sensorValue: 21,
                    units: 'F',
                    5702: '2016/03/18',
                    5703: '_unreadable_',
                    5704: '_exec_'
                },
                reqObj2 = {
                    sensorValue: 22,
                    units: 'F',
                    5702: '2016/03/18',
                    5703: '_unreadable_',
                    5704: '_exec_'
                };

            var devNotifyHdlr = function (msg) {
                    switch(msg.type) {
                        case 'notify':
                            if (msg.data.path === '/temperature/0') {
                                expect(msg.data.value).to.be.eql(reqObj2);
                                shepherd.removeListener('ind', devNotifyHdlr);
                                done(); 
                            }
                            break;
                        default:
                            break;
                    }
                };

            shepherd.on('ind', devNotifyHdlr);

            remoteNode.observeReq('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') {
                    expect(msg.data).to.be.eql(reqObj);
                    remoteNode.writeReq('/temperature/0/sensorValue', 22, function (err, msg) {});
                }
            });
        });

        it('observe - object', function (done) {
            remoteNode.observeReq('/temperature', function (err, msg) {
                if (msg.status === '4.05') 
                    done();
            });
        });

        it('observe - bad path', function (done) {
            remoteNode.observeReq(3303, function (err, msg) {
                if (err) done();
            });
        });
    });

    describe('coap-shepherd tries to cancelObserve', function() {
        it('cancelObserve - resource', function (done) {
            remoteNode.cancelObserveReq('/temperature/0/units', function (err, msg) {
                if (msg.status === '2.05') done();
            });
        });

        it('cancelObserve - resource is not observed', function (done) {
            remoteNode.cancelObserveReq('/temperature/0/5703', function (err, msg) {
                if (msg.status === '4.04') done();
            });
        });

        it('cancelObserve - instence', function (done) {
            remoteNode.cancelObserveReq('/temperature/0', function (err, msg) {
                if (msg.status === '2.05') done();
            });
        });

        it('cancelObserve - object', function (done) {
            remoteNode.cancelObserveReq('/temperature', function (err, msg) {
                if (msg.status === '4.05') done();
            });
        });

        it('cancelObserve - bad path', function (done) {
            remoteNode.cancelObserveReq(3303, function (err, msg) {
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
