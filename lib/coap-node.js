'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('busyman'),
    network = require('network'),
    SmartObject = require('smartobject'),
    coap = require('coap');

var cutils = require('./utils/cutils.js'),
    config = require('../config.js');

/**** Code Enumerations ****/
var TTYPE = { root: 0, obj: 1, inst: 2, rsc: 3 },
    TAG = { notfound: '_notfound_', unreadable: '_unreadable_', exec: '_exec_', unwritable: '_unwritable_', unexecutable: '_unexecutable_' },
    ERR = { success: 0, notfound: 1, unreadable: 2, unwritable: 3, unexecutable: 4, timeout: 5, badtype: 6 },
    RSP = { ok: '2.00', created: '2.01', deleted: '2.02', changed: '2.04', content: '2.05', badreq: '4.00',
            unauth: '4.01', forbid: '4.03', notfound: '4.04', notallowed: '4.05', timeout: '4.08', dberror: '5.00' };

var connectionType = config.connectionType || 'udp4',
    reqTimeout = config.reqTimeout || 60,
    heartbeatTime = config.heartbeatTime || 20,
    serverChkTime = config.serverChkTime || 60;

function CoapNode (clientName, devAttrs) {
    if (!_.isString(clientName)) 
        throw new TypeError('clientName should be a string.');

    EventEmitter.call(this);

    devAttrs = devAttrs || {};

    this.servers = {};

    this.clientName = clientName;
    this.locationPath = 'unknown';

    this.lifetime = config.lifetime;
    this.version = config.version;

    this.ip = 'unknown';
    this.mac = 'unknown';
    this.port = 'unknown';

    this._serverIp = 'unknown';
    this._serverPort = 'unknown';

    this.objList = null;
    this.so = new SmartObject();

    this._registered = false;

    this._lfsecs = 0;
    this._updater = null;
    this._repAttrs = {};
    this._reporters = {};

    this._hbPacemaker = null;
    this._hbStream = { stream: null, port: null };
    this._socketServerChker = null;

    this._init(devAttrs);
}

util.inherits(CoapNode, EventEmitter);

CoapNode.prototype._init = function (devAttrs) {
    var self = this;

    this.initResrc('lwm2mServer', 0, {              // oid = 1
        shortServerId: 'unknown',                   // rid = 0
        lifetime: this.lifetime,                    // rid = 1
        defaultMinPeriod: config.defaultMinPeriod,  // rid = 2
        defaultMaxPeriod: config.defaultMaxPeriod   // rid = 3
    });

    this.initResrc('device', 0, {                 // oid = 3
        manuf: devAttrs.manuf || 'sivann',        // rid = 0
        model: devAttrs.model || 'cnode-01',      // rid = 1
        serial: devAttrs.serial || 'c-0000',      // rid = 2
        firmware: devAttrs.firmware || 'v1.0',    // rid = 3
        devType: devAttrs.devType || 'generic',   // rid = 17
        hwVer: devAttrs.hwVer || 'v1.0',          // rid = 18
        swVer: devAttrs.swVer || 'v1.0',          // rid = 19
        availPwrSrc: devAttrs.availPwrSrc || 'unknown',
        pwrSrcVoltage: devAttrs.pwrSrcVoltage || 'unknown'
    });

    this.initResrc('connMonitor', 0, {      // oid = 4
        ip: this.ip,                        // rid = 4
        routeIp: 'unknown'                  // rid = 5         
    });

    checkAndCloseServer(this, true);
};

CoapNode.prototype._updateNetInfo = function (callback) {
    var self = this;

    try {
        network.get_active_interface(function(err, obj) {
            if (err) {
                self.ip = '127.0.0.1';
                self.mac = '00:00:00:00:00:00';
                callback(err);
            } else {
                self.ip = obj.ip_address;
                self.mac = obj.mac_address;
                // [TODO]
                self.so.connMonitor[0].ip = self.ip;
                self.so.connMonitor[0].routeIp = obj.gateway_ip || '';
                callback(null, { ip: obj.ip_address, mac: obj.mac_address, routeIp: obj.gateway_ip });
            }
        });
    } catch (e) {
        self.ip = '127.0.0.1';
        self.mac = '00:00:00:00:00:00';
        callback(e);
    }
};

