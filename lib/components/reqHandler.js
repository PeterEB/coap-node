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
        bootstrapping = cn._bootstrapping && (req.rsinfo.address === cn.bsServer.ip) && (req.rsinfo.port === cn.bsServer.port),
        serverInfo = findServer(cn, req.rsinfo),
        bsSequence = false,
        reqHdlr;

    console.log(optType);
    switch (optType) {
        case 'read':
            reqHdlr = serverReadHandler;
            break;
        case 'discover':
            reqHdlr = serverDiscoverHandler;
            break;
        case 'write':
            if (bootstrapping) { 
                bsSequence = true;
                reqHdlr = serverBsWriteHandler;
            } else {
                reqHdlr = serverWriteHandler;
            }
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
        case 'create':
            reqHdlr = serverCreateHandler;
            break;
        case 'delete':
            if (bootstrapping) {
                bsSequence = true;
                reqHdlr = serverBsDeleteHandler;
            } else {
                reqHdlr = serverDeleteHandler;   
            }
            break;
        case 'finish':
            if (bootstrapping) {
                bsSequence = true;
                reqHdlr = serverFinishHandler;
            } else {
                rsp.reset();
            }
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
    
    if (!serverInfo || (cn._bootstrapping && !bsSequence))
        rsp.reset();
    else if (reqHdlr)
        setImmediate(function () {
            reqHdlr(cn, req, rsp, serverInfo);
        });
}

function serverReadHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
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

    if (pathObj.oid === 0 || pathObj.oid === 'lwm2mSecurity') {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        cn.so.dump(pathObj.oid, { restrict: true }, readCallback);
    } else if (target.type === TTYPE.inst) {
        cn.so.dump(pathObj.oid, pathObj.iid, { restrict: true }, readCallback);
    } else if (target.type === TTYPE.rsc) {
        cn.so.read(pathObj.oid, pathObj.iid, pathObj.rid, { restrict: true }, readCallback);
    }
}

function serverDiscoverHandler (cn, req, rsp, serverInfo) {
    var pathObj = cutils.getPathIdKey(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rspPayload;

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else {
        rspPayload = buildAttrsAndRsc(cn, serverInfo.shortServerId, pathObj.oid, pathObj.iid, pathObj.rid);
        rsp.code = RSP.content;
        rsp.setOption('Content-Format', 'application/link-format');
        rsp.end(rspPayload);
    }
}

function serverBsWriteHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        value = getReqData(req, target.pathKey),
        obj = {};
        
    // if req come from bootstrap server, should create object instance
    if (target.type === TTYPE.obj) {
        rsp.code = RSP.notallowed;
        rsp.end();
    } else if (target.type === TTYPE.inst) {
        cn.createInst(pathObj.oid, pathObj.iid, value);
        rsp.code = RSP.changed;
        rsp.end();
    } else {
        obj[pathObj.rid] = value;
        cn.createInst(pathObj.oid, pathObj.iid, obj);
        rsp.code = RSP.changed;
        rsp.end();
    }
}

function serverWriteHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        value = getReqData(req, target.pathKey),
        obj = {};

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

function serverWriteAttrHandler (cn, req, rsp, serverInfo) {
    var pathObj = cutils.getPathIdKey(req.url),
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        attrs = cutils.buildRptAttr(req);

    if (!target.exist) {
        rsp.code = RSP.notfound;
        rsp.end();
    } else if (attrs === false) {
        rsp.code = RSP.badreq;
        rsp.end();
    } else {
        cn._setAttrs(serverInfo.shortServerId, pathObj.oid, pathObj.iid, pathObj.rid, attrs);
        rsp.code = RSP.changed;
        rsp.end();
    }
}

function serverExecuteHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
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

