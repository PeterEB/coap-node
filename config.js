'use strict';

module.exports = {

    // the cserver's COAP server will start listening.
    // default is 5683.
    clientDefaultPort: 5685,

    // indicates if the server should create IPv4 connections (udp4) or IPv6 connections (udp6).
    // default is udp4.
    connectionType: 'udp4',

    // the registration should be removed by the Server if a new registration or update is not received within this lifetime. 
    // default is 86400 secs.
    lifetime: 86400,

    // minimum supported LWM2M version
    version: '1.0.0',

    // Minimum time in seconds the Client Device should wait between two notifications.
    // default is 0 secs.
    defaultMinPeriod: 0,

    // Maximum Period. Maximum time in seconds the Client Device should wait between two notifications. 
    // When maximum time expires after the last notification, a new notification should be sent.
    // default is 60 secs.
    defaultMaxPeriod: 60,

    // request should get response in the time.
    // default is 60 secs.
    reqTimeout: 60,

    // how often to sent heartbeat.
    // default is 20 secs.
    heartbeatTime: 20,

    // how often to check the socket is not used.
    // default is 60 secs.
    serverChkTime: 60
};
