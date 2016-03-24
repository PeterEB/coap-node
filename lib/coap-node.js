'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('lodash'),
    network = require('network'),
    coap = require('coap');

var cutils = require('./utils/cutils.js'),
    config = require('../config.js');

/**** Code Enumerations ****/
var TTYPE = { root: 0, obj: 1, inst: 2, rsc: 3 },
    TAG = { notfound: '_notfound_', unreadable: '_unreadable_', exec: '_exec_', unwritable: '_unwritable_', unexecutable: '_unexecutable_' },
    ERR = { success: 0, notfound: 1, unreadable: 2, unwritable: 3, unexecutable: 4, timeout: 5, badtype: 6 },
    RSP = { ok: '2.00', created: '2.01', deleted: '2.02', changed: '2.04', content: '2.05', badreq: '4.00',
            unauth: '4.01', forbid: '4.03', notfound: '4.04', notallowed: '4.05', timeout: '4.08', dberror: '5.00' };

var clientDefaultPort = config.clientDefaultPort || 5685,
    connectionType = config.connectionType || 'udp4',
    reqTimeout = config.reqTimeout || 10,
    heartbeatTime = config.heartbeatTime || 30,
    serverChkTime = config.serverChkTime || 60;

function CoapNode (clientName, devAttrs) {
    if (!_.isString(clientName)) throw new TypeError('clientName should be a string.');
    EventEmitter.call(this);

    devAttrs = devAttrs || {};

    this.servers = {};

    this.clientName = clientName;
    this.locationPath = 'unknown';

    this.lifetime = Math.floor(devAttrs.lifetime) || 86400;
    this.version = devAttrs.version || '1.0.0';

    this.ip = devAttrs.ip || null;
    this.mac = devAttrs.mac || null;
    this.port = devAttrs.port || clientDefaultPort;

    this._serverIp = null;
    this._serverPort = null;

    this.objList = null;
    this.so = null;

    this._registered = false;

    this._lfsecs = 0;
    this._updater = null;
    this._repAttrs = {};
    this._reporters = {};

    this._hbPacemaker = null;
    this._hbStream = { stream: null, port: null };
    this._serverChker = null;

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

    _startListener(this, function (err) {
        if (err) throw err;
    });

    _checkAndCloseServer(this, true);
};

