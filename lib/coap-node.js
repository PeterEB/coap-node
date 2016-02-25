'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('lodash'),
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
    this._registed = false;
    
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
    var self = this,
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
        callback(null, { status: '2.00' });
    } else {
        this.update(attrs, callback);
    }
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

        if (_.isFunction(rsc)) 
            throw new TypeError('resource cannot be a function.');

        if (_.isObject(rsc))
            rsc._isCb = _.isFunction(rsc.read) || _.isFunction(rsc.write) || _.isFunction(rsc.exec);

        self.so[okey][iid][rkey] = rsc;
    });
};

CoapNode.prototype.readResrc = function (oid, iid, rid, callback) {
    var self = this,
        target = this._target(oid, iid, rid),
        rsc = target.value;

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });

        // if (!_.isNil(data)) _checkAndReportResrc(self, oid, iid, rid, data);
    }

    if (!target.exist) {
        invokeCb(new Error('not found target.'), null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.read)) {
            rsc.read(function (err, val) {
                invokeCb(null, val, callback);
            });
        } else {
            invokeCb(new Error('unreadable.', null, callback));
        }
    } else if (_.isObject(rsc)) {
        rsc = _.omit(rsc, ['_isCb']);
        invokeCb(null, rsc, callback);
    } else { 
        invokeCb(null, rsc, callback);
    }
};

CoapNode.prototype._dumpObj = function (oid, iid, callback) {
    var self = this,
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
                self.readResrc(oid, ii, rid, function (err, data) {
                    if (err)
                        chkErr = err;
                    else
                        dump[ii][cutils.ridNumber(oid, rid)] = data;
                });
            });
        });
    } else if (target.exist && target.type === 'instance') {
        _.forEach(target.value, function (rsc, rid) {
            self.readResrc(oid, iid, rid, function (err, data) {
                if (err)
                    chkErr = err;
                else
                    dump[cutils.ridNumber(oid, rid)] = data;
            });
        });
    } else {
        dump = null;
    }

    if (chkErr)
        callback(chkErr);
    else
        callback(null, dump);
};

CoapNode.prototype.writeResrc = function (oid, iid, rid, value, callback) {
    var self = this,
        target = this._target(oid, iid, rid),
        rsc = target.value,
        okey = cutils.oidKey(oid),
        rkey = cutils.ridKey(oid, rid);

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });

        // if (!_.isNil(data)) _checkAndReportResrc(self, oid, iid, rid, data);
    }

    if (!target.exist){
        invokeCb(new Error('not found target.'), null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.write)) {
            rsc.write(value, function (err, val) {
                invokeCb(null, val, callback);
            });
        } else {
            invokeCb(new Error('unreadable.', null, callback));
        }
    } else {
        if (typeof rsc !== typeof value) {
            invokeCb(new TypeError('bad type of value.'), null, callback);
        } else {
            this.so[okey][iid][rkey] = value;
            invokeCb(null, value, callback);
        }
    }
};

CoapNode.prototype.execResrc = function (oid, iid, rid, argus, callback) {
    var target = this._target(oid, iid, rid),
        rsc = target.value;

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });
    }

    if (_.isFunction(argus)) {
        callback = argus;
        argus = [];
    }

    if (_.isUndefined(argus))
    argus = [];

    if (!target.exist){
        invokeCb(new Error('not found target.'), null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.exec)) {
            argus.push(function (err, val) {
                invokeCb(err, val, callback);
            });
            rsc.exec.apply(this, argus);
        } else {
            invokeCb(new Error('unreadable.', null, callback));
        }
    }
};

CoapNode.prototype.register = function (ip, port, callback) {
    var self = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            query: 'ep=' + this.clientName + '&lt=' + this.lifetime + '&lwm2m=' + this.version, 
            payload: _buildObjList(this),
            method: 'POST'
        },
        msg;

    this.request(reqObj, function (err, rsp) {
        if (err) {
            callback(err);
        } else {
            msg = { status: rsp.code };

            if (rsp.code === '2.01') {
                msg.data = self;
                _lfUpdate(self, true);
                self._serverIp = ip;
                self._serverPort = port;
                self.pathname = rsp.headers['Location-Path'];
                self.so.lwm2mServer[0].shortServerId = rsp.headers['Location-Path'].split('/')[1];
                self.port = rsp.outSocket.port;
                self._registed = true;
                self._startListener(function (err) {
                    if (err) {
                        // [TODO] deregister
                        _lfUpdate(self, false);
                        callback(err);
                    } else {
                        callback(null, msg);
                        self.emit('ready');
                    }
                });
            } else {
                callback(null, msg);
            }
        }
    });
};

