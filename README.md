SSTK: SmartScenes ToolKit
============

The (S)STK provides:

1. Web-based framework for viewing models and scenes.
1. Various web-based annotation interfaces for annotating models and scenes
1. Batch processing component for doing analysis on scenes and offscreen rendering (see [ssc/README.md](ssc/README.md))
1. Server-side rendering

# Getting Started

1. Install [node.js](https://nodejs.org/).  Using the Node Version Manager ([nvm](https://github.com/creationix/nvm)) is the easiest way to install node.js on most systems.
```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
source ~/.bashrc
nvm install --lts
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
you can use with the STK.  Many of these datasets require agreeing to a licenese and terms of use, 
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
* Type `npm install` to get base dependencies
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
npm start
```  
Again, a `server/run.sh` script is provided that will run the above steps together.

Development Workflow
======================
For routine local development, here are the usual steps:
* Start webpack build process in watch mode by calling `NODE_ENV=dev npm run build` in repository root.  If new dependencies have been introduced, you may get an unresolved module error and will need to run `npm install` first.  You need to build the client code everytime there is a code change -- watch mode is a convenience for avoiding manual `npm run build` calls all the time.
* In a separate terminal, start the server process by calling `./run.sh` inside the `server/` directory.
* Go to a browser window and pull up `localhost:8010/index.html` or any other entry point (such as `scene-viewer.html`).
* If you just need a one-time build of the toolkit, copy out the `client/build/STK.bundle.js` (after `npm run build`) to the `vendor/assets/javascripts` directory of SceneStudio.

Building the documentation
==========================
- `cd client` from the repository root
- run `npm run jsdoc`
- Open the generated `jsdoc/index.html` page with a browser
