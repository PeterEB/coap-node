'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('lodash'),
    Q = require('q'),
    network = require('network'),
    coap = require('coap');

var cutils = require('./utils/cutils.js');

function CoapNode (clientName, devAttrs) {

    devAttrs = devAttrs || {};

    this.server = null;

    this.clientName = clientName;
    this.pathname = 'unknown';

    this.lifetime = Math.floor(devAttrs.lifetime) || 86400;
    this.version = devAttrs.version || '1.0.0';

    this.ip = devAttrs.ip || null;
    this.mac = devAttrs.mac || null;
    this.port = devAttrs.port || null;

    this._serverIp = null;
    this._serverPort = null;

    this.objList = null;
    this.so = null;

    this._connected = false;

    this._init();
}

util.inherits(CoapNode, EventEmitter);

CoapNode.prototype._init = function () {
    var self = this;

    this.so = {
        lwm2mServer: {
            0: {  // oid = 1
                shortServerId: null,        // rid = 0
                lifetime: this.lifetime,    // rid = 1
                defaultMinPeriod: 1,        // rid = 2
                defaultMaxPeriod: 60        // rid = 3
            }
        },
        device: {
            0: {       // oid = 3
                manuf: 'lwm2m',             // rid = 0
                model: 'LW1',               // rid = 1
                devType: 'generic',         // rid = 17
                hwVer: 'v1',                // rid = 18
                swVer: 'v1'                 // rid = 19
            }
        },
        connMonitor: {
            0: {  // oid = 4
                ip: this.ip,                // rid = 4
                routeIp: ''                 // rid = 5
            }
        }
    };

    if (!this.ip || !this.mac) {
        network.get_active_interface(function (err, info) {
            self.ip = self.ip || info.ip_address;
            self.mac = self.mac || info.mac_address;
            self.so.connMonitor['0'].ip = self.ip;
            self.so.connMonitor['0'].routeIp = info.gateway_ip;
        });
    }
};

