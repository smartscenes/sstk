'use strict';

var Toolbar = require('ui/Toolbar');

function SceneViewerToolbar(params) {
  Toolbar.call(this, params);
  this.allowEdit = params.allowEdit;
}

SceneViewerToolbar.prototype = Object.create(Toolbar.prototype);
SceneViewerToolbar.prototype.constructor = SceneViewerToolbar;

SceneViewerToolbar.prototype.init = function () {
  this.elem.hide();
  var app = this.app;

  // Start new button group
  var nbuttonsInGroup = 0;
  if (app.help) {
    this.addButton('Help', 'Help',
      'help', function () {
        app.help();
      });
    nbuttonsInGroup++;
  }

  if (app.allowEdit && app.editMeta) {
    this.addButton('Edit Meta', 'Edit Meta',
      'editmeta', function () {
        app.editMeta();
      });
    nbuttonsInGroup++;
  }

  if (nbuttonsInGroup) {
    this.addSpacer();
  }

  // Start new button group
  nbuttonsInGroup = 0;
  if (app.allowConsole) {
    this.addButton('Console', 'Console', 'console', function (evt) {
        app.toggleConsole();
      }, function () {
        return app.isConsoleVisible();
      }
    );
    nbuttonsInGroup++;
  }
  if (app.allowEdit) {
    this.addButton('Edit', 'Edit', 'edit', function (evt) {
        app.toggleEditMode();
      }, function () {
        return app.isEditMode();
      }
    );
    nbuttonsInGroup++;
  }
  if (app.allowEdit && app.allowBBoxQuery) {
    this.addButton('Suggest', 'Suggest objects using context (Ctrl+B)', 'suggest', function (evt) {
      app.toggleContextQueryMode();
    }, function () {
      return app.isContextQueryModeActive();
    }
    );
    nbuttonsInGroup++;
  }
  if (app.allowSelectMode && app.annotateActivity) {
    this.addButton('Objects', 'Objects', 'objects', function (evt) {
        app.toggleObjectSelectMode();
      }, function () {
        return app.isObjectSelectMode();
      }
    );
    nbuttonsInGroup++;
  }
  if (app.allowSelectMode) {
    this.addButton('Select', 'Select', 'select', function (evt) {
        app.toggleSelectMode();
      }, function () {
        return app.isSelectMode();
      }
    );
    nbuttonsInGroup++;
  }

  if (app.allowMaterialMode) {
    this.addButton('Material', 'Material', 'material', function (evt) {
        app.toggleMaterialMode();
      }, function () {
        return app.isMaterialMode();
      }
    );
    nbuttonsInGroup++;
  }

  if (nbuttonsInGroup) {
    this.addSpacer();
  }

  // Start new button group
  if (this.allowEdit) {
    this.addButton('Undo', 'Undo (Ctrl+Z)',
      'undo', function (evt) {
        app.undo(evt);
      });
    this.addButton('Redo', 'Redo (Ctrl+Y)',
      'redo', function (evt) {
        app.redo(evt);
      });

    this.addSpacer();

    this.addButton('Copy', 'Copy selected model (Ctrl+C)',
      'copy', function (evt) {
        app.copy(evt);
      });
    this.addButton('Paste', 'Paste copied model (Ctrl+V)',
      'paste', function (evt) {
        app.paste(evt);
      });
    this.addButton('Delete', 'Delete selected model (Delete)',
      'delete', function (evt) {
        app.delete(evt);
      });

    this.addButton('Tumble', 'Tumble selected model (Ctrl+M)',
       'tumble', function (evt) {
        app.tumble(evt);
       });

    this.addSpacer();
  }

  if (app.allowSave && app.saveScene) {
    this.addButton('Save', 'Save scene (Ctrl+S)',
      'save', function () {
        app.saveScene();
      });
  }
  if (app.annotateActivity) {
    this.addButton('Clear', 'Clear',
      'clear', function () {
        app.activityOnClickClear();
      });
  }
  if (app.annotateActivity) {
    this.addButton('Next', 'Done with this activity',
      'done', function () {
        app.activityOnClickNext();
      });
  }

  if (app.allowClose && app.close) {
    this.addButton('Close', 'Close the editor',
      'close', function () {
        app.close();
      });
  }


  // Update button states

  // Disable buttons in the initial state
  this.disableButton('Undo');
  this.disableButton('Redo');
  this.disableButton('Copy');
  this.disableButton('Paste');
  this.disableButton('Delete');
  this.disableButton('Tumble');

  // Subscribe to app notifications so we can disable/enable/hide as necessary
  this.app.contextQueryControls.Subscribe('ContextQueryActive', this, function () {
    this.updateButtonState('BBox');
  });
  this.app.contextQueryControls.Subscribe('ContextQueryInactive', this, function () {
    this.updateButtonState('BBox');
  });
  this.app.editControls.Subscribe('SelectedInstanceChanged', this, function (newInst) {
    if (newInst) {
      this.enableButton('Copy');
      this.enableButton('Delete');
      this.enableButton('Tumble');
    } else {
      this.disableButton('Copy');
      this.disableButton('Delete');
      this.disableButton('Tumble');
    }
  });
  this.app.Subscribe('CopyCompleted', this, function () {
    this.enableButton('Paste');
  });

  if (this.app.undoStack) {
    this.app.undoStack.Subscribe('RestoredSavedState', this, function () {
      this.enableButton('Undo');
      this.enableButton('Redo');
    });
    this.app.undoStack.Subscribe('ReachedBeginning', this, function () {
      this.disableButton('Undo');
    });
    this.app.undoStack.Subscribe('ReachedEnd', this, function () {
      this.disableButton('Redo');
    });
    this.app.undoStack.Subscribe('RecordedNewState', this, function () {
      this.enableButton('Undo');
      this.disableButton('Redo');
    });
  }

  // Hide some buttons
  if (!this.allowEdit) {
    this.disableButton('Save');
    // Hide every button except for close and help
    //for (var name in this.buttons) {
    //  if (name !== 'Close' && name !== 'Help') {
    //    this.buttons[name].hide();
    //  }
    //}
  }
  this.elem.show();

};

module.exports = SceneViewerToolbar;