CoapNode.prototype.setDevAttrs = function (attrs, callback) {
    if (!_.isPlainObject(attrs)) 
        throw new Error('attrs should be an object.');

    var self = this,
        updateObj = {},
        objListInPlain,
        localStatus;

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime) {
            self.lifetime = self.so.lwm2mServer[0].lifetime = updateObj.lifetime = attrs.lifetime;
            lfUpdate(self, true);
        } else if (key === 'ip' && attrs.ip !== self.ip) {
            self.ip = self.so.connMonitor[0].ip = updateObj.ip = attrs.ip;
        } else if (key === 'version' && attrs.version !== self.version) {
            self.version = updateObj.version = attrs.version;
        } else {
            localStatus = RSP.badreq;
        }
    });

    objListInPlain = checkAndBuildObjList(self, true);

    if (!_.isNil(objListInPlain))
        updateObj.objList = objListInPlain;

    if (localStatus) {
        if (_.isFunction(callback))
            callback(null, { status: localStatus });
    } else if (_.isEmpty(updateObj)) {
        if (_.isFunction(callback))
            callback(null, { status: RSP.ok });
    } else {
        this._update(updateObj, callback);
    }
};

/*********************************************************
 * resources function                                    *
 *********************************************************/
CoapNode.prototype.initResrc = function (oid, iid, resrcs) {
    if (!_.isPlainObject(resrcs)) 
        throw new TypeError('resrcs should be an object.');

    this.so.createIpsoOnly(oid);
    this.so.addResources(oid, iid, resrcs);
};

CoapNode.prototype.readResrc = function (oid, iid, rid, callback) {
    var self = this;

    this.so.readResource(oid, iid, rid, function (err, val) {
        if (!_.isNil(val)) checkAndReportResrc(self, oid, iid, rid, val);
        callback(err, val);
    });
};

CoapNode.prototype._dumpObj = function (oid, iid, callback) {
    var self = this,
        target,
        dump = {},
        count = 0;

    if (_.isFunction(iid)) {
        callback = iid;
        iid = undefined;
    }

    target = this._target(oid, iid);

    if (target.exist && target.type === TTYPE.obj) {

        _.forEach(target.value, function (iObj, ii) {
            count += _.keys(iObj).length;
        });

        _.forEach(target.value, function (iObj, ii) {
            dump[ii] = {};
            _.forEach(iObj, function (rsc, rid) {
                self.readResrc(oid, ii, rid, function (err, data) {
                    count -= 1;
                    dump[ii][rid] = data;

                    if (count === 0 && _.isFunction(callback))
                        callback(null, dump);
                });
            });
        });
    } else if (target.exist && target.type === TTYPE.inst) {
        count = _.keys(target.value).length;

        _.forEach(target.value, function (rsc, rid) {
            self.readResrc(oid, iid, rid, function (err, data) {
                count -= 1;
                dump[rid] = data;

                if (count === 0 && _.isFunction(callback))
                    callback(null, dump);
            });
        });
    } else {
        dump = null;

        if (_.isFunction(callback))
            callback(null, dump);
    }
};
CoapNode.prototype.writeResrc = function (oid, iid, rid, value, callback) {
    var self = this;
    this.so.writeResource(oid, iid, rid, value, function (err, val) {
        if (!_.isNil(val)) checkAndReportResrc(self, oid, iid, rid, val);
        callback(err, val);
    });
};

CoapNode.prototype._writeInst = function (oid, iid, value, callback) {
    var self = this,
        target = this._target(oid, iid),
        okey = cutils.oidKey(oid),
        dump = {},
        chkErr = null,
        count = _.keys(value).length;

    if (!target.exist){
        callback(ERR.notfound, null);
    } else {

        if (chkErr && _.isFunction(callback)) {
            callback(chkErr, null);
        } else {
            _.forEach(value, function (rsc, rid) {
                self.writeResrc(oid, iid, rid, rsc, function (err, data) {
                    count -= 1;

                    if (err) {
                        chkErr = chkErr || err;
                    } else {
                        if (data ===  TAG.unwritable || data === TAG.exec) {
                            chkErr = chkErr || ERR.unwritable;
                        } else {
                            dump[cutils.ridNumber(oid, rid)] = data;
                        }
                    }

                    if (count === 0 && _.isFunction(callback))
                        callback(chkErr, dump);
                });
            });
        }
    }
};