CoapNode.prototype.setDevAttrs = function (attrs, callback) {
    var deferred = Q.defer();



    // [TODO] Update
    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.initResrc = function (callback) {
    var deferred = Q.defer();


    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.readResrc = function (callback) {
    var deferred = Q.defer();


    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.writeResrc = function (callback) {
    var deferred = Q.defer();


    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.connect = function (ip, port, callback) {
    var deferred = Q.defer(),
        cnode = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            query: 'ep=' + this.clientName + '&lt=' + this.lifetime + '&lwm2m=' + this.version, 
            payload: this._buildObjList(),
            method: 'POST'
        },
        msg;

    this.request(reqObj).then(function (rsp) {
        msg = { status: rsp.code };

        if (rsp.code === '2.01') {
            msg.data = cnode;
            cnode._serverIp = ip;
            cnode._serverPort = port;
            cnode.pathname = rsp.headers['Location-Path'];
            cnode.so.lwm2mServer['0'].shortServerId = rsp.headers['Location-Path'].split('/')[1];
            cnode.port = rsp.outSocket.port;
            cnode._connected = true;
            return cnode._startListener().then(function () {
                cnode.emit('ready');
            }, function (err) {
                // [TODO] disconnect
                deferred.reject(err);
                // return?
            });
        }
        return 'notConnect';
    }).done(function () {
        // [TODO] ltUpdate
        deferred.resolve(msg);
    }, function (err) {
        deferred.reject(err);
    });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.update = function (attrs, callback) {
    var deferred = Q.defer(),
        cnode = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort,
            query: _buildUpdateQuery(attrs),
            pathname: this.pathname,
            method: 'PUT'
        };

    this.request(reqObj).done(function (rsp) {
        var msg = { status: rsp.code };

        if (rsp.code === '2.04') {
            // [TODO]
        }
        deferred.resolve(msg);
    }, function (err) {
        deferred.reject(err);
    });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.disconnect = function (callback) {
    var deferred = Q.defer(),
        cnode = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: this.pathname,
            method: 'DELETE'
        };

    if (this._connected === true && this.server) {

        this.request(reqObj).done(function (rsp) {
            var msg = { status: rsp.code };

            if (rsp.code === '2.02') {
                cnode.server.close();
                cnode._serverIp = null;
                cnode._serverPort = null;
                cnode._connected = false;
                cnode.emit('close');
            }
            deferred.resolve(msg);
        }, function (err) {
            deferred.reject(err);
        });

    } else if (this._connected === true) {

    }

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype._startListener = function (callback) {
    var deferred = Q.defer(),
        server;

    server = coap.createServer({
        type: 'udp4',
        proxy: true
    });

    this.server = server;

    server.on('request', _serverReqHandler(this));

    server.listen(this.port, function (err) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(server);
        }
    });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.request = function (reqObj, callback) {
    var deferred = Q.defer(),
        agent = new coap.Agent({type: 'udp4'}),
        req = agent.request(reqObj);

    req.on('response', function(rsp) {
        if (rsp.headers && rsp.headers['Content-Format'] === 'application/json')
            rsp.payload = JSON.parse(rsp.payload);
        else
            rsp.payload = rsp.payload.toString();

        deferred.resolve(rsp);
    });

    req.on('error', function(err) {
        deferred.reject(err);
    });

    req.end(reqObj.payload);
    
    return deferred.promise.nodeify(callback);
};

CoapNode.prototype._buildObjList = function () {
    var self = this,
        payloadOfObjList = '';

    this.objList = {};

    _.forEach(this.so, function (obj, oid) {
        var oidNumber = cutils.oidNumber(oid);
        self.objList[oidNumber] = [];

        _.forEach(obj, function (iObj, iid) {
            self.objList[oidNumber].push(iid);
        });
    });

    _.forEach(this.objList, function (iidArray, oidNum) {
        var oidNumber = oidNum;

        if (_.isEmpty(iidArray)) {
            payloadOfObjList += '</' + oidNumber + '>,';
        } else {
            _.forEach(iidArray, function (iid) {
                payloadOfObjList += '</' + oidNumber + '/' + iid + '>,';
            });
        }
    });

    if (payloadOfObjList[payloadOfObjList.length-1] === ',')           
        payloadOfObjList = payloadOfObjList.slice(0, payloadOfObjList.length-1);

    return payloadOfObjList;
};

/*********************************************************
 * Handler function
 *********************************************************/
function _serverReqHandler (node) {
    return function(req, rsp) {
        var optType = _serverReqParser(req);

        switch (optType) {
            case 'read':
                _serverReadHandler(node, req, rsp);
                break;
            case 'discover':
                _serverDiscoverHandler(node, req, rsp);
                break;
            case 'observe':
                _serverObserveHandler(node, req, rsp);
                break;
            case 'write':
                _serverWriteHandler(node, req, rsp);
                break;
            case 'writeAttr':
                _serverWriteAttrHandler(node, req, rsp);
                break;
            case 'execute':
                _serverExecuteHandler(node, req, rsp);
                break;
            case 'empty':
                rsp.reset();
                break;
            default:
                break;
        }
        
    };
}

var _serverReadHandler = function(node, req, rsp) {

    rsp.code = '2.05';
    rsp.end();

    // rsp.setOption('Content-Format', 'application/json');
    // rsp.end(JSON.stringify(so));
};

function _serverDiscoverHandler (node, req, rsp) {
    rsp.code = '2.05';
    rsp.end();
}

function _serverObserveHandler (node, req, rsp) {
    rsp.code = '2.05';
    rsp.end();
}

function _serverWriteHandler (node, req, rsp) {
    rsp.code = '2.04';
    rsp.end();
}

function _serverWriteAttrHandler (node, req, rsp) {
    rsp.code = '2.04';
    rsp.end();
}

function _serverExecuteHandler (node, req, rsp) {
    rsp.code = '2.04';
    rsp.end();
}

/*********************************************************
 * Private function
 *********************************************************/
function _serverReqParser (req) {
    var optType;

    if (req.code === '0.00' && req._packet.confirmable && req.payload.length === 0) {
        optType = 'empty';
    } else {
        switch (req.method) {
            case 'GET':
                if (req.headers.Observe === 0)
                    optType = 'observe';
                else if (req.headers.Accept === 'application/link-format')
                    optType = 'discover';
                else
                    optType = 'read';
                break;
            case 'PUT':
                if (req.payload.length === 0)
                    optType = 'writeAttr';
                else
                    optType = 'write';
                break;
            case 'POST':
                optType = 'execute';
                break;
            default:
                break;
        }
    }

    return optType;
}

function _buildUpdateQuery (attrs) {
    var query = '',
        updateParameter = [];

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime')
            query += 'lt=' + val + '&';
        else if (key === 'version')
            query += 'lwm2m=' + val + '&';
    });

    if (query[query.length-1] === '&')           
        query = query.slice(0, query.length-1);

    return query;
}

module.exports = CoapNode;