CoapNode.prototype.update = function (attrs, callback) {
    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort,
            pathname: this.pathname,
            query: _buildUpdateQuery(attrs),
            payload: attrs.objList,
            method: 'PUT'
        };

    this.request(reqObj, function (err, rsp) {
        if (err) {
            callback(err);
        } else {
            var msg = { status: rsp.code };

            if (rsp.code === '2.04') {
                msg.data = attrs;
                self.emit('update');
            } 
            callback(null, msg);
        }
    });
};

CoapNode.prototype.deregister = function (callback) {
    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: this.pathname,
            method: 'DELETE'
        };

    if (this._registed === true && this.server) {

        this.request(reqObj, function (err, rsp) {
            if (err) {
                callback(err);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === '2.02') {
                    self.server.close();
                    self._serverIp = null;
                    self._serverPort = null;
                    self._registed = false;
                    self.emit('close');
                }

                callback(null, msg);
            }
        });
    } else if (this._registed === true) {
        callback();
    }
};

CoapNode.prototype.lookup = function (clientName, callback) {
    var reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: '/rd-lookup/ep',
            query: 'ep=' + clientName,
            method: 'GET'
        };
// [TODO] lookupType
        this.request(reqObj, function (err, rsp) {
            if (err) {
                callback(err);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === '2.05') {
                    msg.data = rsp.payload;
                }  

                callback(null, msg);
            }
        });
};

CoapNode.prototype._startListener = function (callback) {
    var self = this,
        server;

    server = coap.createServer({
        type: 'udp4',
        proxy: true
    });

    this.server = server;

    server.on('request', function (req, rsp) {
        if (!_.isEmpty(req.payload) && req.headers && req.headers['Content-Format'] === 'application/json') {   // [TODO] test
            req.payload = JSON.parse(req.payload);
        } else if (!_.isEmpty(req.payload)) {
            req.payload = req.payload.toString();

            if (!_.isNaN(Number(req.payload)))
                req.payload = Number(req.payload);
        }

        _serverReqHandler(self, req, rsp);
    });

    server.listen(this.port, function (err) {
        if (err) {
            callback(err);
        } else {
            callback(null, server);
        }
    });
};

