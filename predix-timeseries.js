
/**
 * Copyright 2013, 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications copyright (C) 2017 Sense Tecnic Systems, Inc.
 *
 **/

var request = require('request');
var ws = require("ws");
const uaa_util = require('predix-uaa-client');


const SECONDS_CONVERT_TO_MS = 1000;
const defaultQueryUrlPrefix = "https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/";
const defaultWsURL = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
const originPath = "http://localhost/";

module.exports = function(RED){
  "use strict";

  function timeseriesClientNode(n){

    RED.nodes.createNode(this,n);
    var node = this;

    node.UAAurl = n.UAAurl;
    node.queryUrlPrefix = (n.queryUrlPrefix === '') ? defaultQueryUrlPrefix : n.queryUrlPrefix;
    node.wsUrl = (n.wsUrl === '') ? defaultWsURL : n.wsUrl;
    node.clientID = node.credentials.clientID;
    node.clientSecret = node.credentials.clientSecret;
    node.predixZoneId = n.predixZoneId;

    //add the oauth endpoint to the UAA host url
    node.UAAurl += '/oauth/token';

    // var buffer = new Buffer(node.clientID+":"+node.clientSecret);
    // node.base64ClientCredential = buffer.toString('base64');

    // var options ={
    //   url: node.UAAurl,
    //   headers:{
    //     'Content-Type':'application/x-www-form-urlencoded',
    //     'Pragma':'no-cache',
    //     'Cache-Control':'no-cache',
    //     'authorization':'Basic '+node.base64ClientCredential
    //   },
    //   method:'POST',
    //   body:'username='+node.credentials.userID+'&password='+node.credentials.userSecret+'&grant_type=password'
    // };

    // request(options, function(error, response, body){
    //   if(response && response.statusCode!==200){
    //     node.error(response.statusCode+": "+response.statusMessage);
    //     node.emit('unauthenticated','');
    //   } else if(response){
    //     try {
    //       node.accessToken = JSON.parse(response.body).access_token;
    //       node.refreshToken = JSON.parse(response.body).refresh_token;

    //       node.emit('authenticated','');
    //       node.tokenExpiryTime = (new Date).getTime() + JSON.parse(response.body).expires_in*SECONDS_CONVERT_TO_MS;
    //     } catch (err) {
    //       node.emit('accessTokenError');
    //     }
    //   } else {
    //     node.error("Invalid request");
    //     node.emit('unauthenticated','');
    //   }
    // });

    this.on('close', function(){
      /* nothing for now */
    });
  }

  RED.nodes.registerType("timeseries-client", timeseriesClientNode, {
    credentials:{
      clientID:{type:"text"},
      clientSecret: { type:"text"}
    }
  });


  function timeseriesIngestNode(config){
    RED.nodes.createNode(this,config);
    var node = this;
    var isWsConnected = false;
    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      node.predixZoneId = node.server.predixZoneId;
      node.accessToken = node.server.accessToken;

      if(node.predixZoneId && node.accessToken){
        startconn();
      };

      this.server.on('authenticated', function() {
        node.log("[Predix Timeseries]: authenticated");
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
        node.predixZoneId = node.server.predixZoneId;
        node.accessToken = node.server.accessToken;
        startconn();
      });

      this.server.on('unauthenticated',function() {
        node.log("[Predix Timeseries]: unauthenticated");
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
        node.predixZoneId = "";
        node.accessToken = "";
      });

      this.server.on('accessTokenError',function() {
        node.error("[Predix Timeseries]: access token error");
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Access Error"});
        node.predixZoneId = "";
        node.accessToken = "";
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing config"});
    }

    //ws connection
    function startconn(){
      node.log("[Predix Timeseries]: start connection");
      var opts = {};
      if(node.predixZoneId && node.accessToken) {
        opts={
          headers:{
            'predix-zone-id':node.predixZoneId,
            'authorization':'Bearer '+node.accessToken,
            'origin':originPath
          }
        };
      } else {
        if (!node.accessToken) {
          node.status({fill:"red",shape:"ring",text:"missing access token"});
        } else if (!node.predixZoneId) {
          node.status({fill:"red",shape:"ring",text:"missing predix zone id"});
        }
        return;
      }
      var socket = new ws(wsURL, opts);
      node.connection = socket;
      handleConnection(node.connection);
    }

    function handleConnection(/*socket*/socket){
      socket.on('open', function(){
        node.log("[Predix Timeseries]: websocket is connected");
        isWsConnected = true;
        node.emit('opened','');
        node.status({fill:"green",shape:"dot",text:"Connected"});
      });

      socket.on('close',function(code, data){
        node.log("[Predix Timeseries]: websocket is closed");
        isWsConnected = false;
        node.status({fill:"red",shape:"ring",text:"Closed"});
        node.emit('closed');

        //reconnect
        if(node.accessToken != ""){
          clearTimeout(node.tout);
          node.emit('reconnecting');
          node.status({fill:"yellow",shape:"ring",text:"Reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        };
      });

      socket.on('error', function(err){
        isWsConnected = false;
        node.error(err);

        node.status({fill:"red",shape:"ring",text:"Error"});

        if(node.server.checkTokenExpire()){
          node.server.renewToken(node.server);
          if(node.accessToken != ""){
            clearTimeout(node.tout);
            node.emit('reconnecting');
            node.status({fill:"yellow",shape:"ring",text:"Reconnecting"});
            node.tout = setTimeout(function(){ startconn(); }, 3000);
          }
        }
      });

      socket.on('message',function(data){
        node.log(data);
        var statusCode;
        try {
          statusCode = JSON.parse(data).statusCode;
        } catch (err) {
          node.error("Invalid status code");
        }
        if(statusCode !== 202 ){
          node.error(statusCode + ": " + "Ingest error");
        };
      })
    }

    this.on("input", function(msg){
      var payload;
      if (msg.hasOwnProperty("payload")) {
        if (!Buffer.isBuffer(msg.payload)) { // if it's not a buffer make sure it's a string.
          payload = RED.util.ensureString(msg.payload);
        } else {
          payload = msg.payload;
        }
      }
      if(isWsConnected === true){
        if (payload) {
            try {
              node.connection.send(payload);
            } catch(err){
              node.error(err);
            }
        }
      } else {
        node.error("[Predix Timeseries]: Websocket not connected");
      }
    });
  }
  RED.nodes.registerType("timeseries-ingest", timeseriesIngestNode);

  function timeseriesQueryNode(config){
    RED.nodes.createNode(this,config);
    var node = this;
    var requestMethod ='';
    node.queryType = config.queryType;

    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      node.predixZoneId = node.server.predixZoneId;
      this.server.on('authenticated', function() {
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
        node.predixZoneId = node.server.predixZoneId;
        node.accessToken = node.server.accessToken;
      });
      this.server.on('unauthenticated',function() {
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
        node.predixZoneId = "";
        node.accessToken = "";
      });
      this.server.on('accessTokenError',function() {
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Access Error"});
        node.predixZoneId = "";
        node.accessToken = "";
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing server config"});
    }

    switch(node.queryType){
      case "aggregations":
        node.apiEndpoint = node.server.queryUrlPrefix + "aggregations";
        requestMethod = 'GET';
        break;
      case "datapoints":
        node.apiEndpoint = node.server.queryUrlPrefix + "datapoints";
        requestMethod = 'POST';
        break;
      case "currentDatapoints":
        node.apiEndpoint = node.server.queryUrlPrefix + "datapoints/latest";
        requestMethod = 'POST';
        break;
      case "tags":
        node.apiEndpoint = node.server.queryUrlPrefix + "tags";
        requestMethod = 'GET';
        break;
      default:
        node.apiEndpoint = node.server.queryUrlPrefix;
    };

    function requestCall(msg){
      if (msg.hasOwnProperty("payload")){
        var body;
        try {
          body = JSON.stringify(msg.payload)
        } catch (err) {
          node.error("Failed to parse msg.payload: " + err);
          return;
        }
        // Call with client credentials (UAAUrl, ClientID, ClientSecret),
        // will fetch a client token using these credentials.
        // In this case the client needs authorized_grant_types: client_credentials
        uaa_util.getToken(node.server.UAAurl, node.server.clientID, node.server.clientSecret).then((token) => {
            // Use token.access_token as a Bearer token Authroization header
            // in calls to secured services.

          request({
              url: node.apiEndpoint,
              headers:{
                'predix-zone-id':node.predixZoneId,
                'authorization':'Bearer '+token.access_token
              },
              method:requestMethod,
              body:body
            }, function(error, response, body){
            if(error){
              node.error(error);
            } else if(response) {
              if (response.statusCode!==200){
                node.error(response.statusCode+": "+response.body);
              } else {
                node.send({payload:response.body});
              }
            }
          });

        }).catch((err) => {
          node.error(err);
        });
      }
    };

    this.on('input', function(msg){
      requestCall(msg);
    });
  }
  RED.nodes.registerType("timeseries-query", timeseriesQueryNode);
}

