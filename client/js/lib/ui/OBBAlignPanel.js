var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var AnnotatorInfo = require('annotate/AnnotatorInfo');
var AnnotatorUtil = require('annotate/AnnotatorUtil');
//var OBBPoser = require('sem/OBBPoser');
var SemanticOBB = require('geo/SemanticOBB');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');

var keymap = require('controls/keymap');
var _ = require('util/util');

function OBBAlignPanel(options) {
  this.__options = options;
  this.submitAnnotationsUrl =  options.submitAnnotationsUrl;
  this.retrieveAnnotationsUrl =  options.retrieveAnnotationsUrl;
  this.segments = options.segments;
  this.__annotationType = 'obb_align';
  var app = options.app;
  this.__annotatorInfo = new AnnotatorInfo(app, {
    appId: app.appId,
    type: this.__annotationType
  });
  this.auth = this.__annotatorInfo.auth;
}

Object.defineProperty(OBBAlignPanel.prototype, 'modelId', {
  get: function () {
    return this.segments? this.segments.modelId : null;
  }
});

OBBAlignPanel.prototype.init = function() {
  var scope = this;
  var panel = this.__options.panel;

  var deltaRotate = THREE.Math.degToRad(5);
  var buttons = {
    items: {
      fitOBB: {
        name: 'Fit OBB',
        items: {
          fitOBBUnrestricted: {
            name: '(U)nrestricted',
            callback: function() {
              scope.__applyToSelected(index => scope.__refitOBB(index, { constrainVertical: false, checkAABB: false }));
            },
            accessKey: 'u'
          },
          fitOBBVertical: {
            name: '(V)ertical',
            callback: function() {
              scope.__applyToSelected(index => scope.__refitOBB(index, { constrainVertical: true, checkAABB: true }));
            },
            accessKey: 'v'
          },
          fitOBBAABB: {
            name: '(A)ABB',
            callback: function() {
              scope.__applyToSelected(index => scope.__refitOBB(index, { constrainVertical: true, checkAABB: true }));
            },
            accessKey: 'a'
          }
        }
      },
      toggle: {
        name: 'Toggle',
        items: {
          toggleFront: {
            name: 'Fron(t)',
            callback: function () {
              scope.__applyToSelected(index => scope.__toggleOBBFront(index, +1, true));
            },
            accessKey: 't'
          },
          toggleUp: {
            name: 'U(p)',
            callback: function () {
              scope.__applyToSelected(index => scope.__toggleOBBUp(index, +1, true));
            },
            accessKey: 'p'
          }
        }
      },
      rotateRefit: {
        name: 'Rotate and refit',
        items: {
          rotateNeg: {
            name: '- (J)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, null, -deltaRotate, true));
            },
            accessKey: 'j'
          },
          rotatePos: {
            name: '+ (L)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, null, deltaRotate, true));
            },
            accessKey: 'l'
          }
        }
      }
    }
  };

  // Button for guessing OBB pose
  // var poseObbButton = $('<button></button>').text('Guess OBB pose');
  // poseObbButton.click(() => {
  //   var obbPoser = new OBBPoser();
  //   var segments = scope.segments;
  //   var sceneBBox = Object3DUtil.getBoundingBox(segments.origObject3D);
  //   obbPoser.guessOBBPoses(segments.segmentGroups, sceneBBox);
  // });
  // buttonsPanel.append(poseObbButton);

  var buttonsPanel = UIUtil.createPanel(buttons, keymap);
  this.__mainAnnotateButtons = buttonsPanel.find('input[type=button]');
  this.__mainAnnotateButtonLabels = buttonsPanel.find('label');
  this.__mainAnnotateButtons.addClass('btn btn-default btn-sm');
  this.__setMainAnnotateButtonsEnabled(false);
  var panelId = 'obbAlignPanel_' + _.generateRandomId();
  buttonsPanel.attr('id', panelId);
  panel.append(buttonsPanel);

  // Button for loading OBB poses for testing
  var saveloadPanel = $('<div></div>');
  var importFileInput = UIUtil.createFileInput({
    id: 'obbsImport',
    label: 'Load OBBs',
    style: 'basic',
    hideFilename: true,
    inline: true,
    loadFn: (file) => this.loadOBBAnnotations({ file: file, type: 'file' })
  });
  saveloadPanel.append(importFileInput.group);

  // Button for saving OBB poses for testing
  var exportAnnotationsButton = $('<button></button>').text('Export OBBs');
  exportAnnotationsButton.click(() => {
    this.auth.authenticate(() => this.saveOBBAnnotations());
  });
  saveloadPanel.append(exportAnnotationsButton);

  if (this.submitAnnotationsUrl) {
    var submitAnnotationsButton = $('<button></button>').text('Submit OBBs');
    submitAnnotationsButton.click(() => {
      this.auth.authenticate(() => this.submitOBBAnnotations());
    });
    saveloadPanel.append(submitAnnotationsButton);
  }

  buttonsPanel.append(saveloadPanel);
  this.__otherAnnotateButtons = saveloadPanel.find('input[type=button],button');

  this.__buttonsPanel = buttonsPanel;
};

