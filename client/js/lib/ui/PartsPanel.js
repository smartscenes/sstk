'use strict';

var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var Segments = require('geo/Segments');
var Voxels = require('model/ModelInstanceVoxels');
var Object3DUtil = require('geo/Object3DUtil');
var OBBAlignPanel = require('ui/OBBAlignPanel');
var LabelRemap = require('util/LabelRemap');
var LabelsPanel = require('ui/LabelsPanel');
var MeshHierarchyPanel = require('ui/MeshHierarchyPanel');
var DatConfigControls = require('ui/DatConfigControls');
var IOUtil = require('io/IOUtil');
var UIUtil = require('ui/UIUtil');
var _ = require('util/util');

/**
 * Parts panel
 * @param params
 * @param params.container
 * @param [params.app]
 * @param [params.getDebugNode] {function}
 * @param [params.showNodeCallback] {function}
 * @param [params.meshHierarchy.submitPartAnnotationsUrl] {string}
 * @param [params.meshHierarchy.retrievePartAnnotationsUrl] {string}
 * @param [params.meshHierarchy.filterEmptyGeometries] {boolean}
 * @param [params.meshHierarchy.showMultiMaterial] {boolean}
 * @param [params.meshHierarchy.collapseNestedPaths] {boolean}
 * @param [params.meshHierarchy.allowLabeling] {boolean}
 * @param [params.meshHierarchy.allowEditHierarchy] {boolean}
 * @param [params.meshHierarchy.allowSelectMaterials] {boolean}
 * @param [params.allowVoxels] {boolean} Whether to load voxels (false by default)
 * @param [params.allowObbAdjustment] {boolean} Whether to allow adjustment of obbs (false by default)
 * @param [params.allowSelectParts] {boolean} Whether to allow for part selection using mouse (true by default)
 * @param [params.partTypes] {string[]}
 * @param [params.labelTypes] {string[]}
 * @param [params.defaultPartType] {string}
 * @param [params.defaultLabelType] {string}
 * @param [params.neutralColor]
 * @param [params.segmentTypes] {string[]}
 * @param [params.voxelColorFields] {string[]}
 * @param [params.partType] {string}
 * @param [params.labelType] {string}
 * @param [params.labelsPanel]
 * @constructor
 * @memberOf ui
 */
