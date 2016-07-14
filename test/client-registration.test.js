var expect = require('chai').expect,
    _ = require('busyman'),
    fs = require('fs'),
    SmartObject = require('smartobject'),
    shepherd = require('coap-shepherd');

var CoapNode = require('../lib/coap-node');

var so = new SmartObject();

var node = new CoapNode('utNode', so);

shepherd.on('error', function (err) {
    console.log(err);
});

node.on('error', function (err) {
    console.log(err);
});

describe('coap-node registration test', function() {
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
    });

    describe('coap-node tries to register', function() {

        it('register - register', function (done) {
            shepherd.permitJoin(300);

            var devRegHdlr = function (msg) {
                    switch(msg.type) {
                        case 'registered':
                            if (msg.data.clientName === 'utNode') {
                                shepherd.removeListener('ind', devRegHdlr);
                                done(); 
                            }
                            break;
                        default:
                            break;
                    }
                };

            shepherd.on('ind', devRegHdlr);

            node.register('127.0.0.1', 5683, function (err, msg) {
                var cn;
                if (msg.status === '2.01' || msg.status === '2.04') {
                    cn = shepherd.find('utNode');
                    expect(cn._registered).to.be.eql(true);
                }
            });
        });

        it('register - register again', function (done) {
            var devRegHdlr = function (msg) {
                switch(msg.type) {
                    case 'registered':
                        if (msg.data.clientName === 'utNode') {
                            shepherd.removeListener('ind', devRegHdlr);
                            done(); 
                        }
                        break;
                    default:
                        break;
                }
            };

            shepherd.on('ind', devRegHdlr);

            node.register('127.0.0.1', 5683, function (err, msg) {
                expect(msg.status).to.be.eql('2.04');
            });
        });
    });

    describe('coap-node tries to setDevAttrs', function() {
        it('setDevAttrs - update', function (done) {
            var devUpdateHdlr = function (msg) {
                switch(msg.type) {
                    case 'update':
                        if (msg.data.device === 'utNode') {
                            expect(msg.data.lifetime).to.be.eql(60000);
                            shepherd.removeListener('ind', devUpdateHdlr);
                            done(); 
                        }
                        break;
                    default:
                        break;
                }
            };

            shepherd.on('ind', devUpdateHdlr);

            node.setDevAttrs({ lifetime: 60000 }, function (err, msg) {
                if (msg.status === '2.04') {
                    expect(node.lifetime).to.be.eql(60000);
                }
            });
        });

        it('setDevAttrs - change port', function (done) {
            node.setDevAttrs({}, function (err, msg) {
                if (msg.status === '2.04') {
                    done();
                }
            });
        });

        it('setDevAttrs - bed req', function (done) {
            node.setDevAttrs({ name: 'peter' }, function (err, msg) {
                if (msg.status === '4.00') {
                    done();
                }
            });
        });
    });

    describe('coap-node tries to deregister', function() {
        it('deregister - deregister', function (done) {
            var devDeregHdlr = function (msg) {
                var cn;

                switch(msg.type) {
                    case 'deregistered':
                        if (msg.data === 'utNode') {
                            shepherd.removeListener('ind', devDeregHdlr);
                            cn = shepherd.find('utNode');
                            expect(cn).to.be.eql(undefined);
                            done(); 
                        }
                        break;
                    default:
                        break;
                }
            };

            shepherd.on('ind', devDeregHdlr);

            node.deregister(function (err, msg) {});
        });

        it('deregister - deregister again', function (done) {
            node.deregister(function (err, msg) {
                if (msg.status === '4.04') {
                    done();
                }
            });
        });

        it('deregister - setDevAttrs after deregister', function (done) {
            node.setDevAttrs({ lifetime: 12000 }, function (err, msg) {
                if (msg.status === '4.04') {
                    done();
                }
            });
        });
    });

    describe('stop', function() {
        it('stop - shepherd', function (done) {
            shepherd.stop(function () {
                done();
            });
        });
    });

});
