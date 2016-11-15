# node-red-contrib-predix-timeseries


These are [Node-RED](http://nodered.org) nodes that interface with the Timeseries microservices on [General Electric's Predix platform](https://www.ge.com/digital/predix) specifically for the functions of data ingestion and data query. The nodes simplify the process of data ingestion and data query without requiring users to develop an actual application on the Predix platform. 

For more information on Predix, please refer to [Predix resource](https://www.predix.io/resources).

For a quicker way to setup the Timeseries microservice on Predix, please refer to [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md). 

## Pre-requesites

To run these nodes, you need to have a running Predix Timeseries service on the GE's Predix platform. Please refer to [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md). 

## Install

Run the follwing command in the root directory of your Node-RED install.
Usually this is `~/.node-red` .
```
    npm install node-red-contrib-predix-timeseries
```

## Usage

### Timeseries Ingest node: Write data to timeseries

To setup the Timeseries ingest node, first setup the Timeseries client configuration by entering the information of your timeseries instance, such as the UAA url, Client ID, Client secret and the Predix-Zone-Id. If you are not sure where to obtain these values, please refer to the predix-timeseries-setup-guide. For a better understanding of the timeseries data structure, please refer to the [predix timeseries document](https://www.predix.io/docs/?r=816498#F0PrUNk2).

The current default ws url is wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages, if you have a different ws url, please feel free to contact the author of this node.

If you have entered all correct information and deploy, you should see the node showing "Connected".
![](readme_images/data_ingest_conencted.png?raw=true)

Once the node is connected, user is able send data in the incoming message. The fields include:

1. msg.payload.messageId: the ID of this data ingestion message
2. msg.payload.body: main part of the data ingestion message, which include three fields:
    * name: the tag names for timeseries 
    * datapoints: the datapoints in array form, which include timestamp, measurement and quality
    * attributes(optional): attributes are key/value pairs used to store data associated with a tag

A sample code (taken from Predix toolkit API explorer) for what goes into the function node would be:


        msg.payload={
          "messageId": "1453338376222",
          "body": [
            {
              "name": "Compressor-2015:CompressionRatio",
              "datapoints": [
                [
                  1453338376222,
                  10,
                  3
                ],
                [
                  1453338377222,
                  10,
                  1
                ]
              ],
              "attributes": {
                "host": "server1",
                "customer": "Acme"
              }
            }
          ]
        }  
        return msg;


### Timeseries Query node: Query data from timeseries

To setup the Timeseries ingest node, first setup the Timeseries client configuration by entering the information of your timeseries instance, such as the UAA url, Client ID, Client secret and the Predix-Zone-Id. If you are not sure where to obtain these values, please refer to the predix-timeseries-setup-guide. For a better understanding of the timeseries data structure, please refer to the [predix timeseries document](https://www.predix.io/docs/?r=816498#F0PrUNk2).

The current default API base url is https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/, if you have a different url, please feel free to contact the author of this node.

Once you have all the correct information and deploy the flow, you should see the node showing "Authenticated".
![](readme_images/data_query_authenticated.png?raw=true)

The data query node has a drop down menu with 4 options. They are referring to four API endpoints of the [Preix timeseries data services](https://www.predix.io/api#!/Asset).

Here would be the sample code for the query command that users can send with the incoming messages in a function node(sample codes are taken from Predix toolkit API explorer). 

1. Get all available aggregations:
    
        msg.payload={
          //we can just send an empty msg.payload
        };
        return msg;  

2. Query datapoints:
  
  * If you would like to group datapoints:

          msg.payload={
            "start": "1y-ago",
            "tags": [
              {
                "name": "Compressor-2015:CompressionRatio",
                "order": "desc",
                "groups": [
                  {
                    "name": "quality"
                  }
                ]
              }
            ]
          };
          return msg;

  * If you would like to query limited datapoints:

          msg.payload={
            "start": "1y-ago",
            "tags": [
              {
                "name": "Compressor-2015:CompressionRatio",
                "order": "desc",
                "limit": 2
              }
            ]
          };
          return msg; 

  * If you would like to query ordered datapoints:

          msg.payload={
            "start": "1y-ago",
            "tags": [
              {
                "name": "Compressor-2015:CompressionRatio",
                "order": "desc"
              }
            ]
          };
          return msg; 

  * If you would like to query time bounded datapoints:

          msg.payload={
            "cache_time": 0,
            "tags": [
              {
                "name": "Compressor-2015:CompressionRatio",
                "order": "desc"
              }
            ],
            "start": 1452112200000,
            "end": 1453458896222
          };
          return msg;   

3. Query for current value:

        msg.payload={
          "tags": [
            {
              "name": "Compressor-2015:CompressionRatio"
            }
          ]
        };
        return msg;  

4. Get all tags:

        msg.payload={
          //we can just send an empty msg.payload
        };
        return msg;  