function PartsPanel(params) {
  params = params || {};
  // Initialize from params
  this.container = params.container;
  this.app = params.app;
  this.getDebugNode = params.getDebugNode;
  this.showNodeCallback = params.showNodeCallback;
  this.allowVoxels = (params.allowVoxels != undefined)? params.allowVoxels : true;
  this.allowObbAdjustment = (params.allowObbAdjustment != undefined)? params.allowObbAdjustment : false;
  this.allowSelectParts = (params.allowSelectParts != undefined)? params.allowSelectParts : true;
  this.partTypes = params.partTypes;
  this.labelTypes = params.labelTypes;
  this.defaultPartType = params.defaultPartType || 'none';
  this.defaultLabelType = params.defaultLabelType || 'Segment';
  this.neutralColor = params.neutralColor || '#FFF8DC';

  var meshHierarchyConfig = params.meshHierarchy || {};
  var scope = this;
  this.__meshHierarchyConfig = _.defaults({
    app: this.app,
    onPartsNodeChanged: function(oldNode, newNode) {
      scope.getDebugNode().remove(oldNode);
      scope.getDebugNode().add(newNode);
    }
  }, meshHierarchyConfig, {
    treePanel: $('#treePanel'),
    controlsPanel: $('#treePanelControls'),
    buttonsPanel: $('#treePanelButtons'),
    submitPartAnnotationsUrl:  Constants.submitAnnotationsURL,
    retrievePartAnnotationsUrl:  Constants.retrieveAnnotationsURL,
    filterEmptyGeometries: false,
    showMultiMaterial: false,
    collapseNestedPaths: false,
    defaultMaterialSetting: 'clear',
    allowLabeling: false,
    allowEditHierarchy: false,
    allowSelectMaterials: false,
    onhoverCallback: 'highlight'
  });

  // surfaces and voxels
  this.segmentTypes = params.segmentTypes || ['meshes', 'mtl-groups', 'surfaces', 'surfaces-coarse', 'surfaces-fine', 'surfaces-finest'];
  this.segmentsByType = _.keyBy(_.map(this.segmentTypes,
    function(segType) {
      return new Segments(params, segType);
    }), 'segmentType');

  this.surfaces = this.segmentsByType['surfaces'];
  this.surfaces.Subscribe('segmentsUpdated', this, function() {
    this.__colorSegments(this.surfaces, 'surfaces', this.labelType);
    if (this.labelsPanel && this.partType === 'surfaces') {
      this.__updateLabelsPanel(this.surfaces.getLabels(), this.__getLabelColorIndex());
    }
    if (this.surfaces.segmentedObject3DHierarchical) {
      this.meshHierarchy.detach(this.getDebugNode());
      this.meshHierarchy.setSegmented(this.surfaces.segmentedObject3DHierarchical);
      this.meshHierarchy.attach(this.getDebugNode());
      //console.log(this.meshHierarchy.partsNode);
    }
    if (this.__obbAlignPanel) {
      this.__obbAlignPanel.retrieveAnnotations();
    }
  }.bind(this));
  this.meshes = this.segmentsByType['meshes'];
  this.materials = this.segmentsByType['mtl-groups'];

  // Voxels
  this.voxelColorFields = params.voxelColorFields || ['voxels-color-32-surface-old', 'voxels-color-128-surface-old',
    'voxels-color-32-surface', 'voxels-color-32-solid',
    'voxels-color-64-surface', 'voxels-color-64-solid',
    'voxels-color-128-surface', 'voxels-color-128-solid',
    'voxels-color-256-surface', 'voxels-color-256-solid',
    'voxels-color-32-surface-filtered', 'voxels-color-32-solid-filtered',
    'voxels-color-64-surface-filtered', 'voxels-color-64-solid-filtered',
    'voxels-color-128-surface-filtered', 'voxels-color-128-solid-filtered'
  ];
  this.voxelFields = ['voxels-solid', 'voxels-surface', 'voxels-solid-256', 'voxels-labeled'].concat(this.voxelColorFields);
  this.voxelsByType = _.keyBy(_.map(this.voxelFields,
    function(voxelField) {
      return new Voxels({ voxelsField: voxelField });
    }), 'voxelsField');
  this.labeledVoxels = this.voxelsByType['voxels-labeled'];

  this.meshHierarchy = null;
  this.origObject3D = null;
  this.partType = params.partType || this.defaultPartType;
  this.labelType = params.labelType || this.defaultLabelType;
  this.modelId = null;

  if (params.labelsPanel) {
    this.labelsPanel = new LabelsPanel(params.labelsPanel);
    this.labelsPanel.createPanel();
    this.labelsPanel.Subscribe('labelSelected', this, this.onSelectLabel.bind(this));
  }

  this.useColorSequence = params.useColorSequence;
  this.surfaces.showOBBs = params.showOBBs;
  this.init();
}

PartsPanel.prototype.__initDefaultLabelRemaps = function() {
  var labelMappingCategory = 'category';
  var labelMappingsRaw = require("raw-loader!labels/label-mappings.tsv");
  var labelMappings = IOUtil.parseDelimited(labelMappingsRaw, {keyBy: labelMappingCategory, filename: 'label-mappings.tsv'}).data;
  this.initLabelRemaps(labelMappings, labelMappingCategory);
};