OBBAlignPanel.prototype.__setMainAnnotateButtonsEnabled = function(flag) {
  if (flag) {
    this.__mainAnnotateButtons.prop('disabled', false);
    this.__mainAnnotateButtonLabels.css('color', 'black');
    this.__mainAnnotateButtons.removeClass('disabled');
  } else {
    this.__mainAnnotateButtons.prop('disabled', true);
    this.__mainAnnotateButtonLabels.css('color', 'gray');
    this.__mainAnnotateButtons.addClass('disabled');
  }
};

OBBAlignPanel.prototype.__setAllAnnotateButtonsEnabled = function(flag) {
  this.__setMainAnnotateButtonsEnabled(flag);
  if (flag) {
    this.__otherAnnotateButtons.prop('disabled', false);
  } else {
    this.__otherAnnotateButtons.prop('disabled', true);
  }
};

OBBAlignPanel.prototype.onSelectLabel = function(labelInfo) {
  if (labelInfo.isAll) {
    this.__setMainAnnotateButtonsEnabled(false);
  } else {
    this.__setMainAnnotateButtonsEnabled(true);
  }
};

// This is initial OBBs (we will be switching from this format to a different format)
function parseOBBsWithOrientationField(data) {
  var obbs = [];
  _.forEach(data, (obb, i) => {
    if (obb.orientation) {
      if (_.isString(obb.orientation)) {
        obb.symmetryType = obb.orientation;
        delete obb.orientation;
      } else {
        // TODO: clean up
        var vs = _.map(obb.orientation, function(x) { return Object3DUtil.toVector3(x); });
        if (vs[0] && vs[1]) {
          var dir = new THREE.Vector3();
          dir.subVectors(vs[1], vs[0]);
          dir.normalize();
          obb.front = dir;
        }
        obb.upIndex = 2;
      }
    }
    obbs[i] = SemanticOBB.fromJSON(obb);
  });
  return obbs;
}

OBBAlignPanel.prototype.parseOBBAnnotations = function(data) {
  var modelId = (data.modelId != null)? data.modelId : data.itemId;
  if (modelId !== this.modelId) {
    UIUtil.showAlert('OBB annotation does not match current model id');
    console.error('OBB annotation does not match current model id: got model id ' +
      modelId + ', expected ' + this.modelId);
  } else if (data.annotations) {
    var obbs = data.annotations.map(obb => {
      return obb? SemanticOBB.fromJSON(obb) : undefined;
    });
    return obbs;
  } else {
    UIUtil.showAlert('Invalid obb annotations');
    console.error('Invalid obb annotations', data);
  }
};

OBBAlignPanel.prototype.__loadOBBAnnotations = function(err, data, options) {
  console.log('got', err, data, options);
  if (err) {
    UIUtil.showAlert('Error loading obb annotations from ' + options.type);
    console.error('Error loading obb annotations from ' + options.type, err);
  } else {
    try {
      var obbs;
      if (data.appId == null && data.annotations == null) {
        obbs = parseOBBsWithOrientationField(data);
      } else {
        obbs = this.parseOBBAnnotations(data);
      }
      if (obbs) {
        this.__setOBBs(obbs);
      }
    } catch (cerr) {
      UIUtil.showAlert('Error setting obbs');
      console.error('Error setting obbs', cerr);
    }
  }
};

OBBAlignPanel.prototype.loadOBBAnnotations = function(options) {
  console.log('loading obb annotations');
  this.__setAllAnnotateButtonsEnabled(false);
  FileUtil.readAsync(options.file || options.path, 'json', (err, data) => {
    this.__loadOBBAnnotations(err, data, options);
    this.__setAllAnnotateButtonsEnabled(true);
  });
};

OBBAlignPanel.prototype.getOBBAnnotations = function() {
  var obbs = this.segments.getOBBs();
  return obbs.map(x => x? x.toJSON() : x);
};

