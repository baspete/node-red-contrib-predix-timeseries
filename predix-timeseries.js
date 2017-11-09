
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
// var ws = require("ws");
const uaa_util = require('predix-uaa-client');
const WebSocketClient = require('websocket').client;
const url = require('url');
const SECONDS_CONVERT_TO_MS = 1000;
const defaultQueryUrlPrefix = "https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/";
const defaultWsURL = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
const originPath = "http://localhost/";

module.exports = function(RED){
  "use strict";

  // ******************************************************************
  // Config Node

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

  // Config Node
  // ******************************************************************


  // ******************************************************************
  // Query Node

  function timeseriesQueryNode(config){
    RED.nodes.createNode(this,config);
    var node = this;
    var requestMethod ='';
    node.queryType = config.queryType;

    this.server = RED.nodes.getNode(config.server);

    // Indicator
    if(this.server){
      node.on('authenticated', function() {
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
      });
      node.on('unauthenticated',function() {
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
      });
      node.on('requestError',function() {
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Request Error"});
      });
      node.on('responseError',function() {
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Response Error"});
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing server config"});
    }

    // Method/Routes for query Types
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
        // Call with client credentials (UAAUrl, ClientID, ClientSecret), will fetch a client token using these credentials.
        // uaa_util will cache token for these credentials and retrieve a refresh token if needed.
        uaa_util.getToken(node.server.UAAurl, node.server.clientID, node.server.clientSecret).then((token) => {
          node.emit('authenticated','');
          request({
              url: node.apiEndpoint,
              headers:{
                'predix-zone-id':node.server.predixZoneId,
                'authorization':'Bearer '+token.access_token
              },
              method:requestMethod,
              body:body
            }, function(error, response, body){
            if(error){
              node.error(error);
              node.emit('requestError','');
            } else if(response) {
              if (response.statusCode!==200){
                node.emit('responseError','');
                node.error(response.statusCode+": "+response.body);
              } else {
                node.send({payload:response.body});
              }
            }
          });
        }).catch((err) => {
          node.emit('unauthenticated','');
          node.error(err);
        });
      }
    };

    this.on('input', function(msg){
      requestCall(msg);
    });
  }
  RED.nodes.registerType("timeseries-query", timeseriesQueryNode);

  // Query Node
  // ******************************************************************

  // ******************************************************************
  // Ingest Node

  function timeseriesIngestNode(config){
    RED.nodes.createNode(this,config);
    var node = this;
    var isWsConnected = false;
    const client = new WebSocketClient();

    node.server = RED.nodes.getNode(config.server);

    // Indicator for Auth Events
    if(node.server){
      node.server.on('authenticated', function() {
        node.log("[Predix Timeseries]: authenticated");
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
      });
      node.server.on('unauthenticated',function() {
        node.log("[Predix Timeseries]: unauthenticated");
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
      });
      node.server.on('accessTokenError',function() {
        node.error("[Predix Timeseries]: access token error");
        node.status({fill:"red",shape:"ring",text:"Access Error"});
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing config"});
    }


    // Get a token
    uaa_util.getToken(node.server.UAAurl, node.server.clientID, node.server.clientSecret).then((token) => {
      node.emit('authenticated','');

      // Proxy check for websocket
      let requestOptions = {};
      if(process.env.https_proxy) {
        const proxy = url.parse(process.env.https_proxy);
        const tunnelingAgent = require('tunnel').httpsOverHttp({
          proxy: {
            host: proxy.hostname,
            port: proxy.port
          }
        });
        node.log("[Predix Timeseries]: Using Proxy "+ proxy.host);
        requestOptions.agent = tunnelingAgent;
      }

      const headers = {
        'predix-zone-id':node.server.predixZoneId,
        'authorization':'Bearer '+token.access_token,
        'Origin':originPath
      };

      client.on('connect', connection => {

        node.log("[Predix Timeseries]: Websocket Connected");
        node.status({fill:"green",shape:"dot",text:"Connected"});

        connection.on('error', error => {
          node.error("[Predix Timeseries]: Websocket Connected");
          node.status({fill:"red",shape:"ring",text:"Websocket Error"});
        });

        // Handle responses to sending data.
        // These should look something like { type: 'utf8', utf8Data: '{"statusCode":202,"messageId":"1"}' }
        connection.on('message', data => {
          var statusCode;
          try {
            statusCode = JSON.parse(data.utf8Data).statusCode;
          } catch (err) {
            node.error("[Predix Timeseries]: Invalid ingest status code: " + statusCode);
          }
          if(statusCode < 200 || statusCode >= 300){
            node.error('[Predix Timeseries] :' + statusCode + ": " + "ingest error");
          } else {
            // Everything worked, blinkenlights!
            node.status({fill:"green",shape:"circle",text:"Data Sent"});
            // TODO: go back to filled circle
          };
        });


        // Send data when input to node received
        node.on("input", function(msg){
          var payload;
          if (msg.hasOwnProperty("payload")) {
            if (!Buffer.isBuffer(msg.payload)) { // if it's not a buffer make sure it's a string.
              payload = RED.util.ensureString(msg.payload);
            } else {
              payload = msg.payload;
            }
          }
          if (payload) {
            try {
              connection.sendUTF(payload);
              node.log("[Predix Timeseries]: Sent " + JSON.stringify(payload));
            } catch(err){
              node.error(err);
            }
          }
        });

      });

      // Open the web socket
      client.connect(node.server.wsUrl, null, originPath, headers, requestOptions);

    }).catch((err) => {
      node.emit('unauthenticated','');
      node.error(err);
    });

  }
  RED.nodes.registerType("timeseries-ingest", timeseriesIngestNode);

  // Ingest
  // ******************************************************************

}