CoapNode.prototype.request = function (reqObj, callback) {
    var agent = new coap.Agent({type: 'udp4'}),
        req = agent.request(reqObj);

    req.on('response', function(rsp) {
        if (!_.isEmpty(rsp.payload) && rsp.headers && rsp.headers['Content-Format'] === 'application/json')
            rsp.payload = JSON.parse(rsp.payload);
        else if (!_.isEmpty(rsp.payload))
            rsp.payload = rsp.payload.toString();

        callback(null, rsp);
    });

    req.on('error', function(err) {
        callback(err);
    });

    req.end(reqObj.payload);
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

CoapNode.prototype._setAttrs = function (oid, iid, rid, attrs) {
    var okey, 
        rkey,
        key;

    if (arguments.length === 4) {
        rkey = cutils.ridKey(oid, rid);
        key = okey + ':' + iid + ':' + rkey;
    } else if (arguments.length === 3) {
        attrs = rid;
        rid = undefined;
        key = okey + ':' + iid;
    } else if (arguments.length === 2) {
        attrs = iid;
        iid = undefined;
        key = okey;
    }
    if (!_.isPlainObject(attrs)) throw new TypeError('attrs should be given as an object.');

    attrs.pmin = _.isNumber(attrs.pmin) ? attrs.pmin : this.so.lwm2mServer[0].defaultMinPeriod;
    attrs.pmax = _.isNumber(attrs.pmax) ? attrs.pmax : this.so.lwm2mServer[0].defaultMaxPeriod;
    attrs.mute = _.isBoolean(attrs.mute) ? attrs.mute : true;
    attrs.cancel = _.isBoolean(attrs.cancel) ? attrs.cancel : true;

    this._repAttrs[key] = attrs;
    return true;
};

CoapNode.prototype._getAttrs = function (oid, iid, rid) {
    var okey, 
        rkey,
        key,
        defaultAttrs;

    defaultAttrs = {
        pmin: this.so.lwm2mServer[0].defaultMinPeriod,
        pmax: this.so.lwm2mServer[0].defaultMaxPeriod,
        mute: true,
        cancel: true,
        lastRpVal: null
    };

    if (arguments.length === 3) {
        rkey = cutils.ridKey(oid, rid);
        key = okey + ':' + iid + ':' + rkey;
    } else if (arguments.length === 2) {
        key = okey + ':' + iid;
    } else if (arguments.length === 1) {
        key = okey;
    }

    this._repAttrs[key] = this._repAttrs[key] || defaultAttrs;
    return this._repAttrs[key];
};

CoapNode.prototype._buildAttrsAndRsc = function (oid, iid, rid) {
    var payload = '',
        attrs = this._getAttrs(oid, iid, rid),
        attrsPayload = '',
        allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'step' ],
        target = this._target(oid, iid, rid),
        onum,
        rnum;

    _.forEach(attrs, function (val, key) {
        if (_.includes(allowedAttrs, key))
            attrsPayload = attrsPayload + ';' + key + '=' + val;
        else if (key === 'cancel' && val === true)
            attrsPayload = attrsPayload + ';cancel';    // ';pmin=1;pmax=60;cancel'
    });

    if (target.type === 'object') {
        onum = cutils.oidNumber(oid);
        payload = '</' + onum + '>' + attrsPayload + ',';
        _.forEach(target.value, function (iobj, ii) {
            _.forEach(iobj, function (val, rkey) {
                rnum = cutils.ridNumber(oid, rkey);
                payload = payload + '</' + onum + '/' + ii + '/' + rnum + '>' + ',';
            });
        });
    } else if (target.type === 'instance') {
        onum = cutils.oidNumber(oid);
        payload = '</' + onum + '/' + iid + '>' + attrsPayload + ',';
        _.forEach(target.value, function (val, rkey) {
            rnum = cutils.ridNumber(oid, rkey);
            payload = payload + '</' + onum + '/' + iid + '/' + rnum + '>' + ',';
        });

    } else if (target.type === 'resource') {
        onum = cutils.oidNumber(oid);
        rnum = cutils.ridNumber(oid, rid);
        payload = '</' + onum + '/' + iid + '/' + rnum + '>' + attrsPayload + ',';
    }

    return payload.slice(0, payload.length - 1);
};

CoapNode.prototype._enableReport = function (oid, iid, rid, rsp, callback) {
    var self = this,
        target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        okey = cutils.oidKey(oid),
        rkey,
        key,
        pmin,
        pmax,
        rpt,
        dumper;

    if (target.type === 'object') {
        key = okey;
        dumper = function (cb) {
            self._dumpObj(oid, cb);
        };
    } else if (target.type === 'instance') {
        key = okey + ':' + iid;
        dumper = function (cb) {
            self._dumpObj(oid, iid, cb);
        };
    } else if (target.type === 'resource') {
        rkey = cutils.ridKey(oid, rid);
        key = okey + ':' + iid + ':' + rkey;
        dumper = function (cb) {
            self.readResrc(oid, iid, rid, cb);
        };
    }

    pmin = rAttrs.pmin * 1000;
    pmax = rAttrs.pmax * 1000;
    rAttrs.cancel = false;
    this._reporters[key] = { min: null, max: null, write: null };
    rpt = this._reporters[key];

    rpt.min = setTimeout(function () {
        rAttrs.mute = false;
    }, pmin);

    function reporterMax () {
        rAttrs.mute = true;

        dumper(function (err, val) {
            rpt.write(val);
        });

        if (!_.isNil(rpt.min))
            clearTimeout(rpt.min);

        rpt.min = setTimeout(function () {
            rAttrs.mute = false;
        }, pmin);
    }

    rpt.max = setInterval(reporterMax, pmax);

    rpt.write = function (val) {
        rAttrs.lastRpVal = val;

        if (_.isObject(val))
            rsp.write(JSON.stringify(val));
        else
            rsp.write(val.toString());

        if (!_.isNil(rpt.max))
            clearInterval(rpt.max);
        
        rpt.max = setInterval(reporterMax, pmax);
    };

    dumper(callback);
};

