var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var AnnotatorInfo = require('annotate/AnnotatorInfo');
var AnnotatorUtil = require('annotate/AnnotatorUtil');
//var OBBPoser = require('sem/OBBPoser');
var PartAnnotationMatcher = require('part-annotator/PartAnnotationMatcher');
var SemanticOBB = require('geo/SemanticOBB');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');
var PubSub = require('PubSub');

var keymap = require('controls/keymap');
var _ = require('util/util');

function OBBAlignPanel(options) {
  PubSub.call(this);
  this.__options = options;
  this.submitAnnotationsUrl =  options.submitAnnotationsUrl;
  this.retrieveAnnotationsUrl =  options.retrieveAnnotationsUrl;
  this.segments = options.segments;
  this.__saveLabelInfo = options.saveLabelInfo;   // whether to save label info
  this.__excludeFields = ['triIndices', 'segments'];          // what fields to exclude when saving
  this.__annotationTask = options.task;
  this.__annotationType = 'obb-align';
  var app = options.app;
  this.__annotatorInfo = new AnnotatorInfo(app, {
    appId: app.appId,
    task: this.__annotationTask,
    type: this.__annotationType
  });
  this.__metadata = {
    partType: this.segments.segmentType,
    includeLabelInfo: this.__saveLabelInfo
  };
  this.auth = this.__annotatorInfo.auth;
  this.__isButtonsEnabled = false;
}

OBBAlignPanel.prototype = Object.create(PubSub.prototype);
OBBAlignPanel.prototype.constructor = OBBAlignPanel;

Object.defineProperty(OBBAlignPanel.prototype, 'modelId', {
  get: function () {
    return this.segments? this.segments.modelId : null;
  }
});

Object.defineProperty(OBBAlignPanel.prototype, 'isButtonsEnabled', {
  get: function() {
    return this.__isButtonsEnabled;
  },
  set: function(v) {
    this.__isButtonsEnabled = true;
    this.__setAllAnnotateButtonsEnabled(this.__isButtonsEnabled);
  }
});

Object.defineProperty(OBBAlignPanel.prototype, 'hasSelected', {
  get: function () {
    return this.segments? this.segments.selectedIndex >= 0 : false;
  }
});

OBBAlignPanel.prototype.init = function() {
  var scope = this;
  var panel = this.__options.panel;

  var deltaRotate = THREE.MathUtils.degToRad(5);
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
            class: 'textRed',
            callback: function () {
              scope.__applyToSelected(index => scope.__toggleOBBFront(index, +1, true));
            },
            accessKey: 't'
          },
          toggleUp: {
            name: 'U(p)',
            class: 'textGreen',
            callback: function () {
              scope.__applyToSelected(index => scope.__toggleOBBUp(index, +1, true));
            },
            accessKey: 'p'
          },
          checkFront: {
            text: 'hasFront',
            type: 'checkbox',
            change: function (val) {
              scope.__applyToSelected(index => scope.__ensureOBBFront(index, val, true));
            },
            __update: function(element, info) {
              var flag = info.obb? info.obb.hasFront : false;
              element.prop('checked', flag);
            }
          },
          checkUp: {
            text: 'hasUp',
            type: 'checkbox',
            change: function (val) {
              scope.__applyToSelected(index => scope.__ensureOBBUp(index, val, true));
            },
            __update: function(element, info) {
              var flag = info.obb? info.obb.hasUp : false;
              element.prop('checked', flag);
            }
          },
        }
      },
      rotateRefit: {
        name: 'Rotate and refit',
        items: {
          rotateWrtUpNeg: {
            name: '- (J)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, 'up', -deltaRotate, true));
            },
            accessKey: 'j'
          },
          rotateWrtUpPos: {
            name: '+ (L)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, 'up', deltaRotate, true));
            },
            accessKey: 'l'
          },
          rotateWrtFrontNeg: {
            name: '- (K)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, 'front', -deltaRotate, true));
            },
            accessKey: 'k'
          },
          rotateWrtFrontPos: {
            name: '+ (I)',
            callback: function () {
              scope.__applyToSelected(index => scope.__adjustOBB(index, 'front', deltaRotate, true));
            },
            accessKey: 'i'
          }
        }
      },
      symmetry: {
        name: 'Symmetry',
        items: {
          setSymmetryType: {
            type: 'select',
            options: ['unknown', 'none', 'reflect_lr', 'reflect_bf', 'reflect_tb', 'rotate_up_2', 'rotate_up_4', 'rotate_up_8', 'rotate_up_inf', 'sphere'],
            change: function(val) {
              if (val === 'unknown') {
                val = null;
              }
              scope.__applyToSelected(index => scope.__setInfo(index, 'symmetry', val));
            },
            __update: function(element, info) {
              var val = info? info.symmetry : null;
              if (val == null) {
                val = 'unknown';
              }
              element.val(val);
            }
          }
        }
      }
    }
  };

  this.__updatableUIstates = _.findMatchingDeep(buttons, 'items', (item) => item.__update != null);
  this.__updatableUIstates.forEach(state => {
    state.update = (info) => state.__update(state.element, info);
  });

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
  this.__mainAnnotateButtons = buttonsPanel.find('input,select');
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
  this.__setMainAnnotateButtonsEnabled(flag && this.hasSelected);
  if (flag) {
    this.__otherAnnotateButtons.prop('disabled', false);
  } else {
    this.__otherAnnotateButtons.prop('disabled', true);
  }
};

