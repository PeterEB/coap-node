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

    this._lfsecs = 0;
    this._updater = null;
    this._repAttrs = {};
    this._reporters = {};
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
            self.so.connMonitor[0].ip = self.ip;
            self.so.connMonitor[0].routeIp = info.gateway_ip;
        });
    }
};

CoapNode.prototype.setDevAttrs = function (attrs, callback) {
    var deferred = Q.defer(),
        self = this,
        update = {};

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime) {
            self.lifetime = self.so.lwm2mServer[0].lifetime = update.lifetime = attrs.lifetime;
            _lfUpdate(self, true);
        } else if (key === 'ip' && attrs.ip !== self.ip) {
            self.ip = self.so.connMonitor[0].ip = update.ip = attrs.ip;
        } else if (key === 'version' && attrs.version !== self.version) {
            self.version = update.version = attrs.version;
        } else if (key === 'objListUpdate' && attrs.objListUpdate === true) {
            update.objList = _buildObjList(self);
        }
    });

    if (_.isEmpty(update)) {
        deferred.resolve({ status: '2.00' });
    } else {
        this.update(attrs).done(function (msg) {
            deferred.resolve(msg);
        }, function (err) {
            deferred.reject(err);
        });
    }

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.initResrc = function (oid, iid, resrcs) {
    var self = this,
        okey = cutils.oidKey(oid);

    if (!_.isPlainObject(resrcs)) 
        throw new TypeError('resrcs should be an object.');

    this.so[okey] = this.so[okey] || {};
    this.so[okey][iid] = this.so[okey][iid] || {};

    _.forEach(resrcs, function (rsc, rid) {
        var  rkey = cutils.ridKey(oid, rid);

        self.so[okey][iid][rkey] = rsc;
    });
};

CoapNode.prototype.readResrc = function (oid, iid, rid, callback) {
    var deferred = Q.defer(),
        target = this._target(oid, iid, rid);

    if (!target.exist)
        deferred.reject(new Error('not found target.'));
    else 
        deferred.resolve(target.value);

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype._dumpObj = function (oid, iid, callback) {
    var deferred = Q.defer(),
        self = this,
        target,
        dump = {},
        chkErr;

    if (_.isFunction(iid)) {
        callback = iid;
        iid = undefined;
    }

    target = this._target(oid, iid);

    if (target.exist && target.type === 'object') {
        _.forEach(target.value, function (iObj, ii) {
            dump[ii] = {};

            _.forEach(iObj, function (rsc, rid) {
                self.readResrc(oid, ii, rid).then(function (data) {
                    dump[ii][cutils.ridNumber(oid, rid)] = data;
                }, function (err) {
                    chkErr = err;
                });
            });
        });
    } else if (target.exist && target.type === 'instance') {
        _.forEach(target.value, function (rsc, rid) {
            self.readResrc(oid, iid, rid).then(function (data) {
                dump[cutils.ridNumber(oid, rid)] = data;
            }, function (err) {
                chkErr = err;
            });
        });
    } else {
        dump = null;
    }

    if (chkErr)
        deferred.reject(chkErr);
    else
        deferred.resolve(dump);

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.writeResrc = function (oid, iid, rid, value, callback) {
    var deferred = Q.defer(),
        target = this._target(oid, iid, rid),
        okey = cutils.oidKey(oid),
        rkey = cutils.ridKey(oid, rid);

    if (!target.exist){
        deferred.reject(new Error('not found target.'));
    } else {
        if (typeof target.value !== typeof value) {
            deferred.reject(new TypeError('bad type of value.'));
        } else {
            this.so[okey][iid][rkey] = value;
            deferred.resolve(target.value);
        }
    }

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.execResrc = function (oid, iid, rid, argus, callback) {
    var deferred = Q.defer();



    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.connect = function (ip, port, callback) {
    var deferred = Q.defer(),
        self = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            query: 'ep=' + this.clientName + '&lt=' + this.lifetime + '&lwm2m=' + this.version, 
            payload: _buildObjList(this),
            method: 'POST'
        },
        msg;

    this.request(reqObj).then(function (rsp) {
        msg = { status: rsp.code };

        if (rsp.code === '2.01') {
            msg.data = self;
            _lfUpdate(self, true);
            self._serverIp = ip;
            self._serverPort = port;
            self.pathname = rsp.headers['Location-Path'];
            self.so.lwm2mServer[0].shortServerId = rsp.headers['Location-Path'].split('/')[1];
            self.port = rsp.outSocket.port;
            self._connected = true;
            return self._startListener().then(function () {
                self.emit('ready');
            }, function (err) {
                // [TODO] disconnect
                deferred.reject(err);
                // return?
            });
        }
        return 'notConnect';
    }).done(function () {
        deferred.resolve(msg);
    }, function (err) {
        _lfUpdate(self, false);
        deferred.reject(err);
    });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.update = function (attrs, callback) {
    var deferred = Q.defer(),
        self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort,
            pathname: this.pathname,
            query: _buildUpdateQuery(attrs),
            payload: attrs.objList,
            method: 'PUT'
        };

    this.request(reqObj).done(function (rsp) {
        var msg = { status: rsp.code };

        if (rsp.code === '2.04') {
            msg.data = attrs;
            self.emit('update');
        } 
        deferred.resolve(msg);
    }, function (err) {
        deferred.reject(err);
    });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.disconnect = function (callback) {
    var deferred = Q.defer(),
        self = this,
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
                self.server.close();
                self._serverIp = null;
                self._serverPort = null;
                self._connected = false;
                self.emit('close');
            }
            deferred.resolve(msg);
        }, function (err) {
            deferred.reject(err);
        });

    } else if (this._connected === true) {

    }

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype.lookup = function (clientName, callback) {
    var deferred = Q.defer(),
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: '/rd-lookup/ep',
            query: 'ep=' + clientName,
            method: 'GET'
        };
// [TODO] lookupType
        this.request(reqObj).done(function (rsp) {
            var msg = { status: rsp.code };

            if (rsp.code === '2.05') {
                msg.data = rsp.payload;
            }
            deferred.resolve(msg);
        }, function (err) {
            deferred.reject(err);
        });

    return deferred.promise.nodeify(callback);
};

