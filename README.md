# node-red-contrib-predix-timeseries

These are [Node-RED](http://nodered.org) nodes that interface with the Timeseries microservices on [General Electric's Predix platform](https://www.ge.com/digital/predix) specifically for the functions of data ingestion and data query. The nodes simplify the process of data ingestion and data query without requiring users to develop an actual application on the Predix platform. For more information on Predix, please refer to [Predix resource](https://www.predix.io/resources).

## Pre-requesites

To run these nodes, you need to have a running Predix Timeseries service on the GE's Predix platform. Please refer to [predix-timeseries-setup-guide](https://github.com/SenseTecnic/node-red-contrib-predix-timeseries/blob/master/predix-timeseries-setup.md).

## Install

Run the follwing command in the root directory of your Node-RED install.
Usually this is `~/.node-red` .

```
npm install node-red-contrib-predix-ts
```

## Credit

This was forked from the [node-red-contrib-predix-timeseries](https://flows.nodered.org/node/node-red-contrib-predix-timeseries) node, and modified to use the [predix-uaa-client](https://www.npmjs.com/package/predix-uaa-client) for token management.