OBBAlignPanel.prototype.onSelectLabel = function(labelInfo) {
  if (labelInfo.isAll || !this.hasSelected) {
    this.__setMainAnnotateButtonsEnabled(false);
  } else {
    this.__setMainAnnotateButtonsEnabled(true);
    var obb = this.__showUpFront(this.segments.selectedIndex);
    this.__updateUIState(this.segments.selectedIndex);
    return obb != null;
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

OBBAlignPanel.prototype.__showAlert = function(message, style, timeout) {
  UIUtil.showAlert({ message: message, style: style, timeout: timeout, overlay: true });
};

OBBAlignPanel.prototype.__checkOBBAnnotations = function(annotationsByLabelType, metadata) {
  const loadedPartsAnnId = metadata.partsAnnId;
  const currentPartsAnnId = this.segments.partsAnnId;
  if (loadedPartsAnnId == null) {
    console.warn('Unknown loaded part annotation id', loadedPartsAnnId);
  }
  if (currentPartsAnnId == null) {
    console.warn('Unknown current part annotation id', currentPartsAnnId);
  }
  if (loadedPartsAnnId !== currentPartsAnnId) {
    // Need to check if the partIds and objectIds are okay
    console.warn('Loaded annotation is for part annotations ' + loadedPartsAnnId
      + ', currently using part annotations ' + currentPartsAnnId);
    this.__showAlert('Loaded part annotation may have changed, please check annotation carefully', 'alert-warning');
    const partAnnotationMatcher = new PartAnnotationMatcher();
    const obbHelpers =  this.segments.getOBBHelpers();
    const matchedInfo = _.mapValues(annotationsByLabelType, (anns, labelType) => {
      const helper = obbHelpers[labelType];
      return partAnnotationMatcher.checkMatchByLabel(anns, helper.components, helper.idField);
    });
    return matchedInfo;
  }
};

OBBAlignPanel.prototype.__convertOBBAnnotations = function(annotationsByLabelType, matchedInfo, includeLabelInfo) {
  this.__showAlert('Converting OBB annotations for updated part annotations', 'alert-warning');
  const obbHelpers =  this.segments.getOBBHelpers();
  const updatedAnnotations = _.mapValues(annotationsByLabelType, (anns, labelType) => {
    const notMatched = [];
    const matched = matchedInfo[labelType];
    if (matched) {
      const helper = obbHelpers[labelType];
      const idField = helper.idField;
      const loadedAnnsById = _.keyBy(anns, idField);
      const updatedAnns = helper.components.map( comp => {
        const currentId = comp[idField];
        const loadedId = matched.currentToLoaded[currentId];
        const loaded = (loadedId != null)? loadedAnnsById[loadedId] : undefined;
        const obb = loaded? loaded.obb : null;
        if (!loaded) {
          notMatched.push(comp);
        }
        if (includeLabelInfo) {
          const updatedAnn = this.__getSegGroupAnnInfo(comp);
          updatedAnn.obb = obb;
          updatedAnn.dominantNormal = loaded? loaded.dominantNormal : undefined;
          return updatedAnn;
        } else {
          return obb;
        }
      });
      const notMatchedNotRemove = notMatched.filter(x => x.label !== 'remove');
      if (notMatchedNotRemove.length) {
        console.warn('Unable to match ' + notMatchedNotRemove.length + ' (' + labelType + ')', notMatchedNotRemove);
        this.__showAlert('Please resave after checking annotations for ' + notMatchedNotRemove.map(x => x.label).join('<br/>'), 'alert-danger', 0);
      }
      return updatedAnns;
    } else {
      return anns;
    }
  });
  console.log('old annotations', annotationsByLabelType);
  console.log('updated annotations', updatedAnnotations);
  return updatedAnnotations;
};

OBBAlignPanel.prototype.__processOBBAnnotations = function(record) {
  var data = record.data;
  var modelId = (record.modelId != null)? record.modelId : record.itemId;
  if (modelId !== this.modelId) {
    this.__showAlert('OBB annotation does not match current model id');
    console.error('OBB annotation does not match current model id: got model id ' +
      modelId + ', expected ' + this.modelId);
  } else if (data && data.annotations) {
    var annotations = data.annotations;
    var metadata = data.metadata;
    var matchInfo = this.__checkOBBAnnotations(annotations, metadata);
    if (matchInfo) {
      annotations = this.__convertOBBAnnotations(annotations, matchInfo, metadata.includeLabelInfo);
    }
    if (metadata.includeLabelInfo) {
      this.__setLabeledOBBs(annotations);
    } else {
      this.__setOBBs(annotations);
    }
  } else {
    this.__showAlert('Invalid obb annotations');
    console.error('Invalid obb annotations', data);
  }
};

OBBAlignPanel.prototype.__loadOBBAnnotations = function(err, data, options) {
  console.log('got', err, data, options);
  if (err) {
    this.__showAlert('Error loading obb annotations from ' + options.type);
    console.error('Error loading obb annotations from ' + options.type, err);
  } else if (data) {
    try {
      if (data.appId == null) {
        // TDOO: remove support for this format
        var obbs = parseOBBsWithOrientationField(data);
        if (obbs) {
          this.__setOBBs(obbs);
        }
      } else {
        this.__processOBBAnnotations(data);
      }
    } catch (cerr) {
      this.__showAlert('Error setting obbs');
      console.error('Error setting obbs', cerr);
    }
  } else {
    console.log('no obb annotations');
  }
  var obbHelpers =  this.segments.getOBBHelpers();
  _.forEach(obbHelpers, (obbHelper, labelType) => this.__onObbsUpdated(labelType, obbHelper));
};

OBBAlignPanel.prototype.loadOBBAnnotations = function(options) {
  console.log('loading obb annotations');
  this.__setAllAnnotateButtonsEnabled(false);
  FileUtil.readAsync(options.file || options.path, 'json', (err, data) => {
    this.__loadOBBAnnotations(err, data, options);
    this.__setAllAnnotateButtonsEnabled(true);
  });
};

OBBAlignPanel.prototype.__getSegGroupAnnInfo = function(segGroup) {
  if (segGroup) {
    var copy = segGroup.partInfo? _.clone(segGroup.partInfo) : _.clone(segGroup);
    if (segGroup.obb) {
      copy.obb = segGroup.obb.toJSON();
    }
    if (copy.dominantNormal) {
      if (segGroup.obb) {
        copy.dominantNormal = segGroup.obb.dominantNormal.toArray();
      } else {
        delete copy.dominantNormal;
      }
    }
    if (copy.parts) {
      copy.parts = copy.parts.map(x => x.index);
    }
    if (this.__excludeFields) {
      copy = _.omit(copy, this.__excludeFields);
    }
    return copy;
  }
};

OBBAlignPanel.prototype.getOBBAnnotations = function() {
  var obbHelpersByLabel = this.segments.getOBBHelpers();
  if (this.__saveLabelInfo) {
    var annotations = _.mapValues(obbHelpersByLabel,
      (obbHelper, label) => {
        return obbHelper.components.map(segGroup => this.__getSegGroupAnnInfo(segGroup));
      });
    return annotations;
  } else {
    var obbsByLabel = _.mapValues(obbHelpersByLabel,
      (obbHelper, label)  => {
      var obbs = obbHelper.getOBBs();
      return obbs.map(x => x ? x.toJSON() : x);
    });
    if (_.size(obbsByLabel) === 1) {
      return _.map(obbsByLabel, obbs =>  obbs)[0];
    } else {
      return obbsByLabel;
    }
  }
};

// Functions for submit/export/import
OBBAlignPanel.prototype.getAnnotationsJson = function(annotations) {
  // Put the partsAnnId into the metadata since when we save to the DB, we don't have that as a column
  this.__metadata.partsAnnId = this.segments.partsAnnId;
  var data = this.__annotatorInfo.getMerged({
    itemId: this.modelId,
    modelId: this.modelId,
    data: {
      metadata: this.__metadata,
      annotations: annotations
    },
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
        // Call loadOBBAnnotations to make sure obb information are indicated as updated
        this.__loadOBBAnnotations()
      } else {
        this.__loadOBBAnnotations(null, res, options);
      }
      this.__setAllAnnotateButtonsEnabled(true);
    });
};

OBBAlignPanel.prototype.__setOBBs = function(obbs) {
  if (Array.isArray(obbs)) {
    this.segments.useOBBs(obbs, {createObbMeshes: true});
  } else {
    var obbHelpers =  this.segments.getOBBHelpers();
    _.each(obbs, (os, labelType) => {
      obbHelpers[labelType].useOBBs(os, { createObbMeshes: true});
    });
  }
};

OBBAlignPanel.prototype.__setLabeledOBBs = function(anns) {
  var obbHelpers =  this.segments.getOBBHelpers();
  _.each(anns, (os, labelType) => {
    obbHelpers[labelType].useLabeledOBBs(os, { createObbMeshes: true});
  });
};

OBBAlignPanel.prototype.__getLabelUpdate = function(comp, obb) {
  var textColor;
  // TODO: have gray color for remove
  if (comp.label === 'remove' || comp.label === 'unknown') {
    textColor = (obb) ? 'gray' : '#F08080';
  } else if (obb) {
    textColor = (obb.hasUp && obb.hasFront)? 'black' : 'orange';
  } else {
    textColor = 'red';
  }
  return { textColor: textColor };
};

OBBAlignPanel.prototype.refresh = function(labelType) {
  var obbHelpers =  this.segments.getOBBHelpers();
  if (obbHelpers[labelType]) {
    this.__onObbsUpdated(labelType, obbHelpers[labelType]);
  }
};

OBBAlignPanel.prototype.__onObbsUpdated = function(labelType, obbHelper) {
  for (var i = 0; i < obbHelper.components.length; i++) {
    var comp = obbHelper.components[i];
    if (comp) {
      this.__onObbUpdated(labelType, i, comp);
    }
  }
};

OBBAlignPanel.prototype.__onObbUpdated = function(labelType, compIndex, comp) {
  this.Publish('OBBUpdated', { labelType: labelType, component: comp,
    labelUpdate: this.__getLabelUpdate(comp, comp.obb) });
};

OBBAlignPanel.prototype.__applyToSelected = function(f) {
  var meshIndex = this.segments.selectedIndex;
  if (meshIndex >= 0) {
    var obb = f(meshIndex);
    var obbHelper = this.__getOBBHelper();
    var comp = obbHelper.components[meshIndex];
    if (comp) {
      this.__onObbUpdated(this.segments.labelType, meshIndex, comp);
    }
  }
};

OBBAlignPanel.prototype.__refitOBB = function(meshIndex, options) {
  var obbOpts = _.defaults(Object.create(null), options, { up: Constants.worldUp, front: Constants.worldFront });
  var obbHelper = this.__getOBBHelper();
  obbHelper.refitOBB(meshIndex, obbOpts);
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

OBBAlignPanel.prototype.__getOBBHelper = function() {
  return this.segments.getOBBHelperForLabelType(this.segments.labelType);
};

OBBAlignPanel.prototype.__updateUIState = function(meshIndex) {
  var obbHelper = this.__getOBBHelper();
  var comp = obbHelper.components[meshIndex];
  this.__updatableUIstates.forEach(state => state.update(comp));
};

OBBAlignPanel.prototype.__setInfo = function(meshIndex, fieldname, fieldvalue) {
  var obbHelper = this.__getOBBHelper();
  var comp = obbHelper.components[meshIndex];
  comp[fieldname] = fieldvalue;
};

OBBAlignPanel.prototype.__adjustOBB = function(meshIndex, axisIndex, rotateBy, autoRefit) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    if (axisIndex === 'up') {
      if (!obb.hasUp) {
        obb.ensureUpFront(obbHelper.getDefaultUpLocal(), obbHelper.getDefaultFrontLocal(), true);
      }
      axisIndex = obb.upIndex;
    } else if (axisIndex === 'front') {
      if (!obb.hasFront) {
        obb.ensureUpFront(obbHelper.getDefaultUpLocal(), obbHelper.getDefaultFrontLocal(), true);
      }
      axisIndex = obb.frontIndex;
    }
    axisIndex = axisIndex % 3;
    //console.log('__adjustOBB before:', obb.toJSON());
    var transform = obbHelper.getLocalToWorldTransform();
    obb = obb.clone();
    obb.applyMatrix4(transform);
    var basis = this.__getRotatedOBBBasis(obb, axisIndex, rotateBy);
    return obbHelper.refitOBB(meshIndex, { basis: basis });
    // var obbHelper = this.__getOBBHelper();
    // obb = obbHelper.getOBB(meshIndex);
    //console.log('__adjustOBB after:', obb.toJSON());
  } else if (autoRefit) {
    return this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__toggleOBBFront = function(meshIndex, incr, autoRefit) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    obb.toggleFront(incr);
    obbHelper.updateOBB(meshIndex, obb);
    return obb;
  } else if (autoRefit) {
    return this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__toggleOBBUp = function(meshIndex, incr, autoRefit) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    obb.toggleUp(incr);
    obbHelper.updateOBB(meshIndex, obb);
    return obb;
  } else if (autoRefit) {
    return this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__ensureOBBFront = function(meshIndex, flag, autoRefit) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    obb.isFrontNull = !flag;
    obb.ensureFront(obbHelper.getDefaultFrontLocal(), true);
    obbHelper.updateOBB(meshIndex, obb);
    return obb;
  } else if (flag && autoRefit) {
    return this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__ensureOBBUp = function(meshIndex, flag, autoRefit) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    obb.isUpNull = !flag;
    obb.ensureUp(obbHelper.getDefaultUpLocal(), true);
    obbHelper.updateOBB(meshIndex, obb);
    return obb;
  } else if (flag && autoRefit) {
    return this.__refitOBB(meshIndex, { constrainVertical: true });
  }
};

OBBAlignPanel.prototype.__showUpFront = function(meshIndex) {
  var obbHelper = this.__getOBBHelper();
  var obb = obbHelper.getOBB(meshIndex);
  if (obb) {
    obb.ensureUpFront(obbHelper.getDefaultUpLocal(), obbHelper.getDefaultFrontLocal(), true);
    obbHelper.updateOBB(meshIndex, obb);
    return obb;
  }
};

module.exports = OBBAlignPanel;
