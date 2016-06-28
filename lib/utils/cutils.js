'use strict';

var urlParser = require('url').parse,
    _ = require('busyman'),
    lwm2mId = require('lwm2m-id');

var cutils = {};

cutils.getTime = function () {
    return Math.round(new Date().getTime()/1000);
};

cutils.oidKey = function (oid) {
    var oidItem = lwm2mId.getOid(oid);
    return oidItem ? oidItem.key : oid;
};

cutils.oidNumber = function (oid) {
    var oidItem = lwm2mId.getOid(oid);

    oidItem = oidItem ? oidItem.value : parseInt(oid);   

    if (_.isNaN(oidItem))
        oidItem = oid;

    return oidItem;
};

cutils.ridKey = function (oid, rid) {
    var ridItem = lwm2mId.getRid(oid, rid);

    if (_.isUndefined(rid))
        rid = oid;

    return ridItem ? ridItem.key : rid;
};

cutils.ridNumber = function (oid, rid) {
    var ridItem = lwm2mId.getRid(oid, rid);

    if (_.isUndefined(rid))
        rid = oid;

    ridItem = ridItem ? ridItem.value : parseInt(rid);   

    if (_.isNaN(ridItem))
        ridItem = rid;

    return ridItem;
};

cutils.buildRptAttr = function (req) {
    var allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        attrs = {};

    _.forEach(_queryParser(req.url), function(queryParam) {     // 'pmin=10&pmax=60'
        if (_.includes(allowedAttrs, queryParam[0])) {
            attrs[queryParam[0]] = parseInt(queryParam[1]);
        } else {
            return false;
        }
    });

    return attrs;   // { pmin: 10, pmax:60 }
};

cutils.urlParser = function (url) {
    var urlObj = {
        pathname: url.split('?')[0],
        query: url.split('?')[1]
    };

    return urlObj;
};

cutils.pathSlashParser = function (url) {
    var path = urlParser(url).pathname,
        pathArray = path.split('/');       // '/x/y/z'

    if (pathArray[0] === '') 
        pathArray = pathArray.slice(1);

    if (pathArray[pathArray.length-1] === '')           
        pathArray = pathArray.slice(0, pathArray.length-1);

    return pathArray;  // ['x', 'y', 'z']
};

cutils.getSoKeyObj = function (url) {
    var pathArray,       // '/1/2/3'
        pathObj = {},
        oid,
        rid;

    if (url) {
        pathArray = this.pathSlashParser(url);
        if (pathArray[0]) {    //oid
            oid = this.oidKey(pathArray[0]);
            pathObj.oid = oid;

            if (pathArray[1]) {    //iid
                pathObj.iid = + pathArray[1]; 

                if (pathArray[2]) {    //rid
                    rid = this.ridKey(oid, pathArray[2]);
                    pathObj.rid = rid;
                } 
            }
        }
    }

    return pathObj;     // {oid:'lwm2mServer', iid: '2', rid: 'defaultMaxPeriod'}
};

cutils.pathDateType = function (path) {
    var pathArray = this.pathSlashParser(path),
        dateType;

    if (pathArray.length === 1) {
        dateType = 'object';
    } else if (pathArray.length === 2) {
        dateType = 'instance';
    } else if (pathArray.length === 3) {
        dateType = 'resource';
    }

    return dateType;
};

