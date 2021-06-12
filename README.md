SSTK: SmartScenes ToolKit
============

The (S)STK provides:

1. Web-based framework for viewing models and scenes.
1. Various web-based annotation interfaces for annotating models and scenes
1. Batch processing component for doing analysis on scenes and offscreen rendering (see [ssc/README.md](ssc/README.md))
1. Server-side rendering

# Getting Started

0. The SSTK can be used on Linux, MacOS and Windows systems.

Prerequisites for Ubuntu:
`sudo apt-get install build-essential libxi-dev libglu1-mesa-dev libglew-dev libvips`

Prerequisites for MacOS:
Please install [Xcode](https://developer.apple.com/xcode/)

For some weird reason, [`node-gyp`](https://github.com/nodejs/node-gyp) requires python 2.7 so make sure that is the python in your path.

1. Install [node.js](https://nodejs.org/).  Using the Node Version Manager ([nvm](https://github.com/creationix/nvm)) is the easiest way to install node.js on most systems.
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
source ~/.bashrc
nvm install v10.23.2
```
If you use zsh instead of bash, replace all instances of bash with zsh.
Confirm above works using `node -v` at the terminal.

2. Build and run server
```
  cd stk
  ./build.sh
  cd server
  ./run.sh
```

3. Visit http://localhost:8010 in your browser (Chrome is recommended)!


## Assets
To use the STK, you will need to get yourself some assets.  There are several open-source datasets that
you can use with the STK.  Many of these datasets require agreeing to a license and terms of use, 
so please go to their respective websites to download them.

1. 3D Models
  - [ShapeNet](www.shapenet.org) is a large dataset of 3D models.    
2. Synthetic Scenes
  - [Stanford Scene Database](http://graphics.stanford.edu/projects/scenesynth/) consist of 150 synthetic scenes.
  - [SUNCG](suncg.cs.princeton.edu) is a large indoor dataset with over 45K houses.
3. Reconstructions
  - [ScanNet](http://www.scan-net.org/) 
  - [Matterport3D](https://github.com/niessner/Matterport)
  - [SceneNN](http://people.sutd.edu.sg/~saikit/projects/sceneNN/)
  - [2D-3D-S](http://buildingparser.stanford.edu/dataset.html)

The STK has been developed to be able to easily view and annotate 3D assets.  
Specifically, parts of ShapeNet, SUNCG, ScanNet, and Matterport3D were all developed using the STK.

## Entry Points
- `model-viewer` : Model viewing interface
- `model-categorizer.html` : Model categorization interface
- `scene-viewer.html` : Scene Viewer

Advanced Build Instructions
==================

You will need to build the client side assets that the server will serve before connecting to any entry point with your browser. To do this run the following in the root repository directory:
* `cd client`
* Type `npm install` to install client dependencies
* Run `npm run build` to package the stk source files
  * Use `NODE_ENV=dev npm run build` to build source maps and have webpack watch for changes.
  * Use `NODE_ENV=prod npm run build` to optimize (including minify) the JS assets.

For convenience a `build.sh` script is provided that will run the two steps above.
You will need to repeat the build step every time the client source files are changed or use `NODE_ENV=dev npm run build` to watch and rebuild as you develop!

Running the server
==================
Once you have built the client source files as described above, you need to start the server (see [server/README.md](server/README.md) for details, including how to deploy a new instance).
Do the following from the root repository directory:
```
cd server
npm install                 
npm start          # or use "npm watch" to run the server using nodemon and automatically restart the server on changes
```
Again, a `server/run.sh` script is provided that will run the above steps together.

Development Workflow
======================
For routine local development, here are the usual steps:
* Start webpack build process in watch mode by calling `NODE_ENV=dev npm run build` inside the `client/` directory.  If new dependencies have been introduced, you may get an unresolved module error and will need to run `npm install` first.  With watch mode, you won't have to manually run `npm run build` when you change the client code (it will monitor changes in the client directory and rebuilt automatically).
* In a separate terminal, start the server process by calling `npm run watch` inside the `server/` directory.  Again, if new server code dependencies have been introduced, you may need an `npm install` call to resolve them first.  Running the server in watch mode will monitor changes in the server directory and restart the server automatically.
* Go to a browser window and pull up `localhost:8010/index.html` or any other entry point (such as `scene-viewer.html`).
* If you just need a one-time build of the toolkit, copy out the `client/build/STK.bundle.js` (after `npm run build`) to the target directory.

Versioning conventions:
- The `master` branch contains latest mainstream (with potential bug fixes over latest release)
- The `dev` branch contains large (potentially breaking) changes
- The `v0.5.x` branch (and similar future versioned branches) contain the latest release of that form
Versioning workflow: develop on `master` for small bug fixes or on `dev` for large changes. When ready to release branch, make sure to update appropriate `v0.5.x` or similar latest release branch, and also tag with exact version number (e.g., `v0.5.3`).


Annotation Assets and Database
==============================
The annotation tools use a MySQL database for storing annotations and an Apache solr index for indexing assets.  

SQL DDL scripts for creating data tables are in `scripts/db`.  See [MySQL installation](https://dev.mysql.com/doc/refman/5.7/en/installing.html) instructions for installing your own instance of MySQL and run the provided DDL scripts in `scripts/db` to create the annotation tables.  

See [wiki](https://github.com/smartscenes/sstk/wiki/Preparing-Assets-for-Annotation) for how to prepare your assets for annotation.  Once you have setup a MySQL server, you should edit `config.annDb` in `server/config/index.js` to point to your MySQL instance.


Access remote servers using reverse proxying and SSH tunneling
==============================================================
The server uses reverse proxying to access various other resources and web services.
Edit `server/app/routes/proxy-rules.js` to add your own proxy rules for accessing your own resources.

If you run your own solr instance locally,  you should set the environment variable `USE_LOCAL=1`.  This can be done by manually or by copying the `env.example.sh` to `env.sh` and modifying it as necessary.  It will be used in the provided `build.sh` and `run.sh`.   

For storing annotations, you will need to setup your own MySQL server.  Once you have setup a MySQL server, you should edit `config.annDb` in `server/config/index.js` to point to your MySQL instance.

If your MySQL server is limited to access by `localhost` only, you can use ssh tunneling to forward `3306` from a remote machine to `localhost` through SSH connection: 
```
ssh -L 3306:localhost:3306 -L <host> -N
``````

Building the documentation
==========================
- `cd client` from the repository root
- run `npm run jsdoc`
- Open the generated `jsdoc/index.html` page with a browser


Changelog
=========

Refer to [CHANGELOG.md](CHANGELOG.md) for a record of notable changes.

