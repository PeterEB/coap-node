var fs = require('fs'),
    path = require('path'),
    _ = require('busyman'),
    expect = require('chai').expect,
    SmartObject = require('smartobject'),
    shepherd = require('coap-shepherd');

var CoapNode = require('../index');

var so = new SmartObject();

var node = new CoapNode('utNode', so);

describe('coap-node - Functional Check', function() {
    this.timeout(15000);

    before(function (done) {
        try {
            fs.unlinkSync(path.resolve('./node_modules/coap-shepherd/lib/database/coap.db'));
        } catch (e) {
            console.log(e);
        }

        shepherd.start(function () {
            done();
        });
    });

    describe('#.register()', function() {
        it('should register device and return msg with status 2.01', function (done) {
            shepherd.permitJoin(300);

            var devRegHdlr = function (msg) {
                    switch(msg.type) {
                        case 'devIncoming':
                            if (msg.cnode.clientName === 'utNode') {
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
                if (msg.status === '2.01') {
                    cn = shepherd.find('utNode');
                    expect(cn._registered).to.be.eql(true);
                }
            });
        });

        it('should register device again and return msg with status 2.01', function (done) {
            node.register('127.0.0.1', 5683, function (err, msg) {
                expect(msg.status).to.be.eql('2.01');
                done();
            });
        });
    });

    describe('#.update()', function() {
        it('should update device attrs and return msg with status 2.04', function (done) {
            var devUpdateHdlr = function (msg) {
                switch(msg.type) {
                    case 'devUpdate':
                        if (msg.cnode.clientName === 'utNode') {
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

            node.update({ lifetime: 60000 }, function (err, msg) {
                if (msg[0].status === '2.04') {
                    expect(node.lifetime).to.be.eql(60000);
                }
            });
        });

        it('should update device port and return msg with status 2.04', function (done) {
            node.update({}, function (err, msg) {
                if (msg[0].status === '2.04') {
                    done();
                }
            });
        });

        it('should return msg with status 4.00 when the attrs is bad', function (done) {
            node.update({ name: 'peter' }, function (err, msg) {
                if (err) {
                    done();
                }
            });
        });
    });

    describe('#.checkout()', function () {
        it('should chect out and _sleep will be true', function (done) {
            node.checkout(function (err, msg) {
                if (msg[0].status === '2.04') {
                    expect(node._sleep).to.be.eql(true);
                    done();
                }
           });
        });

        it('should chect out and _sleep will be true with duration', function (done) {
            node.checkout(10, function (err, msg) {
                if (msg[0].status === '2.04') {
                    expect(node._sleep).to.be.eql(true);
                    done();
                }
           });
        });
    });

    describe('#.checkin()', function () {
        it('should chect in and _sleep will be false', function (done) {
            node.checkin(function (err, msg) {
                if (msg[0].status === '2.04') {
                    expect(node._sleep).to.be.eql(false);
                    done();
                }
            }); 
        });
    });

    describe('#.deregister()', function() {
        it('should deregister device and return msg with status 2.02', function (done) {
            var devDeregHdlr = function (msg) {
                var cn;

                switch(msg.type) {
                    case 'devLeaving':
                        if (msg.cnode === 'utNode') {
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

            node.deregister(function (err, msg) {
                expect(msg[0].status).to.be.eql('2.02');
            });
        });

        it('should return msg with status 4.04 when the device is not registered', function (done) {
            node.deregister(function (err, msg) {
                if (msg[0].status === '4.04') {
                    done();
                }
            });
        });

        it('should return msg with status 4.04 when the device is not registered', function (done) {
            node.update({ lifetime: 12000 }, function (err, msg) {
                if (msg[0].status === '4.04') {
                    done();
                }
            });
        });
    });

    after(function (done) {
        shepherd.stop(function () {
            done();
        });
    });
});
