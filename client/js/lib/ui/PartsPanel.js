'use strict';

var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var Segments = require('geo/Segments');
var Voxels = require('model/ModelInstanceVoxels');
var ModelInfo = require('model/ModelInfo');
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
 * @param [params.allowAllSupportedParts] {boolean} Whether to allow for all support parts to be shown in the parts panel
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
  this.allowAllSupportedParts = (params.allowAllSupportedParts != undefined)? params.allowAllSupportedParts : false;
  this.includeDefaultLabelRemaps = (params.includeDefaultLabelRemaps != undefined)? params.includeDefaultLabelRemaps : true;
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
    submitPartAnnotationsUrl: Constants.submitAnnotationsURL,
    retrievePartAnnotationsUrl: Constants.retrieveAnnotationsURL,
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
  this.defaultSegmentTypes = ['meshes', 'mtl-groups', 'surfaces', 'surfaces-coarse', 'surfaces-fine', 'surfaces-finest'];
  this.segmentTypes = params.segmentTypes || this.defaultSegmentTypes;
  this.__options = params;
  this.segmentsByType = _.keyBy(_.map(this.segmentTypes,
    function(segType) {
      return new Segments(params, segType);
    }), 'segmentType');
  this.segmentsByType['meshes'].notTrueSegmentation = true;
  this.segmentsByType['mtl-groups'].notTrueSegmentation = true;

  this.surfaces = this.segmentsByType['surfaces'];
  this.surfaces.Subscribe('segmentsUpdated', this, function() {
    this.__onSegmentsLoaded(this.surfaces, 'surfaces');
  }.bind(this));
  this.meshes = this.segmentsByType['meshes'];
  this.materials = this.segmentsByType['mtl-groups'];

  // Voxels
  this.defaultVoxelsColorFields = [
    // 'voxels-color-32-surface', 'voxels-color-32-solid',
    // 'voxels-color-64-surface', 'voxels-color-64-solid',
    // 'voxels-color-128-surface', 'voxels-color-128-solid',
    // 'voxels-color-256-surface', 'voxels-color-256-solid',
    // 'voxels-color-32-surface-filtered', 'voxels-color-32-solid-filtered',
    // 'voxels-color-64-surface-filtered', 'voxels-color-64-solid-filtered',
    // 'voxels-color-128-surface-filtered', 'voxels-color-128-solid-filtered'
  ];
  this.voxelColorFields = params.voxelColorFields || this.defaultVoxelsColorFields;
  this.voxelFields = ['voxels-solid', 'voxels-surface', 'voxels-labeled'].concat(this.voxelColorFields);
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
  this.showOBBs = !!params.showOBBs;
  this.init();
}

PartsPanel.prototype.__onSegmentsLoaded = function(segments, partType) {
  segments.showOBBs = this.showOBBs;
  segments.useColorSequence = this.useColorSequence;
  this.__colorSegments(segments, partType, this.labelType);
  if (this.labelsPanel && this.partType === partType) {
    this.__updateLabelsPanel(segments.getLabels(), this.__getLabelColorIndex());
  }
  //console.log('onSegmentsLoaded', segments.segmentedObject3DHierarchical);
  if (segments.segmentedObject3DHierarchical) {
    this.meshHierarchy.detach(this.getDebugNode());
    this.meshHierarchy.setSegmented(segments.segmentedObject3DHierarchical);
    this.meshHierarchy.attach(this.getDebugNode());
    //console.log(this.meshHierarchy.partsNode);
  }
  if (this.__obbAlignPanel && partType === this.__obbAlignPanel.segments.segmentType) {
    this.__obbAlignPanel.retrieveAnnotations();
  }
};

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

Object.defineProperty(PartsPanel.prototype, 'useColorSequence', {
  get: function () { return this.__useColorSequence; },
  set: function (flag) {
    this.__useColorSequence = flag;
    _.each(this.segmentsByType, function (s, t) {
      s.useColorSequence = flag;
    });
  }
});

Object.defineProperty(PartsPanel.prototype, 'showOBBs', {
  get: function () { return this.__showOBBs; },
  set: function (flag) {
    this.__showOBBs = flag;
    _.each(this.segmentsByType, function (s, t) {
      s.showOBBs = flag;
    });
    if (this.__isSegmentationType(this.partType)) {
      this.__colorSegments(this.segmentsByType[this.partType], this.partType, this.labelType);
    }
  }
});

