# node-red-contrib-predix-timeseries

These are [Node-RED](http://nodered.org) nodes that interface with the Timeseries microservices on [General Electric's Predix platform](https://www.ge.com/digital/predix) specifically for the functions of data ingestion and data query. The nodes simplify the process of data ingestion and data query without requiring users to develop an actual application on the Predix platform. For more information on Predix, please refer to [Predix resource](https://www.predix.io/resources).

## Pre-requesites

To run these nodes, you need to have a running Predix Timeseries service and UAA service on the GE's Predix platform. Please refer to the Predix Developer Network [documentation](https://docs.predix.io/en-US/content/service/data_management/time_series/) for details on creating these services.

TL;DR: You'll need to set up a Predix Timeseries instance, and a UAA client with grant type `client_credentials` and `timeseries.zones.<your timeseries zone id>.ingest`, `timeseries.zones.<your timeseries zone id>.query` and `timeseries.zones.<your timeseries zone id>.user` scopes. Once you have that, you'll need to enter values in your config node for:

  * The timeseries URL for queries (this will be https://something-or-other)
  * The timeseries URL for ingest (this will be wss://something-or-other)
  * The UAA url
  * The UAA client ID
  * The UAA client secret
  * Your timeseries zone ID

## Install

Run the follwing command in the root directory of your Node-RED install.
Usually this is `~/.node-red` .

```
npm install node-red-contrib-predix-ts
```

## Credit

This was forked from the [node-red-contrib-predix-timeseries](https://flows.nodered.org/node/node-red-contrib-predix-timeseries) node, and modified to use the [predix-uaa-client](https://www.npmjs.com/package/predix-uaa-client) for token management.