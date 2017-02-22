
# How to set up a Predix Time Series Microservice for access by Node-RED (Updated on Feb 22, 2017)

This guide will show you how to set up a timeseries service on Predix platform binded with just a placeholder front-end Webapp. This guide includes 3 major steps, including:

1. Set up a placeholder front-end app.
2. Set up a UAA instance
3. Set up a Timeseries instance
4. Update UAA settings

Once this is done you can ingest and query data though the API explorer tab in Predix Toolkit, or even better, Node-RED using the node-red-contrib-predix-timeseries nodes.

## Pre-requesites

To setup a timeseries service on General Electric's Predix platform, you will need:
- a developer account. For more information on getting a developer account, visit [Predix Developer Network](https://www.predix.io/).

- Cloud Foundry CLI: http://docs.cloudfoundry.org/cf-cli/

- Git: https://git-scm.com/

- Ruby + DevKit: https://www.ruby-lang.org/en/downloads/ https://github.com/oneclick/rubyinstaller/wiki/Development-Kit

Now let's start the setup.

## 1. Setup a placeholder front-end app

1. Use the Cloud Foundry CLI to log into Cloud Foundry

        cf login -a <API-ENDPOINT>

    where the API-ENDPOINT could be one of these:

        Predix Basic: https://api.system.aws-usw02-pr.ice.predix.io
        Predix Select: https://api.system.asv-pr.ice.predix.io
        Predix Japan: https://api.system.aws-jp01-pr.ice.predix.io
        Predix UK: https://api.system.dc-uk01-pr.ice.predix.io

2. Clone the hello-world sample app from predix github to your local

        git clone https://github.com/PredixDev/Predix-HelloWorld-WebApp

3. Edit the manifest.yml file within the Predix-HelloWorld-Webapp with the following info 

        applications:
          - name: Predix-HelloWorld-WebApp-<YourAppName>
            buildpack: predix_openresty_buildpack
            memory: 64M
            stack: cflinuxfs2

4. Inside the Predix-HelloWorld-Webapp

        cf push

5. Verify the app is uploaded in Cloud Foundry by 

        cf apps
    you can also enter this in the browser to check the webpage

        https://Predix-HelloWorld-WebApp-<YourAppName>.run.aws-usw02-pr.ice.predix.io

## 2. Set up a UAA instance

6. Now, create an UAA instance, the easy way would be enter this in the command terminal:

        cf create-service predix-uaa Free <YourAppName>-secure-uaa-instance -c '{"adminClientSecret":"<YOUR ADMIN PASSWORD>"}'
        
	In this command, it really depends on what tier of UAA service is available for you. You might use either **"Free"** or **"Tiered"** service for your UAA instance.
    
    If you are working on a Windows machine, you would use this instead:
    
    	cf create-service predix-uaa Tiered <your-name>-secure-uaa-instance -c '{\"adminClientSecret\":\"<YOUR ADMIN PASSWORD>\"}'

7. Then, login to the [Predix Developer Network console](https://www.predix.io/), find your space, and then in the service instances tab, find the UAA service that you just created, click on it.
    * You should see a "configure service instance" button on the right hand side, click on it
    * Now you will be prompted to enter the admin password for the UAA instance that you just created
    * Once you login, you will see your UAA url at the bottom at the dashboard, copy this url for later use.

8. Now you would need to loggin the [Predix Toolkit site](https://predix-toolkit.run.aws-usw02-pr.ice.predix.io/).
    * Click "Login as admin" on the left-hand panel, then Enter the UAA url along with your admin password, click submit. You should see a response with token.
    * Click "Create a client Id", this will be also referred as app client id later on. Enter the client id with a client secret, click submit and you should see a response with token. 
    * Click "create a user", this will create a user for you
    * You can verify by clicking "User Password Login", enter credentials and submit. You should see a response with token.
    * Then you can click "check token", in which you should see the decoded token

## 3. Set up a Timeseries instance

9. In the Predix Developer Network console page, go to catalog -> timeseries -> at the bottom of the page click "subscribe"

10. Now fill in the info for new servicve instance
    * org/space should be related to your account
    * UAA field should be the UAA instance url that you just created 
    * service instance name would be <YourAppName>-timeseries-instance for convention.
    * click create service and now you should see the new service instance under your console.

11. Your would need to bind the timeseries service with the placeholder app, go to the command terminal and enter:

        cf bind-service Predix-HelloWorld-WebApp-<YourAppName> <YourAppName>-timeseries-instance

12. Now, edit manifest.yml file just like we did for the front-end app. Add in the following fields at the bottom:

        services:
            - <YourAppName>-secure-uaa-instance
            - <YourAppName>-timeseries-instance
        env:
            clientId: <client id  that you created in UAA instance>
            base64ClientCredential: <open the terminal, enter "echo –n app_client_id:secret | base64", copy the converted value to here>
            
    Note: if you are working on a Windows environment, you can use an online Base64 encoding tool.

    Now save the yml file, and do a "cf push" again. Once it's done, verify with "cf env Predix-HelloWorld-WebApp-<YourAppName>". You will see the config of this app, and we will need these values for the next step. The value of "zone-http-header-value" will be the <your-timeseries-zone-id> that you need.     
    
## 4. Update UAA settings    
    
13. Now, go back to Predix Toolkit site, we need to add timeseries in the authorties.
    * login as admin like when you set up UAA instance
    * click Get Client ID on the left panel, and you should see the info of the client
    * click "Update Client ID", where you will enter these three new authorities for the placeholder app. Note that you will find your timeseries zone id from the command "cf env Predix-HelloWorld-WebApp-<YourAppName>" that you did in previous step.

            timeseries.zones.<your-timeseries-zone-id>.user
            timeseries.zones.<your-timeseries-zone-id>.ingest
            timeseries.zones.<your-timeseries-zone-id>.query 

    * validate the token by clicking "check token", you should see the newly added authorities in the token, with the correct timeseries zone id.

14. You will also need to grant access privilege to the client and user that you will be using to access the Timeseries instance. You can do this in the UAA instance configuration by adding the corresponding groups to the users that you will be using. The other more efficient way would be adding these groups in the command terminal. Note that you will need to be very careful as you might accidently wipe the admin policies of your UAA instance.

    * You will need to have uaac installed on your workstation. If you have not yet installed that, just enter 

            gem install cf-uaac

    * You will need to target to the UAA instance by:

            uaac target <uaa-instance-url>

    * Login as admin by:

            uaac token client get admin
                Client secret:  ******        //Your admin password

    * Create new groups that we will be using by:

            uaac group add timeseries.zones.<your-timeseries-zone-id>.user
            uaac group add timeseries.zones.<your-timeseries-zone-id>.ingest
            uaac group add timeseries.zones.<your-timeseries-zone-id>.query

    * Assuming you have already had your user set up in the previous step, we will add the corresponding previlege(s) to the user. Note that you can grant only ingest or only query access to the user. We are adding all the previleges here for showcase:

            uaac member add timeseries.zones.<your-timeseries-zone-id>.user <username>
            uaac member add timeseries.zones.<your-timeseries-zone-id>.ingest <username>
            uaac member add timeseries.zones.<your-timeseries-zone-id>.query <username>
            
    * You will also need to update the scope list of the client. To do this, enter:
    		
            uaac client get <Your Client ID>
      
      and you will be able to see the original scope list you have with the current client ID. For example, the default values should be "uaa.none openid"
      		
      To update the scope list that contains only the default values, you will need to enter:
      
      		uaac client update <Your Client ID> --scope "timeseries.zones.<your-timeseries-zone-id>.user timeseries.zones.<your-timeseries-zone-id>.query timeseries.zones.<your-timeseries-zone-id>.ingest uaa.none openid"
            
      You can validate the scope list in the response.
     
    * If things go well, we can now verify the user previleges by decoding the user token:

            uaac token owner get <Your Client ID> <Your Username>
                Client secret:  ******    //client secret
                Password:  ********       //user password
            uaac token decode

      And you should be able to see the user privileges in the scope field of the user token.

    
## Finishing

Now that the timeseries instance is set up and ready to use. You can ingest and query data though the API explorer tab in Predix Toolkit. 
   