function serverObserveHandler (cn, req, rsp, serverInfo) {
    var pathObj = cutils.getPathIdKey(req.url),
        ssid = serverInfo.shortServerId, 
        target = cn._target(pathObj.oid, pathObj.iid, pathObj.rid),
        rAttrs = cn._getAttrs(ssid, pathObj.oid, pathObj.iid, pathObj.rid),
        dataAndOpt;

    function enableReport(oid, iid, rid, format, rsp) {
        cn._enableReport(ssid, oid, iid, rid, format, rsp, function (err, val) {
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
        helper.heartbeat(cn, ssid, true, rsp);
        rsp.statusCode = RSP.content;
        rsp.write('hb');
    } else if (!target.exist) {
        rsp.statusCode = RSP.notfound;
        rsp.end();
    } else if (target.type === TTYPE.obj) {
        rsp.statusCode = RSP.notallowed;
        rsp.end();
    } else if (serverInfo.reporters[target.pathKey]) {
        cn._disableReport(ssid, pathObj.oid, pathObj.iid, pathObj.rid, function (err) {
            enableReport(pathObj.oid, pathObj.iid, pathObj.rid, req.headers.Accept, rsp);
        });
    } else {
        enableReport(pathObj.oid, pathObj.iid, pathObj.rid, req.headers.Accept, rsp);
    }
}

function serverCancelObserveHandler (cn, req, rsp, serverInfo) {
    var pathObj = cutils.getPathIdKey(req.url),
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
        cn._disableReport(serverInfo.shortServerId, pathObj.oid, pathObj.iid, pathObj.rid, function (err, val) {
            if (err)
                rsp.code = RSP.notfound;
            else
                rsp.code = RSP.content;

            rsp.end();
        });
    }
}

function serverPingHandler (cn, req, rsp, serverInfo) {
    rsp.code = serverInfo.registered ? RSP.content : RSP.notallowed;
    rsp.end();
}

function serverCreateHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
        target = cn._target(pathObj.oid, pathObj.iid),
        data = getReqData(req, target.pathKey),
        value = data[Object.keys(data)],
        iid = Object.keys(data)[0];

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

function serverBsDeleteHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url),
        objList,
        oid;

    if (_.isNil(pathObj.oid) && _.isNil(pathObj.iid)) {
        cn.deleteInst(pathObj.oid, pathObj.iid);
        rsp.code = RSP.deleted;
        rsp.end();
    } else {
        objList = cn.so.objectList();
        _.forEach(objList, function (obj) {
            oid = obj.oid;
            switch (oid){
                case 0:
                case 1:
                case 2:
                case 4:
                case 5:
                case 6:
                case 7:
                    _.forEach(obj.iid, function (iid) {
                        cn.deleteInst(oid, iid);
                    });
                    break;

                default:
                    break;
            }
        });

        rsp.code = RSP.deleted;
        rsp.end();
    }
}

function serverDeleteHandler (cn, req, rsp) {
    var pathObj = cutils.getPathIdKey(req.url);

    if (_.isNil(pathObj.oid) && _.isNil(pathObj.iid)) {
        cn.deleteInst(pathObj.oid, pathObj.iid, function(err) {
            if (err)
                rsp.code = RSP.badreq;
            else
                rsp.code = RSP.deleted;
            rsp.end();
        });
    } else {
        rsp.code = RSP.notallowed;
        rsp.end();
    }
}

function serverFinishHandler (cn, req, rsp) {
    var securityObjs = cn.so.dumpSync('lwm2mSecurity'),
        serverObjs = cn.so.dumpSync('lwm2mServer'),
        lwm2mServerURI,
        serverInfo;

    rsp.code = RSP.changed;
    rsp.end('finish');
    
    cn._bootstrapping = false;
    cn.emit('bootstrapped');

    // should register configured lwm2m server
    cn._factoryBootstrap(function (err) {
        if (err)
            cn.emit('error', err);
    });
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
                if (req.headers['Content-Format'])
                    optType = 'write';
                else
                    optType = 'writeAttr';
                break;
            case 'POST':
                if (req.url === '/ping')
                    optType = 'ping';
                else if (req.url === '/bs')
                      optType = 'finish';
                else if (req.url === '/announce')
                    optType = 'announce';
                else if (req.headers['Content-Format'])
                    optType = 'create';
                else
                    optType = 'execute';
                break;
            case 'DELETE':
                optType = 'delete';
                break;
            default:
                optType = 'empty';
                break;
        }
    }

    return optType;
}

// [TODO]
function getRspDataAndOption(req, originalData) {
    var format, data;

    if (req.headers.Accept === 'text/plain') {
        format = 'text/plain';
        if (_.isBoolean(originalData))
            data = originalData ? '1' : '0';
        else
            data = originalData.toString();
    } else if (req.headers.Accept === 'application/json') {
        format = 'application/json';
        data = cutils.encodeJson(req.url, originalData);
    } else {
        format = 'application/tlv';
        data = cutils.encodeTlv(req.url, originalData);
    }

    return {
        data: data,
        option: {'Content-Format': format}
    };
}

// [TODO]
function getReqData(req, path) {
    var data;
    
    if (req.headers['Content-Format'] === 'application/json') {
        data = cutils.decodeJson(path, req.payload);
    } else if (req.headers['Content-Format'] === 'application/tlv') {
        data = cutils.decodeTlv(path, req.payload);
    } else {
        data = req.payload.toString();
    }

    return data;
}

function buildAttrsAndRsc(cn, ssid, oid, iid, rid) {
    var attrs = cn._getAttrs(ssid, oid, iid, rid),
        allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        target = cn._target(oid, iid, rid),
        value,
        data;

    if (!_.isNil(iid)) 
        value = cn.getSmartObject().dumpSync(oid, iid);
    else 
        value = cn.getSmartObject().dumpSync(oid);

    data = cutils.encodeLinkFormat(target.pathKey, value, attrs);

    return data;
}

function findServer(cn, rsinfo) {
    var data;

    _.forEach(cn.serversInfo, function (serverInfo, ssid) {
        if (serverInfo.ip === rsinfo.address && serverInfo.port === rsinfo.port) 
            data = serverInfo;
    });

    if (!data)
        if (cn.bsServer.ip === rsinfo.address && cn.bsServer.port === rsinfo.port)
            data = cn.bsServer;

    return data;
}

/*********************************************************
 * Module Exports                                        *
 *********************************************************/
module.exports = serverReqHandler;
