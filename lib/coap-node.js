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

    this.servers = {};      // CoAP Server
    this.serversInfo = {};  // LwM2M Server
    /*  
        shoutId: {
            shortServerId: 10,
            ip: '192.168.1.119',
            port: 5683,
            locationPath: '1a2b',
            registered: true,
            repAttrs: {},
            reporters: {},
            hbPacemaker = null,
            hbStream = { stream: null, port: null, finishCb: null },
            lfsecs = 0
        }
    */

    this.clientName = clientName;
    this.locationPath = 'unknown';
    this.ip = 'unknown';
    this.mac = 'unknown';
    this.port = 'unknown';
    this.version = devAttrs.version || '1.0.0';
    this.lifetime = devAttrs.lifetime || 86400;

    this.bsServer = {};
    /*  
        {
            shortServerId: 1,
            ip: '192.168.1.120',
            port: 5683,
        }
    */

    this.objList = null;
    this.so = smartObj;
    this.autoReRegister = devAttrs.autoReRegister || true;

    this._bootstrapping = false;
    this._sleep = false;
    this._updater = null;
    this._socketServerChker = null;

    this._config = {
        reqTimeout: config.reqTimeout,
        heartbeatTime: config.heartbeatTime,
        serverChkTime: config.serverChkTime,
        connectionType: config.connectionType,
        defaultMinPeriod: config.defaultMinPeriod,
        defaultMaxPeriod: config.defaultMaxPeriod
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

                if (err) {          // [TODO] reply to the original data?
                    chkErr = chkErr || err;
                    dump = data;    
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

CoapNode.prototype.createInst = function (oid, iid, resrcs) {
    return this.so.init(oid, iid, resrcs);
};

CoapNode.prototype.deleteInst = function (oid, iid) {
    return this.so.remove(oid, iid);
};

/*********************************************************
 * network function                                      *
 *********************************************************/
CoapNode.prototype.configure = function (ip, port, opts) {   // opts: { lifetime pmax pmin }
    if (!_.isString(ip))
        throw new TypeError('ip should be a string.');

    if ((!_.isString(port) && !_.isNumber(port)) || _.isNaN(port))
        throw new TypeError('port should be a string or a number.');
        
    var securityIid = this._idCounter('securityIid'), 
        serverIid = this._idCounter('serverIid'),
        shortServerId = this._idCounter('shortServerId');

    if (!opts)
        opts = {};

    this.so.init('lwm2mSecurity', securityIid, {
        lwm2mServerURI: 'coap://' + ip + ':' + port,
        bootstrapServer: false,
        securityMode: 3,
        pubKeyId: '',
        serverPubKeyId: '',
        secretKey: '',
        shortServerId: shortServerId
    });

    this.so.init('lwm2mServer', serverIid, {
        shortServerId: shortServerId,
        lifetime: opts.lifetime || this.lifetime,
        defaultMinPeriod: opts.pmax || this._config.defaultMinPeriod,
        defaultMaxPeriod: opts.pmin || this._config.defaultMaxPeriod,
        notificationStoring: false,
        binding: 'U'
    });

    return shortServerId;
};

CoapNode.prototype.bootstrap = function (mode, ip, port, callback) { 
    if ((!_.isString(mode) && !_.isNumber(mode)))
        throw new TypeError('mode should be a string or a number.');

    if (_.isFunction(ip)) {
        callback = ip;
        ip = null;
    } else if (_.isFunction(port)) {
        callback = port;
        port = null;
    }

    switch (mode) {
        case 0:
        case '0':
            this._factoryBootstrap(callback);
            break;

        case 1:
        case '1':
            this._clientInitBootstrap(ip, port, callback);
            break;

        default:
            callback(new Error('the given mode is not defined.'));
            break;
    }
};

CoapNode.prototype._clientInitBootstrap = function (ip, port, callback) {
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
        securityIid = this._idCounter('securityIid'), 
        shortServerId = this._idCounter('shortServerId'),
        resetCount = 0,
        msg;

    function setListenerStart(port, msg) {
        if (!agent._sock) {
            startListener(self, port, function (err) {
                console.log(port);
                if (err) {
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

    reqObj.query = 'ep=' + self.clientName;

    self.request(reqObj, agent, function (err, rsp) {
        if (err) {
            invokeCbNextTick(err, null, callback);
        } else {
            msg = { status: rsp.code };
            if (rsp.code === RSP.changed) {
                self.bsServer = { 
                    ip: rsp.rsinfo.address,
                    port: rsp.rsinfo.port,
                };

                self.ip = rsp.outSocket.ip;
                self.port = rsp.outSocket.port;
                self._bootstrapping = true;
                setListenerStart(rsp.outSocket.port, msg);
           } else {
               invokeCbNextTick(null, msg, callback);
           }
       }
   });
 };

CoapNode.prototype._factoryBootstrap = function (callback) {
    var self = this,
        securityObjs = this.so.dumpSync('lwm2mSecurity'),
        serverObjs = this.so.dumpSync('lwm2mServer'),
        requestCount = 0,
        requestInfo = [],
        serverInfo,
        rsps = [],
        chkErr;

    _.forEach(serverObjs, function (serverObj, iid) {
        _.forEach(securityObjs, function (securityObj, iid) {
            if (serverObj.shortServerId === securityObj.shortServerId && !securityObj.bootstrapServer) {
                requestInfo.push({ uri: securityObj.lwm2mServerURI, ssid: securityObj.shortServerId });
                requestCount = requestCount + 1;
            }
        });
    });

    if (requestCount === 0) {
        invokeCbNextTick(new Error('Do not have any client bootstrap configuration.'), null, callback);
    } else {
        _.forEach(requestInfo, function (info, key) {
            if (requestCount !== 0) {
                serverInfo = getServerUriInfo(info.uri);
                self._register(serverInfo.address, serverInfo.port, info.ssid, function (err, msg) {
                    requestCount = requestCount - 1;
                    if (err) {
                        chkErr = chkErr || err;
                        requestCount = 0;
                    } else {
                        rsps.push({ shortServerId: info.ssid, status: msg.status });
                    }
                });
            } else {
                if (chkErr)
                    invokeCbNextTick(chkErr, null, callback);
                else 
                    invokeCbNextTick(null, rsps, callback);
            }
        });
    }
};

CoapNode.prototype._register = function (ip, port, ssid, callback) {
    if (!_.isString(ip))
        throw new TypeError('ip should be a string.');

    if ((!_.isString(port) && !_.isNumber(port)) || _.isNaN(port))
        throw new TypeError('port should be a string or a number.');

    var self = this,
        reqObj = {
            hostname: ip,
            port: port,
            pathname: '/rd',
            payload: helper.checkAndBuildObjList(this, false, { ct: 'application/json', hb: true }),
            method: 'POST',
            options: {'Content-Format': 'application/link-format'}
        },
        agent = this._createAgent(),
        resetCount = 0,
        msg;

    function setListenerStart(port, msg) {
        if (!agent._sock) {
            startListener(self, port, function (err) {
                if (err) {
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

                if (rsp.code === RSP.created) {
                    self.serversInfo[ssid] = { 
                        shortServerId: ssid,
                        ip: rsp.rsinfo.address,
                        port: rsp.rsinfo.port,
                        locationPath: '/rd/' + rsp.headers['Location-Path'],
                        registered: true,
                        lfsecs: 0,
                        repAttrs: {},
                        reporters: {},
                        hbPacemaker: null,
                        hbStream: { stream: null, port: null, finishCb: null }
                    };

                    self.ip = rsp.outSocket.ip;
                    self.port = rsp.outSocket.port;
                    setListenerStart(rsp.outSocket.port, msg);
                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    });
};

CoapNode.prototype.register = function (ip, port, opts, callback) {
    var ssid = this.configure(ip, port, opts);

    this._register(ip, port, ssid, callback);
};

CoapNode.prototype.update = function (attrs, callback) {
    if (!_.isPlainObject(attrs))
        throw new TypeError('attrs should be an object.');

    var self = this,
        requestCount = Object.keys(this.serversInfo).length,
        updateObj = {},
        objListInPlain,
        localStatus,
        rsps = [],
        chkErr;

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' && attrs.lifetime !== self.lifetime ) {
            // self.so.set('lwm2mServer', 0, 'lifetime', attrs.lifetime);  // [TODO] need to check / multi server
            self.lifetime = updateObj.lifetime = attrs.lifetime;
        } else {
            localStatus = RSP.badreq;
        }
    });

    objListInPlain = helper.checkAndBuildObjList(self, true);

    if (!_.isNil(objListInPlain))
        updateObj.objList = objListInPlain;

    if (localStatus) {
        invokeCbNextTick(new Error('There is an unrecognized attribute within the attrs.'), null, callback);
    } else {
        _.forEach(this.serversInfo, function (serverInfo, ssid) {
            self._update(serverInfo, updateObj, function (err, msg) {
                requestCount = requestCount - 1;
                if (err) {
                    chkErr = chkErr || err;
                    requestCount = 0;
                } else {
                    rsps.push({ shortServerId: ssid, status: msg.status });
                }

                if (requestCount === 0) {
                    if (chkErr)
                        invokeCbNextTick(chkErr, null, callback);
                    else 
                        invokeCbNextTick(null, rsps, callback);     // [TODO] status
                }
            });
        });
    }
};

CoapNode.prototype._update = function (serverInfo, attrs, callback) {
    if (!_.isPlainObject(attrs))
        throw new TypeError('attrs should be an object.');

    var self = this,
        reqObj = {
            hostname: serverInfo.ip,
            port: serverInfo.port,
            pathname: serverInfo.locationPath,
            query: cutils.buildUpdateQuery(attrs),
            payload: attrs.objList,
            method: 'POST'
        },
        agent = this._createAgent(),
        resetCount = 0,
        msg;

    function setListenerStart(port, msg) {
        if (!agent._sock) {
            startListener(self, port, function (err) {
                if (err) {
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

    if (serverInfo.registered) {
        this.request(reqObj, agent, function (err, rsp) {
            if (err) {
                invokeCbNextTick(err, null, callback);
            } else {
                msg = { status: rsp.code };

                if (rsp.code === RSP.changed) {
                    self.ip = rsp.outSocket.address;
                    self.port = rsp.outSocket.port;
                    setListenerStart(rsp.outSocket.port, msg);
                } else {
                    invokeCbNextTick(null, msg, callback);
                }
            }
        });
    } else {
        invokeCbNextTick( null, { status: RSP.notfound }, callback);
    }
};

CoapNode.prototype.deregister = function (ssid, callback) {
    var self = this,
        requestCount = Object.keys(this.serversInfo).length,
        rsps = [],
        chkErr;

    function deregister(serverInfo, cb) {
        var reqObj = {
                hostname: serverInfo.ip,
                port: serverInfo.port,
                pathname: serverInfo.locationPath,
                method: 'DELETE'
            };

        if (serverInfo.registered === true) {
            self.request(reqObj, function (err, rsp) {
                if (err) {
                    invokeCbNextTick(err, null, cb);
                } else {
                    var msg = { status: rsp.code };

                    if (rsp.code === RSP.deleted) {
                        self._disableAllReport(serverInfo.shortServerId);

                        // [TODO]
                        // _.forEach(self.servers, function (server, key) {
                        //     server.close();      
                        // });

                        serverInfo.registered = false;
                        self.emit('deregistered');
                    }

                    invokeCbNextTick(null, msg, cb);
                }
            });
        } else {
            invokeCbNextTick(null, { status: RSP.notfound }, cb);
        }
    }

    if (_.isFunction(ssid)) {
        callback = ssid;
        ssid = null;
    }

    if (_.isNil(ssid)) {
        _.forEach(this.serversInfo, function (serverInfo, ssid) {
            deregister(serverInfo, function (err, msg) {
                requestCount = requestCount - 1;
                if (err) {
                    chkErr = chkErr || err;
                    requestCount = 0;
                } else {
                    rsps.push({ shortServerId: ssid, status: msg.status });
                }

                if (requestCount === 0) {
                    if (chkErr)
                        invokeCbNextTick(chkErr, null, callback);
                    else 
                        invokeCbNextTick(null, rsps, callback);     // [TODO] status
                }
            });
        });
    } else if (this.serversInfo[ssid]) {
        deregister(this.serversInfo[ssid], callback);
    } else {
        invokeCbNextTick(null, { status: RSP.notfound }, callback);
    }
};

CoapNode.prototype.checkin = function (callback) {
    var self = this,
        agent = this._createAgent(),
        requestCount = Object.keys(this.serversInfo).length,
        resetCount = 0,
        rsps = [],
        chkErr;

    function setListenerStart(port, msg, cb) {
        if (!agent._sock) {
            startListener(self, port, function (err) {
                if (err) {
                    invokeCbNextTick(err, null, cb);
                } else {
                    invokeCbNextTick(null, msg, cb);
                }
            });
        } else {
            if (resetCount < 10) {
                resetCount += 1;
                setTimeout(function () {
                    setListenerStart(msg);
                }, 10);
            } else {
                invokeCbNextTick(new Error('Socket can not be create.'), null, cb);
            }
        }
    }

    function checkin(serverInfo, cb) {
        var reqObj = {
            hostname: serverInfo.ip,
            port: serverInfo.port,
            pathname: serverInfo.locationPath,
            query: 'chk=in',
            method: 'PUT'
        };

        if (serverInfo.registered === true) {
            self.request(reqObj, agent, function (err, rsp) {
                if (err) {
                    invokeCbNextTick(err, null, cb);
                } else {
                    var msg = { status: rsp.code };

                    if (rsp.code === RSP.changed) {
                        self.ip = rsp.outSocket.address;
                        self.port = rsp.outSocket.port;
                        self._sleep = false;
                        setListenerStart(rsp.outSocket.port, msg, cb);
                    } else {
                        invokeCbNextTick(null, msg, cb);
                    }
                }
            });
        } else {
            invokeCbNextTick(null, { status: RSP.notfound }, cb);
        }
    }

    _.forEach(this.serversInfo, function (serverInfo, ssid) {
        checkin(serverInfo, function (err, msg) {
            requestCount = requestCount - 1;
            if (err) {
                chkErr = chkErr || err;
                requestCount = 0;
            } else {
                rsps.push({ shortServerId: ssid, status: msg.status });
            }

            if (requestCount === 0) {
                if (chkErr)
                    invokeCbNextTick(chkErr, null, callback);
                else 
                    invokeCbNextTick(null, rsps, callback);     // [TODO] status
            }
        });
    });
};

CoapNode.prototype.checkout = function (duration, callback) {
    var self = this,
        requestCount = Object.keys(this.serversInfo).length,
        rsps = [],
        chkErr;

    if (_.isFunction(duration)) {
        callback = duration;
        duration = undefined;
    }

    if (!_.isUndefined(duration) && (!_.isNumber(duration) || _.isNaN(duration)))
        throw new TypeError('duration should be a number if given.');
    else if (!_.isUndefined(callback) && !_.isFunction(callback))
        throw new TypeError('callback should be a function if given.');

    function checkout(serverInfo, cb) {
        var reqObj = {
            hostname: serverInfo.ip,
            port: serverInfo.port,
            pathname: serverInfo.locationPath,
            query: duration ? 'chk=out&t=' + duration : 'chk=out',
            method: 'PUT'
        };

        if (serverInfo.registered === true) {
            self.request(reqObj, function (err, rsp) {
                if (err) {
                    invokeCbNextTick(err, null, cb);
                } else {
                    var msg = { status: rsp.code };

                    if (rsp.code === RSP.changed) {
                        self._disableAllReport(serverInfo.shortServerId);
                        self._sleep = true;
                        _.forEach(self.servers, function (server, key) {
                            server.close();
                        });
                    }

                    invokeCbNextTick(null, msg, cb);
                }
            });
        } else {
            invokeCbNextTick(null, { status: RSP.notfound }, cb);
        }
    }

    _.forEach(this.serversInfo, function (serverInfo, ssid) {
        checkout(serverInfo, function (err, msg) {
            requestCount = requestCount - 1;
            if (err) {
                chkErr = chkErr || err;
                requestCount = 0;
            } else {
                rsps.push({ shortServerId: ssid, status: msg.status });
            }

            if (requestCount === 0) {
                if (chkErr)
                    invokeCbNextTick(chkErr, null, callback);
                else 
                    invokeCbNextTick(null, rsps, callback);     // [TODO] status
            }
        });
    });
};

CoapNode.prototype.lookup = function (ssid, clientName, callback) {
    var serverInfo = this.serversInfo[ssid],
        reqObj = {
            hostname: serverInfo.ip,
            port: serverInfo.port,
            pathname: '/rd-lookup/ep',
            query: 'ep=' + clientName,
            method: 'GET'
        };

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
        trg.pathKey = okey;
        if (!_.isNil(iid)) {
            trg.type = TTYPE.inst;
            trg.pathKey = okey + '/' + iid;
            if (!_.isNil(rid)) {
                trg.type = TTYPE.rsc;
                rkey = cutils.ridKey(oid, rid);
                trg.ridKey = rkey;
                trg.pathKey = okey + '/' + iid + '/' + rkey;
            }
        }
    }

    if (trg.exist) {
        if (trg.type === TTYPE.obj)
            trg.value = this.so.findObject(oid);
        else if (trg.type === TTYPE.inst)
            trg.value = this.so.findObjectInstance(oid, iid);
        else if (trg.type === TTYPE.rsc)
            trg.value = this.so.get(oid, iid, rid);
    }

    return trg;
};

CoapNode.prototype._setAttrs = function (ssid, oid, iid, rid, attrs) {
    if (!_.isPlainObject(attrs))
        throw new TypeError('attrs should be given as an object.');

    var target = this._target(oid, iid, rid),
        rAttrs = this._getAttrs(ssid, oid, iid, rid),
        key = target.pathKey;

    rAttrs.pmin = _.isNumber(attrs.pmin) ? attrs.pmin : rAttrs.pmin;
    rAttrs.pmax = _.isNumber(attrs.pmax) ? attrs.pmax : rAttrs.pmax;
    rAttrs.gt = _.isNumber(attrs.gt) ? attrs.gt : rAttrs.gt;
    rAttrs.lt = _.isNumber(attrs.lt) ? attrs.lt : rAttrs.lt;
    rAttrs.stp = _.isNumber(attrs.stp) ? attrs.stp : rAttrs.stp;

    return this;
};

CoapNode.prototype._getAttrs = function (ssid, oid, iid, rid) {
    var serverInfo = this.serversInfo[ssid],
        key = this._target(oid, iid, rid).pathKey,
        defaultAttrs;

    defaultAttrs = {
        pmin: this._config.defaultMinPeriod,    // [TODO] need to check
        pmax: this._config.defaultMaxPeriod,    // [TODO] need to check
        mute: true,
        enable: false,
        lastRpVal: null
    };

    serverInfo.repAttrs[key] = serverInfo.repAttrs[key] || defaultAttrs;

    return serverInfo.repAttrs[key];
};

CoapNode.prototype._enableReport = function (ssid, oid, iid, rid, format, rsp, callback) {
    var self = this,
        serverInfo = this.serversInfo[ssid],
        target = this._target(oid, iid, rid),
        key = target.pathKey,
        rAttrs = this._getAttrs(ssid, oid, iid, rid),
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
        } else {
            rAttrs.lastRpVal = val;
        }

        if (format === 'text/plain') {
            if (_.isBoolean(val))
                val = val ? '1' : '0';
            else
                val = val.toString();
        } else if (format === 'application/json') {
            val = cutils.encodeJson(key, val);
        } else {
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
        removeReporter(self, ssid, oid, iid, rid);
    }

    dumper(function (err, data) {
        if (!err && data !== TAG.unreadable && data !== TAG.exec) {
            rAttrs.mute = false;
            rAttrs.enable = true;
            rAttrs.lastRpVal = data;

            rsp.once('finish', finishHdlr);

            rpt = serverInfo.reporters[key] = {
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

CoapNode.prototype._disableReport = function (ssid, oid, iid, rid, callback) {
    var serverInfo = this.serversInfo[ssid],
        key = this._target(oid, iid, rid).pathKey,
        rpt,
        chkErr;

    if (serverInfo)
        rpt = serverInfo.reporters[key];

    if (rpt) {
        rpt.stream.removeListener('finish', rpt.finishHdlr);
        rpt.stream.end();
        removeReporter(this, ssid, oid, iid, rid);
        chkErr = ERR.success;
    } else {
        chkErr = ERR.notfound;
    }

    if (_.isFunction(callback))
        callback(chkErr, null);
};

CoapNode.prototype._disableAllReport = function (ssid) {
    var self = this;

    function disableReport(serverInfo) {
        helper.heartbeat(self, serverInfo.shortServerId, false);

        _.forEach(serverInfo.reporters, function (rpt, key) {
            var oid = key.split('/')[0],
                iid = key.split('/')[1],
                rid = key.split('/')[2];

            self._disableReport(serverInfo.shortServerId, oid, iid, rid, function (err, result) {
                if (err)
                    self.emit('error', err);
            });
        });
    }

    if (_.isNil(ssid)) {
        _.forEach(this.serversInfo, function (serverInfo, ssid) {
            disableReport(self, serverInfo, function (err, rsp) {
                // [TODO]
            });
        });
    } else if (this.serversInfo[ssid]) {
        disableReport(this.serversInfo[ssid]);
    }
};

CoapNode.prototype._idCounter = function (type) {
    var id,
        idUsed;

    switch (type) {
        case 'securityIid':
            id = 1;
            while (this.so.has('lwm2mSecurity', id)) {
                id = id + 1;
            }
            break;

        case 'serverIid':
            id = 1;
            while (this.so.has('lwm2mServer', id)) {
                id = id + 1;
            }
            break;

        case 'shortServerId':
            id = 0;
            do {
                id = id + 1;
                idUsed = false;
                _.forEach(this.so.dumpSync('lwm2mSecurity'), function (iObj, iid) {
                    if (iObj.shortServerId === id)
                        idUsed = true;
                });
            } while(idUsed);
            break;

        default:
            break;
    }

    return id;
};

/*********************************************************
 * Private function                                      *
 *********************************************************/
function startListener(cn, port, callback) {
    var server;

    server = coap.createServer({
        type: cn._config.connectionType,
        proxy: true
    });

    cn.servers[port] = server;

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
        server.listen(port, function (err) {
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

function removeReporter(cn, ssid, oid, iid, rid) {
    var serverInfo = cn.serversInfo[ssid],
        key = cn._target(oid, iid, rid).pathKey,
        rAttrs = cn._getAttrs(ssid, oid, iid, rid),
        rpt;

    if (!serverInfo)
        return;

    rpt = serverInfo.reporters[key];

    if (rpt) {
        clearTimeout(rpt.min);
        clearInterval(rpt.max);
        rpt.min = null;
        rpt.max = null;
        rpt.write = null;
        rpt.stream = null;
        rpt.port = null;
        delete serverInfo.reporters[key];
    }

    rAttrs.enable = false;
    rAttrs.mute = true;
}

function getServerUriInfo(uri) {
    var uriArray = uri.split('://'),
        infoArray = uriArray[uriArray.length - 1].split(':'),
        info = {
            address: infoArray[0],
            port: infoArray[1]
        };

    return info;
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
