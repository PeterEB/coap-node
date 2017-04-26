'use strict';

var urlParser = require('url').parse,
    lwm2mId = require('lwm2m-id'),
    lwm2mCodec = require('lwm2m-codec'),
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
cutils.chkPathSlash = function (path) {
    if (path.charAt(0) === '/') {
        return path;
    } else {
        return '/' + path;
    }
};

cutils.urlParser = function (url) {
    var urlObj = {
        pathname: url.split('?')[0],
        query: url.split('?')[1]
    };

    return urlObj;
};

cutils.getPathArray = function (url) {
    var path = urlParser(url).pathname,
        pathArray = path.split('/');       // '/x/y/z'

    if (pathArray[0] === '')
        pathArray = pathArray.slice(1);

    if (pathArray[pathArray.length-1] === '')
        pathArray = pathArray.slice(0, pathArray.length-1);

    return pathArray;  // ['x', 'y', 'z']
};

cutils.getPathIdKey = function (url) {
    var pathArray = this.getPathArray(url),   // '/1/2/3'
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

cutils.getPathDateType = function (path) {
    var pathArray = this.getPathArray(path),
        dateType = [ 'so', 'object', 'instance', 'resource' ][pathArray.length];
    return dateType;
};

/*********************************************************
 * Link utils                                            *
 *********************************************************/
cutils.encodeLinkFormat = function (path, value, attrs) {
    return lwm2mCodec.encode('link', path, value, attrs);
};
/*********************************************************
 * TLV utils                                             *
 *********************************************************/
cutils.encodeTlv = function (path, value) {
    return lwm2mCodec.encode('tlv', path, value);
};

cutils.decodeTlv = function (path, value) {
    return lwm2mCodec.decode('tlv', path, value);
};

/*********************************************************
 * JSON utils                                            *
 *********************************************************/
cutils.encodeJson = function (path, value) {
    return lwm2mCodec.encode('json', path, value);
};

cutils.decodeJson = function (path, value) {
    return lwm2mCodec.decode('json', path, value);
};

module.exports = cutils;
