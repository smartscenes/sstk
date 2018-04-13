One basic functionality of the SmartScenes SceneToolkit is to provide 3D viewers for models and scenes.

{@tutorial model-viewer} - Tutorial for setting up model viewers

{@tutorial scene-viewer} - Tutorial for setting up scene viewers

{@tutorial voxels} - Tutorial for working with voxels

The base class {@linkcode Viewer3D} is provided with common functionality that can be shared by other viewers.

To create your own custom viewer on top of {@linkcode Viewer3D}
```javascript
var Viewer3D = require('Viewer3D');

function MyViewer(params) {
  var defaults = {
    useDatGui: true,
    uihookups: _.keyBy([
      {
        name: 'saveImage',
        click: this.saveImage.bind(this),
        shortcut: 'i'
      }
   ]),
  };
  this.urlParams = _.getUrlParams();
  var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params, defaults);
  Viewer3D.call(this, allParams);
}

MyViewer.prototype = Object.create(Viewer3D.prototype);
MyViewer.prototype.constructor = MyViewer;

MyViewer.prototype.init = function() {
  this.setupBasicRenderer();       // Calls Viewer3D.setupBasicRenderer to setup renderer and camera controls 
  this.setupBasicScene();          // Setup scene
  this.setupDatGui();              // Calls Viewer3D.setupDatGui to setup dat.gui controls 
  this.registerEventListeners();   // Calls Viewer3D.registerEventListeners to register event listeners
};

MyViewer.prototype.setupBasicScene = function(options) {
  this.scene = new THREE.Scene();
  this.light = this.createDefaultLight();
  this.scene.add(this.light);
  this.scene.add(this.camera);

  // TODO: Add meshes to scene
  
  if (Constants.isBrowser) { window.scene = this.scene; }  // export for THREE.js inspector
};

MyViewer.prototype.getRenderScene = function () {
  return this.scene;
};

```

