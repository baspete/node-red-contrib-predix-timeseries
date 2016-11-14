var request = require('request'); 
var ws = require("ws");

const SECONDS_CONVERT_TO_MS = 1000;
const queryUrlPrefix = "https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/";
const wsURL = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
const originPath = "http://localhost/";  

module.exports = function(RED){
  "use strict";

  function timeseriesClientNode(n){
    
    RED.nodes.createNode(this,n);
    var node = this;

    node.UAAurl = n.UAAurl;
    node.clientID = node.credentials.clientID;
    node.clientSecret = node.credentials.clientSecret;
    node.predixZoneId = n.predixZoneId;

    //Checks if hitting the correct UAA api, if not, modify the end points to avoid 302 error
    var endOfUaaUrl = node.UAAurl.substr(node.UAAurl.length-12);
    if(endOfUaaUrl !== '/oauth/token'){
        node.UAAurl += '/oauth/token';
    };
        
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
      body:'username='+node.credentials.userID+'&password='+node.credentials.userSecret+'&grant_type=password'
    };

    function callback(error, response, body){
      if(response && response.statusCode!==200){
        node.error(response.statusCode+": "+response.statusMessage);
        node.emit('unauthenticated','');
      } else if(response){
        try {
          node.accessToken = JSON.parse(response.body).access_token;
          node.refreshToken = JSON.parse(response.body).refresh_token;

          node.emit('authenticated','');
          node.tokenExpiryTime = (new Date).getTime() + JSON.parse(response.body).expires_in*SECONDS_CONVERT_TO_MS; 
          // node.log("Token expires at "+node.tokenExpiryTime+", the current time is "+(new Date).getTime());
        } catch (err) {
          node.emit('accessTokenError');
        }
      } else {
        node.error("Invalid request");
        node.emit('unauthenticated','');
      }
    };

    request(options,callback);

    this.on('close', function(){
      /* nothing for now */
    });
  }

  RED.nodes.registerType("timeseries-client", timeseriesClientNode, {
    credentials:{
      clientID:{type:"text"},
      clientSecret: { type:"password"},
      userID:{type:"text"},
      userSecret:{type:"password"}      
    }
  });

  timeseriesClientNode.prototype.checkTokenExpire = function(/*Node*/handler) {
    return ((new Date).getTime() >= this.tokenExpiryTime );
  };

  timeseriesClientNode.prototype.renewToken = function(/*Node*/handler){
    var options ={
      url: this.UAAurl,
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'Pragma':'no-cache',
        'Cache-Control':'no-cache',
        'authorization':'Basic '+this.base64ClientCredential
      },
      method:'POST',
      body: 'refresh_token='+this.refreshToken+'&grant_type=refresh_token'
    };

    function callback(error, response, body){
      if(response && response.statusCode!==200){
        this.error(response.statusCode+": "+response.statusMessage);
        this.emit('unauthenticated','');
      } else if(response){
        try {
          this.accessToken = JSON.parse(response.body).access_token;
          this.refreshToken = JSON.parse(response.body).refresh_token;
          this.emit('authenticated','');
          this.tokenExpiryTime = (new Date).getTime() + JSON.parse(response.body).expires_in*SECONDS_CONVERT_TO_MS;
          // this.log("Renew access token");
        } catch (err) {
          this.emit('accessTokenError');
        }
      } else {
        this.error("Invalid request");
        this.emit('unauthenticated','');
      }
    };
    request(options,callback);
  };


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

      this.server.on('accessTokenError',function() { 
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
      // console.log("start connection");
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
        // console.log("Websocket is opened");
        isWsConnected = true;
        node.emit('opened','');
        node.status({fill:"green",shape:"dot",text:"Connected"});
      });

      socket.on('close',function(code, data){
        // console.log("websocket is closed");
        isWsConnected = false;
        node.status({fill:"red",shape:"ring",text:"Closed"});
        node.emit('closed');
        //reconnect
        if(!node.unauthorized){
          clearTimeout(node.tout);
          node.emit('reconnecting');
          node.status({fill:"yellow",shape:"ring",text:"Reconnecting"});
          node.tout = setTimeout(function(){ startconn(); }, 3000);
        }; 
      });

      socket.on('error', function(err){
        isWsConnected = false;
        // node.warn("Socket error");
        node.error(err);

        node.status({fill:"red",shape:"ring",text:"Error"});
     
        if(node.server.checkTokenExpire(node.server)){
          node.server.renewToken(node.server);
          if(!node.unauthorized){
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
      // console.log("injected");
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
        node.error("Websocket not connected");
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

      if(node.server.checkTokenExpire(node.server)){
        node.server.renewToken(node.server);
      } 
      if (msg.hasOwnProperty("payload")){
        var body;
        try {
          body = JSON.stringify(msg.payload)
        } catch (err) {
          node.error("Failed to parse msg.payload: " + err);
          return;
        }
        var options ={
          url: node.apiEndpoint,
          headers:{
            'predix-zone-id':node.predixZoneId,
            'authorization':'Bearer '+node.accessToken
          },
          method:requestMethod,
          body:body
        };

        function callback(error, response, body){
          if(error){
            node.error(error);
          } else if(response) {
            if (response.statusCode!==200){
              node.error(response.statusCode+": "+response.body);
            } else {
              node.send({payload:response.body});
            }
          }
        };
        request(options,callback);
      } 
    });
  }
  RED.nodes.registerType("timeseries-query", timeseriesQueryNode);
}