CoapNode.prototype.initResrc = function (oid, iid, resrcs) {
    if (!_.isPlainObject(resrcs)) throw new TypeError('resrcs should be an object.');
    var self = this,
        okey = cutils.oidKey(oid);

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

        if (!_.isNil(data)) _checkAndReportResrc(self, oid, iid, rid, data);
    }

    if (!target.exist) {
        invokeCb(ERR.notfound, null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.read)) {
            rsc.read(function (err, val) {
                invokeCb(ERR.success, val, callback);
            });
        } else if (_.isFunction(rsc.exec)) {
            invokeCb(ERR.unreadable, TAG.exec, callback);
        } else {
            invokeCb(ERR.unreadable, TAG.unreadable, callback);
        }
    } else if (_.isObject(rsc)) {
        invokeCb(ERR.success, _.omit(rsc, ['_isCb']), callback);
    } else { 
        invokeCb(ERR.success, rsc, callback);
    }
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
            _.forEach(iObj, function (rsc, rid) {
                count += 1;
            });
        });

        _.forEach(target.value, function (iObj, ii) {
            dump[ii] = {};
            _.forEach(iObj, function (rsc, rid) {
                self.readResrc(oid, ii, rid, function (err, data) {
                    count -= 1;
                    dump[ii][cutils.ridNumber(oid, rid)] = data;

                    if (count === 0 && _.isFunction(callback))
                        callback(null, dump);
                });
            });
        });
    } else if (target.exist && target.type === TTYPE.inst) {

        _.forEach(target.value, function (rsc, rid) {
            count += 1;
        });

        _.forEach(target.value, function (rsc, rid) {
            self.readResrc(oid, iid, rid, function (err, data) {
                count -= 1;
                dump[cutils.ridNumber(oid, rid)] = data;

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

        if (!_.isNil(data)) _checkAndReportResrc(self, oid, iid, rid, data);
    }

    if (!target.exist){
        invokeCb(ERR.notfound, null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.write)) {
            rsc.write(value, function (err, val) {
                invokeCb(ERR.success, val, callback);
            });
        } else if (_.isFunction(rsc.exec)) {
            invokeCb(ERR.unwritable, TAG.exec, callback);
        } else {
            invokeCb(ERR.unwritable, TAG.unwritable, callback);
        }
    } else {
        if (typeof rsc !== typeof value) {
            invokeCb(ERR.badtype, null, callback);
        } else {
            this.so[okey][iid][rkey] = value;
            invokeCb(ERR.success, value, callback);
        }
    }
};

CoapNode.prototype._writeInst = function (oid, iid, value, callback) {
    var self = this,
        target = this._target(oid, iid),
        okey = cutils.oidKey(oid),
        dump = {},
        chkErr = null,
        count = 0;

    if (!target.exist){
        callback(ERR.notfound, null);
    } else {
        _.forEach(value, function (rsc, rid) {
            var rtarget = self._target(oid, iid, rid),
                rval = rtarget.value;

            count += 1;

            if (!rtarget.exist){
                chkErr = chkErr || ERR.notfound;
            } else if (_.isObject(rval) && rval._isCb) {
                if (_.isFunction(rval.write)) {
                    chkErr = chkErr || ERR.success;
                } else if (_.isFunction(rval.exec)) {
                    chkErr = chkErr || ERR.unwritable;
                } else {
                    chkErr = chkErr || ERR.unwritable;
                }
            } else {
                if (typeof rval !== typeof rsc) {
                    chkErr = chkErr || ERR.badtype;
                } else {
                    chkErr = chkErr || ERR.success;
                }
            }
        });

        if (chkErr && _.isFunction(callback)) {
            callback(chkErr, null);
        } else {
            _.forEach(value, function (rsc, rid) {
                self.writeResrc(oid, iid, rid, rsc, function (err, data) {
                    count -= 1;

                    if (err)
                        chkErr = chkErr || err;
                    else
                        dump[cutils.ridNumber(oid, rid)] = data;

                    if (count === 0 && _.isFunction(callback))
                        callback(chkErr, dump);
                });
            });
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

// [TODO] check argus
    if (!target.exist){
        invokeCb(ERR.notfound, null, callback);
    } else if (_.isObject(rsc) && rsc._isCb) {
        if (_.isFunction(rsc.exec)) {
            argus.push(function (err, val) {
                invokeCb(ERR.success, val, callback);
            });
            rsc.exec.apply(this, argus);
        } else {
            invokeCb(ERR.unexecutable, TAG.unexecutable, callback);
        }
    } else {
        invokeCb(ERR.unexecutable, TAG.unexecutable, callback);
    }
};

CoapNode.prototype.register = function (ip, port, callback) {
    if (!_.isString(ip)) throw new TypeError('ip should be a string.');
    var self = this,
        reqObj = { 
            hostname: ip, 
            port: port, 
            pathname: '/rd',
            query: 'ep=' + this.clientName + '&lt=' + this.lifetime + '&lwm2m=' + this.version, 
            payload: _checkAndBuildObjList(this, false),
            method: 'POST'
        },
        msg;

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });
    }

    this.request(reqObj, function (err, rsp) {
        if (err) {
            invokeCb(err, null, callback);
        } else {
            msg = { status: rsp.code };

            if (rsp.code === RSP.created || rsp.code === RSP.changed) {
                self._serverIp = ip;
                self._serverPort = port;
                _lfUpdate(self, true);
                self.locationPath = rsp.headers['Location-Path'];
                self.port = rsp.outSocket.ip;
                self.port = rsp.outSocket.port;
                self._registered = true;

                setTimeout(function () {
                    _startListener(self, function (err) {
                        if (err) {
                            _lfUpdate(self, false);
                            invokeCb(err, null, callback);
                        } else {
                            invokeCb(null, msg, callback);
                            self.emit('registered');
                        }
                    });
                }, 100 );

            } else {
                invokeCb(null, msg, callback);
            }
        }
    });
};

CoapNode.prototype._update = function (attrs, callback) {
    if (!_.isPlainObject(attrs)) throw new Error('attrs should be an object.');
    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort,
            pathname: this.locationPath,
            query: _buildUpdateQuery(attrs),
            payload: attrs.objList,
            method: 'PUT'
        };

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });
    }

    if (this._registered === true) {
        this.request(reqObj, function (err, rsp) {
            if (err) {
                invokeCb(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    msg.data = attrs;

// [TODO] update ip
                    // if (self.ip !== rsp.outSocket.address) {
                    //     self.ip = rsp.outSocket.address;
                    //     attrs.ip = rsp.outSocket.address;
                    // }

                    if (self.port !== rsp.outSocket.port) {
                        self.port = rsp.outSocket.port;
                        attrs.port = rsp.outSocket.port;
                    }

                    setTimeout(function () {
                        _startListener(self, function (err) {
                            if (err) {
                                invokeCb(err, null, callback);
                            } else {
                                invokeCb(null, msg, callback);
                                self.emit('update');
                            }
                        });
                    }, 100 );
                } else {
                    invokeCb(null, msg, callback);
                }
            }
        });
    } else {
        invokeCb( null, { status: RSP.notfound }, callback);
    }
};

