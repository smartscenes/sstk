# Node.js Server App #

## Install and Run ##
1. Requires node.js (install using [nvm](https://github.com/creationix/nvm))
1. Make sure to build the client first ([instructions](../README.md)).
1. Install dependencies and run server through `run.sh`.†
1. Use browser to go to localhost:8010

†Set `NODE_ENV=prod` to run the server in production mode (e.g., w/ `cache-control` header set on server responses).

If you want to start the server on ports other than the defaults (8010 and 9010), or under an application prefix use 
```
NODE_BASE_URL='/myapp' REVERSE_PROXY_PORT=8010 HTTP_SERVER_PORT=9010 npm start
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

## Directory Structure
```
  # Existing files
  app/                     # Main server app
    routes/
      proxy-rules.js       # Add routes here to access data on other servers and webservices
  config/                  # Update annotation database connection info and other configurations
  lib/                     # Utility functions 
  proj/                    # Add your project specific app code here
  sass/                    # scss (templated styles)
  static/                  # static content
    css/                   # static stylesheets
    data/                  # Global data and assets here
    html/                  # static pages
    images/
    js/
  views/                   # Templated jade files
    
  # Example project directory (mirror main app)
  proj/
    proj1/
      data/
      static/
      views/
      index.js
      
  # Generated files
  logs/              # Server logs
  node_modules/      # dependent node modules (populated by npm install)
```

## Running style check and tests ##
* `Static checking and style checking` <-> `npm run lint`
* `Unit/integration tests and code coverage*` <-> `npm run cover`
* `Run everything!` <-> `npm test`  
**Note: Code coverage is only over files touched by unit/integration tests*
