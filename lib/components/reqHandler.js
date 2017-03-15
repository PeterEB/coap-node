'use strict';

var _ = require('busyman'),
    debug = require('debug')('coap-node:reqHdlr');

var cutils = require('./cutils'),
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
        case 'create':
            reqHdlr = serverCreateHandler;
            break;
        case 'delete':
            reqHdlr = serverDeleteHandler;
            break;
        case 'bs':
            reqHdlr = serverBsHandler;
            break;
        case 'empty':
            rsp.reset();
            break;
        default:
            break;
    }

    if (reqHdlr)
        setImmediate(function () {
            reqHdlr(cn, req, rsp);
        });
}

function serverReadHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        dataAndOpt;

    function readCallback(err, data) {
        if (err) {
            rsp.code = (data === TAG.unreadable || data === TAG.exec)? RSP.notallowed : RSP.badreq;
            rsp.end(data);
        } else {
            rsp.code = RSP.content;
            dataAndOpt = getRspDataAndOption(req, data);
            rsp.setOption('Content-Format', dataAndOpt.option['Content-Format']);
            rsp.end(dataAndOpt.data);
        }
    }

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        cn.so.dump(pathObj.oid, { restrict: true }, readCallback);
    } else if (target.type === TTYPE.inst) {
        cn.so.dump(pathObj.oid, pathObj.iid, { restrict: false }, readCallback);
    } else if (target.type === TTYPE.rsc) {
        cn.so.read(pathObj.oid, pathObj.iid, pathObj.rid, { restrict: true }, readCallback);
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
        rsp.setOption('Content-Format', 'application/link-format');
        rsp.end(rspPayload);
    }
}

function serverWriteHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        value;

    if (req.headers['Content-Format'] === 'application/json') {
        value = cutils.decodeJsonObj(target.pathKey, req.payload);
    } else if (req.headers['Content-Format'] === 'application/tlv') {
        value = cutils.decodeTLV(target.pathKey, req.payload);
    } else {
        value = req.payload.toString();
    }

    function writeCallback(err, data) {
        if (err)
            rsp.code = (data === TAG.unwritable || data === TAG.exec) ? RSP.notallowed : RSP.badreq ;
        else
            rsp.code = RSP.changed;

        rsp.end();
    }

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else if (target.type === TTYPE.inst) {
        cn._writeInst(pathObj.oid, pathObj.iid, value, writeCallback);
    } else {
        cn.so.write(pathObj.oid, pathObj.iid, pathObj.rid, value, { restrict: true }, writeCallback);
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
    } else if (argus === false) {
        rsp.code = RSP.badreq;
        rsp.end();
    } else if (target.type === TTYPE.obj || target.type === TTYPE.inst) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else {
        cn.execResrc(pathObj.oid, pathObj.iid, pathObj.rid, argus, function (err, data) {
            if (err)
                rsp.code = (data === TAG.unexecutable) ? RSP.notallowed : RSP.badreq;
            else
                rsp.code = RSP.changed;

            rsp.end();
        });
    }
}

function serverObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rAttrs = cn._getAttrs(pathObj.oid, pathObj.iid, pathObj.rid),
        dataAndOpt;

    function enableReport(oid, iid, rid, rsp) {
        cn._enableReport(oid, iid, rid, rsp, function (err, val) {
            if (err) {
                rsp.statusCode = (val ===  TAG.unreadable || val === TAG.exec) ? RSP.notallowed : RSP.notfound;
                rsp.end(val);
            } else {
                rsp.statusCode = RSP.content;
                dataAndOpt = getRspDataAndOption(req, val);
                rsp.setOption('Content-Format', dataAndOpt.option['Content-Format']);
                rsp.write(dataAndOpt.data);
            }
        });
    }

    if (pathObj.oid === 'heartbeat') {
        helper.heartbeat(cn, true, rsp);
        rsp.statusCode = RSP.content;
        rsp.write('hb');
    } else if (!target.exist) {
        rsp.statusCode = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else if (cn._reporters[target.pathKey]) {
        cn._disableReport(pathObj.oid, pathObj.iid, pathObj.rid, function (err) {
            enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp);
        });
    } else {
        enableReport(pathObj.oid, pathObj.iid, pathObj.rid, rsp);
    }
}

function serverCancelObserveHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid);

    if (pathObj.oid === 'heartbeat') {
        helper.heartbeat(cn, false);
        rsp.code = RSP.content;
        rsp.end();
    } else if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else {
        cn._disableReport(pathObj.oid, pathObj.iid, pathObj.rid, function (err, val) {
            if (err)
                rsp.code = RSP.notfound;
            else
                rsp.code = RSP.content;

            rsp.end();
        });
    }
}

function serverPingHandler (cn, req, rsp) {
    rsp.code = cn._registered ? RSP.content : RSP.notallowed;
    rsp.end();
}

function serverAnnounceHandler (cn, req, rsp) {
    cn.emit('announce', req.payload);
}

function serverCreateHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url),
        target = cn._target(pathObj.oid, pathObj.iid),
        value,
        iid;

    if (req.headers['Content-Format'] === 'application/json') {
        var data = cutils.decodeJsonObj(target.pathKey, req.payload);
        value = data[Object.keys(data)];
        iid = Object.keys(data)[0];
    } else if (req.headers['Content-Format'] === 'application/tlv') {
        var data = cutils.decodeTLV(target.pathKey, req.payload);
        value = data[Object.keys(data)];
        iid = Object.keys(data)[0];
    }

    if (!target.exist) {
        rsp.code = RSP.badreq;
        rsp.end();
    } else {
        cn.createInst(pathObj.oid, iid, value, function (err, data) {
            if (err)
                rsp.code = RSP.badreq;
            else
                rsp.code = RSP.created;
            rsp.end();
        });
    }
}

function serverDeleteHandler (cn, req, rsp) {
    var pathObj = cutils.getSoKeyObj(req.url);

    if (req.url != '/') {
        cn.deleteInst(pathObj.oid, pathObj.iid, function(err) {
            if (err)
                rsp.code = RSP.badreq;
            else
                rsp.code = RSP.deleted;
            rsp.end();
        });
    } else {
        // Should delete everything, but not implemented...
        rsp.code = RSP.deleted;
        rsp.end();
    }
}

function serverBsHandler (cn, req, rsp) {
    cn.emit('bootstrapped');
    rsp.code = RSP.changed;
    rsp.end('finnish');
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
                if (req.headers['Content-Format'])
                    optType = 'write';
                else
                    optType = 'writeAttr';
                break;
            case 'POST':
                if (req.url === '/ping')
                    optType = 'ping';
                else if (req.url === '/bs')
                      optType = 'bs';
                else if (req.url === '/announce')
                    optType = 'announce';
                else if (req.headers['Content-Format'])
                    optType = 'create';
                else
                    optType = 'execute';
                break;
            case 'DELETE':
                optType = 'delete';
            default:
                break;
        }
    }

    return optType;
}

// [TODO]
function getRspDataAndOption(req, originalData) {
    var format, data;

    if (req.headers.Accept === 'application/json' || _.isObject(originalData)) {
        format = 'application/json';
        data = JSON.stringify(cutils.encodeJsonObj(req.url, originalData));
    } else if (req.headers.Accept === 'application/tlv') {
        format = 'application/tlv';
        data = cutils.encodeTLV(req.url, originalData);
        data = new Buffer(data, 'hex');
    } else {
        format = 'text/plain';
        data = originalData.toString();
    }

    return {
        data: data,
        option: {'Content-Format': format}
    };
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
        if (_.includes(allowedAttrs, key) && _.isNumber(val))
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
