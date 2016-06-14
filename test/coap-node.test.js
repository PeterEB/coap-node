var should = require('should'),
    _ = require('lodash'),
    CoapNode = require('../lib/coap-node');

var node = new CoapNode('utNode');

describe('Constructor Check', function () {
    it('CoapNode(clientName, devAttrs)', function () {
        var defSo = {
                lwm2mServer: {
                    0: {  // oid = 1
                        shortServerId: null,        
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
                        availPwrSrc:'line',
                        pwrSrcVoltage: '3.3V'
                    }
                },
                connMonitor: {
                    0: {        // oid = 4
                        ip: 'unknown',                // rid = 4
                        routeIp: 'unknown'            // rid = 5         
                    }
                }
            };

        node.start();

        should(node.clientName).be.eql('utNode');
        should(node.locationPath).be.eql('unknown');
        should(node.lifetime).be.eql(86400);
        should(node.version).be.eql('1.0.0');  
        should(node.ip).be.eql('unknown');
        should(node.port).be.eql(5684);
        should(node._serverIp).be.null();
        should(node._serverPort).be.null();
        should(node.objList).be.null();
        should(node.so).be.eql(defSo);
        should(node._registered).be.false();
        should(node._lfsecs).be.eql(0);
        should(node._updater).be.null();
        should(node._repAttrs).be.eql({});
        should(node._reporters).be.eql({});
        should(node._hbPacemaker).be.null();
        should(node._reporters).be.eql({});
        should(node._hbPacemaker).be.null();
    });
});