CoapNode.prototype.setDevAttrs = function (attrs, callback) {
    if (!_.isPlainObject(attrs)) throw new Error('attrs should be an object.');
    var self = this,
        updateObj = {},
        objListInPlain,
        localStatus;

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime) {
            self.lifetime = self.so.lwm2mServer[0].lifetime = updateObj.lifetime = attrs.lifetime;
            _lfUpdate(self, true);
        } else if (key === 'ip' && attrs.ip !== self.ip) {
            self.ip = self.so.connMonitor[0].ip = updateObj.ip = attrs.ip;
        } else if (key === 'version' && attrs.version !== self.version) {
            self.version = updateObj.version = attrs.version;
        } else {
            localStatus = RSP.badreq;
        }
    });

    objListInPlain = _checkAndBuildObjList(self, true);

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

CoapNode.prototype.deregister = function (callback) {
    var self = this,
        reqObj = { 
            hostname: this._serverIp, 
            port: this._serverPort, 
            pathname: this.locationPath,
            method: 'DELETE'
        };

    function invokeCb(err, data, cb) {
        if (_.isFunction(cb))
            process.nextTick(function () {
                cb(err, data);
            });
    }

    if (this._registered === true) {

        this.request(reqObj, function (err, rsp) {
            if (err) {
                invokeCb(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.deleted) {
                    _.forEach(self.servers, function (server, key) {
                        if (key !== clientDefaultPort)
                            server.close();
                    });
                    _lfUpdate(self, false);
                    self._disableAllReport();
                    self._serverIp = null;
                    self._serverPort = null;
                    self._registered = false;
                    self.emit('deregistered');
                }

                invokeCb(null, msg, callback);
            }
        });
    } else {
        invokeCb(null, { status: RSP.notfound }, callback);
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

        function invokeCb(err, data, cb) {
            if (_.isFunction(cb))
                process.nextTick(function () {
                    cb(err, data);
                });
        }
// [TODO] lookupType
        this.request(reqObj, function (err, rsp) {
            if (err) {
                invokeCb(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.content) {
                    msg.data = rsp.payload;
                }  

                invokeCb(null, msg, callback);
            }
        });
};

CoapNode.prototype.request = function (reqObj, callback) {
    if (!_.isPlainObject(reqObj)) throw new Error('reqObj should be an object.');
    var self = this,
        agent = new coap.Agent({ type: connectionType }),
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
        if (trg.type === TTYPE.obj)
            trg.value = this.so[okey];
        else if (trg.type === TTYPE.inst)
            trg.value = this.so[okey][iid];
        else if (trg.type === TTYPE.rsc)
            trg.value = this.so[okey][iid][rkey];
    }
    return trg;
};