cutils.encodeJsonObj = function (path, value) {
    var self = this,
        objInJson = { 'e': [] },
        pathType = this.pathDateType(path),
        pathArray = this.pathSlashParser(path),
        oid = pathArray[0];

    if (pathType === 'object') {
        _.forEach(value, function (iObj, iid) {
            _.forEach(iObj, function (resrc, rid) {
                if (_.isPlainObject(resrc)) {
                    _.forEach(resrc, function (r, riid) {
                        var data = self.encodeJsonValue(iid + '/' + self.ridNumber(oid, rid) + '/' + riid, r);
                        objInJson.e.push(data);
                    });
                } else {
                    var data = self.encodeJsonValue(iid + '/' + self.ridNumber(oid, rid), resrc);
                    objInJson.e.push(data);
                }
            });
        });
    } else if (pathType === 'instance') {
        _.forEach(value, function (resrc, rid) {
            if (_.isPlainObject(resrc)) {
                _.forEach(resrc, function (r, riid) {
                    var data = self.encodeJsonValue(self.ridNumber(oid, rid) + '/' + riid, r);
                    objInJson.e.push(data);
                });
            } else {
                var data = self.encodeJsonValue(self.ridNumber(oid, rid), resrc);
                objInJson.e.push(data);
            }
        });
    } else if (pathType === 'resource') {
         if (_.isPlainObject(value)) {
            _.forEach(value, function (r, riid) {
                var data = self.encodeJsonValue(riid, r);
                objInJson.e.push(data);
            });
        } else {
            if (value instanceof Date) value = Number(value);
            // var data = self.encodeJsonValue(path, value);
            // objInJson.e.push(data);
            objInJson = value;
        }
    }

    return objInJson;
};

cutils.encodeJsonValue = function (path, value) {
    var val = { 'n': path.toString() };

    if (_.isNumber(value)) {
        val.v = Number(value);
    } else if (_.isString(value)) {
        val.sv = String(value);
    } else if (value instanceof Date) {
        val.v = Number(value);       
    } else if (_.isBoolean(value)) {
        val.bv = Boolean(value);
    } else if (_.isPlainObject(value)) {
        val.ov = value;     // [TODO] objlnk
    }

    return val;
};

cutils.decodeJsonObj = function (type, value) {
    var obj = {};

    if (value.e) {
        switch (type) {
            case 1:         // obj
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n.split('/'),          // [iid, rid[, riid]]
                        val;

                    if (resrc.v) {
                        val = resrc.v;
                    } else if (resrc.sv) {
                        val = resrc.sv;
                    } else if (resrc.bv) {
                        val = resrc.bv;
                    } else if (resrc.ov) {
                        val = resrc.ov;     // [TODO] objlnk
                    }

                    if (path[0] === '')
                        path = path.slice(1);

                    if (path[path.length - 1] === '')
                        path = path.slice(0, path.length - 1);

                    if (path[0] && !_.has(obj, path[0]))
                        obj[path[0]] = {};

                    if (path[1] && !_.has(obj, [path[0], path[1]])) {
                        if (path[2]) {
                            obj[path[0]][path[1]] = {};
                            obj[path[0]][path[1]][path[2]] = val;
                        } else {
                            obj[path[0]][path[1]] = val;
                        }
                    }
                });
                break;
            case 2:         // inst
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n.split('/'),          // [rid[, riid]]
                        val;

                    if (resrc.v) {
                        val = resrc.v;
                    } else if (resrc.sv) {
                        val = resrc.sv;
                    } else if (resrc.bv) {
                        val = resrc.bv;
                    } else if (resrc.ov) {
                        val = resrc.ov;     // [TODO] objlnk
                    }

                    if (path[0] === '')
                        path = path.slice(1);

                    if (path[path.length - 1] === '')
                        path = path.slice(0, path.length - 1);

                    if (path[0] && !_.has(obj, path[0])) {
                        if (path[1]) {
                            obj[path[0]] = {};
                            obj[path[0]][path[1]] = val;
                        } else {
                            obj[path[0]] = val;
                        }
                    }
                });
                break;
            case 3:         // resrc
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n,          // [[riid]]
                        val;

                    if (resrc.v) {
                        val = resrc.v;
                    } else if (resrc.sv) {
                        val = resrc.sv;
                    } else if (resrc.bv) {
                        val = resrc.bv;
                    } else if (resrc.ov) {
                        val = resrc.ov;     // [TODO] objlnk
                    }

                    if (path && !_.has(obj, path)) {
                        obj[path] = val;
                    }
                });
                break;
        default:
            break;
        }
    } else {
        obj = value;
    }

    return obj;
};

/*********************************************************
 * Private function
 *********************************************************/
function _queryParser (url) {
    var query = urlParser(url).query,
        queryParams = query.split('&');

    _.forEach(queryParams, function (queryParam, idx) {
        queryParams[idx] = queryParam.split('=');
    });

    return queryParams;
}

module.exports = cutils;
