var should = require('should'),
    _ = require('lodash'),
    CoapNode = require('../coap-node');

var node = new CoapNode('utNode');

describe('Constructor Check', function () {
    it('CoapNode(clientName, devAttrs)', function () {
        var defSo = {
                lwm2mServer: {
                    0: {  // oid = 1
                        shortServerId: null,        
                        lifetime: 86400,   
                        defaultMinPeriod: 1,       
                        defaultMaxPeriod: 60        
                    }
                },
                device: {
                    0: {       
                        manuf: 'lwm2m',           
                        model: 'LW1',              
                        devType: 'generic',       
                        hwVer: 'v1',                
                        swVer: 'v1'                
                    }
                },
                connMonitor: {
                    0: {  
                        ip: null,               
                        routeIp: ''               
                    }
                }
            };

        should(node.clientName).be.eql('utNode');
        should(node.locationPath).be.eql('unknown');
        should(node.lifetime).be.eql(86400);
        should(node.version).be.eql('1.0.0');  
        should(node.ip).be.null();
        should(node.port).be.eql('5685');
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
