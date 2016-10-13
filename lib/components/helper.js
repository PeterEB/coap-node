'use strict';

var _ = require('busyman');

var cutils = require('./cutils'),
    CNST = require('./constants');

/**** Code Enumerations ****/
var TTYPE = CNST.TTYPE,
    TAG = CNST.TAG,
    ERR = CNST.ERR,
    RSP = CNST.RSP;

var helper = {};

/*********************************************************
 * helper                                                *
 *********************************************************/
helper.lfUpdate = function (cn, enable) {
    cn._lfsecs = 0;
    clearInterval(cn._updater);
    cn._updater = null;

    if (enable) {
        cn._updater = setInterval(function () {
            cn._lfsecs += 1;
            if (cn._lfsecs >= (cn.lifetime)) {
                cn.update({ lifetime: cn.lifetime }, function (err, msg) {
                    if (err) {
                        cn.emit('error', err);
                    } else {
                        if (msg.status === RSP.notfound)
                            helper.lfUpdate(cn, false);
                    }
                });

                cn._lfsecs = 0;
            }
        }, 1000);
    }
};

helper.heartbeat = function (cn, enable, rsp) {
    clearInterval(cn._hbPacemaker);
    cn._hbPacemaker = null;
    
    if (cn._hbStream.stream) {
        cn._hbStream.stream.removeListener('finish', cn._hbStream.finishCb);
        cn._hbStream.stream.end();
        cn._hbStream.stream = null;
        cn.emit('logout');
    }

    if (enable) {
        cn._hbStream.stream = rsp;
        cn._hbStream.finishCb = function () {
            clearInterval(cn._hbPacemaker);
            cn.emit('offline');

            if (cn.autoReRegister === true) 
                helper.reRegister(cn);
        };

        rsp.on('finish', cn._hbStream.finishCb);

        cn._hbPacemaker = setInterval(function () {
            try {
                cn._hbStream.stream.write('hb');
            } catch (e) {
                cn.emit('error', e);
            }
        }, cn._config.heartbeatTime * 1000);
        cn.emit('login');
    }
};

helper.reRegister = function (cn) {
    cn.emit('reconnect');
    cn.register(cn._serverIp, cn._serverPort, function (err, msg) {
        if (!msg || !(msg.status === RSP.created || msg.status === RSP.changed)) {
            setTimeout(function () {
                helper.reRegister(cn);
            }, 5000);
        }
    });
};

helper.checkAndBuildObjList = function (cn, check) {
    var objList = cn.getSmartObject().objectList(),
        objListInPlain = '',
        newObjList = {};


    _.forEach(objList, function (rec) {
        newObjList[rec.oid] = rec.iid;
    });

    if (!_.isEmpty(cn.objList) && _.isEqual(cn.objList, newObjList) && check === true)
        return null;       // not diff

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
        objListInPlain = objListInPlain.slice(0, objListInPlain.length - 1);

    return objListInPlain;
};

helper.checkAndReportResrc = function (cn, oid, iid, rid, val) {
    var target = cn._target(oid, iid, rid),
        oidKey = target.oidKey,
        ridKey = target.ridKey,
        rAttrs = cn._getAttrs(oid, iid, rid),
        iAttrs = cn._getAttrs(oid, iid),
        rpt = cn._reporters[target.pathKey],
        iRpt = cn._reporters[oidKey + '/' + iid],
        iObj = {},
        chkRp;

    if (!rAttrs.enable && !iAttrs.enable)
        return false;

    if (_.isNil(rAttrs.lastRpVal))
        rAttrs.lastRpVal = iAttrs.lastRpVal[ridKey];

    chkRp = chackResourceAttrs(val, rAttrs.gt, rAttrs.lt, rAttrs.stp, rAttrs.lastRpVal);

    // chack Resource pmin and report
    if (rAttrs.mute && rAttrs.enable) {
        setTimeout(function () {
            helper.checkAndReportResrc(cn, oid, iid, rid, val);
        }, rAttrs.pmin * 1000);
    } else if (!rAttrs.mute && chkRp && rAttrs.enable && _.isFunction(rpt.write)) {
        rpt.write(val);
    }

    // chack Object Instance pmin and report
    if (iAttrs.mute && iAttrs.enable) {
        setTimeout(function () {
            helper.checkAndReportResrc(cn, oid, iid, rid, val);
        }, iAttrs.pmin * 1000);
    } else if (!iAttrs.mute && chkRp && iAttrs.enable && _.isFunction(iRpt.write)) {
        iObj[ridKey] = val;
        iRpt.write(iObj);
    }
};

helper.checkAndCloseServer = function (cn, enable) {
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
        }, cn._config.serverChkTime * 1000);  
    }
};

/*********************************************************
 * Private function                                      *
 *********************************************************/
function chackResourceAttrs(val, gt, lt, step, lastRpVal) {
    var chkRp = false;

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
        // check Recource notification class attributes
        if (_.isNumber(gt) && _.isNumber(lt) && lt > gt) {
            chkRp = (lastRpVal !== val) && (val > gt) && (val < lt);
        } else if (_.isNumber(gt) && _.isNumber(lt)) {
            chkRp = _.isNumber(gt) && (lastRpVal !== val) && (val > gt);
            chkRp = chkRp || (_.isNumber(lt) && (lastRpVal !== val) && (val < lt));
        } else {
            chkRp = (lastRpVal !== val);
        }

        if (_.isNumber(step)) 
            chkRp = (Math.abs(val - lastRpVal) > step);
    }

    return chkRp;
}

/*********************************************************
 * Module Exports                                        *
 *********************************************************/
module.exports = helper;