CoapNode.prototype.execResrc = function (oid, iid, rid, argus, callback) {
    this.so.execResource(oid, iid, rid, argus, callback);
};

/*********************************************************
 * network function                                      *
 *********************************************************/
CoapNode.prototype.register = function (ip, port, callback) {
    if (!_.isString(ip)) 
        throw new TypeError('ip should be a string.');

    var self = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            payload: checkAndBuildObjList(this, false),
            method: 'POST'
        },
        agent = this._createAgent(),
        sockStatus = 'open',
        msg,
        resetCount = 0;

    function setListenerStart(msg) {
        if (sockStatus === 'close') {
            startListener(self, function (err) {
                if (err) {
                    lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    invokeCbNextTick(null, msg, callback);
                    self.emit('registered');
                }
            });
        } else {
            if (resetCount < 10) {
                resetCount += 1;
                setTimeout(function () {
                    return setListenerStart(msg);
                }, 10);
            } else {
                throw Error('Sock can not be create.');
            }
        }
    }

    agent._sock.once('close', function (msg) {
        sockStatus = 'close';
    });

    this._updateNetInfo(function () {
        reqObj.query = 'ep=' + self.clientName + '&lt=' + self.lifetime + '&lwm2m=' + self.version + '&mac=' + self.mac;

        self.request(reqObj, agent, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                msg = { status: rsp.code };

                if (rsp.code === RSP.created || rsp.code === RSP.changed) {
                    self._serverIp = ip;
                    self._serverPort = port;
                    lfUpdate(self, true);
                    self.locationPath = rsp.headers['Location-Path'];
                    self.ip = rsp.outSocket.ip;
                    self.port = rsp.outSocket.port;
                    self._registered = true;

                    try {
                        setListenerStart(msg);
                    } catch (e) {
                        invokeCbNextTick(e, null, callback);
                    }

                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    });
    
};

CoapNode.prototype._update = function (attrs, callback) {
    if (!_.isPlainObject(attrs)) 
        throw new Error('attrs should be an object.');

    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort,
            pathname: this.locationPath,
            query: cutils.buildUpdateQuery(attrs),
            payload: attrs.objList,
            method: 'PUT'
        },
        agent = this._createAgent(),
        sockStatus = 'open',
        msg,
        resetCount = 0;

    function setListenerStart(msg) {
        if (sockStatus === 'close') {
            startListener(self, function (err) {
                if (err) {
                    lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    invokeCbNextTick(null, msg, callback);
                    self.emit('registered');
                }
            });
        } else {
            if (resetCount < 10) {
                resetCount += 1;
                setTimeout(function () {
                    return setListenerStart(msg);
                }, 10);
            } else {
                throw Error('Sock can not be create.');
            }
        }
    }

    agent._sock.once('close', function (msg) {
        sockStatus = 'close';
    });

    if (this._registered === true) {
        this.request(reqObj, agent, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    if (self.ip !== rsp.outSocket.address) {
                        self.ip = rsp.outSocket.address;
                    }

                    if (self.port !== rsp.outSocket.port) {
                        self.port = rsp.outSocket.port;
                    }

                    try {
                        setListenerStart(msg);
                    } catch (e) {
                        invokeCbNextTick(e, null, callback);
                    }

                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    } else {
        invokeCbNextTick( null, { status: RSP.notfound }, callback);
    }
};

CoapNode.prototype.deregister = function (callback) {
    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: this.locationPath,
            method: 'DELETE'
        };

    if (this._registered === true) {
        this.request(reqObj, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.deleted) {
                    _.forEach(self.servers, function (server, key) {
                        server.close();
                    });
                    lfUpdate(self, false);
                    self._disableAllReport();
                    self._serverIp = null;
                    self._serverPort = null;
                    self._registered = false;
                    self.emit('deregistered');
                }

                invokeCbNextTick(null, msg, callback);
            }
        });
    } else {
        invokeCbNextTick(null, { status: RSP.notfound }, callback);
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
                invokeCbNextTick(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.content) {
                    msg.data = rsp.payload;
                }  

                invokeCbNextTick(null, msg, callback);
            }
        });
};

CoapNode.prototype._createAgent = function () {
    return new coap.Agent({ type: connectionType });
};

