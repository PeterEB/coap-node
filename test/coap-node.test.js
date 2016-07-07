var expect = require('chai').expect,
    _ = require('busyman'),
    CoapNode = require('../lib/coap-node');

var node = new CoapNode('utNode');

describe('CoapNode Check', function () {
    it('Signature Check', function () {
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

        expect(function () { return new CoapNode('xxx'); }).not.to.throw(TypeError);
    });

    it('Constructor Check', function () {
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
                        firmware: 'v1.0',           // rid = 3
                        devType: 'generic',         // rid = 17
                        hwVer: 'v1.0',              // rid = 18
                        swVer: 'v1.0',              // rid = 19
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
        // expect(node.so.dump()).to.be.eql(defSo);

        expect(node._registered).to.be.false;
        expect(node._lfsecs).to.be.eql(0);
        expect(node._updater).to.be.eql(null);
        expect(node._repAttrs).to.be.eql({});
        expect(node._reporters).to.be.eql({});
        expect(node._hbPacemaker).to.be.eql(null);
        expect(node._reporters).to.be.eql({});
        expect(node._hbPacemaker).to.be.eql(null);
    });
});
