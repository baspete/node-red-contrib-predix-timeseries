
module.exports = function(RED){
  "use strict";

  function timeseriesClientNode(n){
    var request = require('request'); 
    RED.nodes.createNode(this,n);
    var node = this;

    node.UAAurl = n.UAAurl;
    node.clientID = n.clientID;
    node.clientSecret = n.clientSecret;
    node.predixZoneId = n.predixZoneId;
    node.closing = false;
    
    
    var buffer = new Buffer(node.clientID+":"+node.clientSecret);
    node.base64ClientCredential = buffer.toString('base64');
    
    var options ={
      url: node.UAAurl,
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'Pragma':'no-cache',
        'Cache-Control':'no-cache',
        'authorization':'Basic '+node.base64ClientCredential
      },
      method:'POST',
      body:'client_id='+node.clientID+'&grant_type=client_credentials'

    };

    //access token expires in 12 hours

    function callback(error, response, body){
      if(response && response.statusCode!==200){
        node.error(response.statusCode+": "+response.statusMessage);
        console.log(response.statusCode+": "+response.statusMessage);
        node.emit('unauthenticated','');

      } else if(response){
        // console.log(response.statusCode);
        // console.log(JSON.parse(response.body).access_token);
        node.accessToken = JSON.parse(response.body).access_token;
        node.emit('authenticated','');
      } else {
        console.log("Invalid request");
        node.error("Invalid request");
        node.emit('unauthenticated','');
      }
    };


    request(options,callback);

    this.on('close', function(){
      console.log("config node is closing");
      node.closing = true;
    });

  }
  RED.nodes.registerType("timeseries-client", timeseriesClientNode);

  function timeseriesIngestNode(config){
    var ws = require("ws");    
    const wsURL = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
    const originPath = "http://localhost/";


    RED.nodes.createNode(this,config);
    var node = this;
    var websocketConnection = false;
    console.log("openning");
    node.closing = false;

    console.log(node.closing);
//a bug here:

// 1 Nov 20:52:36 - [info] Started modified flows
// 1 Nov 20:52:41 - [info] Stopping modified flows
// node is closing
// 1 Nov 20:52:41 - [info] Stopped modified flows
// 1 Nov 20:52:41 - [info] Starting modified flows
// openning
// false
// 1 Nov 20:52:41 - [info] Started modified flows
// 1 Nov 20:52:45 - [info] Stopping modified flows
// node is closing
// 1 Nov 20:52:45 - [info] Stopped modified flows
// 1 Nov 20:52:45 - [info] Starting modified flows
// openning
// false
// 1 Nov 20:52:45 - [info] Started modified flows
// websocket is closed
// true
// false
// closed but not restarting
// 1 Nov 20:52:51 - [info] Stopping modified flows
// node is closing
// 1 Nov 20:52:51 - [info] Stopped modified flows
// 1 Nov 20:52:51 - [info] Starting modified flows
// openning
// false
// 1 Nov 20:52:51 - [info] Started modified flows



    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      this.server.on('authenticated', function() { 
        console.log("authenticated");
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
        node.predixZoneId = node.server.predixZoneId;
        node.accessToken = node.server.accessToken;
        startconn();
      });
      this.server.on('unauthenticated',function() { 
        console.log("unauthenticated");
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
        node.predixZoneId = "";
        node.accessToken = "";        
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing server config"});
    }

    //ws connection
    function startconn(){
      console.log("start connection");
      var opts = {};
      if(node.predixZoneId && node.accessToken){
        opts={
          headers:{
            'predix-zone-id':node.predixZoneId,
            'authorization':'Bearer '+node.accessToken,
            'origin':originPath
          }
        };
      }

      var socket = new ws(wsURL, opts);
      node.connection = socket;
      handleConnection(node.connection);
    }

    function handleConnection(/*socket*/socket){
      socket.on('open', function(){
        console.log("Websocket is opened");
        websocketConnection = true;
        node.emit('opened','');
        node.status({fill:"green",shape:"dot",text:"Websocket connected"});
      });

      socket.on('close',function(){
        console.log("websocket is closed");
        websocketConnection = false;
        node.status({fill:"red",shape:"ring",text:"Websocket closed"});
        node.emit('closed');
        //reconnect
        if(!node.closing && !node.unauthorized){
          if (node.tout) { 
            clearTimeout(node.tout); 
          }
          node.emit('reconnecting');
          console.log("websocket is reconnecting");
          node.status({fill:"yellow",shape:"ring",text:"Websocket is reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        } else {
          console.log(node.closing);
          console.log(node.unauthorized);
          console.log("closed but not restarting");
        }
      })

      socket.on('error', function(err){
        websocketConnection = false;
        console.log("websocket is on error");
        node.emit('error', err.message);
        //reconnect
        if(!node.closing && !node.unauthorized){
          if (node.tout) { 
            clearTimeout(node.tout); 
          }
          node.emit('reconnecting');
          console.log("websocket is reconnecting");
          node.status({fill:"yellow",shape:"ring",text:"Websocket is reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        }        
      })

      socket.on('message',function(data){
        node.send({payload:data});
      })
    }

    
    this.on("input", function(msg){
      console.log("injected");
      var payload;
      if (msg.hasOwnProperty("payload")) {
        if (!Buffer.isBuffer(msg.payload)) { // if it's not a buffer make sure it's a string.
          payload = RED.util.ensureString(msg.payload);
        } else {
          payload = msg.payload;
        }
      }
      console.log(payload);
      if (payload) {
          node.connection.send(payload,function(error){
            if (error) {
              console.log(error);
              node.warn("websocket error");
            }
          });
      }
    });      
    this.on("close", function(){
      console.log("node is closing");
      node.closing = true;
    });
  }
  RED.nodes.registerType("timeseries-ingest", timeseriesIngestNode);



// bug: timeseries query node must be deployed with full flow
  function timeseriesQueryNode(config){
    var request = require('request'); 
    const queryUrlPrefix = "https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/"

    RED.nodes.createNode(this,config);
    var node = this;
    node.queryType = config.queryType;

    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      this.server.on('authenticated', function() { 
        console.log("authenticated");
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
        node.predixZoneId = node.server.predixZoneId;
        node.accessToken = node.server.accessToken;
      });
      this.server.on('unauthenticated',function() { 
        console.log("unauthenticated");
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
        node.predixZoneId = "";
        node.accessToken = "";        
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing server config"});
    }

    var requestMethod ='';

    switch(node.queryType){
      case "0":
        node.apiEndpoint = queryUrlPrefix + "aggregations";
        requestMethod = 'GET';
        break;
      case "1":
        node.apiEndpoint = queryUrlPrefix + "datapoints";
        requestMethod = 'POST';
        break;
      case "2":
        node.apiEndpoint = queryUrlPrefix + "datapoints/latest";
        requestMethod = 'POST';
        break;
      case "3":
        node.apiEndpoint = queryUrlPrefix + "tags";
        requestMethod = 'GET';
        break;
      default:
        node.apiEndpoint = queryUrlPrefix;
    }


    this.on('input', function(msg){
      console.log("injectect");
      if (msg.hasOwnProperty("payload")){
        console.log(msg.payload);
        var options ={
          url: node.apiEndpoint,
          headers:{
            'predix-zone-id':node.predixZoneId,
            'authorization':'Bearer '+node.accessToken
          },
          method:requestMethod,
          body:JSON.stringify(msg.payload)
        };
 
        console.log(typeof node.apiEndpoint);

        function callback(error, response, body){
          if(error){
            console.log(error);
            node.error(error);
          }
          if(response && response.statusCode!==200){
            node.error(response.statusCode+": "+response.body);
            console.log(response.statusCode+": "+response.body);

          } else if(response){
            console.log(response.body);
            node.send({payload:response.body});
          }

        };

        request(options,callback);
      } 
    });
    
  }
  RED.nodes.registerType("timeseries-query", timeseriesQueryNode);
}