PartsPanel.prototype.initLabelRemaps = function(labelMappings, labelMappingCategory) {
  var mpr40ColorsRaw = require("raw-loader!labels/mpr40.tsv");
  var nyu40ColorsRaw = require("raw-loader!labels/nyu40colors.csv");
  var mpr40Colors = IOUtil.parseDelimited(mpr40ColorsRaw, { filename: 'mpr40.tsv' }).data;
  var nyu40Colors = IOUtil.parseDelimited(nyu40ColorsRaw).data;

  var labelRemap = new LabelRemap({
    mappings: labelMappings,
    labelSets: {
      'mpr40': { data: mpr40Colors, id: 'mpcat40index', label: 'mpcat40', unlabeled: 'unlabeled', empty: 'void', other: 'misc' },
      'nyu40': { data: nyu40Colors, id: 'nyu40id', label: 'nyu40class', unlabeled: 'void', other: 'otherprop' }
    },
    mappingKeyField: labelMappingCategory
  });

  var scope = this;
  //console.log(labelRemap);
  _.each(labelRemap.labelSets, function(labels, name) {
    if (scope.defaultLabelTypes.indexOf(name) < 0) {
      scope.defaultLabelTypes.push(name);
    }
    scope.setLabelColorIndex(name, labels);
  });
};

PartsPanel.prototype.__initSegmentsPanel = function(options) {
  var scope = this;
  var panel = options.panel;
  panel.empty();

  // Keep segment colors
  // TODO: consider moving to the datgui or removing
  if (this.useColorSequence != null) {
    function updateUseColorSequenceFlag(flag) {
      scope.useColorSequence = flag;
      _.each(scope.segmentsByType, function (s, t) {
        s.useColorSequence = flag;
      });
    }

    var keepSegmentColorsCheckbox = UIUtil.createCheckbox({
      id: 'keepSegmentColors',
      text: 'Keep segment colors',
      change: updateUseColorSequenceFlag
    }, scope.useColorSequence);
    updateUseColorSequenceFlag(scope.useColorSequence);
    panel.append(keepSegmentColorsCheckbox.checkbox).append(keepSegmentColorsCheckbox.label).append("<br/>");
  }

  // Show OBBs
  function updateShowOBBsFlag(flag) {
    scope.surfaces.showOBBs = flag;
    if (scope.partType === 'surfaces') {
      scope.__colorSegments(scope.surfaces, scope.partType, scope.labelType);
    }
  }

  var showSegmentOBBsCheckbox = UIUtil.createCheckbox({
    id: 'showSegmentOBBs',
    text: 'Show segment OBBs',
    change: updateShowOBBsFlag
  }, scope.surfaces.showOBBs);
  updateShowOBBsFlag(scope.surfaces.showOBBs);
  panel.append(showSegmentOBBsCheckbox.checkbox).append(showSegmentOBBsCheckbox.label);

  if (scope.allowObbAdjustment) {
    scope.__obbAlignPanel = new OBBAlignPanel({
      app: this.app,
      panel: options.panel,
      segments: this.surfaces,
      submitAnnotationsUrl:  Constants.submitAnnotationsURL,
      retrieveAnnotationsUrl:  Constants.retrieveAnnotationsURL
    });
    scope.__obbAlignPanel.init();
  }
};

