
module.exports = function(RED){
  "use strict";

  function timeseriesClientNode(n){
    var request = require('request'); 
    RED.nodes.createNode(this,n);
    var node = this;

    node.UAAurl = n.UAAurl;
    node.clientID = node.credentials.clientID;
    node.clientSecret = node.credentials.clientSecret;
    node.predixZoneId = n.predixZoneId;
        
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
        node.emit('unauthenticated','');
      } else if(response){
        node.accessToken = JSON.parse(response.body).access_token;
        node.emit('authenticated','');
      } else {
        node.error("Invalid request");
        node.emit('unauthenticated','');
      }
    };

    request(options,callback);

    this.on('close', function(){
    });

  }
  RED.nodes.registerType("timeseries-client", timeseriesClientNode, {
    credentials:{
      clientID:{type:"text"},
      clientSecret: { type:"password"}
    }
  });

  function timeseriesIngestNode(config){
    var ws = require("ws");    
    const wsURL = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
    const originPath = "http://localhost/";

    RED.nodes.createNode(this,config);
    var node = this;
    var websocketConnection = false;

    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      node.predixZoneId = node.server.predixZoneId;
      node.accessToken = node.server.accessToken;

      if(node.predixZoneId && node.accessToken){
        startconn();
      };

      this.server.on('authenticated', function() { 
        // console.log("authenticated");
        node.unauthorized = false;
        node.status({fill:"green",shape:"dot",text:"Authenticated"});
        node.predixZoneId = node.server.predixZoneId;
        node.accessToken = node.server.accessToken;
        startconn();
      });

      this.server.on('unauthenticated',function() { 
        // console.log("unauthenticated");
        node.unauthorized = true;
        node.status({fill:"red",shape:"ring",text:"Unauthenticated"});
        node.predixZoneId = "";
        node.accessToken = "";        
      });
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing config"});
    }

    //ws connection
    function startconn(){
      // console.log("start connection");
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
        // console.log("Websocket is opened");
        websocketConnection = true;
        node.emit('opened','');
        node.status({fill:"green",shape:"dot",text:"Connected"});
      });

      socket.on('close',function(code, data){
        // console.log("websocket is closed");
        // console.log(code);
        websocketConnection = false;
        node.status({fill:"red",shape:"ring",text:"Closed"});
        node.emit('closed');
        //reconnect
        if(!node.unauthorized){
          if (node.tout) { 
            clearTimeout(node.tout); 
          }
          node.emit('reconnecting');
          node.status({fill:"yellow",shape:"ring",text:"Reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        }; 
      })

      socket.on('error', function(err){
        websocketConnection = false;
        node.warn("Socket error");
        node.emit('error', err.message);
        //reconnect
        if(!node.unauthorized){
          if (node.tout) { 
            clearTimeout(node.tout); 
          }
          node.emit('reconnecting');
          node.status({fill:"yellow",shape:"ring",text:"Reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        }        
      })

      socket.on('message',function(data){
        node.log(data); 
        var statusCode = JSON.parse(data).statusCode;
        if(statusCode !== 202 ){
          node.error(statusCode + ": " + "Ingest error");
        };
      })
    }

    this.on("input", function(msg){
      // console.log("injected");
      var payload;
      if (msg.hasOwnProperty("payload")) {
        if (!Buffer.isBuffer(msg.payload)) { // if it's not a buffer make sure it's a string.
          payload = RED.util.ensureString(msg.payload);
        } else {
          payload = msg.payload;
        }
      }

      if(websocketConnection){

        if (payload) {
 
            try{node.connection.send(payload);}
            catch(err){
              node.error(err);
            }
        }
      } else {
        node.error("Websocket not connected");
      }
    });      

  }
  RED.nodes.registerType("timeseries-ingest", timeseriesIngestNode);


  function timeseriesQueryNode(config){
    var request = require('request'); 
    const queryUrlPrefix = "https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/"

    RED.nodes.createNode(this,config);
    var node = this;
    var requestMethod ='';
    node.queryType = config.queryType;

    this.server = RED.nodes.getNode(config.server);

    if(this.server){
      node.accessToken = this.server.accessToken;
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
    } else {
      node.status({fill:"yellow", shape:"dot",text:"Missing server config"});
    }

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
      if (msg.hasOwnProperty("payload")){
        var options ={
          url: node.apiEndpoint,
          headers:{
            'predix-zone-id':node.predixZoneId,
            'authorization':'Bearer '+node.accessToken
          },
          method:requestMethod,
          body:JSON.stringify(msg.payload)
        };

        function callback(error, response, body){
          if(error){
            node.error(error);
          }
          if(response && response.statusCode!==200){
            node.error(response.statusCode+": "+response.body);
          } else if(response){
            node.send({payload:response.body});
          }
        };
        request(options,callback);
      } 
    });
  }
  RED.nodes.registerType("timeseries-query", timeseriesQueryNode);
}