PartsPanel.prototype.__initSegmentsPanel = function(options) {
  var scope = this;
  var panel = options.panel;
  panel.empty();

  // Keep segment colors
  // TODO: consider moving to the datgui or removing
  if (this.useColorSequence != null) {
    function updateUseColorSequenceFlag(flag) {
      scope.useColorSequence = flag;
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
    scope.showOBBs = flag;
  }

  var showSegmentOBBsCheckbox = UIUtil.createCheckbox({
    id: 'showSegmentOBBs',
    text: 'Show part OBBs',
    change: updateShowOBBsFlag
  }, scope.showOBBs);
  updateShowOBBsFlag(scope.showOBBs);
  panel.append(showSegmentOBBsCheckbox.checkbox).append(showSegmentOBBsCheckbox.label);
  this.__initOBBAlignerPanel(options);
};

PartsPanel.prototype.__initOBBAlignerPanel = function(options) {
  var scope = this;
  if (scope.allowObbAdjustment) {
    var obbAlignPartType = options.obbAlignPartType || 'surfaces';
    var obbAlignSegments = this.segmentsByType[obbAlignPartType];
    if (obbAlignSegments) {
      console.log('Use obb align part type ' + obbAlignPartType);
      scope.__obbAlignPanel = new OBBAlignPanel({
        app: this.app,
        panel: options.panel,
        saveLabelInfo: true,
        segments: obbAlignSegments,
        task: options.obbAlignTask,
        submitAnnotationsUrl: Constants.submitAnnotationsURL,
        retrieveAnnotationsUrl: Constants.retrieveAnnotationsURL,
      });
      scope.__obbAlignPanel.init();
      scope.__obbAlignPanel.Subscribe('OBBUpdated', this, (info) => {
        // console.log('got', 'OBBUpdated', info, this.labelType);
        if (info.labelUpdate && info.labelType === this.labelType) {
          var labelIndex = info.component.labelIndex;
          if (labelIndex != null) {
            var labelInfo = this.labelsPanel.labelInfos[labelIndex];
            this.labelsPanel.updateInfo(labelInfo, info.labelUpdate);
          }
        }
      });
    } else {
      console.warn('No segments for obb align part type ' + obbAlignPartType);
    }
  }
}

PartsPanel.prototype.init = function () {
  this.labelTypeSelect = $('#labelType');//$('<select></select>');
  // TODO: Add materials and meshes
  this.defaultLabelTypes = this.labelTypes || ['Raw', 'Segment', 'Category', 'Label', 'Object'];
  if (this.includeDefaultLabelRemaps) {
    this.__initDefaultLabelRemaps();
  }
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
    panel: $('#showSegmentsDiv'),
    obbAlignPartType: this.__options.obbAlignPartType
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
  var labelColors =  this.__getLabelColorIndex(partType, labelType);
  // console.log('colorSegments', partType, labelType, labelColors);
  if (labelColors && labelColors.labelToId) {
    segments.colorSegments(labelType, labelColors.labelToId, function(x) {
        var label = x? x.split(':')[0] : x;
        return labelColors.rawLabelToLabel(label);
      }, labelColors.getMaterial, labelColors.unlabeledId, true);
  } else {
    segments.colorSegments(labelType, labelColors, null, null, null, true, this.neutralColor);
  }
};

/**
 * Update panel of labels
 * @param rawLabels {string[]|LabelInfo[]} Array of labels or labelInfos
 * @param labelColors {util.LabelRemap.LabelSet}
 * @private
 */
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
    var isSegmentation = this.__isSegmentationType(partType);
    if (isSegmentation) {
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
  var isSegmentation = this.__isSegmentationType(this.partType);
  if (isSegmentation) {
    var segs = this.segmentsByType[this.partType];
    this.__colorSegments(segs, this.partType, this.labelType);
    if (this.labelsPanel) {
      this.__updateLabelsPanel(segs.getLabels(), this.__getLabelColorIndex());
    }
    if (this.__obbAlignPanel) {
      this.__obbAlignPanel.refresh(labelType);
    }
  }
};

PartsPanel.prototype.__showLabelsPanel = function (flag) {
  if (this.labelsPanel) {
    if (this.partType === 'voxels-labeled') {
      this.__updateLabelsPanel(this.labeledVoxels.getLabels(), this.labeledVoxels.labelColorIndex);
    } else if (this.__isSegmentationType(this.partType)) {
      var segs = this.segmentsByType[this.partType];
      this.__updateLabelsPanel(segs.getLabels() || [], this.__getLabelColorIndex());
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
        s.setSelectedLabel(labelInfo);
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
  var isSegmentation = this.__isSegmentationType(this.partType);
  //this.__showElement('#showSegmentsDiv',  this.partType === 'surfaces' /*&& this.surfaces.obbsObject3D != undefined*/);
  //this.__showElement('#labelTypeSelectDiv', this.partType === 'surfaces' /*&& this.surfaces.rawSegmentObject3D != undefined*/);
  //this.__showLabelsPanel(this.partType === 'surfaces' || this.partType === 'voxels-labeled');
  this.__showElement('#showSegmentsDiv',  isSegmentation);
  this.__showElement('#labelTypeSelectDiv', isSegmentation);
  var isLabeledSegmentation = isSegmentation && this.segmentsByType[this.partType].getLabels();
  this.__showLabelsPanel(isLabeledSegmentation || this.partType === 'voxels-labeled');
  this.__showPartType(this.partType, true);
};

PartsPanel.prototype.__isSegmentationType = function (partType) {
  var segs = this.segmentsByType[partType];
  var isSeg = segs && !segs.notTrueSegmentation;
  // console.log('isSeg', partType, isSeg, segs);
  return isSeg;
};

PartsPanel.prototype.__showPartType = function (partType, flag) {
  this.meshHierarchy.showParts(false);
  var debugNode = this.getDebugNode();
  _.each(this.voxelsByType, function(v,t) { v.clearVoxelSlice(debugNode); });

  console.log('showing part type', partType, flag);
  if (partType === 'none') {
    Object3DUtil.setVisible(this.origObject3D, flag);
    if (this.meshHierarchy.showSegmented) {
      this.meshHierarchy.detach(this.getDebugNode());
      this.meshHierarchy.restoreOriginalHierarchy();
      this.meshHierarchy.attach(this.getDebugNode());
    }
  } else if (this.segmentsByType[this.partType]) {
    var s = this.segmentsByType[this.partType];
    s.showSegments(flag);
    if (flag && this.__isSegmentationType(this.partType)) {
      this.__colorSegments(s, partType, this.labelType);
    }
    if (s.segmentedObject3DHierarchical) {
      this.meshHierarchy.detach(this.getDebugNode());
      this.meshHierarchy.setSegmented(s.segmentedObject3DHierarchical);
      this.meshHierarchy.attach(this.getDebugNode());
    }
  } else if (this.voxelsByType[this.partType]) {
    console.log('Showing voxels', this.partType, flag);
    var v = this.voxelsByType[this.partType];
    v.showVoxels(flag);
    v.setSliceMode(false);
  } else {
    console.warn('Unknown part type', partType);
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
  voxels.isCustom = true;
  this.voxelsByType[name] = voxels;
  var voxelNode = voxels.getVoxelNode();
  if (voxelNode) {
    Object3DUtil.setVisible(voxels.getVoxelNode(), false);
    this.showNodeCallback(voxels.getVoxelNode());
  } else {
    console.warn('No voxels for ' + name);
  }
  // Add to part menu
  var partTypeIndex = this.partTypes.indexOf(name);
  if (partTypeIndex < 0) {
    this.partTypes.push(name);
    this.partTypeSelect.append('<option value="' + name + '">' + name + '</option>');
  }
  this._setOptionDisabled(this.partTypeSelect, name, false);
  this.setPartType(name);
};

PartsPanel.prototype.addCustomSegments = function(name, segments) {
  console.log('add custom segments', name);
  if (this.segmentsByType[name]) {
    // Clear previous segments
    //var oldSegments = this.segmentsByType[name];
    // oldSegments.clearVoxelSlice(this.getDebugNode());
    // var node = oldSegments.getVoxelNode();
    // if (node) {
    //   this.getDebugNode().remove(node);
    //   Object3DUtil.dispose(node);
    // }
  }
  segments.isCustom = true;
  this.segmentsByType[name] = segments;
  segments.showSegments(false);
  // Add to part menu
  var partTypeIndex = this.partTypes.indexOf(name);
  if (partTypeIndex < 0) {
    this.partTypes.push(name);
    this.partTypeSelect.append('<option value="' + name + '">' + name + '</option>');
  }
  this._setOptionDisabled(this.partTypeSelect, name, false);
  this.setPartType(name);
  if (this.allowObbAdjustment && name === this.__options.obbAlignPartType) {
    this.__initOBBAlignerPanel({
      panel: $('#showSegmentsDiv'),
      obbAlignPartType: this.__options.obbAlignPartType,
      obbAlignTask: this.__options.obbAlignTask
    });
  }
  this.segmentsByType[name].Subscribe('segmentsUpdated', this, function() {
    this.__onSegmentsLoaded(this.segmentsByType[name], name);
  }.bind(this));
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

  if (this.allowAllSupportedParts) {
    // Check if there are other segments and voxels that are supported that we don't know about
    var requestedPartTypes = this.__options.partTypes;
    var filter = function(name) { return (requestedPartTypes)? requestedPartTypes.indexOf(name) >= 0 : true; };
    var segMetadata = ModelInfo.getMetadataForDataType(modelInstance.model.info, 'segment');
    if (segMetadata) {
      var supportedSegments = segMetadata.data || [];
      for (var i = 0; i < supportedSegments.length; i++) {
        var name = supportedSegments[i].name;
        if (!this.segmentsByType[name] && filter(name)) {
          this.addCustomSegments(name, new Segments(this.__options, name));
        }
      }
    }
    var partsMetadata = ModelInfo.getMetadataForDataType(modelInstance.model.info, 'parts');
    if (partsMetadata) {
      var supportedParts = partsMetadata.data || [];
      for (var i = 0; i < supportedParts.length; i++) {
        var name = supportedParts[i].name;
        if (!this.segmentsByType[name] && filter(name)) {
          this.addCustomSegments(name, new Segments(this.__options, name));
        }
      }
    }
    var voxMetadata = ModelInfo.getMetadataForDataType(modelInstance.model.info, 'voxel') || [];
    if (voxMetadata) {
      var supportedVoxels = voxMetadata.data || [];
      for (var i = 0; i < supportedVoxels.length; i++) {
        var name = supportedVoxels[i].name;
        if (!this.voxelsByType[name] && filter(name)) {
          this.addCustomVoxels(name, new Voxels({voxelsField: name}));
        }
      }
    }
  }

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