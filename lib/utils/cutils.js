'use strict';

var urlParser = require('url').parse,
    _ = require('lodash'),
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
    var allowedAttrs = [ 'pmin', 'pmax', 'gt', 'lt', 'step' ],
        attrs = {};

    _.forEach(_queryParser(req.url), function(queryParam) {     // 'pmin=10&pmax=60'
        if (_.includes(allowedAttrs, queryParam[0])) {
            attrs[queryParam[0]] = parseInt(queryParam[1]);
        } else if (queryParam[0] === 'cancel') {
            attrs.cancel = true;
        }
    });

    return attrs;   // { pmin: 10, pmax:60 }
};

cutils.uriParser = function (url) {
    var pathname = urlParser(url).pathname,
        pathnameParams = pathname.split('/');       // '/x/y/z'

    if (pathnameParams[0] === '') 
        pathnameParams = pathnameParams.slice(1);

    if (pathnameParams[pathnameParams.length-1] === '')           
        pathnameParams = pathnameParams.slice(0, pathnameParams.length-1);

    return pathnameParams;  // ['x', 'y', 'z']
};

cutils.getSoKeyObj = function (url) {
    var pathnameParams,       // '/1/2/3'
        pathObj = {},
        oid,
        rid;

    if (url) {
        pathnameParams = this.uriParser(url);
        if (pathnameParams[0]) {    //oid
            oid = this.oidKey(pathnameParams[0]);
            pathObj.oid = oid;

            if (pathnameParams[1]) {    //iid
                pathObj.iid = + pathnameParams[1]; 

                if (pathnameParams[2]) {    //rid
                    rid = this.ridKey(oid, pathnameParams[2]);
                    pathObj.rid = rid;
                } 
            }
        }
    }

    return pathObj;     // {oid:'lwm2mServer', iid: '2', rid: 'defaultMaxPeriod'}
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