CoapNode.prototype._setAttrs = function (oid, iid, rid, attrs) {
    if (!_.isPlainObject(attrs)) throw new TypeError('attrs should be given as an object.');   
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
        allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        target = this._target(oid, iid, rid),
        onum,
        rnum;

    _.forEach(attrs, function (val, key) {
        if (_.includes(allowedAttrs, key))
            attrsPayload = attrsPayload + ';' + key + '=' + val;   // ';pmin=1;pmax=60'
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

    if (target.type === TTYPE.obj) {
        key = okey;
        dumper = function (cb) {
            self._dumpObj(oid, cb);
        };
    } else if (target.type === TTYPE.inst) {
        key = okey + '/' + iid;
        dumper = function (cb) {
            self._dumpObj(oid, iid, cb);
        };
    } else if (target.type === TTYPE.rsc) {
        rkey = cutils.ridKey(oid, rid);
        key = okey + '/' + iid + '/' + rkey;
        dumper = function (cb) {
            self.readResrc(oid, iid, rid, cb);
        };
    }

    function reporterMax () {  
        rAttrs.cancel = true;
        dumper(function (err, val) {
            rAttrs.mute = true;
            rAttrs.cancel = true;
            rpt.write(val);
        });

        if (!_.isNil(rpt.min))
            clearTimeout(rpt.min);

        rpt.min = setTimeout(function () {
            rAttrs.mute = false;
        }, pmin);
    }

    dumper(function (err, data) {
        if (!err) {
            rAttrs.cancel = false;
            rAttrs.lastRpVal = data;

            pmin = rAttrs.pmin * 1000;
            pmax = rAttrs.pmax * 1000;
            self._reporters[key] = { min: null, max: null, write: null, stream: rsp, port: self.port };
            rpt = self._reporters[key];

            rpt.min = setTimeout(function () {
                rAttrs.mute = false;
            }, pmin);

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
        }

        if (_.isFunction(callback))
            callback(err, data);
    });
};

CoapNode.prototype._disableReport = function (oid, iid, rid, callback) {
    var target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        okey = cutils.oidKey(oid),
        rkey,
        key,
        rpt;

    if (target.type === TTYPE.obj) {
        key = okey;
    } else if (target.type === TTYPE.inst) {
        key = okey + '/' + iid;
    } else if (target.type === TTYPE.rsc) {
        rkey = cutils.ridKey(oid, rid);
        key = okey + '/' + iid + '/' + rkey;
    }

    rpt = this._reporters[key];

    if (rpt) {
        clearTimeout(rpt.min);
        clearInterval(rpt.max);
        rpt.stream.end();

        rAttrs.cancel = true;
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
            callback(ERR.badtype, null);
    }
};

CoapNode.prototype._disableAllReport = function () {
    var self = this,
        rAttrs;

    _heartbeat(this, false);

    _.forEach(this._reporters, function (rpt, key) {
        var oid = key.split('/')[0],
            iid = key.split('/')[1],
            rid = key.split('/')[2];

        rAttrs = self._getAttrs(oid, iid, rid);

        clearTimeout(rpt.min);
        clearInterval(rpt.max);
        rpt.stream.end();

        rAttrs.cancel = true;
        rAttrs.mute = true;
        rpt.min = null;
        rpt.max = null;
        rpt.write = null;
        rpt.stream = null;
        rpt.port = null;
        delete self._reporters[key];
    });
};

/*********************************************************
 * Handler function
 *********************************************************/
function _serverReqHandler (cn, req, rsp) {
    var optType = _serverReqParser(req),
        reqHdlr;

    switch (optType) {
        case 'read':
            reqHdlr = _serverReadHandler;
            break;        
        case 'discover':
            reqHdlr = _serverDiscoverHandler;
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
        case 'observe':
            reqHdlr = _serverObserveHandler;
            break;
        case 'cancelObserve':
            reqHdlr = _serverCancelObserveHandler;
            break;
        case 'ping':
            reqHdlr = _serverPingHandler;
            break;
        case 'announce':
            reqHdlr = _serverAnnounceHandler;
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

function _serverReadHandler (cn, req, rsp) {
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
        });
    }
}

function _serverDiscoverHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rspPayload = '';

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else {
        rspPayload = cn._buildAttrsAndRsc(pathObj.oid, pathObj.iid, pathObj.rid);
        rsp.code = RSP.content;
        rsp.end(rspPayload);
    }
}

function _serverWriteHandler (cn, req, rsp) {
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
                if (err === ERR.badtype)
                    rsp.code = RSP.badreq;
                else 
                    rsp.code = RSP.notallowed;

                rsp.end();
            } else {
                rsp.code = RSP.changed;
                rsp.end();
            }
        });
    } else {
        cn.writeResrc(pathObj.oid, pathObj.iid, pathObj.rid, value, function (err, data) {
            if (err) {
                if (err === ERR.badtype)
                    rsp.code = RSP.badreq;
                else 
                    rsp.code = RSP.notallowed;

                rsp.end();
            } else {
                rsp.code = RSP.changed;
                rsp.end();
            }
        });
    }
}

function _serverWriteAttrHandler (cn, req, rsp) {
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

function _serverExecuteHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        argus = _getArrayArgus(req.payload);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj || target.type === TTYPE.inst || argus === false) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else {
        cn.execResrc(pathObj.oid, pathObj.iid, pathObj.rid, argus, function (err, data) {
            if (err) {
                rsp.code = RSP.notallowed;
                rsp.end();
            } else {
                rsp.code = RSP.changed;
                rsp.end();                 
            }
        });
    }
}

function _serverObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist && pathObj.oid !== 'heartbeat') {
        rsp.statusCode = RSP.notfound;
        rsp.end();
    } else if (pathObj.oid === 'heartbeat') {
        _heartbeat(cn, true, rsp);
        rsp.statusCode = RSP.content;
        rsp.write(cutils.getTime().toString());
    } else {
        cn._enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp, function (err, val) {
            if (err) {
                rsp.statusCode = RSP.notallowed;
                rsp.end(val);
            } else {
                rsp.statusCode = RSP.content;
                if (_.isPlainObject(val)) {
                    rsp.setOption('Content-Format', 'application/json');
                    rsp.write(JSON.stringify(val));  
                } else {
                    rsp.write(val.toString());
                }
            }
        });
    }
}

