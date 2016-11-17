# node-red-contrib-predix-timeseries


These are [Node-RED](http://nodered.org) nodes that interface with the Timeseries microservices on [General Electric's Predix platform](https://www.ge.com/digital/predix) specifically for the functions of data ingestion and data query. The nodes simplify the process of data ingestion and data query without requiring users to develop an actual application on the Predix platform. For more information on Predix, please refer to [Predix resource](https://www.predix.io/resources).

For more information of these nodes, please refer to the tutorial on [http://developers.sensetecnic.com](http://developers.sensetecnic.com/article/tutorial-using-fred-to-interface-timeseries-on-predix/)

For a quick way to setup the Timeseries microservice on Predix, please refer to [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md). 

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

To setup the Timeseries ingest node, first setup the Timeseries client configuration by entering the information of your timeseries instance, such as the UAA url, Client ID, Client secret and the Predix-Zone-Id. If you are not sure where to obtain these values, please refer to the [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md). For a better understanding of the timeseries data structure, please refer to the [predix timeseries document](https://www.predix.io/docs/?r=816498#F0PrUNk2).

The current default ws url is wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages, if you have a different ws url, please feel free to contact the author of this node.

If you have entered all correct information and deploy, you should see the node showing "Connected".
![](readme_images/data_ingest_conencted.png?raw=true)

Once the node is connected, user is able send data in the incoming message. The fields include:

1. msg.payload.messageId: the ID of this data ingestion message
2. msg.payload.body: main part of the data ingestion message, which include three fields:
    * name: the tag names for timeseries 
    * datapoints: the datapoints in array form, which include timestamp, measurement and quality
    * attributes(optional): attributes are key/value pairs used to store data associated with a tag

For detail usage of the node, please refer to the tutorial on [http://developers.sensetecnic.com](http://developers.sensetecnic.com/article/tutorial-using-fred-to-interface-timeseries-on-predix/)


### Timeseries Query node: Query data from timeseries

To setup the Timeseries ingest node, first setup the Timeseries client configuration by entering the information of your timeseries instance, such as the UAA url, Client ID, Client secret and the Predix-Zone-Id. If you are not sure where to obtain these values, please refer to the [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md). For a better understanding of the timeseries data structure, please refer to the [predix timeseries document](https://www.predix.io/docs/?r=816498#F0PrUNk2).

The current default API base url is https://time-series-store-predix.run.aws-usw02-pr.ice.predix.io/v1/, if you have a different url, please feel free to contact the author of this node.

Once you have all the correct information and deploy the flow, you should see the node showing "Authenticated".
![](readme_images/data_query_authenticated.png?raw=true)

The data query node has a drop down menu with 4 options. They are referring to four API endpoints of the [Preix timeseries data services](https://www.predix.io/api#!/Asset).
    
   * Get all available aggregations
   * Query datapoints
   * Query for current value
   * Get all tags


For sample codes on the query command and node setup, please refer to our tutorial on [http://developers.sensetecnic.com](http://developers.sensetecnic.com/article/tutorial-using-fred-to-interface-timeseries-on-predix/)


