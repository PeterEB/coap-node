'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    SmartObject = require('smartobject'),
    _ = require('busyman'),
    coap = require('coap'),
    debug = require('debug')('coap-node'),
    logReq = require('debug')('coap-node:request'),
    logRsp = require('debug')('coap-node:response');

var reqHandler = require('./components/reqHandler'),
    cutils = require('./components/cutils'),
    helper = require('./components/helper'),
    CNST = require('./components/constants'),
    config = require('./config'),
    init = require('./init');

if (process.env.npm_lifecycle_event === 'test') {
    var network = {
        get_active_interface: function (cb) {
            setTimeout(function () {
                cb(null, {
                    ip_address: '127.0.0.1',
                    gateway_ip: '192.168.1.1',
                    mac_address: '00:00:00:00:00:00'
                });
            }, 100);
        }
    };
} else {
    var network = require('network');
}

/**** Code Enumerations ****/
var TTYPE = CNST.TTYPE,
    TAG = CNST.TAG,
    ERR = CNST.ERR,
    RSP = CNST.RSP;

/*********************************************************
 * CoapNode                                              *
 *********************************************************/
function CoapNode (clientName, smartObj, devAttrs) {
    if (!_.isString(clientName))
        throw new TypeError('clientName should be a string.');

    if (!_.isObject(smartObj))
        throw new TypeError('smartObj should be a instance of SmartObject Class.');

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
    this.so = smartObj;
    this.autoReRegister = devAttrs.autoReRegister || true;

    this._registered = false;
    this._sleep = false;

    this._repAttrs = {};
    this._reporters = {};

    this._lfsecs = 0;
    this._updater = null;
    this._hbPacemaker = null;
    this._hbStream = { stream: null, port: null, finishCb: null };
    this._socketServerChker = null;

    this._config = {
        connectionType: config.connectionType || 'udp4',
        reqTimeout: config.reqTimeout || 60,
        defaultMinPeriod: config.defaultMinPeriod || 0,
        defaultMaxPeriod: config.defaultMaxPeriod || 60,
        heartbeatTime: config.heartbeatTime || 20,
        serverChkTime: config.serverChkTime || 60
    };

    init.setupNode(this, devAttrs);
}

util.inherits(CoapNode, EventEmitter);

CoapNode.prototype._updateNetInfo = function (callback) {
    var self = this;

    network.get_active_interface(function(err, obj) {
        if (err) {
            callback(err);
        } else {
            self.ip = obj.ip_address;
            self.mac = obj.mac_address;
            self.so.set('connMonitor', 0, 'ip', self.ip);
            self.so.set('connMonitor', 0, 'routeIp', obj.gateway_ip || 'unknown');
            callback(null, { ip: obj.ip_address, mac: obj.mac_address, routeIp: obj.gateway_ip });
        }
    });
};

/*********************************************************
 * resources function                                    *
 *********************************************************/
CoapNode.prototype.getSmartObject = function () {
    return this.so;
};

CoapNode.prototype._writeInst = function (oid, iid, value, callback) {
    var self = this,
        exist = this.so.has(oid, iid),
        okey = cutils.oidKey(oid),
        dump = {},
        chkErr = null,
        count = _.keys(value).length;

    if (!exist) {
        callback(ERR.notfound, null);
    } else {
        _.forEach(value, function (rsc, rid) {
            if (!self.so.isWritable(oid, iid, rid) && oid != 'lwm2mSecurity' && oid != 'lwm2mServer')
                chkErr = chkErr || new Error('Resource is unwritable.');
        });

        if (chkErr)
            return callback(chkErr, TAG.unwritable);

        _.forEach(value, function (rsc, rid) {
            self.so.write(oid, iid, rid, rsc, function (err, data) {
                count -= 1;

                if (err) {
                    chkErr = chkErr || err;
                    dump = null;
                    count = 0;
                } else {
                    dump[cutils.ridNumber(oid, rid)] = data;
                }

                if (count === 0 && _.isFunction(callback))
                    return callback(chkErr, dump);
            });
        });
    }
};

CoapNode.prototype.execResrc = function (oid, iid, rid, argus, callback) {
    return this.so.exec(oid, iid, rid, argus, callback);
};

CoapNode.prototype.createInst = function (oid, iid, resrcs, callback) {
    return this.so.init(oid, iid, resrcs, callback);
};

CoapNode.prototype.deleteInst = function (oid, iid, callback) {
    return this.so.remove(oid, iid, callback);
};

