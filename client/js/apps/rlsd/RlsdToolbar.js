const SceneViewerToolbar = require('scene-viewer/SceneViewerToolbar');

const FINISH_BUTTON_NAME = 'Finish';

class RlsdToolbar extends SceneViewerToolbar {
  constructor(params) {
    super(params);
    this.showPutOnArchToggles = params.showPutOnArchToggles;
    this.finishEnabled = params.finishEnabled;
  }

  updatePutOnArch(putOnArch) {
    if (this.showPutOnArchToggles) {
      if (putOnArch) {
        this.setMenuButtonLabel('Put on', 'Put on Arch');
      } else {
        this.setMenuButtonLabel('Put on', 'Put on Any Surface');
      }
    }
  }

  setFinishEnabled(enabled) {
    if (this.app.allowFinish) {
      this.finishEnabled = enabled;
      // if(enabled){
      //   this.enableButton(FINISH_BUTTON_NAME);
      // }
      // else{
      //   this.disableButton(FINISH_BUTTON_NAME);
      // }
    }
  }

  __addCustomSceneEditButtons() {
    // add some custom buttons
    // NOTE:
    // rlsdSimpleMode
    // allowBBoxQuery = false, annotateActivity = false, allowSelectMode = false, allowMaterialMode = false
    // allowUndoStack = false, allowCopyPaste = false, allowTumble = false

    var app = this.app;

    // Add button for overlay panoram
    this.addButton('Toggle Overlay Panorama', 'Toggle Overlay Panorama',
      null, function () {
        app.togglePanoramaOverlayMode();
      });
    this.setButtonWidth('Toggle Overlay Panorama', '100px');
    this.addSpacer();

    this.addMenuButton('Edit Mode', 'Select edit mode', [
      {
        label: 'Basic',
        click: () => app.editControls.controlMode = 'basic'
      },
      {
        label: 'Scale',
        click: () => app.editControls.controlMode = 'scale'
      }
    ]);
    //this.setMenuButtonLabel('Edit Mode', app.editControls.controlMode);

    if (this.showPutOnArchToggles) {
      this.addMenuButton('Put on', 'Put on surface', [
        {
          label: 'Put on Arch',
          click: () => app.putOnArchOnly = true
        },
        {
          label: 'Put on Any Surface',
          click: () => app.putOnArchOnly = false
        }
      ]);
      this.updatePutOnArch(app.putOnArchOnly);
      this.setButtonWidth('Put on', '75px');
      this.addSpacer();
    }
  }

  init() {
    super.init();
    var app = this.app;
    var scope = this;
    // TODO: merge this with the finish button, there is no need to have separate finish and close buttons
    if (app.allowFinish && !app.finished) {
      this.addButton(FINISH_BUTTON_NAME, 'Once you finish the task, you will not be able to make further changes.',
        'done', function () {

          // Check to see if user has annotated all objects
          var done = app.imageMaskObjectPlacer.countCompleted();
          var total = app.imageMaskObjectPlacer.activeViewpointObjectInfoStore? app.imageMaskObjectPlacer.activeViewpointObjectInfoStore.size : 0;
          if (done < total) {
            bootbox.alert('You have not annotated all object masks. Please annotate remaining object masks before clicking “Finish”. If you cannot find good matches for some object masks or you have trouble placing an object, please enter a comment for that mask.')
          } else {
            bootbox.confirm('Are you sure you have accurately placed all objects? Please check that all objects are aligned and have a good shape match. Once you indicate you have finished, you will not be able to make further changes. Click “Cancel” to go back, or “Ok” to indicate that you are finished.',
              function (result) { if (result) { app.finish(); } }
            );
          }
        });
      // if(!this.finishEnabled)
      // this.disableButton(FINISH_BUTTON_NAME)
    }

  }
}

module.exports = RlsdToolbar;