CoapNode.prototype.request = function (reqObj, ownAgent, callback) {
    if (!_.isPlainObject(reqObj)) 
        throw new Error('reqObj should be an object.');

    if (_.isFunction(ownAgent)) {
        callback = ownAgent;
        ownAgent = undefined;
    }

    var self = this,
        agent = ownAgent || new coap.Agent({ type: connectionType }),
        req = agent.request(reqObj),
        reqChecker;

    req.on('response', function(rsp) {
        clearTimeout(reqChecker);
        if (!_.isEmpty(rsp.payload) && rsp.headers && rsp.headers['Content-Format'] === 'application/json')
            rsp.payload = JSON.parse(rsp.payload);
        else if (!_.isEmpty(rsp.payload))
            rsp.payload = rsp.payload.toString();

        if (_.isFunction(callback))
            callback(null, rsp);
    });

    req.on('error', function(err) {
        self.emit('error', err);

        if (_.isFunction(callback))
            callback(err);
    });

    reqChecker = setTimeout(function () {
        var rsp = { code: RSP.timeout };
        agent.abort(req);
        callback(null, rsp);
    }, reqTimeout * 1000);

    req.end(reqObj.payload);
};

/*********************************************************
 * protect function                                      *
 *********************************************************/
CoapNode.prototype._target = function (oid, iid, rid) {
    var okey = cutils.oidKey(oid),
        trg = {
            type: null,
            exist: this.so.has(oid, iid, rid),
            value: this.so.get(oid, iid, rid),
            pathKey: null,
            oidKey: okey,
            ridKey: null,
        },
        rkey;

    if (!_.isNil(oid)) {
        trg.type = TTYPE.obj;
        if (!_.isNil(iid)) {
            trg.type = TTYPE.inst;
            if (!_.isNil(rid)) {
                trg.type = TTYPE.rsc;
                rkey = cutils.ridKey(oid, rid);
            }
        }
    }

    if (trg.exist) {
        if (trg.type === TTYPE.obj) {
            trg.pathKey = okey;
        } else if (trg.type === TTYPE.inst) {
            trg.pathKey = okey + '/' + iid;
        } else if (trg.type === TTYPE.rsc) {
            trg.pathKey = okey + '/' + iid + '/' + rkey;
            trg.ridKey = rkey;
        }
    }

    return trg;
};

CoapNode.prototype._setAttrs = function (oid, iid, rid, attrs) {
    if (!_.isPlainObject(attrs)) 
        throw new TypeError('attrs should be given as an object.');   

    var target = this._target(oid, iid, rid),
        key = target.pathKey;

    attrs.pmin = _.isNumber(attrs.pmin) ? attrs.pmin : this.so.lwm2mServer[0].defaultMinPeriod;
    attrs.pmax = _.isNumber(attrs.pmax) ? attrs.pmax : this.so.lwm2mServer[0].defaultMaxPeriod;
    attrs.mute = _.isBoolean(attrs.mute) ? attrs.mute : true;
    attrs.enable = _.isBoolean(attrs.enable) ? attrs.enable : false;

    this._repAttrs[key] = attrs;
    return true;
};

CoapNode.prototype._getAttrs = function (oid, iid, rid) {
    var target = this._target(oid, iid, rid),
        key = target.pathKey,
        defaultAttrs;

    defaultAttrs = {
        pmin: this.so.lwm2mServer[0].defaultMinPeriod,
        pmax: this.so.lwm2mServer[0].defaultMaxPeriod,
        mute: true,
        enable: false,
        lastRpVal: null
    };

    this._repAttrs[key] = this._repAttrs[key] || defaultAttrs;

    return this._repAttrs[key];
};

