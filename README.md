# calenar-sync-poc

## testing the script:

### On google cloud console:

1. create a project on google cloud console https://console.cloud.google.com
2. enable google calendar api
3. add tester to auth consent screen
4. get credentials for the project

### on the codebase

1. create an env.js file on the root
2. copy the content of example.env.js to env.js
3. fill the empty value in env.js with values in the credentials gotten from google cloud console
4. run "npm i && npm run start"
