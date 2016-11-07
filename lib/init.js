var coap = require('coap'),
    _ = require('busyman');

var helper = require('./components/helper');

var init = {};

init.setupNode = function (cn, devResrcs) {
    var maxLatency = (cn._config.reqTimeout - 47)/ 2,
        so = cn.getSmartObject();

    coap.updateTiming({
        maxLatency: maxLatency
    });

    so.init('lwm2mServer', 0, {                         // oid = 1
        shortServerId: 'unknown',                       // rid = 0
        lifetime: cn.lifetime,                          // rid = 1
        defaultMinPeriod: cn._config.defaultMinPeriod,  // rid = 2
        defaultMaxPeriod: cn._config.defaultMaxPeriod   // rid = 3
    });

    so.init('device', 0, {                         // oid = 3
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

    so.init('connMonitor', 0, {     // oid = 4
        ip: cn.ip,                  // rid = 4
        routeIp: 'unknown'          // rid = 5         
    });

    so.__read = so.read;    // __read is the original read
    so.read = function (oid, iid, rid, opt, callback) {
        var dataToCheck;

        if (_.isFunction(opt)) {
            callback = opt;
            opt = undefined;
        }

        return so.__read(oid, iid, rid, opt, function (err, data) {
            dataToCheck = data;
            setImmediate(function () {
                helper.checkAndReportResrc(cn, oid, iid, rid, dataToCheck);
            });

            callback(err, data);
        });
    };

    so.__write = so.write;    // __write is the original write
    so.write = function (oid, iid, rid, value, opt, callback) {
        var dataToCheck;

        if (_.isFunction(opt)) {
            callback = opt;
            opt = undefined;
        }

        return so.__write(oid, iid, rid, value, opt, function (err, data) {
            dataToCheck = data || value;
            setImmediate(function () {
                helper.checkAndReportResrc(cn, oid, iid, rid, dataToCheck);
            });

            callback(err, data);
        });
    };

    helper.checkAndCloseServer(cn, true);
};

module.exports = init;