CoapNode.prototype._disableReport = function (oid, iid, rid) {
    var target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        okey,
        rkey,
        key,
        rpt;

    if (target.type === 'object') {
        key = okey;
    } else if (target.type === 'instance') {
        key = okey + ':' + iid;
    } else if (target.type === 'resource') {
        rkey = cutils.ridKey(oid, rid);
        key = okey + ':' + iid + ':' + rkey;
    }

    rpt = this._reporters[key];

    clearTimeout(rpt.min);
    clearInterval(rpt.max);

    rAttrs.cancel = true;
    rAttrs.mute = true;
    rpt.min = null;
    rpt.max = null;
    rpt.write = null;
    delete this._reporters[key];
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
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else if (target.type === 'object' || target.type === 'instance') {
        node._dumpObj(pathObj.oid, function (err, dump) {
            if (err) {
                rsp.code = '4.04';
                rsp.end();
            } else {
                rsp.code = '2.05';
                rsp.setOption('Content-Format', 'application/json');
                rsp.end(JSON.stringify(target.value));  
            }
        });
    } else if (target.type === 'resource') {
        node.readResrc(pathObj.oid, pathObj.iid, pathObj.rid, function (err, value) {
            if (err) {
                rsp.code = '4.04';
                rsp.end();
            } else {
                rsp.code = '2.05';
                if (_.isPlainObject(value)) {
                    rsp.setOption('Content-Format', 'application/json');
                    rsp.end(JSON.stringify(value));  
                } else {
                    rsp.end(value.toString());
                }
            }
        });
    }
}

function _serverDiscoverHandler (node, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rspPayload = '';

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else {
        rspPayload = node._buildAttrsAndRsc(pathObj.oid, pathObj.iid, pathObj.rid);
        rsp.code = '2.05';
        rsp.end(rspPayload);
    }
}

function _serverObserveHandler (node, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else {
        node._enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp, function (err, val) {
            rsp.code = '2.05';

            if (_.isPlainObject(val)) {
                rsp.setOption('Content-Format', 'application/json');
                rsp.write(JSON.stringify(val));  
            } else {
                rsp.write(val.toString());
            }
        });
    }
}

function _serverWriteHandler (node, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid),
        value = req.payload;

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else if (target.type === 'object' || target.type === 'instance') {
        rsp.code = '4.05';
        rsp.end();
    } else if (target.type === 'resource') {
        node.writeResrc(pathObj.oid, pathObj.iid, pathObj.rid, value, function (err, data) {
            if (err) {
                rsp.code = '4.00';
                rsp.end();
            } else {
                rsp.code = '2.04';
                rsp.end();
            }
        });
    }
}

function _serverWriteAttrHandler (node, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid),
        attrs = cutils.buildAttr(req);

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else {
        node._setAttrs(pathObj.oid, pathObj.iid, pathObj.rid, attrs);
        rsp.code = '2.04';
        rsp.end();
    }
}

function _serverExecuteHandler (node, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = node._target(pathObj.oid, pathObj.iid, pathObj.rid),
        argus = req.payload;

    if (!target.exist) {
        rsp.code = '4.04';
        rsp.end();
    } else {
        node.execResrc(pathObj.oid, pathObj.iid, pathObj.rid, argus, function (err, data) {
            if (err) {
                rsp.code = '4.05';
                rsp.end();
            } else {
                rsp.code = '2.04';
                rsp.end();                 
            }
        });
    }
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
console.log(optType);
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
                cn.update({ lifetime: cn.lifetime }, function (err, msg) {
                    if (err) {
                        // [TODO err]
                    } else {
                        if (msg.status === '4.04')
                            _lfUpdate(cn, false);
                    }
                });

                cn._lfsecs = 0;
            }
        }, 1000);
    }
}

function _checkAndReportResrc(cn, oid, iid, rid, val) {
    var target = cn._target(oid, iid, rid),
        rAttrs = cn._getAttrs(oid, iid, rid),
        gt = rAttrs.gt,
        lt = rAttrs.lt,
        step = rAttrs.step,
        lastRpVal = rAttrs.lastRpVal,
        okey = cutils.oidKey(oid),
        rkey,
        key,
        rpt,
        chkRpVal;

    if (rAttrs.cancel)
        return false;

    if (target.type === 'object') {
        key = okey;
    } else if (target.type === 'instance') {
        key = okey + ':' + iid;
    } else if (target.type === 'resource') {
        rkey = cutils.ridKey(oid, rid);
        key = okey + ':' + iid + ':' + rkey;
    }

    rpt = cn._reporters[key];

    if (rAttrs.mute) {
        setTimeout(function () {
            _checkAndReportResrc(cn, oid, iid, rid, val);
        }, rAttrs.pmin);
    } else {

    }

    if (chkRpVal) {
        rpt.write(val);
        rAttrs.lastRpVal = val;
    }
}

module.exports = CoapNode;