PartsPanel.prototype.init = function () {
  this.labelTypeSelect = $('#labelType');//$('<select></select>');
  // TODO: Add materials and meshes
  this.defaultLabelTypes = this.labelTypes || ['Raw', 'Segment', 'Category', 'Label', 'Object'];
  this.__initDefaultLabelRemaps();
  for (var i = 0; i < this.defaultLabelTypes.length; i++) {
    var s = this.defaultLabelTypes[i];
    this.labelTypeSelect.append('<option value="' + s + '">' + s + '</option>');
  }
  var scope = this;
  this.labelTypeSelect.change(function () {
    scope.labelTypeSelect.find('option:selected').each(function () {
      scope.setLabelType($(this).val());
    });
  });
  this.labelTypeSelect.val(this.labelType);
  this.__colorSegments(this.surfaces, 'surfaces', this.labelType);
  //this.container.append(this.labelTypeSelect);

  // TODO: Add materials and meshes
  this.defaultPartTypes = _.concat(['none'], this.segmentTypes, this.voxelFields);
  if (this.partTypes) {
    this.partTypes = this.partTypes.filter( function(x) {
      var ok = this.defaultPartTypes.indexOf(x) >= 0;
      if (!ok) {
        console.warn('Ignoring unknown part type: ' + x);
      }
      return ok;
    }.bind(this));
  } else {
    this.partTypes = this.defaultPartTypes;
  }
  if (this.partTypes.length > 0) {
    this.partTypeSelect = $('#partType');//$('<select></select>');
    for (var i = 0; i < this.partTypes.length; i++) {
      var s = this.partTypes[i];
      this.partTypeSelect.append('<option value="' + s + '">' + s + '</option>');
    }
    this.partTypeSelect.change(function () {
      scope.partTypeSelect.find('option:selected').each(function () {
        scope.setPartType($(this).val());
      });
    });
    this.partTypeSelect.val(this.partType);
  }
  //this.container.append(this.partTypeSelect);
  this.meshHierarchy = new MeshHierarchyPanel(this.__meshHierarchyConfig);
  this.meshHierarchy.Subscribe('SelectNode', this, function() {
    scope.setPartType('none');
  });

  this.showButton = $('#showButton');
  this.showButton.click(function (event) { this.showSegment(); }.bind(this));

  this.numberBox = $('#numberBox');
  this.numberBox.keyup(function (event) {
    if (event.keyCode === 13) { // "enter" key
      this.showSegment();
    }
  }.bind(this));

  this.__initSegmentsPanel({
    panel: $('#showSegmentsDiv')
  });

  var partsConfigControls = $('#partsConfigControls');
  if (partsConfigControls.length) {
    this.__datConfig = new DatConfigControls({
      container: partsConfigControls,
      options: [
        { name: 'min', defaultValue: 0.0, text: 'Voxel threshold',
          min: 0.0, max: 1.0, step: 0.01,
          onChange: function(v) {
            scope.setVoxelThreshold(v);
          }
        }
      ]
    });
  }
};

var defaultColors = {
  'unknown': '#A9A9A9',
  'unannotated': '#A9A9A9'
};

PartsPanel.prototype.setVoxelThreshold = function(v) {
  //this.colorVoxels.updateGridField('minThreshold', v);
  var scope = this;
  _.each(this.voxelColorFields, function(f) {
    scope.voxelsByType[f].updateGridField('minThreshold', v);
  });
};

PartsPanel.prototype.setLabelColorIndex = function (labelType, index, callback, labelField, indexField) {
  if (!this.__labelColors) {
    this.__labelColors = {};
  }
  if (typeof index === 'string') {
    // Load resource and then set
    // TODO: Refactor into separate utility class
    var loader = new AssetLoader();
    var labelColors = this.__labelColors;
    loader.load(index, null, function (data) {
      var labelToIndex;
      if (labelField && indexField) {
        labelToIndex = IOUtil.parseDelimited(data, { keyBy: labelField }).data;
        labelToIndex = _.mapValues(labelToIndex, function(v) { return v[indexField]; });
      } else {
        labelToIndex = IOUtil.indexLines(data, { delimiter: ',' });
      }
      labelColors[labelType] = labelToIndex;
      _.merge(labelToIndex, defaultColors);
      if (callback) {
        callback(labelToIndex);
      }
    });
  } else if (index.labelToId) {
    this.__labelColors[labelType] = index;
    if (callback) {
      callback(index);
    }
  } else {
    this.__labelColors[labelType] = index;
    _.merge(index, defaultColors);
    if (callback) {
      callback(index);
    }
  }
};