// Functions for submit/export/import
OBBAlignPanel.prototype.getAnnotationsJson = function(annotations) {
  var data = this.__annotatorInfo.getMerged({
    itemId: this.modelId,
    modelId: this.modelId,
    annotations: annotations,
    //screenshot: screenshot,
  });
  console.log(data);
  return data;
};

OBBAlignPanel.prototype.saveOBBAnnotations = function() {
  var annotations = this.getOBBAnnotations();
  var filename = (this.modelId != null)? this.modelId + '.obbs.json' : 'obbs.json';
  var data = this.getAnnotationsJson(annotations);
  FileUtil.saveJson(data, filename);
};

OBBAlignPanel.prototype.submitOBBAnnotations = function() {
  var annotations = this.getOBBAnnotations();

  this.__setAllAnnotateButtonsEnabled(false);
  var data = this.getAnnotationsJson(annotations);
  AnnotatorUtil.submitAnnotations(this.submitAnnotationsUrl, data, this.modelId,
    (err, res) => { this.__setAllAnnotateButtonsEnabled(true); });
};

OBBAlignPanel.prototype.retrieveAnnotations = function() {
  var options = { path: this.retrieveAnnotationsUrl, type: 'url' };
  this.__setAllAnnotateButtonsEnabled(false);
  AnnotatorUtil.retrieveAnnotations(this.retrieveAnnotationsUrl, this.__annotationType, this.modelId,
    (err, res) => {
      if (err) {
      } else {
        this.__loadOBBAnnotations(null, res, options);
      }
      this.__setAllAnnotateButtonsEnabled(true);
    });
};

OBBAlignPanel.prototype.__setOBBs = function(obbs) {
  this.segments.useOBBs(obbs, { createObbMeshes: true });
};

OBBAlignPanel.prototype.__applyToSelected = function(f) {
  var meshIndex = this.segments.iSegmentGroup;
  if (meshIndex >= 0) {
    f(meshIndex);
  }
};

OBBAlignPanel.prototype.__refitOBB = function(meshIndex, options) {
  var obbOpts = _.defaults(Object.create(null), options, { up: Constants.worldUp, front: Constants.worldFront });
  this.segments.updateFittedOBBForSegmentGroup(meshIndex, obbOpts);
};

OBBAlignPanel.prototype.__getRotatedOBBBasis = (function() {
  var temp = new THREE.Matrix4();
  var axis = new THREE.Vector3();
  return function(obb, axisIndex, rotateBy, res) {
    res = res || new THREE.Matrix4();
    res.copy(obb.basis);
    // Rotate
    axis.set(0,0,0);
    axis.setComponent(axisIndex, 1);
    temp.makeRotationAxis(axis, rotateBy);
    res.multiplyMatrices(res, temp);
    return res;
  };
})();

OBBAlignPanel.prototype.__adjustOBB = function(meshIndex, axisIndex, rotateBy, autoRefit) {
  var obb = this.segments.getOBBForSegmentGroup(meshIndex);
  if (axisIndex == null) {
    if (!obb.hasUp) {
      obb.upIndex = 2;
    }
    axisIndex = obb.upIndex;
  }
  axisIndex = axisIndex % 3;
  if (obb) {
    //console.log('__adjustOBB before:', obb.toJSON());
    var transform = Object3DUtil.getModelMatrixWorld(this.segments.origObject3D);
    obb = obb.clone();
    obb.applyMatrix4(transform);
    var basis = this.__getRotatedOBBBasis(obb, axisIndex, rotateBy);
    this.segments.updateFittedOBBForSegmentGroup(meshIndex, { basis: basis });
    obb = this.segments.getOBBForSegmentGroup(meshIndex);
    //console.log('__adjustOBB after:', obb.toJSON());
  } else if (autoRefit) {
    this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__toggleOBBFront = function(meshIndex, incr, autoRefit) {
  var obb = this.segments.getOBBForSegmentGroup(meshIndex);
  if (obb) {
    obb.toggleFront(incr);
    this.segments.updateOBB(obb, meshIndex);
  } else if (autoRefit) {
    this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__toggleOBBUp = function(meshIndex, incr, autoRefit) {
  var obb = this.segments.getOBBForSegmentGroup(meshIndex);
  if (obb) {
    obb.toggleUp(incr);
    this.segments.updateOBB(obb, meshIndex);
  } else if (autoRefit) {
    this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

module.exports = OBBAlignPanel;
