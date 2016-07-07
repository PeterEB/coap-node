'use strict';

var _ = require('busyman');

var cutils = require('./utils/cutils'),
    config = require('../config'),
    CNST = require('./constants');

/**** Code Enumerations ****/
var TTYPE = CNST.TTYPE,
    TAG = CNST.TAG,
    ERR = CNST.ERR,
    RSP = CNST.RSP;

var heartbeatTime = config.heartbeatTime || 20,
    serverChkTime = config.serverChkTime || 60;

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
            if (cn._lfsecs === (cn.lifetime - 5)) {
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
};

helper.checkAndBuildObjList = function (cn, check) {
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
};

helper.checkAndReportResrc = function (cn, oid, iid, rid, val) {
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
            helper.checkAndReportResrc(cn, oidKey, iid, ridKey, val);
        }, rAttrs.pmin * 1000);
    } else if (!rAttrs.mute && chkRp && rAttrs.enable && _.isFunction(rpt.write)) {
        rpt.write(val);
    }

    if (iAttrs.mute && iAttrs.enable) {
        setTimeout(function () {
            helper.checkAndReportResrc(cn, oidKey, iid, ridKey, val);
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
        }, serverChkTime * 1000);  
    }
};

/*********************************************************
 * Module Exports                                        *
 *********************************************************/
module.exports = helper;
