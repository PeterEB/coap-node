var _ = require('busyman'),
    expect = require('chai').expect,
    SmartObject = require('smartobject'); 

var CoapNode = require('../index');

var so = new SmartObject(),
    node = new CoapNode('utNode', so);

describe('coap-node - Constructor Check', function () {
    describe('CoapNode', function () {
        it('should throw TypeError if attrs is not correct', function (done) {
            var defSo = {
                    lwm2mServer: {
                        0: {  // oid = 1
                            shortServerId: 'unknown',        
                            lifetime: 86400,   
                            defaultMinPeriod: 0,       
                            defaultMaxPeriod: 60        
                        }
                    },
                    device: {
                        0: {       // oid = 3
                            manuf: 'sivann',            // rid = 0
                            model: 'cnode-01',          // rid = 1
                            serial: 'c-0000',           // rid = 2
                            firmware: '1.0',           // rid = 3
                            devType: 'generic',         // rid = 17
                            hwVer: '1.0',              // rid = 18
                            swVer: '1.0',              // rid = 19
                            availPwrSrc:'unknown',
                            pwrSrcVoltage: 'unknown'
                        }
                    },
                    connMonitor: {
                        0: {        // oid = 4
                            ip: 'unknown',                // rid = 4
                            routeIp: 'unknown'            // rid = 5         
                        }
                    }
                };

            expect(node.clientName).to.be.eql('utNode');
            expect(node.locationPath).to.be.eql('unknown');
            expect(node.lifetime).to.be.eql(86400);
            expect(node.version).to.be.eql('1.0.0');  
            expect(node.ip).to.be.eql('unknown');
            expect(node.port).to.be.eql('unknown');
            
            expect(node._serverIp).to.be.eql('unknown');
            expect(node._serverPort).to.be.eql('unknown');

            expect(node.objList).to.be.eql(null);

            expect(node._registered).to.be.false;
            expect(node._lfsecs).to.be.eql(0);
            expect(node._updater).to.be.eql(null);
            expect(node._repAttrs).to.be.eql({});
            expect(node._reporters).to.be.eql({});
            expect(node._hbPacemaker).to.be.eql(null);
            expect(node._reporters).to.be.eql({});
            expect(node._hbPacemaker).to.be.eql(null);

            node.so.dump(function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    if (_.isEqual(defSo, data))
                        done();
                }
            });
        });
    });
});

describe('coap-node - Signature Check', function () {
    describe('new CoapNode()', function () {
        it('should throw TypeError if clientName is not a string', function () {
            expect(function () { return new CoapNode(); }).to.throw(TypeError);
            expect(function () { return new CoapNode(undefined); }).to.throw(TypeError);
            expect(function () { return new CoapNode(null); }).to.throw(TypeError);
            expect(function () { return new CoapNode(NaN); }).to.throw(TypeError);
            expect(function () { return new CoapNode(100); }).to.throw(TypeError);
            expect(function () { return new CoapNode([]); }).to.throw(TypeError);
            expect(function () { return new CoapNode({}); }).to.throw(TypeError);
            expect(function () { return new CoapNode(true); }).to.throw(TypeError);
            expect(function () { return new CoapNode(new Date()); }).to.throw(TypeError);
            expect(function () { return new CoapNode(function () {}); }).to.throw(TypeError);

            expect(function () { return new CoapNode('xxx', so); }).not.to.throw(TypeError);
        });
    });

    describe('#.update()', function () {
        it('should throw TypeError if attrs is not a number', function () {
            expect(function () { return node.update(); }).to.throw(TypeError);
            expect(function () { return node.update(undefined); }).to.throw(TypeError);
            expect(function () { return node.update(null); }).to.throw(TypeError);
            expect(function () { return node.update(NaN); }).to.throw(TypeError);
            expect(function () { return node.update(100); }).to.throw(TypeError);
            expect(function () { return node.update('xx'); }).to.throw(TypeError);
            expect(function () { return node.update([]); }).to.throw(TypeError);
            expect(function () { return node.update(true); }).to.throw(TypeError);
            expect(function () { return node.update(new Date()); }).to.throw(TypeError);
            expect(function () { return node.update(function () {}); }).to.throw(TypeError);

            expect(function () { return node.update({}); }).not.to.throw(TypeError);
        });
    });

    describe('#.register()', function () {
        it('should throw TypeError if ip is not a string', function () {
            expect(function () { return node.register(); }).to.throw(TypeError);
            expect(function () { return node.register(undefined, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(null, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(NaN, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(100, '1'); }).to.throw(TypeError);
            expect(function () { return node.register([], '1'); }).to.throw(TypeError);
            expect(function () { return node.register({}, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(true, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(new Date(), '1'); }).to.throw(TypeError);
            expect(function () { return node.register(function () {}, '1'); }).to.throw(TypeError);
        });

        it('should throw TypeError if ip is not a string or a number', function () {
            expect(function () { return node.register('192.168.1.1'); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', undefined); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', null); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', NaN); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', []); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', {}); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', true); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', new Date()); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', function () {}); }).to.throw(TypeError);
        });
    });

    describe('#.checkout()', function () {
        it('should throw TypeError if duration is not a number', function () {
            expect(function () { return node.checkout(null); }).to.throw(TypeError);
            expect(function () { return node.checkout(NaN); }).to.throw(TypeError);
            expect(function () { return node.checkout('xx'); }).to.throw(TypeError);
            expect(function () { return node.checkout([]); }).to.throw(TypeError);
            expect(function () { return node.checkout({}); }).to.throw(TypeError);
            expect(function () { return node.checkout(true); }).to.throw(TypeError);
            expect(function () { return node.checkout(new Date()); }).to.throw(TypeError);

            expect(function () { return node.checkout(100); }).not.to.throw(TypeError);
        });
    });
});