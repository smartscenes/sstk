var Constants = require('Constants');
var PubSub = require('PubSub');
var SceneViewer = require('scene-viewer/SceneViewer');
var ShapeEditor = require('editor/ShapeEditor');
var Object3DUtil = require('geo/Object3DUtil');
var UIUtil = require('ui/UIUtil');
var keymap = require('controls/keymap');
var _ = require('util/util');

// TODO: handle floors, improve grouping
function SceneHierarchyAnnotator(params) {
  PubSub.call(this, params);
  var defaults = {
    appId: 'SceneHierarchyAnnotator@0.0.1',
    instructions: {
      html: [
        'Select and group objects into semantically meaningful regions.',
        'E.g. Couch + coffee table + TV; Kitchen counter + sink + appliances.',
        'View the hierarchy in the right panel (click to select objects). Right click to show grouping options.',
        'Main view controls:',
        'Left click and drag = select objects in boxed region',
        '&emsp;&emsp;&emsp;Ctrl/Cmd + left click = add/remove object from selection',
        '&emsp;&emsp;&emsp;G = create group from selection',
        '&emsp;&emsp;&emsp;Right click = orbit camera (+shift to pan)',
        '&emsp;&emsp;&emsp;Double left click = center and zoom camera on clicked object',
        'Once you have some groups, you can reorganize them by dragging in the tree view.',
        'Ungroup by right clicking in the tree view and selecting the "Ungroup" option.',
        'Click the <b>Save</b> button when you are done.'
      ].join('<br>')
    },
    // uihookups: _.keyBy([
    // ], 'name')
    // Messy scene viewer params!
    loadingIconUrl: Constants.defaultLoadingIconUrl,
    allowEdit: false,
    allowEditHierarchy: true,
    allowSelectMode: true,
    allowSelectGroups: true,
    allowConsole: false,
    allowMagicColors: false,
    //restrictSelectToModels: true,
    selectMode: true,
    checkSelectModeFn: this.checkSelectModeFn.bind(this),
    selectedObjectMaterial: Object3DUtil.getSimpleFalseColorMaterial(1),
    //enableUILog: true,
    showSearchSourceOption: true,
    showInstructions: true,
    useAmbientOcclusion: false,
    useShadows: false,
    useDatGui: true
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);

  this.viewer = new SceneViewer(params);

  this.appId = params.appId;
  this.userId = this.viewer.userId;

  this.viewer.Subscribe('SceneLoaded', this, this.__onSceneLoaded.bind(this));
}

SceneHierarchyAnnotator.prototype = Object.create(PubSub.prototype);
SceneHierarchyAnnotator.prototype.constructor = SceneHierarchyAnnotator;

SceneHierarchyAnnotator.prototype.checkSelectModeFn = function(event) {
  return event.ctrlKey || event.metaKey;
};

SceneHierarchyAnnotator.prototype.init = function() {
  this.shapeEditor = new ShapeEditor({
    app: this.viewer,
    container: this.viewer.container,
    picker: this.viewer.picker,
    camera: this.viewer.camera,
    scene: this.viewer.sceneState.fullScene,
    groundPlane: this.viewer.pickingPlane
  });
  this.sceneState = this.viewer.sceneState;
  this.shapeEditor.reset({
    scene: this.viewer.sceneState.fullScene,
    camera: this.viewer.camera,
    matrixWorld: this.viewer.sceneState.scene.matrixWorld
  });
  this.shapeEditor.setComponent('Select', new ShapeEditor.Components.BoxSelector(
    this.shapeEditor, { height: Constants.metersToVirtualUnit * 3.50, mouseClickTimeout: 100 }));
  this.shapeEditor.setMode({ mode: 'Select' });
  this.shapeEditor.enabled = true;
  var gui = this.viewer.datgui.addFolder('editor');
  this.shapeEditor.getComponent('Select').updateDatGui(gui);
};

SceneHierarchyAnnotator.prototype.__onSceneLoaded = function() {
  this.sceneState = this.viewer.sceneState;
  this.shapeEditor.reset({
    scene: this.viewer.sceneState.fullScene,
    camera: this.viewer.camera,
    matrixWorld: this.viewer.sceneState.scene.matrixWorld
  });
  this.shapeEditor.groundPlane = this.viewer.pickingPlane;
};

SceneHierarchyAnnotator.prototype.launch = function() {
  this.viewer.launch();
  this.init();
  this.registerEvents();
};

SceneHierarchyAnnotator.prototype.registerEvents = function() {
  var scope = this;
  var rendererDom = this.viewer.renderer.domElement;
  rendererDom.addEventListener('click', function (event) {
      event.preventDefault();
      rendererDom.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN && !scope.checkSelectModeFn(event)) {
        scope.shapeEditor.onMouseClick(event);
      }
    },
    false
  );

  rendererDom.addEventListener('pointerup', function (event) {
      event.preventDefault();
      scope.viewer.sceneHierarchy.quiet = false;
      rendererDom.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        scope.shapeEditor.onMouseUp(event);
      }
    },
    false
  );

  rendererDom.addEventListener('pointerdown', function (event) {
      rendererDom.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN && !scope.checkSelectModeFn(event)) {
        scope.shapeEditor.onMouseDown(event);
      }
    },
    false
  );

  rendererDom.addEventListener('pointermove', function (event) {
      event.preventDefault();
      rendererDom.focus();
      scope.viewer.sceneHierarchy.quiet = true;
      var rightMouseButtonPressed = UIUtil.isRightMouseButtonPressed(event);
      if (!rightMouseButtonPressed) {
        scope.shapeEditor.onMouseMove(event);
      }
    },
    false
  );

  rendererDom.addEventListener('keydown', function (event) {
      event.preventDefault();
      rendererDom.focus();
      scope.shapeEditor.onKeypress(event);
    },
    false
  );

};

module.exports = SceneHierarchyAnnotator;