CoapNode.prototype._startListener = function (callback) {
    var deferred = Q.defer(),
        self = this,
        server;

    server = coap.createServer({
        type: 'udp4',
        proxy: true
    });

    this.server = server;

    server.on('request', function (req, rsp) {
        _serverReqHandler(self, req, rsp);
    });

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

CoapNode.prototype._has = function (oid, iid, rid) {
    var okey = cutils.oidKey(oid), 
        has = false,
        rkey;

    if (!_.isUndefined(oid)) {
        has = !_.isUndefined(this.so[okey]);
        if (has && !_.isUndefined(iid)) {
            has = !_.isUndefined(this.so[okey][iid]);
            if (has && !_.isUndefined(rid)) {
                rkey = cutils.ridKey(oid, rid);
                has = !_.isUndefined(this.so[okey][iid][rkey]);
            }
        }
    }

    return has;
};

CoapNode.prototype._target = function (oid, iid, rid) {
    var okey = cutils.oidKey(oid),
        trg = {
            type: null,
            exist: this._has(oid, iid, rid),
            value: null
        },
        rkey;

    if (!_.isNil(oid)) {
        trg.type = 'object';
        if (!_.isNil(iid)) {
            trg.type = 'instance';
            if (!_.isNil(rid)) {
                trg.type = 'resource';
                rkey = cutils.ridKey(oid, rid);
            }
        }
    }

    if (trg.exist) {
        if (trg.type === 'object')
            trg.value = this.so[okey];
        else if (trg.type === 'instance')
            trg.value = this.so[okey][iid];
        else if (trg.type === 'resource')
            trg.value = this.so[okey][iid][rkey];
    }
    return trg;
};

/*********************************************************
 * Handler function
 *********************************************************/
function _serverReqHandler (node, req, rsp) {
    var optType = _serverReqParser(req),
        reqHdlr;

    switch (optType) {
        case 'read':
            reqHdlr = _serverReadHandler;
            break;
        case 'discover':
            reqHdlr = _serverDiscoverHandler;
            break;
        case 'observe':
            reqHdlr = _serverObserveHandler;
            break;
        case 'write':
            reqHdlr = _serverWriteHandler;
            break;
        case 'writeAttr':
            reqHdlr = _serverWriteAttrHandler;
            break;
        case 'execute':
            reqHdlr = _serverExecuteHandler;
            break;
        case 'empty':
            rsp.reset();
            break;
        default:
            break;
    }

    if (reqHdlr)
        process.nextTick(function () {
            reqHdlr(node, req, rsp);
        });
}

function _serverReadHandler (node, req, rsp) {

    rsp.code = '2.05';
    rsp.end();

    // rsp.setOption('Content-Format', 'application/json');
    // rsp.end(JSON.stringify(so));
}

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

function _buildObjList(cn) {
    var payloadOfObjList = '';

    cn.objList = {};

    _.forEach(cn.so, function (obj, oid) {
        var oidNumber = cutils.oidNumber(oid);
        cn.objList[oidNumber] = [];

        _.forEach(obj, function (iObj, iid) {
            cn.objList[oidNumber].push(iid);
        });
    });

    _.forEach(cn.objList, function (iidArray, oidNum) {
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
}

function _lfUpdate(cn, enable) {
    cn._lfsecs = 0;
    clearInterval(cn._updater);
    cn._updater = null;

    if (enable) {
        cn._updater = setInterval(function () {
            cn._lfsecs += 1;
            if (cn._lfsecs === (cn.lifetime - 5)) {
                cn.update({ lifetime: cn.lifetime }).then(function (msg) {
                    if (msg.status === '4.04')
                        _lfUpdate(cn, false);
                });
                cn._lfsecs = 0;
            }
        }, 1000);
    }
}

function _checkAndReportResrc(cn, oid, iid, rid) {
    // [TODO obsever/notify]
}

module.exports = CoapNode;