function _serverCancelObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist && pathObj.oid !== 'heartbeat') {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (pathObj.oid === 'heartbeat') {
        _heartbeat(cn, false);
        rsp.code = RSP.content;
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

function _serverPingHandler (cn, req, rsp) {
    if (!cn._registered) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else {
        rsp.code = RSP.content;
        rsp.end();
    }
}

function _serverAnnounceHandler (cn, req, rsp) {
    cn.emit('announce', req.payload);
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

function _startListener(cn, callback) {
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

        _serverReqHandler(cn, req, rsp);
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

function _buildUpdateQuery (attrs) {
    var query = '';

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' || key === 'lt')
            query += 'lt=' + val + '&';
        else if (key === 'version' || key === 'lwm2m')
            query += 'lwm2m=' + val + '&';
    });

    if (query[query.length-1] === '&')           
        query = query.slice(0, query.length-1);

    return query;
}

function _checkAndBuildObjList(cn, check) {
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
                        cn.emit('error', err);
                    } else {
                        if (msg.status === RSP.notfound)
                            _lfUpdate(cn, false);
                    }
                });

                cn._lfsecs = 0;
            }
        }, 1000);
    }
}

function _heartbeat(cn, enable, rsp) {
    clearInterval(cn._hbPacemaker);
    cn._hbPacemaker = null;

    if (cn._hbStream.stream) {
        cn._hbStream.stream.end();
        cn._hbStream.stream = null;
    }

    if (enable) {
        cn._hbStream.stream = rsp;
        cn._hbPacemaker = setInterval(function () {
            cn._hbStream.stream.write(cutils.getTime().toString());
        }, heartbeatTime * 1000);
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
        chkRp = false;

    if (rAttrs.cancel)
        return false;

    if (target.type === TTYPE.obj) {
        key = okey;
    } else if (target.type === TTYPE.inst) {
        key = okey + '/' + iid;
    } else if (target.type === TTYPE.rsc) {
        rkey = cutils.ridKey(oid, rid);
        key = okey + '/' + iid + '/' + rkey;
    }

    rpt = cn._reporters[key];

    if (rAttrs.mute) {
        setTimeout(function () {
            _checkAndReportResrc(cn, oid, iid, rid, val);
        }, rAttrs.pmin * 1000);
    } else {
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
    }

    if (chkRp && _.isFunction(rpt.write)) {
        rpt.write(val);
        rAttrs.lastRpVal = val;

// [TODO] observe obj/inst, readResrc need report argu
        // if (target.type === TTYPE.inst) {
        //     _checkAndReportResrc(cn, oid, null, null);
        // } else if (target.type === TTYPE.rsc) {
        //     _checkAndReportResrc(cn, oid, iid, null);
        // }
    }
}

function _checkAndCloseServer(cn, enable) {
    clearInterval(cn._serverChker);
    cn._serverChker = null;

    if (enable) {
        cn._serverChker = setInterval(function () {
            _.forEach(cn.servers, function (server, key) {
                var using = false;

                _.forEach(cn._reporters, function (reporter, path) {
                    if (server._port === reporter.port)
                        using = true;
                });

                if (using === false && server._port !== clientDefaultPort && server._port !== cn.port) {
                    server.close();
                    cn.servers[key] = null;
                    delete cn.servers[key];
                }
            });
        }, serverChkTime * 1000);  
    }
}

function _getArrayArgus(argusInPlain) {
    var argusInArray = [],
        notallowed = [' ', '"', "'", '\\'],
        isAnyNotallowed = false;

    function chkCharSyntax(string) {
        _.forEach(notallowed, function (val) {
            if (_.includes(string, val))
                isAnyNotallowed = true;
        });
    }

    if (_.isEmpty(argusInPlain))
        return [];

    _.forEach(argusInPlain.split(','), function (argu) {
        if (Number(argu)) {
            argusInArray.push(Number(argu));
        } else if (_.includes(argu, '=')) {
            argusInArray.push(argu.split('=')[1].slice(1, argu.length - 1));
            chkCharSyntax(argusInArray[argusInArray.length - 1]);
        } else {
            argusInArray.push(argu.slice(1, argu.length - 1));
            chkCharSyntax(argusInArray[argusInArray.length - 1]);
        }
    });

    if (isAnyNotallowed)
        return false;
    else
        return argusInArray;
}

module.exports = CoapNode;
