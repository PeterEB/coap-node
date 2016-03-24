'use strict';

module.exports = {

    // the cserver's COAP server will start listening.
    // default is 5683.
    clientDefaultPort: 5685,

    // indicates if the server should create IPv4 connections (udp4) or IPv6 connections (udp6).
    // default is udp4.
    connectionType: 'udp4',

    // request should get response in the time.
    // default is 60 secs.
    reqTimeout: 60,

    // how often to sent heartbeat.
    // default is 30 secs.
    heartbeatTime: 30,

    // how often to check the socket is not used.
    // default is 60 secs.
    serverChkTime: 60

};