PartsPanel.prototype.__colorSegments = function(segments, partType, labelType) {
  //console.log('colorSegments', partType, labelType);
  var labelColors =  this.__getLabelColorIndex(partType, labelType);
  if (labelColors && labelColors.labelToId) {
    segments.colorSegments(labelType, labelColors.labelToId, function(x) {
        var label = x? x.split(':')[0] : x;
        return labelColors.rawLabelToLabel(label);
      }, labelColors.getMaterial, labelColors.unlabeledId, true);
  } else {
    segments.colorSegments(labelType, labelColors, null, null, null, true, this.neutralColor);
  }
};

PartsPanel.prototype.__updateLabelsPanel = function(rawLabels, labelColors) {
  var colorIndex = labelColors;
  var labels = rawLabels;
  if (labelColors && labelColors.idToColor) {
    colorIndex = {};
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      colorIndex[label] = labelColors.idToColor(labelColors.labelToId(label));
    }
  }
  //console.log('setLabels', labels, colorIndex);
  this.labelsPanel.setLabels(labels, colorIndex);
};

PartsPanel.prototype.__getLabelColorIndex = function (partType, labelType) {
  partType = partType || this.partType;
  labelType = labelType || this.labelType;
  if (this.__labelColors) {
    if (partType === 'surfaces') {
      return this.__labelColors[labelType] || _.clone(defaultColors);
    } else {
      return this.__labelColors[partType] || _.clone(defaultColors);
    }
  } else {
    return _.clone(defaultColors);
  }
};

PartsPanel.prototype.setLabelType = function (labelType) {
  if (this.labelTypeSelect.val() !== labelType) {
    this.labelTypeSelect.val(labelType);
  }
  this.labelType = labelType;
  if (this.partType === 'surfaces') {
    this.__colorSegments(this.surfaces, this.partType, this.labelType);
    if (this.labelsPanel) {
      this.__updateLabelsPanel(this.surfaces.getLabels(), this.__getLabelColorIndex());
    }
  }
};

PartsPanel.prototype.__showLabelsPanel = function (flag) {
  if (this.labelsPanel) {
    if (this.partType === 'voxels-labeled') {
      this.__updateLabelsPanel(this.labeledVoxels.getLabels(), this.labeledVoxels.labelColorIndex);
    } else if (this.partType === 'surfaces') {
      this.__updateLabelsPanel(this.surfaces.getLabels(), this.__getLabelColorIndex());
    } else {
      this.__updateLabelsPanel([], this.__getLabelColorIndex());
    }

    if (flag) {
      this.labelsPanel.show();
    } else {
      this.labelsPanel.hide();
    }
  }
};

PartsPanel.prototype.onSelectLabel = function (labelInfo) {
  console.log('selected', labelInfo);
  if (this.__isSegmentationType(this.partType)) {
    var s = this.segmentsByType[this.partType];
    if (s && labelInfo) {
      if (labelInfo.isAll) {
        this.__colorSegments(s, this.partType, this.labelType);
      } else {
        var slabelData = s.labelData[labelInfo.index];
        if (slabelData) {
          s.highlightSegments(slabelData.segmentGroups, s.useColorSequence ? slabelData.material : null);
        }
      }
    }
  }
  if (this.__obbAlignPanel) {
    this.__obbAlignPanel.onSelectLabel(labelInfo);
  }
};

PartsPanel.prototype.__showElement = function (selector, flag) {
  if (flag) {
    $(selector).show();
  } else {
    $(selector).hide();
  }
};

PartsPanel.prototype.setPartType = function (partType) {
  if (this.partTypeSelect.val() !== partType) {
    this.partTypeSelect.val(partType);
  }
  if (partType !== this.partType) {
    this.__showPartType(this.partType, false);
    this.partType = partType;
  }
  // TODO: These checks don't work before the surfaces are loaded...
  this.__showElement('#showSegmentsDiv',  this.partType === 'surfaces' /*&& this.surfaces.obbsObject3D != undefined*/);
  this.__showElement('#labelTypeSelectDiv', this.partType === 'surfaces' /*&& this.surfaces.rawSegmentObject3D != undefined*/);
  this.__showLabelsPanel(this.partType === 'surfaces' || this.partType === 'voxels-labeled');
  this.__showPartType(this.partType, true);
};