CoapNode.prototype._enableReport = function (oid, iid, rid, rsp, callback) {
    var self = this,
        target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        key = target.pathKey,
        pmin,
        pmax,
        rpt,
        dumper;

    if (target.type === TTYPE.obj) {
        dumper = function (cb) {
            self._dumpObj(oid, cb);
        };
    } else if (target.type === TTYPE.inst) {
        dumper = function (cb) {
            self._dumpObj(oid, iid, cb);
        };
    } else if (target.type === TTYPE.rsc) {
        dumper = function (cb) {
            self.readResrc(oid, iid, rid, cb);
        };
    }

    function reporterMin () {
        rAttrs.mute = false;
    }

    function reporterMax () {  
        dumper(function (err, val) {
            rpt.write(val);
        });
    }

    dumper(function (err, data) {
        if (!err && data !== TAG.unreadable && data !== TAG.exec) {

            rAttrs.enable = true;
            rAttrs.lastRpVal = data;

            pmin = rAttrs.pmin * 1000;
            pmax = rAttrs.pmax * 1000;
            self._reporters[key] = { min: null, max: null, write: null, stream: rsp, port: self.port };
            rpt = self._reporters[key];

            rpt.min = setTimeout(reporterMin, pmin);
            rpt.max = setInterval(reporterMax, pmax);

            rpt.write = function (val) {
                rAttrs.mute = true;

                if (_.isObject(val)) {
                    _.forEach(val, function (val, rid) {
                        rAttrs.lastRpVal[rid] = val;
                    });

                    val = cutils.encodeJsonObj(key, rAttrs.lastRpVal);

                    try {
                        rsp.write(JSON.stringify(val));
                    } catch (e) {
                        self.emit('error', e);
                    }
                } else {
                    rAttrs.lastRpVal = val;

                    try {
                        rsp.write(val.toString());
                    } catch (e) {
                        self.emit('error', e);
                    }
                }

                if (!_.isNil(rpt.max))
                    clearTimeout(rpt.max);
                
                if (!_.isNil(rpt.max))
                    clearInterval(rpt.max);

                rpt.min = setTimeout(reporterMin, pmin);
                rpt.max = setInterval(reporterMax, pmax);
            };
        }

        if (_.isFunction(callback))
            callback(err, data);
    });
};

CoapNode.prototype._disableReport = function (oid, iid, rid, callback) {
    var target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        key = target.pathKey,
        rpt;

    rpt = this._reporters[key];

    if (rpt) {
        clearTimeout(rpt.min);
        clearInterval(rpt.max);
        rpt.stream.end();

        rAttrs.enable = false;
        rAttrs.mute = true;
        rpt.min = null;
        rpt.max = null;
        rpt.write = null;
        rpt.stream = null;
        rpt.port = null;
        delete this._reporters[key];

        if (_.isFunction(callback))
            callback(ERR.success, null);
    } else {
        if (_.isFunction(callback))
            callback(ERR.notfound, null);
    }
};

CoapNode.prototype._disableAllReport = function () {
    var self = this,
        chkErr;

    heartbeat(this, false);

    _.forEach(this._reporters, function (rpt, key) {
        var oid = key.split('/')[0],
            iid = key.split('/')[1],
            rid = key.split('/')[2];

        self._disableReport(oid, iid, rid, function (err, result) {
            if (err) 
                chkErr = chkErr || err;
        });
    });
};

/*********************************************************
 * Handler function
 *********************************************************/
function serverReqHandler (cn, req, rsp) {
    var optType = serverReqParser(req),
        reqHdlr;

    switch (optType) {
        case 'read':
            reqHdlr = serverReadHandler;
            break;        
        case 'discover':
            reqHdlr = serverDiscoverHandler;
            break;
        case 'write':
            reqHdlr = serverWriteHandler;
            break;
        case 'writeAttr':
            reqHdlr = serverWriteAttrHandler;
            break;
        case 'execute':
            reqHdlr = serverExecuteHandler;
            break;
        case 'observe':
            reqHdlr = serverObserveHandler;
            break;
        case 'cancelObserve':
            reqHdlr = serverCancelObserveHandler;
            break;
        case 'ping':
            reqHdlr = serverPingHandler;
            break;
        case 'announce':
            reqHdlr = serverAnnounceHandler;
            break;
        case 'empty':
            rsp.reset();
            break;
        default:
            break;
    }

    if (reqHdlr)
        process.nextTick(function () {
            reqHdlr(cn, req, rsp);
        });
}

function serverReadHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj || target.type === TTYPE.inst) {
        cn._dumpObj(pathObj.oid, pathObj.iid, function (err, dump) {
            rsp.code = RSP.content;
            rsp.setOption('Content-Format', 'application/json');
            dump = cutils.encodeJsonObj(req.url, dump);
            rsp.end(JSON.stringify(dump));  
        });
    } else if (target.type === TTYPE.rsc) {
        cn.readResrc(pathObj.oid, pathObj.iid, pathObj.rid, function (err, value) {
            if (err) {
                rsp.code = RSP.badreq;
                rsp.end(value);
            } else {
                if (value ===  TAG.unreadable || value === TAG.exec) {
                    rsp.code = RSP.notallowed;
                    rsp.end(value);
                } else {
                    rsp.code = RSP.content;
                    if (_.isPlainObject(value)) {
                        rsp.setOption('Content-Format', 'application/json');
                        value = cutils.encodeJsonObj(req.url, value);
                        rsp.end(JSON.stringify(value));  
                    } else {
                        rsp.end(value.toString());
                    }
                }
            }
        });
    }
}

function serverDiscoverHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rspPayload;

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else {
        rspPayload = buildAttrsAndRsc(cn, pathObj.oid, pathObj.iid, pathObj.rid);
        rsp.code = RSP.content;
        rsp.end(rspPayload);
    }
}

function serverWriteHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        value = cutils.decodeJsonObj(target.type, req.payload);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else if (target.type === TTYPE.inst) {
        cn._writeInst(pathObj.oid, pathObj.iid, value, function (err, data) {
            if (err) {
                if (err === ERR.unwritable)
                    rsp.code = RSP.notallowed;
                else 
                    rsp.code = RSP.badreq;

                rsp.end();
            } else {
                rsp.code = RSP.changed;
                rsp.end();
            }
        });
    } else {
        cn.writeResrc(pathObj.oid, pathObj.iid, pathObj.rid, value, function (err, data) {
            if (err) {
                rsp.code = RSP.badreq;
                rsp.end();
            } else {
                if (data ===  TAG.unwritable || data === TAG.exec) {
                    rsp.code = RSP.notallowed;
                    rsp.end();
                } else {
                    rsp.code = RSP.changed;
                    rsp.end();
                }
            }
        });
    }
}

function serverWriteAttrHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        attrs = cutils.buildRptAttr(req);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (attrs === false) {
        rsp.code = RSP.badreq;
        rsp.end();
    } else {
        cn._setAttrs(pathObj.oid, pathObj.iid, pathObj.rid, attrs);
        rsp.code = RSP.changed;
        rsp.end();
    }
}

function serverExecuteHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        argus = cutils.getArrayArgus(req.payload);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj || target.type === TTYPE.inst || argus === false) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else {
        cn.execResrc(pathObj.oid, pathObj.iid, pathObj.rid, argus, function (err, data) {
            if (err) {
                rsp.code = RSP.badreq;
                rsp.end();
            } else {
                if (data === TAG.unexecutable) {
                    rsp.code = RSP.notallowed;
                    rsp.end(); 
                } else {
                    rsp.code = RSP.changed;
                    rsp.end(); 
                }                
            }
        });
    }
}

function serverObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist && pathObj.oid !== 'heartbeat') {
        rsp.statusCode = RSP.notfound;
        rsp.end();
    } else if (pathObj.oid === 'heartbeat') {
        heartbeat(cn, true, rsp);
        rsp.statusCode = RSP.content;
        rsp.write('hb');
    } else if (cn._reporters[target.pathKey]) {
        rsp.statusCode = RSP.ok;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else {
        cn._enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp, function (err, val) {
            if (err) {
                rsp.statusCode = RSP.notfound;
                rsp.end(val);
            } else {
                if (val ===  TAG.unreadable || val === TAG.exec) {
                    rsp.statusCode = RSP.notallowed;
                    rsp.end(val);
                } else {
                    rsp.statusCode = RSP.content;
                    if (_.isPlainObject(val)) {
                        rsp.setOption('Content-Format', 'application/json');
                        val = cutils.encodeJsonObj(req.url, val);
                        rsp.write(JSON.stringify(val));  
                    } else {
                        rsp.write(val.toString());
                    }
                }
            }
        });
    }
}

function serverCancelObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist && pathObj.oid !== 'heartbeat') {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (pathObj.oid === 'heartbeat') {
        heartbeat(cn, false);
        rsp.code = RSP.content;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else {
        cn._disableReport(pathObj.oid, pathObj.iid, pathObj.rid, function (err, val) {
            if (err) {
                rsp.code = RSP.notfound;
                rsp.end();
            } else {
                rsp.code = RSP.content;
                rsp.end();
            }
        });
    }
}

function serverPingHandler (cn, req, rsp) {
    if (!cn._registered) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else {
        rsp.code = RSP.content;
        rsp.end();
    }
}

function serverAnnounceHandler (cn, req, rsp) {
    cn.emit('announce', req.payload);
}

/*********************************************************
 * Private function
 *********************************************************/
function serverReqParser (req) {
    var optType;

    if (req.code === '0.00' && req._packet.confirmable && req.payload.length === 0) {
        optType = 'empty';
    } else {
        switch (req.method) {
            case 'GET':
                if (req.headers.Observe === 0)
                    optType = 'observe';
                else if (req.headers.Observe === 1)
                    optType = 'cancelObserve';
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
                if (req.url === '/ping')
                    optType = 'ping';
                else if (req.url === '/announce')
                    optType = 'announce';
                else
                    optType = 'execute';
                break;
            default:
                break;
        }
    }
    
    return optType;
}

function startListener(cn, callback) {
    var server;

    server = coap.createServer({
        type: connectionType,
        proxy: true
    });

    cn.servers[cn.port] = server;

    server.on('request', function (req, rsp) {
        if (!_.isEmpty(req.payload) && req.headers && req.headers['Content-Format'] === 'application/json') {
            req.payload = JSON.parse(req.payload);
        } else if (!_.isEmpty(req.payload)) {
            req.payload = req.payload.toString();

            if (!_.isNaN(Number(req.payload)))
                req.payload = Number(req.payload);
        }

        serverReqHandler(cn, req, rsp);
    });

    server.listen(cn.port, function (err) {
        if (err) {
            cn.emit('error', err);
            callback(err);
        } else {
            callback(null, server);
        }
    });
}

function lfUpdate(cn, enable) {
    cn._lfsecs = 0;
    clearInterval(cn._updater);
    cn._updater = null;

    if (enable) {
        cn._updater = setInterval(function () {
            cn._lfsecs += 1;
            if (cn._lfsecs === (cn.lifetime - 5)) {
                cn.update({ lifetime: cn.lifetime }, function (err, msg) {
                    if (err) {
                        cn.emit('error', err);
                    } else {
                        if (msg.status === RSP.notfound)
                            lfUpdate(cn, false);
                    }
                });

                cn._lfsecs = 0;
            }
        }, 1000);
    }
}

function heartbeat(cn, enable, rsp) {
    clearInterval(cn._hbPacemaker);
    cn._hbPacemaker = null;

    if (cn._hbStream.stream) {
        cn._hbStream.stream.end();
        cn._hbStream.stream = null;
    }

    if (enable) {
        cn._hbStream.stream = rsp;
        cn._hbPacemaker = setInterval(function () {
            try {
                cn._hbStream.stream.write('hb');
            } catch (e) {
                cn.emit('error', e);
            }
        }, heartbeatTime * 1000);
    }
}

function checkAndBuildObjList(cn, check) {
    var objListInPlain = '',
        newObjList = {};

    _.forEach(cn.so, function (obj, oid) {
        var oidNumber = cutils.oidNumber(oid);
        newObjList[oidNumber] = [];

        _.forEach(obj, function (iObj, iid) {
            newObjList[oidNumber].push(iid);
        });
    });

    if (!_.isEmpty(cn.objList) && _.isEqual(cn.objList, newObjList) && check === true)
        return null;                // not diff

    cn.objList = newObjList;

    _.forEach(newObjList, function (iidArray, oidNum) {
        var oidNumber = oidNum;

        if (_.isEmpty(iidArray)) {
            objListInPlain += '</' + oidNumber + '>,';
        } else {
            _.forEach(iidArray, function (iid) {
                objListInPlain += '</' + oidNumber + '/' + iid + '>,';
            });
        }
    });

    if (objListInPlain[objListInPlain.length-1] === ',')           
        objListInPlain = objListInPlain.slice(0, objListInPlain.length-1);

    return objListInPlain;
}

function checkAndReportResrc(cn, oid, iid, rid, val) {
    var target = cn._target(oid, iid, rid),
        oidKey = target.oidKey,
        ridKey = target.ridKey,
        rAttrs = cn._getAttrs(oidKey, iid, ridKey),
        iAttrs = cn._getAttrs(oidKey, iid),
        gt = rAttrs.gt,
        lt = rAttrs.lt,
        step = rAttrs.step,
        lastRpVal = rAttrs.lastRpVal,
        rpt = cn._reporters[target.pathKey],
        iRpt = cn._reporters[oidKey + '/' + iid],
        chkRp = false,
        iObj = {};

    if (!rAttrs.enable && !iAttrs.enable)
        return false;

    if (_.isNil(lastRpVal))
        lastRpVal = iAttrs.lastRpVal[ridKey];

    if (_.isObject(val)) {
        if (_.isObject(lastRpVal)) {
            _.forEach(lastRpVal, function (v, k) {
                chkRp = chkRp || (v !== lastRpVal[k]);
            });
        } else {
            chkRp = true;
        }
    } else if (!_.isNumber(val)) {
        chkRp = (lastRpVal !== val);
    } else {
        if (_.isNumber(gt) && _.isNumber(lt) && lt > gt) {
            chkRp = (lastRpVal !== val) && (val > gt) && (val < lt);
        } else if (_.isNumber(gt) && _.isNumber(lt)) {
            chkRp = _.isNumber(gt) && (lastRpVal !== val) && (val > gt);
            chkRp = chkRp || (_.isNumber(lt) && (lastRpVal !== val) && (val < lt));
        } else {
            chkRp = (lastRpVal !== val);
        }

        if (_.isNumber(step)) {
            chkRp = chkRp || (Math.abs(val - lastRpVal) > step);
        }
    }

    if (rAttrs.mute && rAttrs.enable) {
        setTimeout(function () {
            checkAndReportResrc(cn, oidKey, iid, ridKey, val);
        }, rAttrs.pmin * 1000);
    } else if (!rAttrs.mute && chkRp && rAttrs.enable && _.isFunction(rpt.write)) {
        rpt.write(val);
    }

    if (iAttrs.mute && iAttrs.enable) {
        setTimeout(function () {
            checkAndReportResrc(cn, oidKey, iid, ridKey, val);
        }, iAttrs.pmin * 1000);
    } else if (!iAttrs.mute && chkRp && iAttrs.enable && _.isFunction(iRpt.write)) {
        iObj[ridKey] = val;
        iRpt.write(iObj);
    }
}

function buildAttrsAndRsc(cn, oid, iid, rid) {
    var payload = '',
        attrs = cn._getAttrs(oid, iid, rid),
        attrsPayload = '',
        allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        target = cn._target(oid, iid, rid),
        onum,
        rnum;

    _.forEach(attrs, function (val, key) {
        if (_.includes(allowedAttrs, key))
            attrsPayload = attrsPayload + ';' + key + '=' + val;   // ';pmin=0;pmax=60'
    });

    if (target.type === TTYPE.obj) {
        onum = cutils.oidNumber(oid);
        payload = '</' + onum + '>' + attrsPayload + ',';
        _.forEach(target.value, function (iobj, ii) {
            _.forEach(iobj, function (val, rkey) {
                rnum = cutils.ridNumber(oid, rkey);
                payload = payload + '</' + onum + '/' + ii + '/' + rnum + '>' + ',';
            });
        });
    } else if (target.type === TTYPE.inst) {
        onum = cutils.oidNumber(oid);
        payload = '</' + onum + '/' + iid + '>' + attrsPayload + ',';
        _.forEach(target.value, function (val, rkey) {
            rnum = cutils.ridNumber(oid, rkey);
            payload = payload + '</' + onum + '/' + iid + '/' + rnum + '>' + ',';
        });

    } else if (target.type === TTYPE.rsc) {
        onum = cutils.oidNumber(oid);
        rnum = cutils.ridNumber(oid, rid);
        payload = '</' + onum + '/' + iid + '/' + rnum + '>' + attrsPayload + ',';
    }

    return payload.slice(0, payload.length - 1);
}

function checkAndCloseServer(cn, enable) {
    clearInterval(cn._socketServerChker);
    cn._socketServerChker = null;

    if (enable) {
        cn._socketServerChker = setInterval(function () {
            _.forEach(cn.servers, function (server, key) {
                var using = false;

                _.forEach(cn._reporters, function (reporter, path) {
                    if (server._port === reporter.port)
                        using = true;
                });

                if (using === false && server._port !== cn.port) {
                    server.close();
                    cn.servers[key] = null;
                    delete cn.servers[key];
                }
            });
        }, serverChkTime * 1000);  
    }
}

function invokeCbNextTick(err, val, cb) {
    if (_.isFunction(cb))
        process.nextTick(function () {
            cb(err, val);
        });
}

module.exports = CoapNode;