/*********************************************************
 * network function                                      *
 *********************************************************/
 CoapNode.prototype.bootstrap = function (ip, port, callback) {
   if (!_.isString(ip))
       throw new TypeError('ip should be a string.');

   if ((!_.isString(port) && !_.isNumber(port)) || _.isNaN(port))
       throw new TypeError('port should be a string or a number.');

   var self = this,
       reqObj = {
           hostname: ip,
           port: port,
           pathname: '/bs',
           method: 'POST'
       },
       agent = this._createAgent(),
       msg,
       resetCount = 0;

   function setListenerStart(msg) {
       if (!agent._sock) {
         startListener(self, function (err) {
               if (err) {
                   helper.lfUpdate(self, false);
                   invokeCbNextTick(err, null, callback);
               } else {
                   self._sleep = false;
                   invokeCbNextTick(null, msg, callback);
               }
           });

       } else {
           if (resetCount < 10) {
               resetCount += 1;
               setTimeout(function () {
                   return setListenerStart(msg);
               }, 10);
           } else {
               invokeCbNextTick(new Error('Socket can not be create.'), null, callback);
           }
       }
   }

   this._updateNetInfo(function () {
       reqObj.query = 'ep=' + self.clientName;

       self.request(reqObj, agent, function (err, rsp) {
           if (err) {
               invokeCbNextTick(err, null, callback);
           } else {
               msg = { status: rsp.code };
               if (rsp.code === RSP.changed) {
                   self._serverIp = ip;
                   self._serverPort = '5683';
                   helper.lfUpdate(self, true);
                   self.ip = rsp.outSocket.ip;
                   self.port = rsp.outSocket.port;
                   setListenerStart(msg);

               } else {
                   invokeCbNextTick(null, msg, callback);
               }
           }
       });
   });
 };

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
            payload: helper.checkAndBuildObjList(this, false, { hb: true }),
            method: 'POST',
            options: {'Content-Format': 'application/link-format'}
        },
        agent = this._createAgent(),
        resetCount = 0,
        msg;

    function setListenerStart(msg) {
        if (!agent._sock) {
            startListener(self, function (err) {
                if (err) {
                    helper.lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    self._sleep = false;
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
                invokeCbNextTick(new Error('Socket can not be create.'), null, callback);
            }
        }
    }

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
                    self.locationPath = '/rd/' + rsp.headers['Location-Path'];
                    self.ip = rsp.outSocket.ip;
                    self.port = rsp.outSocket.port;
                    self._registered = true;
                    setListenerStart(msg);
                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    });
};