PartsPanel.prototype.__isSegmentationType = function (partType) {
  return this.segmentTypes.indexOf(partType) >= 2;
};

PartsPanel.prototype.__showPartType = function (partType, flag) {
  this.meshHierarchy.showParts(false);
  var debugNode = this.getDebugNode();
  _.each(this.voxelsByType, function(v,t) { v.clearVoxelSlice(debugNode); });

  console.log('showing part type', partType, flag);
  if (partType === 'none') {
    Object3DUtil.setVisible(this.origObject3D, flag);
  } else if (partType === 'surfaces') {
    this.surfaces.showSegments(flag);
    if (flag) {
      this.__colorSegments(this.surfaces, partType, this.labelType);
    }
  } else if (this.segmentsByType[this.partType]) {
    var s = this.segmentsByType[this.partType];
    s.showSegments(flag);
    if (flag && this.__isSegmentationType(this.partType)) {
      s.colorSegments('Raw', this.__getLabelColorIndex(partType));
    }
  } else if (this.voxelsByType[this.partType]) {
    console.log('Showing voxels', this.partType, flag);
    var v = this.voxelsByType[this.partType];
    v.showVoxels(flag);
    v.setSliceMode(false);
  }
};

PartsPanel.prototype.loadVoxels = function (voxelType, modelInstance, voxels, labelColorIndex) {
  voxels.init(modelInstance);
  if (labelColorIndex != undefined) {
    voxels.setLabelColorIndex(labelColorIndex);
  }
  voxels.loadVoxels(
    function (v) {
      Object3DUtil.setVisible(v.getVoxelNode(), this.partType === voxelType);
      this.showNodeCallback(v.getVoxelNode());
    }.bind(this)
  );
};

PartsPanel.prototype.addCustomVoxels = function(name, voxels) {
  if (this.voxelsByType[name]) {
    // Clear previous voxels
    var oldVoxels = this.voxelsByType[name];
    oldVoxels.clearVoxelSlice(this.getDebugNode());
    var node = oldVoxels.getVoxelNode();
    if (node) {
      this.getDebugNode().remove(node);
      Object3DUtil.dispose(node);
    }
  }
  this.voxelsByType[name] = voxels;
  Object3DUtil.setVisible(voxels.getVoxelNode(), false);
  this.showNodeCallback(voxels.getVoxelNode());
  var partTypeIndex = this.partTypes.indexOf(name);
  if (partTypeIndex < 0) {
    this.partTypes.push(name);
    this.partTypeSelect.append('<option value="' + name + '">' + name + '</option>');
  }
  this._setOptionDisabled(this.partTypeSelect, 'voxels-color-custom', false);
  this.setPartType(name);
};

PartsPanel.prototype._setOptionDisabled = function (select, opt, flag) {
  select.find('option').each(function () {
    if ($(this).val() === opt) {
      if (flag) {
        $(this).attr('disabled', 'disabled');
      } else {
        $(this).removeAttr('disabled');
      }
    }
  });
};

PartsPanel.prototype._setDisabled = function (elem, flag) {
  console.log('disable: ' + flag);
  if (flag) {
    elem.attr('disabled', 'disabled');
  } else {
    elem.removeAttr('disabled');
  }
};

