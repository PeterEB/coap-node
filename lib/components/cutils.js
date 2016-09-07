'use strict';

var urlParser = require('url').parse,
    lwm2mId = require('lwm2m-id'),
    _ = require('busyman');

var cutils = {};

cutils.getTime = function () {
    return Math.round(new Date().getTime()/1000);
};

/*********************************************************
 * lwm2m-id utils                                        *
 *********************************************************/
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

/*********************************************************
 * path utils                                            *
 *********************************************************/
cutils.buildRptAttr = function (req) {      // 'pmin=10&pmax=60'
    var allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'stp' ],
        attrs = {},
        query = urlParser(req.url).query,
        queryParams = query.split('&');

    _.forEach(queryParams, function (queryParam, idx) {
        queryParams[idx] = queryParam.split('=');       // [[ pmin, 10 ], [ pmax, 60 ]]
    });

    _.forEach(queryParams, function(queryParam) {     
        if (_.includes(allowedAttrs, queryParam[0])) {
            attrs[queryParam[0]] = Number(queryParam[1]);
        } else {
            return false;
        }
    });

    return attrs;   // { pmin: 10, pmax:60 }
};

cutils.buildUpdateQuery = function (attrs) {    // { lifetime: 81000, version: 'v0.1.2' }
    var query = '';

    _.forEach(attrs, function (val, key) {
        if (key === 'lifetime' || key === 'lt')
            query += 'lt=' + val + '&';
        else if (key === 'version' || key === 'lwm2m')
            query += 'lwm2m=' + val + '&';
    });

    if (query[query.length-1] === '&')           
        query = query.slice(0, query.length-1);

    return query;   // 'lt=81000&lwm2m=v0.1.2'
};

cutils.getArrayArgus = function (argusInPlain) {    // 10,15,'xx'
    var argusInArray = [],
        notallowed = [' ', '"', "'", '\\'],
        isAnyNotallowed = false;

    function chkCharSyntax(string) {
        _.forEach(notallowed, function (val) {
            if (_.includes(string, val))
                isAnyNotallowed = true;
        });
    }

    if (argusInPlain.length === 0)
        return [];

    if (Number(argusInPlain))
        argusInPlain = argusInPlain.toString();

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
        return argusInArray;    // [10, 15, 'xx']
};

/*********************************************************
 * path utils                                            *
 *********************************************************/
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
    var pathArray = this.pathSlashParser(url),   // '/1/2/3'
        pathObj = {},
        oid,
        rid;

    if (url) {
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
        dateType = [ 'so', 'object', 'instance', 'resource' ][pathArray.length];
    return dateType;
};

/*********************************************************
 * JSON utils                                            *
 *********************************************************/
cutils.encodeJsonObj = function (path, value) {
    var self = this,
        objInJson = { 'e': [] },
        pathType = this.pathDateType(path),
        pathArray = this.pathSlashParser(path),
        oid = pathArray[0];

    if (pathType === 'object') {
        if (!_.isPlainObject(value)) throw new TypeError('value should be a object.');
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
        if (!_.isPlainObject(value)) throw new TypeError('value should be a object.');
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
cutils.decodeJsonObj = function (path, value) {
    var self = this,
        obj = {},
        pathType = this.pathDateType(path),
        oid = this.getSoKeyObj(path).oid,
        rid;

    if (value.e) {
        switch (pathType) {
            case 'object':         // obj
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n.split('/'),          // [iid, rid[, riid]]
                        val;

                    if (!_.isUndefined(resrc.v)) {
                        val = resrc.v;
                    } else if (!_.isUndefined(resrc.sv)) {
                        val = resrc.sv;
                    } else if (!_.isUndefined(resrc.bv)) {
                        val = resrc.bv;
                    } else if (!_.isUndefined(resrc.ov)) {
                        val = resrc.ov;     // [TODO] objlnk
                    }

                    if (path[0] === '')
                        path = path.slice(1);

                    if (path[path.length - 1] === '')
                        path = path.slice(0, path.length - 1);

                    if (path[0] && !_.has(obj, path[0]))
                        obj[path[0]] = {};

                    rid = self.ridKey(oid, path[1]);

                    if (rid && !_.has(obj, [path[0], rid])) {
                        if (path[2]) {
                            obj[path[0]][rid] = {};
                            obj[path[0]][rid][path[2]] = val;
                        } else {
                            obj[path[0]][rid] = val;
                        }
                    }
                });
                break;
            case 'instance':         // inst
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n.split('/'),          // [rid[, riid]]
                        val;

                    if (!_.isUndefined(resrc.v)) {
                        val = resrc.v;
                    } else if (!_.isUndefined(resrc.sv)) {
                        val = resrc.sv;
                    } else if (!_.isUndefined(resrc.bv)) {
                        val = resrc.bv;
                    } else if (!_.isUndefined(resrc.ov)) {
                        val = resrc.ov;     // [TODO] objlnk
                    }

                    if (path[0] === '')
                        path = path.slice(1);

                    if (path[path.length - 1] === '')
                        path = path.slice(0, path.length - 1);

                    rid = self.ridKey(oid, path[0]);

                    if (rid && !_.has(obj, rid)) {
                        if (path[1]) {
                            obj[rid] = {};
                            obj[rid][path[1]] = val;
                        } else {
                            obj[rid] = val;
                        }
                    }
                });
                break;
            case 'resource':         // resrc
                _.forEach(value.e, function (resrc) {
                    var path = resrc.n,          // [[riid]]
                        val;

                    if (!_.isUndefined(resrc.v)) {
                        val = resrc.v;
                    } else if (!_.isUndefined(resrc.sv)) {
                        val = resrc.sv;
                    } else if (!_.isUndefined(resrc.bv)) {
                        val = resrc.bv;
                    } else if (!_.isUndefined(resrc.ov)) {
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
    } else if (!_.isPlainObject(value) && pathType !== 'resource') {
        if (!_.isPlainObject(value)) throw new TypeError('value should be a object.');
    } else if (!_.isPlainObject(value) && pathType === 'resource') {
        if (!_.isString(value) && !_.isNumber(value)) 
            throw new TypeError('value should be a string or a number.');
        
        obj = value;
    } else {    // value is object and but not LWM2M format
        obj = value;
    }
    
    return obj;
};

module.exports = cutils;
