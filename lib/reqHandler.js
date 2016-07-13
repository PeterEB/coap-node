'use strict';

var _ = require('busyman');

var cutils = require('./utils/cutils'),
    helper = require('./helper'),
    CNST = require('./constants');

/**** Code Enumerations ****/
var TTYPE = CNST.TTYPE,
    TAG = CNST.TAG,
    ERR = CNST.ERR,
    RSP = CNST.RSP;

/*********************************************************
 * Handler function                                      *
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
                if (value ===  TAG.unreadable || value === TAG.exec) {
                    rsp.code = RSP.notallowed;
                    rsp.end(value);
                } else {
                    rsp.code = RSP.badreq;
                    rsp.end(); 
                }
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
                if (data ===  TAG.unwritable || data === TAG.exec) {
                    rsp.code = RSP.notallowed;
                    rsp.end();
                } else {
                    rsp.code = RSP.badreq;
                    rsp.end();
                }
            } else {
                rsp.code = RSP.changed;
                rsp.end();
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
                if (data === TAG.unexecutable) {
                    rsp.code = RSP.notallowed;
                    rsp.end();
                } else {
                    rsp.code = RSP.badreq;
                    rsp.end(); 
                }
            } else {
                rsp.code = RSP.changed;
                rsp.end();     
            }
        });
    }
}

function serverObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rAttrs = cn._getAttrs(pathObj.oid, pathObj.iid, pathObj.rid);

    if (!target.exist && pathObj.oid !== 'heartbeat') {
        rsp.statusCode = RSP.notfound;
        rsp.end();
    } else if (pathObj.oid === 'heartbeat') {
        helper.heartbeat(cn, true, rsp);
        rsp.statusCode = RSP.content;
        rsp.write('hb');
    } else if (cn._reporters[target.pathKey] && rAttrs.enable === true) {
        rsp.statusCode = RSP.ok;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else {
        cn._enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp, function (err, val) {
            if (err) {
                if (val ===  TAG.unreadable || val === TAG.exec) {
                    rsp.statusCode = RSP.notallowed;
                    rsp.end(val);
                } else {
                    rsp.statusCode = RSP.notfound;
                    rsp.end(val);
                }
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
        helper.heartbeat(cn, false);
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
 * Private function                                      *
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

function buildAttrsAndRsc(cn, oid, iid, rid) {
    var payload = '',
        attrs = cn._getAttrs(oid, iid, rid),
        attrsPayload = '',
        allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        target = cn._target(oid, iid, rid),
        onum = cutils.oidNumber(oid),
        rnum;

    _.forEach(attrs, function (val, key) {
        if (_.includes(allowedAttrs, key))
            attrsPayload = attrsPayload + ';' + key + '=' + val;   // ';pmin=0;pmax=60'
    });

    if (target.type === TTYPE.obj) {
        payload = '</' + onum + '>' + attrsPayload + ',';
        _.forEach(cn.so.dumpSync(oid), function (iobj, ii) {
            _.forEach(iobj, function (val, rkey) {
                rnum = cutils.ridNumber(oid, rkey);
                payload = payload + '</' + onum + '/' + ii + '/' + rnum + '>' + ',';
            });
        });
    } else if (target.type === TTYPE.inst) {
        payload = '</' + onum + '/' + iid + '>' + attrsPayload + ',';
        _.forEach(cn.so.dumpSync(oid, iid), function (val, rkey) {
            rnum = cutils.ridNumber(oid, rkey);
            payload = payload + '</' + onum + '/' + iid + '/' + rnum + '>' + ',';
        });

    } else if (target.type === TTYPE.rsc) {
        rnum = cutils.ridNumber(oid, rid);
        payload = '</' + onum + '/' + iid + '/' + rnum + '>' + attrsPayload + ',';
    }

    return payload.slice(0, payload.length - 1);
}

/*********************************************************
 * Module Exports                                        *
 *********************************************************/
module.exports = serverReqHandler;