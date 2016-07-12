'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('busyman'),
    network = require('network'),
    SmartObject = require('smartobject'),
    coap = require('coap');

var reqHandler = require('./reqHandler'),
    cutils = require('./utils/cutils'),
    helper = require('./helper'),
    config = require('../config'),
    CNST = require('./constants');

/**** Code Enumerations ****/
var TTYPE = CNST.TTYPE,
    TAG = CNST.TAG,
    ERR = CNST.ERR,
    RSP = CNST.RSP;

var connectionType = config.connectionType || 'udp4',
    reqTimeout = config.reqTimeout || 60;

/*********************************************************
 * CoapNode                                              *
 *********************************************************/
function CoapNode (clientName, devAttrs) {
    if (!_.isString(clientName)) 
        throw new TypeError('clientName should be a string.');

    EventEmitter.call(this);

    devAttrs = devAttrs || {};

    this.servers = {};

    this.clientName = clientName;
    this.locationPath = 'unknown';

    this.lifetime = devAttrs.lifetime || 86400;
    this.version = devAttrs.version || '1.0.0';

    this.ip = 'unknown';
    this.mac = 'unknown';
    this.port = 'unknown';

    this._serverIp = 'unknown';
    this._serverPort = 'unknown';

    this.objList = null;
    this.so = new SmartObject();

    if (devAttrs.autoReRegister === false)
        this.autoReRegister = false;
    else 
        this.autoReRegister = true;

    this._registered = false;

    this._repAttrs = {};
    this._reporters = {};

    this._lfsecs = 0;
    this._updater = null;
    this._hbPacemaker = null;
    this._hbStream = { stream: null, port: null };
    this._socketServerChker = null;

    init(this, devAttrs);
}

util.inherits(CoapNode, EventEmitter);

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
        throw new TypeError('attrs should be an object.');

    var self = this,
        updateObj = {},
        objListInPlain,
        localStatus;

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime) {
            self.lifetime = self.so.lwm2mServer[0].lifetime = updateObj.lifetime = attrs.lifetime;
            helper.lfUpdate(self, true);
        } else if (key === 'version' && attrs.version !== self.version) {
            self.version = updateObj.version = attrs.version;
        } else {
            localStatus = RSP.badreq;
        }
    });

    objListInPlain = helper.checkAndBuildObjList(self, true);

    if (!_.isNil(objListInPlain))
        updateObj.objList = objListInPlain;

    if (localStatus) {
        if (_.isFunction(callback))
            callback(null, { status: localStatus });
    } else {
        this._update(updateObj, callback);
    }
};

/*********************************************************
 * resources function                                    *
 *********************************************************/
CoapNode.prototype.initResrc = function (oid, iid, resrcs) {
    this.so.createIpsoOnly(oid);
    this.so.addResources(oid, iid, resrcs);
};

