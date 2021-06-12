# Node.js Server App #

## Install and Run ##
0. After you do `./build.sh` in the main STK directory you can directly run the server using `./run.sh` in the server directory
   - `./run.sh` install dependencies by running `npm install` and start the server by calling `npm start`
   - See [client instructions](../README.md#build-instructions) for how to run incremental build of client assets using 
   webpack during development.  That will watch for changes and automatically update the client build packages.
1. Use browser to go to localhost:8010

Set `NODE_ENV=prod` to run the server in production mode (e.g., w/ `cache-control` header set on server responses).

If you want to start the server on ports other than the defaults (8010), or under an application prefix use 
```
NODE_BASE_URL='/myapp' HTTP_SERVER_PORT=8010 npm start
```
You can specify these values in an `env.sh` file (see [env.example.sh](env.example.sh) for an example), and then run `run.sh`.

## Setting up a new instance ##
```
  cp env.example.sh env.sh  
  # Edit env.sh to change the ports and base url
  ./build.sh
  cd server
  ./run.sh
  # Update apache settings to proxy new ports as needed
```

## Running server side rendering server ##
```
  ./ssc-server.js
```

## Proxying through Apache ##
Update apache conf:
   ```
   ProxyPass /scene-toolkit/ http://localhost:8010/
   ProxyPassReverse /scene-toolkit/ http://localhost:8010/
   ```
Reload apache conf: `sudo apache2ctl graceful`

## Directory Structure
```
  # Existing files
  app/                     # Main server app
    routes/
      proxy-rules.js       # Add routes here to access data on other servers and webservices
  config/                  # Server config: Modify to set annotation database connection info and other configurations
  lib/                     # Utility functions (e.g db querying, logging)
  proj/                    # Project specific server apps (mirrors main app directory structure)
  proj/                    # Add your project specific app code here
  sass/                    # scss (templated css style files)
  static/                  # static content (all our static html, css, data goes here)
    css/                   # static stylesheets
    data/                  # Global data and assets here
    html/                  # static pages
    images/
    js/
  test/                    # Need some more tests
  views/                   # Template  pug files for generating html
    
  # Example project directory (mirror main app)
  proj/                 # Project specific server apps (mirrors main app directory structure)    
    proj1/
      data/
      static/
      views/
      index.js          # Hookup of server apps to main express.js
      
  # Generated files
  logs/              # Server logs
  node_modules/      # dependent node modules (populated by npm install)
```

## Running style check and tests ##
* `Static checking and style checking` <-> `npm run lint`
* `Unit/integration tests and code coverage*` <-> `npm run cover`
* `Test everything!` <-> `npm test`  
**Note: Code coverage is only over files touched by unit/integration tests*