CoapNode.prototype.update = function (attrs, callback) {
    if (!_.isPlainObject(attrs))
        throw new TypeError('attrs should be an object.');

    var self = this,
        updateObj = {},
        objListInPlain,
        localStatus;

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime) {
            self.so.set('lwm2mServer', 0, 'lifetime', attrs.lifetime);
            self.lifetime = updateObj.lifetime = attrs.lifetime;
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

    if (localStatus)
        invokeCbNextTick(null, { status: localStatus }, callback);
    else
        return this._update(updateObj, callback);
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
            method: 'POST'
        },
        agent = this._createAgent(),
        resetCount = 0,
        msg;

    function setListenerStart(msg) {
        if (!agent._sock) {
            startListener(self, function (err) {
                if (err) {
                    helper.lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    self._sleep = false;
                    invokeCbNextTick(null, msg, callback);
                }
            });
        } else {
            if (resetCount < 10) {
                resetCount += 1;
                setTimeout(function () {
                    setListenerStart(msg);
                }, 10);
            } else {
                invokeCbNextTick(new Error('Socket can not be create.'), null, callback);
            }
        }
    }

    if (attrs.objList)
        reqObj.options = {'Content-Format': 'application/link-format'};

    if (this._registered === true) {
        this.request(reqObj, agent, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    self.ip = rsp.outSocket.address;
                    self.port = rsp.outSocket.port;
                    setListenerStart(msg);
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
                    helper.lfUpdate(self, false);
                    self._disableAllReport();

                    _.forEach(self.servers, function (server, key) {
                        server.close();
                    });

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

CoapNode.prototype.checkin = function (callback) {
    var self = this,
        reqObj = {
            hostname: this._serverIp,
            port: this._serverPort,
            pathname: this.locationPath,
            query: 'chk=in',
            method: 'PUT'
        },
        agent = this._createAgent(),
        resetCount = 0,
        msg;

    function setListenerStart(msg) {
        if (!agent._sock) {
            startListener(self, function (err) {
                if (err) {
                    helper.lfUpdate(self, false);
                    invokeCbNextTick(err, null, callback);
                } else {
                    invokeCbNextTick(null, msg, callback);
                    self.emit('checkin');
                }
            });
        } else {
            if (resetCount < 10) {
                resetCount += 1;
                setTimeout(function () {
                    setListenerStart(msg);
                }, 10);
            } else {
                invokeCbNextTick(new Error('Socket can not be create.'), null, callback);
            }
        }
    }

    if (this._registered === true) {
        this.request(reqObj, agent, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    self.ip = rsp.outSocket.address;
                    self.port = rsp.outSocket.port;

                    helper.lfUpdate(self, true);
                    self._sleep = false;
                    setListenerStart(msg);
                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    } else {
        invokeCbNextTick(null, { status: RSP.notfound }, callback);
    }
};

CoapNode.prototype.checkout = function (duration, callback) {
    var self = this,
        reqObj = {
            hostname: this._serverIp,
            port: this._serverPort,
            pathname: this.locationPath,
            query: null,
            method: 'PUT'
        };

    if (_.isFunction(duration)) {
        callback = duration;
        duration = undefined;
    }

    if (!_.isUndefined(duration) && (!_.isNumber(duration) || _.isNaN(duration)))
        throw new TypeError('duration should be a number if given.');
    else if (!_.isUndefined(callback) && !_.isFunction(callback))
        throw new TypeError('callback should be a function if given.');

    if (this._registered === true) {
        reqObj.query = duration ? 'chk=out&t=' + duration : 'chk=out';
        this.request(reqObj, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                var msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    helper.lfUpdate(self, false);
                    self._disableAllReport();

                    _.forEach(self.servers, function (server, key) {
                        server.close();
                    });

                    self._sleep = true;
                    self.emit('checkout');
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

CoapNode.prototype.request = function (reqObj, ownAgent, callback) {
    if (!_.isPlainObject(reqObj))
        throw new TypeError('reqObj should be an object.');

    if (_.isFunction(ownAgent)) {
        callback = ownAgent;
        ownAgent = undefined;
    }

    var self = this,
        agent = ownAgent || new coap.Agent({ type: this._config.connectionType }),
        req = agent.request(reqObj);

    req.on('response', function(rsp) {
        if (!_.isEmpty(rsp.payload))
            rsp.payload = rsp.payload.toString();

        if (_.isFunction(callback))
            callback(null, rsp);
    });

    req.on('error', function(err) {
        if (!_.isFunction(callback))
            self.emit('error', err);
        else if (err.retransmitTimeout)
            callback(null, { code: RSP.timeout });
        else
            callback(err);
    });

    req.end(reqObj.payload);
};

/*********************************************************
 * protect function                                      *
 *********************************************************/
CoapNode.prototype._createAgent = function () {
    return new coap.Agent({ type: this._config.connectionType });
};

CoapNode.prototype._target = function (oid, iid, rid) {
    var okey = cutils.oidKey(oid),
        trg = {
            type: null,
            exist: this.so.has(oid, iid, rid),
            value: null,
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
            trg.value = this.so.findObject(oid);
        } else if (trg.type === TTYPE.inst) {
            trg.pathKey = okey + '/' + iid;
            trg.value = this.so.findObjectInstance(oid, iid);
        } else if (trg.type === TTYPE.rsc) {
            trg.pathKey = okey + '/' + iid + '/' + rkey;
            trg.ridKey = rkey;
            trg.value = this.so.get(oid, iid, rid);
        }
    }

    return trg;
};

CoapNode.prototype._setAttrs = function (oid, iid, rid, attrs) {
    if (!_.isPlainObject(attrs))
        throw new TypeError('attrs should be given as an object.');

    var target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(oid, iid, rid),
        key = target.pathKey;

    rAttrs.pmin = _.isNumber(attrs.pmin) ? attrs.pmin : rAttrs.pmin;
    rAttrs.pmax = _.isNumber(attrs.pmax) ? attrs.pmax : rAttrs.pmax;
    rAttrs.gt = _.isNumber(attrs.gt) ? attrs.gt : rAttrs.gt;
    rAttrs.lt = _.isNumber(attrs.lt) ? attrs.lt : rAttrs.lt;
    rAttrs.stp = _.isNumber(attrs.stp) ? attrs.stp : rAttrs.stp;

    return this;
};

CoapNode.prototype._getAttrs = function (oid, iid, rid) {
    var key = this._target(oid, iid, rid).pathKey,
        defaultAttrs;

    defaultAttrs = {
        pmin: this.so.get('lwm2mServer', 0, 'defaultMinPeriod'),
        pmax: this.so.get('lwm2mServer', 0, 'defaultMaxPeriod'),
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
            self.so.dump(oid, iid, cb);
        };
    } else if (target.type === TTYPE.rsc) {
        dumper = function (cb) {
            self.so.read(oid, iid, rid, cb);
        };
    }

    function reporterMin() {
        rAttrs.mute = false;
    }

    function reporterMax() {
        dumper(function (err, val) {
            return err ? self.emit('error', err) : rpt.write(val);
        });
    }

    function reporterWrite(val) {
        rAttrs.mute = true;

        if (_.isObject(val)) {
            _.forEach(val, function (val, rid) {
                rAttrs.lastRpVal[rid] = val;
            });

            val = cutils.encodeJson(key, rAttrs.lastRpVal);
        } else {
            rAttrs.lastRpVal = val;
            // For Eclipse Leshan compatibility, the value should be sent 
            // as TLV encoded instead of UTF
            val = cutils.encodeTlv(key, val);
        }

        try {
            rsp.write(val);
        } catch (e) {
            self.emit('error', e);
        }

        if (!_.isNil(rpt.min))
            clearTimeout(rpt.min);

        if (!_.isNil(rpt.max))
            clearInterval(rpt.max);

        rpt.min = setTimeout(reporterMin, pmin);
        rpt.max = setInterval(reporterMax, pmax);
    }

    function finishHdlr() {
        console.log('Report finish');
        removeReporter(self, oid, iid, rid);
    }

    dumper(function (err, data) {
        if (!err && data !== TAG.unreadable && data !== TAG.exec) {

            rAttrs.mute = false;
            rAttrs.enable = true;
            rAttrs.lastRpVal = data;

            rsp.once('finish', finishHdlr);

            rpt = self._reporters[key] = {
                min: setTimeout(reporterMin, pmin),
                max: setInterval(reporterMax, pmax),
                write: reporterWrite,
                stream: rsp,
                port: self.port,
                finishHdlr: finishHdlr
            };
        }

        if (_.isFunction(callback))
            callback(err, data);
    });
};

CoapNode.prototype._disableReport = function (oid, iid, rid, callback) {
    var key = this._target(oid, iid, rid).pathKey,
        rpt = this._reporters[key],
        chkErr;

    if (rpt) {
        rpt.stream.removeListener('finish', rpt.finishHdlr);
        rpt.stream.end();
        removeReporter(this, oid, iid, rid);
        chkErr = ERR.success;
    } else {
        chkErr = ERR.notfound;
    }

    if (_.isFunction(callback))
        callback(chkErr, null);
};

CoapNode.prototype._disableAllReport = function () {
    var self = this;

    helper.heartbeat(this, false);

    _.forEach(this._reporters, function (rpt, key) {
        var oid = key.split('/')[0],
            iid = key.split('/')[1],
            rid = key.split('/')[2];

        self._disableReport(oid, iid, rid, function (err, result) {
            if (err)
                self.emit('error', err);
        });
    });
};

/*********************************************************
 * Private function                                      *
 *********************************************************/
function startListener(cn, callback) {
    var server;

    server = coap.createServer({
        type: cn._config.connectionType,
        proxy: true
    });

    cn.servers[cn.port] = server;

    server.on('request', function (req, rsp) {        
        if (!_.isEmpty(req.payload) && req.headers['Content-Format'] === 'application/json') {
            req.payload = JSON.parse(req.payload);
        } else if (!_.isEmpty(req.payload) && req.headers['Content-Format'] === 'application/tlv') {
            req.payload = req.payload;
        } else if (!_.isEmpty(req.payload)) {
            req.payload = req.payload.toString();
        }

        reqHandler(cn, req, rsp);
    });

    try {
        server.listen(cn.port, function (err) {
            if (err) {
                if (_.isFunction(callback))
                    callback(err);
                else
                    cn.emit('error', err);
            } else {
                callback(null, server);
            }
        });
    } catch (e) {
        callback(e);
    }
}

function removeReporter(cn, oid, iid, rid) {
    var key = cn._target(oid, iid, rid).pathKey,
        rAttrs = cn._getAttrs(oid, iid, rid),
        rpt = cn._reporters[key];

    if (rpt) {
        clearTimeout(rpt.min);
        clearInterval(rpt.max);
        rpt.min = null;
        rpt.max = null;
        rpt.write = null;
        rpt.stream = null;
        rpt.port = null;
        delete cn._reporters[key];
    }

    rAttrs.enable = false;
    rAttrs.mute = true;
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