CoapNode.prototype.readResrc = function (oid, iid, rid, callback) {
    var self = this;

    this.so.readResource(oid, iid, rid, function (err, val) {
        if (!_.isNil(val)) helper.checkAndReportResrc(self, oid, iid, rid, val);
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

    if (!target.exist) {
        if (_.isFunction(callback))
            callback(null, null);
    } else if (target.type === TTYPE.obj) {
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
    } else if (target.type === TTYPE.inst) {
        count = _.keys(target.value).length;

        _.forEach(target.value, function (rsc, rid) {
            self.readResrc(oid, iid, rid, function (err, data) {
                count -= 1;
                dump[rid] = data;

                if (count === 0 && _.isFunction(callback))
                    callback(null, dump);
            });
        });
    }
};
CoapNode.prototype.writeResrc = function (oid, iid, rid, value, callback) {
    var self = this;
    this.so.writeResource(oid, iid, rid, value, function (err, val) {
        if (!_.isNil(val)) helper.checkAndReportResrc(self, oid, iid, rid, val);
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

    if ((!_.isString(port) && !_.isNumber(port)) || _.isNaN(port)) 
        throw new TypeError('port should be a string or a number.');

    var self = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            payload: helper.checkAndBuildObjList(this, false),
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
                    helper.lfUpdate(self, false);
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
                    helper.lfUpdate(self, true);
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
        throw new TypeError('attrs should be an object.');

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
                    helper.lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    invokeCbNextTick(null, msg, callback);
                    self.emit('updated');
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
                    helper.lfUpdate(self, false);
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
        throw new TypeError('reqObj should be an object.');

    if (_.isFunction(ownAgent)) {
        callback = ownAgent;
        ownAgent = undefined;
    }

    var self = this,
        agent = ownAgent || new coap.Agent({ type: connectionType }),
        req = agent.request(reqObj);

    req.on('response', function(rsp) {
        if (!_.isEmpty(rsp.payload) && rsp.headers && rsp.headers['Content-Format'] === 'application/json')
            rsp.payload = JSON.parse(rsp.payload);
        else if (!_.isEmpty(rsp.payload))
            rsp.payload = rsp.payload.toString();

        if (_.isFunction(callback))
            callback(null, rsp);
    });

    req.on('error', function(err) {
        if (err.retransmitTimeout) {
            if (_.isFunction(callback))
                callback(null, { code: RSP.timeout });
        } else {
            self.emit('error', err);
            if (_.isFunction(callback))
                callback(err); 
        }        
    });

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
        key = target.pathKey,
        rAttrs = this._getAttrs(oid, iid, rid),
        pmin = rAttrs.pmin * 1000,
        pmax = rAttrs.pmax * 1000,
        rpt,
        dumper;

    if (target.type === TTYPE.inst) {
        dumper = function (cb) {
            self._dumpObj(oid, iid, cb);
        };
    } else if (target.type === TTYPE.rsc) {
        dumper = function (cb) {
            self.readResrc(oid, iid, rid, cb);
        };
    }

    function reporterMin() {
        rAttrs.mute = false;
    }

    function reporterMax() {  
        dumper(function (err, val) {
            if (err) {
                self.emit('error', err);
            } else {
                rpt.write(val);
            }
        });
    }

    function reporterWrite(val) {
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

        if (!_.isNil(rpt.min))
            clearTimeout(rpt.min);
        
        if (!_.isNil(rpt.max))
            clearInterval(rpt.max);

        rpt.min = setTimeout(reporterMin, pmin);
        rpt.max = setInterval(reporterMax, pmax);
    }

    dumper(function (err, data) {
        if (!err && data !== TAG.unreadable && data !== TAG.exec) {

            rAttrs.mute = false;
            rAttrs.enable = true;
            rAttrs.lastRpVal = data;

            rsp.on('finish', function () {
                self._disableReport(oid, iid, rid);
            });

            rpt = self._reporters[key] = { 
                min: setTimeout(reporterMin, pmin), 
                max: setInterval(reporterMax, pmax), 
                write: reporterWrite, 
                stream: rsp, 
                port: self.port 
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

    helper.heartbeat(this, false);

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
 * Private function                                      *
 *********************************************************/
function init(cn, devResrcs) {
    var maxLatency = (reqTimeout - 47)/ 2;

    coap.updateTiming({
        maxLatency: maxLatency
    });

    cn.initResrc('lwm2mServer', 0, {              // oid = 1
        shortServerId: 'unknown',                   // rid = 0
        lifetime: cn.lifetime,                    // rid = 1
        defaultMinPeriod: config.defaultMinPeriod,  // rid = 2
        defaultMaxPeriod: config.defaultMaxPeriod   // rid = 3
    });

    cn.initResrc('device', 0, {                 // oid = 3
        manuf: devResrcs.manuf || 'sivann',        // rid = 0
        model: devResrcs.model || 'cnode-01',      // rid = 1
        serial: devResrcs.serial || 'c-0000',      // rid = 2
        firmware: devResrcs.firmware || 'v1.0',    // rid = 3
        devType: devResrcs.devType || 'generic',   // rid = 17
        hwVer: devResrcs.hwVer || 'v1.0',          // rid = 18
        swVer: devResrcs.swVer || 'v1.0',          // rid = 19
        availPwrSrc: devResrcs.availPwrSrc || 'unknown',
        pwrSrcVoltage: devResrcs.pwrSrcVoltage || 'unknown'
    });

    cn.initResrc('connMonitor', 0, {      // oid = 4
        ip: cn.ip,                        // rid = 4
        routeIp: 'unknown'                  // rid = 5         
    });

    helper.checkAndCloseServer(cn, true);
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

        reqHandler(cn, req, rsp);
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

function invokeCbNextTick(err, val, cb) {
    if (_.isFunction(cb))
        process.nextTick(function () {
            cb(err, val);
        });
}

/*********************************************************
 * Module Exports                                        *
 *********************************************************/
module.exports = CoapNode;