PartsPanel.prototype.setTarget = function (modelInstance) {
  if (modelInstance.model.info.fullId) {
    this.modelId = modelInstance.model.info.fullId;
  } else if (modelInstance.model.info.modelId) {
    this.modelId = modelInstance.model.info.modelId;
  }
  this.origObject3D = modelInstance.object3D;

  _.each(this.segmentsByType, function(s,t) {
    s.init(modelInstance);
    this._setOptionDisabled(this.partTypeSelect, t, !s.exists());
  }.bind(this));

  _.each(this.voxelsByType, function(v,t) {
    if (this.allowVoxels) {
      var colorIndex = (v.voxelField === 'voxels-labeled')? this.__getLabelColorIndex(t) : null;
      this.loadVoxels(t, modelInstance, v, colorIndex);
    }
    this._setOptionDisabled(this.partTypeSelect, t, !v.exists());
  }.bind(this));

  // TODO: Keep old part type and show that...
  this.meshHierarchy.setTarget(modelInstance);
  this.meshHierarchy.attach(this.getDebugNode());
  if (this.defaultPartType !== 'none') {
    this.__showPartType('none', false);
  }
  this.setPartType(this.defaultPartType);
};

PartsPanel.prototype.nextPart = function (inc, partControl) {
  if (this.partType === 'none') {
    // No next part
  } else if (this.segmentsByType[this.partType]) {
    if (this.labelsPanel && this.labelsPanel.isVisible()) {
      this.labelsPanel.selectNextLabel(inc);
    } else {
      var s = this.segmentsByType[this.partType];
      s.showNextSegment(inc);
    }
  } else if (this.voxelsByType[this.partType]) {
    var v = this.voxelsByType[this.partType];
    v.clearVoxelSlice(this.getDebugNode());
    if (partControl) {
      v.showNextSliceDim(this.getDebugNode(), inc, -1);
    } else {
      v.showNextVoxelSlice(this.getDebugNode(), inc, v.sliceDim, -1);
    }
  }
};

PartsPanel.prototype.toggleSegmentation = function () {
  var segments = this.getSegments();
  if (segments) {
    var flag = !segments.isSegmentsVisible;
    if (flag) {
      this.setPartType(segments.segmentType);
    } else {
      this.setPartType('none');
    }
  }
};

PartsPanel.prototype.toggleVoxelization = function () {
  var voxels = this.voxelsByType['voxels-solid'];
  if (voxels) {
    var flag = !voxels.isVoxelsVisible;
    if (flag) {
      this.setPartType('voxels-solid');
    } else {
      this.setPartType('none');
    }
  }
};

PartsPanel.prototype.saveLabels = function () {
  if (this.labelsPanel && this.labelsPanel.isVisible()) {
    this.labelsPanel.saveLegend({ saveAll: true });
  }
};

PartsPanel.prototype.getSegments = function () {
  return this.segmentsByType[this.partType] || this.surfaces;
};

// TODO: Old code, remove as much as possible
PartsPanel.prototype.getSegmentIndex = function () {
  // Read number from segmentIndex box
  var segIndex = parseInt(this.numberBox.val());
  return (isNaN(segIndex)) ? 0 : segIndex;
};

PartsPanel.prototype.showOriginal = function () {
  this.setPartType('none');
};

PartsPanel.prototype.showSegment = function (index) {
  if (index === undefined) {
    index = this.getSegmentIndex();
  }
  var segments = this.getSegments();
  segments.showSegment(index);
};

PartsPanel.prototype.onPartClicked = function(intersects, mode) {
  if (this.meshHierarchy.isVisible) {
    this.meshHierarchy.onPartClicked(intersects, mode);
  } else if (this.allowSelectParts && mode === 'select') {
    if (intersects.length > 0) {
      var intersected = intersects[0];
      if (intersected.object.userData.index != null) {
        this.labelsPanel.selectLabelByIndex(intersected.object.userData.index);
      }
    }
  }
};

PartsPanel.prototype.onPartHovered = function(intersects, mode) {
  if (this.meshHierarchy.isVisible) {
    this.meshHierarchy.onPartHovered(intersects, mode);
  }
};

module.exports = PartsPanel;