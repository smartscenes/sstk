'use strict';

var Constants = require('Constants');
var PubSub = require('PubSub');
var async = require('async');
var _ = require('util/util');
var UIUtil = require('ui/UIUtil');

var DatConfigControls = require('ui/DatConfigControls');
const VECTOR_DELIM = ',';

class CoordinateInput extends DatConfigControls {
  constructor(container, x, y, z, allowClear=true, presetToPosition = null) {
    super({
      container: container,
      options: [
        { name: 'x', min: x.min, max: x.max, step: x.step, defaultValue: x.value, onChange: () => this.__notifyChange() },
        { name: 'y', min: y.min, max: y.max, step: y.step, defaultValue: y.value, onChange: () => this.__notifyChange() },
        { name: 'z', min: z.min, max: z.max, step: z.step, defaultValue: z.value, onChange: () => this.__notifyChange() }
      ],
      autoUpdate: true
    });
    var scope = this;
    if (presetToPosition) {
      var presets = ['custom'];
      _.each(presetToPosition, (pos, preset) => {
        presets.push(preset);
      });
      this.config.preset = 'custom';
      this.presetToPosition = presetToPosition;
      var presetProps = {
        get preset() {
          return scope.config.preset;
        },
        set preset(v) {
          scope.config.preset = v;
          var p = scope.presetToPosition[v];
          if (p) {
            scope.setCoordinates(p);
            scope.__notifyChange();
          }
        }
      };
      this.datgui.add(presetProps, 'preset', presets).name('').listen();
    }
    if (allowClear) {
      this.datgui.add({
        clear: function() {
          scope.clearCoordinates();
          scope.__notifyChange();
        }
      }, 'clear');
    }
    this.__tmpVector = new THREE.Vector3();
  }

  onChange(fn) {
    this.__onChange = fn;
  }

  __notifyChange() {
    if (this.config.preset != null) {
      var p = this.presetToPosition[this.config.preset];
      if (p && (p.x != this.config.x || p.y != this.config.y || p.z != this.config.z)) {
        this.config.preset = 'custom';
      }
    }
    if (this.__onChange) {
      this.__onChange(this.getCoordinates());
    }
  }

  clearCoordinates() {
    this.config.x = null;
    this.config.y = null;
    this.config.z = null;
  }

  getCoordinates() {
    if (this.config.x == null || this.config.y == null || this.config.z == null) {
      return null;
    } else {
      this.__tmpVector.set(this.config.x, this.config.y, this.config.z);
      return this.__tmpVector;
    }
  }

  setCoordinates(v) {
    this.config.x = v.x;
    this.config.y = v.y;
    this.config.z = v.z;
  }

}

class RelCoordinateInput extends CoordinateInput {
  constructor(container, x0=0, y0=0, z0=0, allowClear=true) {
    // Add default top, bottom, left, right, front, back
    var Object3DUtil = require('geo/Object3DUtil');
    var presetToPosition = {};
    _.each(Constants.BBoxFaces, function(i, name) {
      const preset = name.toLowerCase();
      presetToPosition[preset] = Object3DUtil.FaceCenters01[i];
    });
    super(container,
      { min: 0, max: 1, step: 0.01, value: x0 },
      { min: 0, max: 1, step: 0.01, value: y0 },
      { min: 0, max: 1, step: 0.01, value: z0 },
      allowClear, presetToPosition);
    this.__worldVector = new THREE.Vector3();
  }

  setBBox(bbox) {
    this.bbox = bbox;
  }

  toWorldCoordinates() {
    var v = this.getCoordinates();
    if (v) {
      this.bbox.getWorldPosition(v, this.__worldVector);
      return this.__worldVector;
    } else {
      return null;
    }
  }

  fromWorldCoordinates(w) {
    this.__worldVector.copy(w);
    this.bbox.getLocalPosition(this.__worldVector, this.__tmpVector);
    this.setCoordinates(this.__tmpVector);
    return this.__tmpVector;
  }
}

/**
 * Create a small panel for annotation fields
 * @param params
 * @param params.container {jQuery} container object
 * @param params.attributes {string[]} List of editable attributes
 * @param params.attributeLinks {Map<string,LinkInfo>} Map of attribute name to linkage properties
 * @param params.attributeInfos {Map<string,Object>} Map of attribute name to custom attribute info
 * @param params.attributesReadOnly {string[]} List of readonly attributes
 * @param params.hideEmptyFields {boolean} Whether to hide empty read-only fields or not
 * @param params.searchController {search.SearchController} Search controller for looking up field information
 * @param [params.allowEnabledSelection] {boolean} Allow selection of which fields to enable to submit
 * @param [params.allowOpSelection] {boolean} Allow selection of operation for multivalue fields
 * @param [params.allowUpdateByQuery] {boolean} Allow updating of annotations by query
 * @param [params.getQuery] {function} {Callback function returning the query to use when submitting}
 * @param [params.enabledAttributes] {string[]} List of enabled attributes (defaults to all editable attributes)
 * @param [params.submitAnnotationsUrl] {string} Url to use for posting model annotations
 * @param [params.onSubmittedCallback] {function()} Callback for when annotations are submitted
 * @param [params.onActivateSelectPoint] {function()} Callback for when we want to select a point
 * @param [params.cancelActivateSelectPoint] {function()} Callback for when select point is canceled
 * @memberOf ui
 * @constructor
 */
function AnnotationsPanel(params) {
  PubSub.call(this);
  // Where to submit annotation
  this.submitAnnotationsUrl = params.submitAnnotationsUrl || (Constants.baseUrl + '/submitModelAnnotations');

  // Panel
  this.container = params.container;
  // List of settable attributes
  this.attributes = params.attributes || [];
  // Map of attribute name to linking information
  this.attributeLinks = params.attributeLinks || {};
  // Map of attribute name to custom attribute info
  this.attributeInfos = params.attributeInfos || {};
  // List of readonly attributes
  this.attributesReadOnly = params.attributesReadOnly || [];
  // Whether to hide empty fields
  this.hideEmptyFields = params.hideEmptyFields;
  // What to use to lookup our attributes
  this.searchController = params.searchController;

  // Application callback indicating annotations submitted
  this.onSubmittedCallback = params.onSubmittedCallback;

  // Application callback indicating that point selection is activated
  this.onActivateSelectPoint = params.onActivateSelectPoint;
  this.cancelActivateSelectPoint = params.cancelActivateSelectPoint;

  // Attributes that we will consider displaying (filtered to displayAttributes)
  this.__displayableAttributes = [].concat(this.attributes);
  for (var i = 0; i < this.attributesReadOnly.length; i++) {
    var attr = this.attributesReadOnly[i];
    var iAttr = this.attributes.indexOf(attr);
    if (iAttr < 0) {
      this.__displayableAttributes.push(attr);
    } else {
      this.attributes.splice(iAttr, 1);
    }
  }

  // Fields initialized in init()
  // List of display attribute names (attributes + attributesReadOnly)
  this.displayAttributes = [];
  // Map of attribute names to attribute info
  this.attributesMap = {};
  // List of attributes to submit
  this.submittableAttributes = [].concat(this.attributes);
  // List of linked attributes
  this.linkedAttributes = [];
  // List of all attribute names
  this.allAttributes = [];
  // List of enabled submittable attributes
  this.enabledDisplayAttributes = params.enabledAttributes;
  // Allow for selecting of enabled submittable attributes
  this.allowEnabledSelection = params.allowEnabledSelection;
  // Allow for selecting of operation to use for multivalue fields
  // TODO: Fix this for linked fields such as wnsynset (does not really work correctly)
  this.allowOpSelection = params.allowOpSelection;
  // Whether to allow update of annotations using query
  this.allowUpdateByQuery = params.allowUpdateByQuery && params.getQuery;
  this.getQuery = params.getQuery;
  this.__updateBy = null;

  // Target specific fields
  // Model instance to annotate
  this.target = null;
  this.targetIds = null;
  // Annotations on the model instance
  this.annotations = {};

  this.__relCoordInputs = [];
  this.__panelId = 'annotationsPanel_' + _.generateRandomId();
  this.init();
}

AnnotationsPanel.prototype = Object.create(PubSub.prototype);
AnnotationsPanel.prototype.constructor = AnnotationsPanel;

Object.defineProperty(AnnotationsPanel.prototype, 'useQuery', {
  get: function () { return this.allowUpdateByQuery && (this.__updateBy === 'queried_all' || this.__updateBy === 'queried_page'); }
});

AnnotationsPanel.prototype.init = function () {
  // Hook up clear button
  this.clearButton = $('#clearAnnotations');
  this.clearButton.click(this.clear.bind(this));
  // Hook up submit button
  this.submitButton = $('#submitAnnotations');
  this.submitButton.click(this.submit.bind(this));
  // Hook up preview button
  this.previewButton = $('#previewAnnotations');
  this.previewButton.click(this.preview.bind(this));
  // Hook up reset button
  this.resetButton = $('#resetAnnotations');
  this.resetButton.click(this.reset.bind(this));

  this.submitButtons = $().add(this.submitButton).add(this.resetButton).add(this.clearButton).add(this.previewButton);
  // Initialize map of attribute names to information about the attributes
  this.lookupAttributeFields();
};

/**
 * Set the specified model instance as target for annotation
 * @param target {model.ModelInstance|model.ModelInstance[]}
 * @param keepNewAnnotations {boolean} Whether to keep new annotations from this session
 */
AnnotationsPanel.prototype.setTarget = function(target, keepNewAnnotations, targetWorldBBox) {
  var scope = this;
  var modelInfo = {};
  if (Array.isArray(target)) {
    modelInfo = this.__getCombinedModelInfo(target);
  } else {
    modelInfo = target.model.info;
    target = [target];
  }
  this.target = target;
  this.targetIds = modelInfo.fullId;
  this.updateTargetWorldBBox(targetWorldBBox);

  // Get linked attributes
  scope.__setAnnotationsFromModelInfo(modelInfo, keepNewAnnotations);
  if (modelInfo) {
    // console.log('annotations panel got modelinfo', modelInfo);
    async.each(this.linkedAttributes, function (name, cb) {
      var field = scope.attributesMap[name];
      if (modelInfo.hasOwnProperty(name)) {
        field.linker.populateLink(name, modelInfo[name], cb);
      } else {
        cb();
      }
    }, function (err) {
      scope.__setAnnotationsFromModelInfo(modelInfo, keepNewAnnotations);
    });
  }
};

AnnotationsPanel.prototype.updateTargetWorldBBox = function(bbox) {
  this.targetWorldBBox = bbox;
  for (var i = 0; i < this.__relCoordInputs.length; i++) {
    this.__relCoordInputs[i].setBBox(bbox);
  }
};

AnnotationsPanel.prototype.__getCombinedModelInfo = function(targets) {
  var modelInfos = [];
  if (targets.length && targets[0].model) {
    modelInfos = _.map(targets, function(mi) { return mi.model.info; });
  } else {
    modelInfos = targets;
  }
  var modelInfo = {
    fullId: _.map(modelInfos, function(info) { return info.fullId; })
  };
  for (var i = 0; i < this.allAttributes.length; i++) {
    var name = this.allAttributes[i];
    var field = this.attributesMap[name];
    if (field) {
      if (field.multiValued) {
        var values = _.filter(_.map(modelInfos, function(info) { return info[name]; }), function(x) { return x != undefined; });
        modelInfo[name] = _.uniq(values);
      }
    }
  }
  return modelInfo;
};

AnnotationsPanel.prototype.__setAnnotationsFromModelInfo = function (modelInfo, keepNewAnnotations) {
  var newAnns = this.annotations? this.annotations['new'] || {} : {};
  this.annotations = {
    'orig': {},
    'new': keepNewAnnotations? newAnns : {},
    'update': {}
  };
  if (modelInfo) {
    // Display attributes
    // Display readwrite attributes
    for (var i = 0; i < this.submittableAttributes.length; i++) {
      var field = this.attributesMap[name];
      var name = this.submittableAttributes[i];
      var isMainAttribute = this.attributes.indexOf(name) >= 0;
      if (modelInfo.hasOwnProperty(name)) {
        var fieldValue = convertFieldValue(field, modelInfo[name]);
        this.annotations.orig[name] = fieldValue;
        if (isMainAttribute) {
          this.setAnnotation(name, fieldValue, keepNewAnnotations);
        }
      } else {
        if (isMainAttribute) {
          this.setAnnotation(name, undefined, keepNewAnnotations);
        }
      }
    }
    // Display readonly attributes
    for (var i = 0; i < this.attributesReadOnly.length; i++) {
      var name = this.attributesReadOnly[i];
      var field = this.attributesMap[name];
      if (modelInfo.hasOwnProperty(name)) {
        var value = modelInfo[name];
        this.showAttribute(name, field, value, 'noedit');
      } else {
        this.showAttribute(name, field, undefined, 'noedit');
        if (field && field.div && this.hideEmptyFields) {
          field.div.hide();
        }
      }
    }
  }
};

AnnotationsPanel.prototype.showAttribute = function (fieldName, field, value, update) {
  // console.log('showAttribute', fieldName, field, value, update);
  // Update the UI
  if (field && field.div) {
    var fieldInput = field.div.find('#anno_' + fieldName);
    if (this.hideEmptyFields) {
      var isEmpty = (value == undefined);
      if (isEmpty) {
        field.div.hide();
      } else {
        field.div.show();
      }
    }
    if (field.type === 'boolean') {
      fieldInput.prop('checked', !!value);
    } else {
      var multiValued = field.multiValued;
      if (multiValued) {
        var fieldValues = field.div.find('#annolist_' + fieldName);
        var updateMap = update;
        if (typeof (update) === 'string') {
          updateMap = {};
          if (value) {
            for (var j = 0; j < value.length; j++) {
              updateMap[value[j]] = update;
            }
          }
        }
        this.updateLabels(fieldValues, fieldName, updateMap);
      } else if (fieldInput.prop("tagName").toLowerCase() !== 'input') {
        fieldInput.text(value != undefined? value : '');
      } else {
        fieldInput.val(value != undefined? value : '');
      }
    }
  }
};

AnnotationsPanel.prototype.__computeFieldDelta = function (field) {
  var fieldName = field.name;
  var multiValued = field.multiValued;
  // Figure out the changes...
  var update = {};
  if (multiValued) {
    if (this.annotations['new'][fieldName]) {
      for (var i = 0; i < this.annotations['new'][fieldName].length; i++) {
        update[ this.annotations['new'][fieldName][i] ] = 'add';
      }
    }
    if (this.annotations.orig[fieldName]) {
      for (var i = 0; i < this.annotations.orig[fieldName].length; i++) {
        var v = this.annotations.orig[fieldName][i];
        if (update[v] === 'add') {
          update[v] = '';
        } else {
          update[v] = 'del';
        }
      }
    }
  } else {
    if (this.annotations['new'][fieldName] !== this.annotations.orig[fieldName]) {
      if (this.annotations['new'][fieldName]) {
        update[ this.annotations['new'][fieldName] ] = 'add';
      }
      if (this.annotations.orig[fieldName]) {
        update[ this.annotations.orig[fieldName] ] = 'del';
      }
    }
  }
  return update;
};


AnnotationsPanel.prototype.setAnnotation = function (fieldName, value, keepNewAnnotations) {
  //console.log('setAnnotation', fieldName, value);
  if (!keepNewAnnotations || this.annotations['new'][fieldName] == undefined) {
    if (_.isArray(value)) {
      this.annotations['new'][fieldName] = [].concat(value);  // Make copy of array
    } else {
      this.annotations['new'][fieldName] = value;
    }
  }
  // Update UI
  var field = this.attributesMap[fieldName];
  if (field) {
    var update = this.__computeFieldDelta(field);
    var v = keepNewAnnotations? this.annotations['new'][fieldName] : value;
    this.annotations.update[fieldName] = update;
    // Update the UI
    this.showAttribute(fieldName, field, v, update);
    this.Publish('FieldUpdated', field, this.getAnnotation(fieldName));
  }
};

AnnotationsPanel.prototype.getRawAnnotation = function(fieldName) {
  return this.annotations['new'][fieldName];
};

function convertValue(type, str) {
  if (str == null) return str;
  if (typeof str !== 'string') return str;
  str = str.trim();
  if (type === 'vector3') {
    if (str.length === 0) return null;
    return str.split(VECTOR_DELIM).map(x => parseFloat(x.trim()));
  } else if (type === 'int') {
    if (str.length === 0) return null;
    return parseInt(str);
  } else if (type === 'double' || type === 'float') {
    if (str.length === 0) return null;
    return parseFloat(str);
  } else {
    return str;
  }
}

function convertFieldValue(field, value) {
  if (value == null || field == null) { return value; }
  if (field.multiValued) {
    return Array.isArray(value)? value : value.split(',').map(x => convertValue(field.type, x));
  } else {
    return convertValue(field.type, value);
  }
}

AnnotationsPanel.prototype.getAnnotation = function(fieldName) {
  var v = this.getRawAnnotation(fieldName);
  if (v != null) {
    var field = this.attributesMap[fieldName];
    return convertFieldValue(field, v);
  } else {
    return v;
  }
};

AnnotationsPanel.prototype.clearAnnotation = function (fieldName) {
  var value = '';
  var field = this.attributesMap[fieldName];
  if (field) {
    var multiValued = field.multiValued;
    if (multiValued) {
      value = [];
    } else {
      if (field.type === 'boolean') {
        value = false;
      }
    }
    this.setAnnotation(fieldName, value);
  }
};

AnnotationsPanel.prototype.removeAnnotation = function (fieldName, value) {
  var current = this.annotations['new'][fieldName];
  if (current) {
    var filtered = current.filter(function (x) { return x !== value; });
    if (current.length !== filtered.length) {
      this.setAnnotation(fieldName, filtered);
    }
  }
};

AnnotationsPanel.prototype.addAnnotation = function (fieldName, value) {
  var current = this.annotations['new'][fieldName];
  if (current) {
    var index = current.indexOf(value);
    if (index < 0) {
      current.push(value);
      this.setAnnotation(fieldName, current);
    }
  } else {
    this.setAnnotation(fieldName, [value]);
  }
};

AnnotationsPanel.prototype.addLinkedAnnotation = function (fieldName, rawValue, linked) {
  if (linked) {
    //console.log('add linked annotation', linked);
    var fieldValue = linked.record[fieldName];
    this.addAnnotation(fieldName, fieldValue);
  }
};

AnnotationsPanel.prototype.setLinkedAnnotation = function (fieldName, rawValue, linked) {
  if (linked) {
    //console.log('add linked annotation', linked);
    var fieldValue = linked.record[fieldName];
    this.setAnnotation(fieldName, fieldValue);
  }
};

AnnotationsPanel.prototype.updateLabels = function (labels, fieldName, updateMap) {
  labels.empty();
  for (var fieldValue in updateMap) {
    if (updateMap.hasOwnProperty(fieldValue)) {
      var update = updateMap[fieldValue];
      var hover;
      var field = this.attributesMap[fieldName];
      if (field && field.linker) {
        hover = field.linker.getHoverData(fieldValue);
      }
      var label = this.__createLabel(fieldName, fieldValue, update, hover);
      labels.append(label);
    }
  }
};

// Creates a label for annotation
//   .searchResultLabel = no change,
//   .searchResultLabel_noedit = no change and not editable,
//   .searchResultLabel_add = added,
//   .searchResultLabel_del = deleted
AnnotationsPanel.prototype.__createLabel = function (attrname, attrvalue, update, hover) {
  var catClass = 'searchResultLabel';
  if (update) {
    catClass = catClass + ' ' + catClass + '_' + update;
  }
  var label = $('<div></div>')
    .attr('class', 'roundBorder ' + catClass)
    .text(attrvalue);
  if (hover) {
    label.attr('title', hover);
  }
  var change = $('<img/>');
  if (update === 'del') {  // Have add button
    label.click(function (e) {
      this.addAnnotation(attrname, attrvalue);
      e.stopPropagation();
    }.bind(this));
    label.append(change);
  } else if (update === 'add' || update === '') {  // Have delete button
    label.click(function (e) {
      this.removeAnnotation(attrname, attrvalue);
      e.stopPropagation();
    }.bind(this));
    label.append(change);
  }
  return label;
};

AnnotationsPanel.prototype.getSelectEnabledSelector = function() {
  return '#' + this.__panelId + '_selectEnabled';
};

AnnotationsPanel.prototype.__createSelectEnabled = function() {
  var enabledSelectElem = $('<select multiple></select>');
  enabledSelectElem.attr('id', this.__panelId + '_selectEnabled');
  var options = this.displayAttributes.filter(name => {
    var field = this.attributesMap[name];
    return field.isSubmittable;
  });
  for (var i = 0; i < options.length; i++) {
    var s = options[i];
    var field = this.attributesMap[s];
    enabledSelectElem.append('<option value="' + s + '" ' + (field.enabled? 'selected':'') + '>' + s + '</option>');
  }
  var scope = this;
  enabledSelectElem.change(function () {
    enabledSelectElem.find('option').each(function () {
      //console.log($(this).val(), $(this).prop('selected'));
      scope.setEnabled($(this).val(), $(this).prop('selected'));
    });
  });
  return enabledSelectElem;
};

AnnotationsPanel.prototype.__createQueryElem = function() {
  var scope = this;
  var fieldUi = $('<div></div>').attr('id', 'annoquery_ui').attr('class','annotation');
  var select = UIUtil.createSelect({
    id: 'annoquery',
    text: 'Update',
    change: function(v) { scope.__updateBy = v; },
    options: [
      { value: 'selected', text: 'selected' },
      { value: 'queried_page', text: 'queried (page)' },
      { value: 'queried_all', text: 'queried (all)' }
    ]
  });
  fieldUi.append(select.label).append('&nbsp;').append(select.select);
  // var select = UIUtil.createSelect([
  //     { value: 'selected', text: 'Update selected' },
  //     { value: 'queried', text: 'Update all queried' }
  //   ]);
  // fieldUi.append(select);
  // var textbox = UIUtil.createTextbox({
  //   id: 'annoquery',
  //   text: 'Query'
  // });
  // fieldUi.append(textbox.label).append('&nbsp;').append(textbox.textbox);
  return fieldUi;
};

AnnotationsPanel.prototype.initPanel = function () {
  if (this.allowUpdateByQuery) {
    var queryElem = this.__createQueryElem();
    this.container.append(queryElem);
  }
  if (this.allowEnabledSelection) {
    var enabledSelectElem = this.__createSelectEnabled();
    this.container.append(enabledSelectElem);
  }
  for (var i = 0; i < this.displayAttributes.length; i++) {
    var name = this.displayAttributes[i];
    var field = this.attributesMap[name];
    if (field) {
      var fieldUi = this.__createAnnotationField(field);
      this.container.append(fieldUi);
    }
  }
};

AnnotationsPanel.prototype.__updateFieldValue = function(field, fieldValue, isAdd) {
  var fieldName = field.name;
  if (!fieldValue.length && isAdd) {
    // Ignore
    return;
  }
  if (field.linker) {
    var scope = this;
    field.linker.linkLabel(fieldValue, function(err, linked) {
      if (linked) {
        if (isAdd) {
          scope.addLinkedAnnotation(fieldName, fieldValue, linked);
        } else {
          scope.setLinkedAnnotation(fieldName, fieldValue, linked);
        }
      }
    });
  } else {
    if (isAdd) {
      this.addAnnotation(fieldName, fieldValue);
    } else {
      this.setAnnotation(fieldName, fieldValue);
    }
  }
};

AnnotationsPanel.prototype.__updateVector3AnnotationField = function(field, fieldUi, fieldInput) {
  // Add button to initiate clicking on canvas to select a point
  fieldInput.attr('disabled', true);

  var allowEdit = !field.isReadOnly;
  if (allowEdit) {
    var scope = this;
    var editButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-pencil"></i></button>');
    fieldUi.append(editButton);
    var showButton = UIUtil.createGlyphShowHideButton(field, function(v) {
      scope.Publish('ToggleVisibility', field, v);
    }, 'isVisible');
    fieldUi.append(showButton);
    var relCoords = new RelCoordinateInput(fieldUi);
    relCoords.onChange(function() {
      var wCoords = relCoords.toWorldCoordinates();
      if (wCoords) {
        var localCoords = scope.target[0].worldToModel(wCoords);
        var fieldValue = localCoords.toArray().join(VECTOR_DELIM);
        scope.__updateFieldValue(field, fieldValue, false);
      } else {
        scope.__updateFieldValue(field, '', false);
      }
    });
    relCoords.hide();
    this.__relCoordInputs.push(relCoords);

    field.isEditing = false;
    editButton.click(function () {
      field.isEditing = !field.isEditing;
      if (field.isEditing) {
        // Start editing
        showButton.prop('disabled', true);
        relCoords.show();
        relCoords.open();
        if (scope.onActivateSelectPoint) {
          if (!field.isVisible) {
            showButton.click();
          }
          scope.onActivateSelectPoint(function (err, event) {
            // console.log('point selected', event);
            if (event) {
              relCoords.fromWorldCoordinates(event.world);
              var fieldValue = event.local.toArray().join(',');
              fieldInput.val(fieldValue);
              scope.__updateFieldValue(field, fieldValue, false);
            } else {
              relCoords.hide();
            }
          }, false);
        }
      } else {
        // Stop editing
        showButton.prop('disabled', false);
        relCoords.hide();
        if (scope.cancelActivateSelectPoint) {
          scope.cancelActivateSelectPoint();
        }
      }
    });
  }
};

AnnotationsPanel.prototype.__createAnnotationField = function(field) {
  var scope = this;
  var fieldName = field.name;
  var fieldUi = $('<div></div>').attr('id', 'field_' + fieldName).attr('class','annotation');
  var multiValued = field.multiValued;
  var inputType = 'text';
  if (field.type === 'boolean') {
    inputType = 'checkbox';
  } else if (field.type === 'int' || field.type === 'double' || field.type === 'float') {
    inputType = 'number';
  }
  if (field.isReadOnly) {
    // Readonly field
    var fieldLabel = $('<label></label>').text(fieldName).addClass('readonly');
    if (field.description) {
      fieldLabel.attr('title', field.description);
    }
    fieldUi.append(fieldLabel);
    fieldUi.append('&nbsp;');
    if (multiValued) {
      var fieldValues = $('<span></span>').attr('id', 'annolist_' + fieldName);
      fieldUi.append(fieldValues);
    } else if (inputType === 'text') {
      var fieldInput = $('<span></span>').attr('id', 'anno_' + fieldName);
      fieldUi.append(fieldInput);
    } else {
      var fieldInput = $('<input/>').attr('id', 'anno_' + fieldName).attr('type', inputType).attr('disabled', true);
      fieldUi.append(fieldInput);
    }
  } else {
    // Editable field
    var fieldInput = $('<input/>').attr('id', 'anno_' + fieldName).attr('type', inputType);
    var fieldLabel = $('<label></label>').attr('for', 'anno_' + fieldName).text(fieldName);
    if (field.description) {
      fieldLabel.attr('title', field.description);
    }
    var attrsToSet = ['placeholder'];
    if (inputType === 'number') {
      attrsToSet = attrsToSet.concat(['min', 'max', 'step']);
    }
    for (var i = 0; i < attrsToSet.length; i++) {
      var attr = attrsToSet[i];
      if (field[attr] != undefined) {
        fieldInput.attr(attr, field[attr]);
      }
    }
    var addButton;
    fieldUi.append(fieldLabel);
    fieldUi.append('&nbsp;');
    if (multiValued) {
      // TODO: Update to handle vector3
      // Multivalued
      var fieldValues = $('<span></span>').attr('id', 'annolist_' + fieldName);
      fieldUi.append(fieldValues);
      fieldUi.append(fieldInput);
      // addButton = $('<input/>').attr('type', 'button').attr('value', 'Add');
      addButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-plus"></i></button>');
      addButton.click(function () {
        var fieldValue = fieldInput.val().trim();
        scope.__updateFieldValue(field, fieldValue, true);
      });
      fieldUi.append(addButton);
      if (this.allowOpSelection) {
        var selectElem = $('<select></select>');
        var options = ['set', 'add', 'remove'];
        var op = 'set';
        for (var j = 0; j < options.length; j++) {
          var s = options[j];
          selectElem.append('<option value="' + s + '" ' + (s === op? 'selected':'') + '>' + s + '</option>');
        }
        field.op = op;
        selectElem.change(function() {
          field.op = selectElem.val();
        });
        fieldUi.append(selectElem);
      }
    } else {
      // Single value
      fieldInput.change(function () {
        if (field.type === 'boolean') {
          scope.setAnnotation(fieldName, fieldInput.prop('checked'));
        } else {
          scope.__updateFieldValue(field, fieldInput.val().trim(), false);
        }
      });
      fieldUi.append(fieldInput);
    }
    if (field.type === 'vector3') {
      this.__updateVector3AnnotationField(field, fieldUi, fieldInput);
    }
    if (field.type !== 'boolean') {
      //So that typing into the textbox doesn't trigger other keyboard shortcuts:
      fieldInput.bind('keypress', null, function (event) {
        event.stopPropagation();
        if (addButton && event.keyCode === 13) {
          addButton.click();
          return false;
        }
      });
    }
    // if (scope.allowEnabledSelection) {
    //   // TODO: Make into x icon
    //   var disableButton = $('<input/>').attr('type', 'button').attr('value', 'Hide');
    //   disableButton.click(function() {
    //     $(scope.getSelectEnabledSelector()).find('option[value="' + fieldName + '"]').attr("selected", null);
    //     scope.setEnabled(fieldName, false);
    //   });
    //   fieldUi.append(disableButton);
    // }
    if (!field.enabled) {
      fieldUi.hide();
    }
  }
  field.div = fieldUi;
  return fieldUi;
};

AnnotationsPanel.prototype.reset = function () {
  var orig = this.annotations.orig;
  for (var i = 0; i < this.attributes.length; i++) {
    var name = this.attributes[i];
    if (orig.hasOwnProperty(name)) {
      this.setAnnotation(name, orig[name]);
    } else {
      this.setAnnotation(name, undefined);
    }
  }
};

AnnotationsPanel.prototype.saveNew = function () {
  var newAnno = this.annotations['new'];
  this.annotations = {
    'orig': newAnno,
    'new': {},
    'update': {}
  };
  this.reset();
};

function forAttributes(attributeMap, names, cb) {
  names.forEach(name => {
    var field = attributeMap[name];
    if (field) {
      cb(field);
    }
  });
}

/**
 * Lookup attribute fields and populate our ui panel
 * @private
 */
AnnotationsPanel.prototype.lookupAttributeFields = function () {
  var saveFieldsCallback = function (err, data) {
    if (err) {
      console.error('Error looking up fields', err);
    } else if (data && data.fields) {
      // Populate attributes map
      var attributesMap = {};
      for (var i = 0; i < data.fields.length; i++) {
        var field = data.fields[i];
        attributesMap[field.name] = field;
        if (this.attributeInfos) {
          var info = this.attributeInfos[field.name];
          if (info) {
            _.merge(field, info);
          }
        }
      }
      this.attributesMap = attributesMap;
      this.displayAttributes = _.filter(this.__displayableAttributes,
        function(name) { return attributesMap.hasOwnProperty(name); });
      // Populate all attributes and isReadOnly flag
      forAttributes(this.attributesMap, this.attributes, field => { field.isReadOnly = false; });
      forAttributes(this.attributesMap, this.attributesReadOnly, field => { field.isReadOnly = true; });
      this.linkedAttributes = [];
      this.allAttributes = [].concat(this.displayAttributes);
      if (this.attributeLinks) {
        for (var name in this.attributeLinks) {
          if (this.attributeLinks.hasOwnProperty(name)) {
            var linkerInfo = this.attributeLinks[name];
            var field = this.attributesMap[name];
            if (field) {
              this.linkedAttributes.push(name);
              field.linker = this.__createLinker(name, linkerInfo);
              if (!field.isReadOnly) {
                var linkedFields = field.linker.linkedFields;
                for (var i = 0; i < linkedFields.length; i++) {
                  var f = linkedFields[i];
                  if (this.submittableAttributes.indexOf(f) < 0) {
                    this.submittableAttributes.push(f);
                  }
                  if (this.allAttributes.indexOf(f) < 0) {
                    this.allAttributes.push(f);
                  }
                }
              }
            } else {
              console.error('Unknown field to link: ' + name);
            }
          }
        }
      }
      forAttributes(this.attributesMap, this.submittableAttributes, field => { field.isSubmittable = true; });
      forAttributes(this.attributesMap, this.displayAttributes, field => { field.isDisplayable = true; });
      if (this.enabledDisplayAttributes) {
        forAttributes(this.attributesMap, this.enabledDisplayAttributes, field => {
          this.setFieldProperty(field, 'enabled', true, true);
        });
      } else {
        forAttributes(this.attributesMap, this.submittableAttributes, field => { field.enabled = true; });
      }
      this.enabledDisplayAttributes = this.displayAttributes.filter(name => {
        return attributesMap[name].enabled;
      });
      this.initPanel();
    }
  }.bind(this);
  this.searchController.lookupFields(Constants.models3dFieldsUrl, saveFieldsCallback);
};

AnnotationsPanel.prototype.setFieldProperty = function(field, name, value, includeLinked) {
  field[name] = value;
  if (includeLinked && field.linker && field.linker.linkedFields) {
    for (var i = 0; i < field.linker.linkedFields.length; i++) {
      var f = field.linker.linkedFields[i];
      var linkedField = this.attributesMap[f];
      if (linkedField) {
        linkedField[name] = value;
      } else {
        console.error('Unknown linked field to set: ' + f);
      }
    }
  }
};

AnnotationsPanel.prototype.setEnabled = function(fieldname, flag) {
  // Make a submittable field enabled or not
  var field = this.attributesMap[fieldname];
  if (field) {
    this.setFieldProperty(field, 'enabled', flag, true);
    if (field.enabled) {
      // Show this field
      field.div.show();
    } else {
      // Hide this field
      field.div.hide();
    }
    this.enabledDisplayAttributes = this.displayAttributes.filter(name => {
      return this.attributesMap[name].enabled;
    });
  } else {
    console.error('Unknown field to set: ' + fieldname);
  }
};

AnnotationsPanel.prototype.clear = function () {
  for (var i = 0; i < this.attributes.length; i++) {
    var name = this.attributes[i];
    this.clearAnnotation(name);
  }
};

AnnotationsPanel.prototype.__updateLinked = function() {
  var anns = this.annotations['new'];
  for (var i = 0; i < this.linkedAttributes.length; i++) {
    var name = this.linkedAttributes[i];
    var fieldValue = anns[name];
    if (fieldValue) {
      var field = this.attributesMap[name];
      var linkedFields = _.filter(field.linker.linkedFields, function(f) { return f !== name; });
      for (var k = 0; k < linkedFields.length; k++) {
        anns[linkedFields[k]] = [];
      }
      if (!_.isArray(fieldValue)) { fieldValue = [fieldValue]; }
      for (var j = 0; j < fieldValue.length; j++) {
        var value = fieldValue[j];
        var linked = field.linker.getLinked(value);
        //console.log('got linked', linked);
        if (linked) {
          for (var k = 0; k < linkedFields.length; k++) {
            var lf = linkedFields[k];
            var lv = linked.record[lf];
            if (lv != undefined) {
              if (!_.isArray(lv)) { lv = [lv]; }
              //console.log('got field', lf, lv);
              for (var li = 0; li < lv.length; li++) {
                if (anns[lf].indexOf(lv[li]) < 0) {
                  anns[lf].push(lv[li]);
                }
              }
            }
          }
        }
      }
      for (var k = 0; k < linkedFields.length; k++) {
        var name = linkedFields[k];
        var lf = this.attributesMap[name];
        lf.op = field.op;
        this.annotations['update'][name] = this.__computeFieldDelta(lf);
      }
    }
  }
};

AnnotationsPanel.prototype.preview = function () {
  //this.__updateLinked();
  //console.log(this.targetIds, this.annotations);
  var submitInfo = this.__checkSubmitOkay();
  var submitData = this.__getSubmitData(submitInfo);
  console.log(submitData);
};

AnnotationsPanel.prototype.__checkSubmitOkay = function() {
  var modelId;
  var query;
  if (this.useQuery) {
    query = this.getQuery();
    if (query == undefined) {
      UIUtil.showAlert('Please enter a query', 'alert-warning');
      return;
    }
    if (this.__updateBy === 'queried_all') {
      query.start = 0;
      query.rows = "all";
    }
  } else {
    modelId = this.targetIds;
    if (modelId == undefined || modelId.length === 0) {
      UIUtil.showAlert('Please select some models to annotate', 'alert-warning');
      return;
    }
  }
  return { modelId: modelId, query: query };
};

AnnotationsPanel.prototype.__getSubmitData = function(submitInfo) {
  this.__updateLinked();
  var params = {
    modelId: submitInfo.modelId,
    query: submitInfo.query,
    // userId: (window.globals)? window.globals.userId : "unknown",
    updateMain: Constants.submitUpdateMain
  };
  var operation = {};
  var newAnno = this.annotations['new'];
  for (var i = 0; i < this.submittableAttributes.length; i++) {
    var name = this.submittableAttributes[i];
    var field = this.attributesMap[name];
    if (field) {
      if (field.enabled && newAnno.hasOwnProperty(name) && newAnno[name] !== undefined) {
        params[name] = newAnno[name]; //convertFieldValue(field ,newAnno[name]);
        if (field.op != null) {
          operation[name] = field.op;
        }
      }
    } else {
      console.warn('Unknown field "' + name + '"');
    }
  }
  if (this.allowOpSelection) {
    params.operation = operation;
  }
  return params;
};

AnnotationsPanel.prototype.__submit = function (data) {
  var submitInfo = null;
  if (data.modelId != null) {
    submitInfo = 'model ' + data.modelId;
  } else {
    submitInfo = 'query ' + data.query;
  }
  console.log('submitting', data);
  var inputs = this.submitButtons;
  inputs.prop('disabled', true);
  $.ajax({
    type: 'POST',
    url: this.submitAnnotationsUrl,
    contentType: 'application/json;charset=utf-8',
    data: JSON.stringify(data),
    success: function (response, textStatus, jqXHR) {
      UIUtil.showAlert('Annotations successfully submitted for', 'alert-success');
      console.log('Annotations successfully submitted for ' + submitInfo + '!!!');
      this.saveNew();
      // Callback
      if (this.onSubmittedCallback) {
        this.onSubmittedCallback();
      }
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      UIUtil.showAlert('Error submitting annotations', 'alert-danger');
      console.error('Error submitting annotations for '  + submitInfo + '!!!');
    },
    complete: function () {
      // Re-enable inputs
      inputs.prop('disabled', false);
    }
  });
};

AnnotationsPanel.prototype.submit = function() {
  var submitInfo = this.__checkSubmitOkay();
  if (!submitInfo) {
    // Abort - some issues (assumes __checkSubmitOkay() will have some alerts)
    return;
  }
  var data = this.__getSubmitData(submitInfo);
  if (_.keys(data).length === 2) {
    UIUtil.showAlert('Nothing to submit', 'alert-warning');
    return;
  }
  if (submitInfo.query != null) {
    bootbox.confirm('Are you sure you want to submit annotations for query ' + JSON.stringify(submitInfo.query),
      (result) => {
        if (result) {
          this.__submit(data);
        }
      });
  } else {
    this.__submit(data);
  }
};

AnnotationsPanel.prototype.__createLinker = function(linkField, linkerInfo) {
  if (linkerInfo.linkType === 'wordnet') {
    return new WordNetLabelLinker(linkField, linkerInfo);
  } else {
    console.error('Unknown linkType ' + linkerInfo.linkType);
  }
};

/**
 * @typedef {Object} AnnotationsPanel.LinkerInfo
 * @memberOf ui
 * @property linkType {string} Type of linker (wordnet)
 * @property displayField {string} What linked field to display
 * @property fieldMappings {Map<string,string>} Map of canonical field names for the linker to specific fields stored with the asset
 */

/**
 * Creates a linker for wordnet labels
 * @param linkField {string}
 * @param linkerInfo {AnnotationsPanel.LinkerInfo}
 * @constructor
 * @memberOf ui
 */
function WordNetLabelLinker(linkField, linkerInfo) {
  var WordNetLinker = require('nlp/WordNetLinker');
  this.__linker = new WordNetLinker(_.pick(linkerInfo, ['solrUrl', 'wordnetVersion', 'taxonomy']));
  this.linkField = linkField;
  this.linkType = linkerInfo.linkType;
  this.displayField = linkerInfo.displayField;
  this.fieldMappings = linkerInfo.fieldMappings;
  this.linkedFields = _.keys(this.fieldMappings);
  this.__cached = {};
}

WordNetLabelLinker.prototype.clear = function() {
  this.__cached = {};
};

WordNetLabelLinker.prototype.getHoverData = function(key) {
  var linked = this.__cached[key];
  if (linked) {
    return JSON.stringify(_.omit(linked.record, ['wnhyperlemmas', 'wnhypersynsets', 'wnhypersynsetkeys']), null, ' ');
  }
};

WordNetLabelLinker.prototype.getLinked = function(key) {
  return this.__cached[key];
};

WordNetLabelLinker.prototype.populateLink = function(fieldname, values, callback) {
  var scope = this;
//  this.__linker.wordnet.lookupByField(this.fieldMappings[fieldname], values, function(err, synsets) {
  // TODO: assumes that values are synsetids...
  if (values && values.length) {
    this.__linker.wordnet.getTaxonomyNodes(values, function(err, synsets) {
      //console.log('got result', result);
      if (synsets) {
        for (var i = 0; i < synsets.length; i++) {
          scope.__convertSynsetTaxnomyNode(synsets[i]);
        }
      }
      if (callback) {
        var mapped = _.isArray(values)? _.map(values, function(v) { return scope.__cached[v]; }) : scope.__cached[values];
        callback(err, mapped);
      }
    });
  } else {
    if (callback) {
      callback(null);
    }
  }
};

WordNetLabelLinker.prototype.__convertSynset = function(synset) {
  var converted = {};
  for (var i = 0; i < this.linkedFields.length; i++) {
    var f = this.linkedFields[i];
    converted[f] = synset[this.fieldMappings[f]];
  }
  var linkDetail = {
    linkValue: converted[this.linkField],
    displayValue: converted[this.displayField],
    record: converted
  };
  this.__cached[linkDetail.linkValue] = linkDetail;
  return linkDetail;
};

WordNetLabelLinker.prototype.__convertSynsetTaxnomyNode = function(node) {
  var linkField = this.fieldMappings[this.linkField];
  var wnsynsetkey = this.fieldMappings['wnsynsetkey'];
  node.synset.wnhyperlemmas = node.ancestors? _.uniq(_.flatMap(node.ancestors, function(x) { return x.words; })) : undefined;
  node.synset.wnhypersynsets = node.ancestors? _.uniq(_.flatMap(node.ancestors, function(x) { return x[linkField]; })) : undefined;
  node.synset.wnhypersynsetkeys = node.ancestors? _.uniq(_.flatMap(node.ancestors, function(x) { return x[wnsynsetkey]; })) : undefined;
  var linkDetail = this.__convertSynset(node.synset);
  return linkDetail;
};

WordNetLabelLinker.prototype.linkLabel = function(label, callback) {
  var scope = this;
  this.__linker.showSynsets(label, function(err, results) {
    if (results && results.selectedLinkIndex >= 0) {
      var selectedSynset = results.synsets[results.selectedLinkIndex];
      if (selectedSynset) {
        scope.__linker.wordnet.getTaxonomyNodes(selectedSynset.synsetid, function(err2, taxNodes) {
          var linkDetail = (taxNodes && taxNodes[0])? scope.__convertSynsetTaxnomyNode(taxNodes[0]) : undefined;
          callback(err2, linkDetail);
        });
        return;
      }
    }
    callback(err);
  }, { includeHyponyms: true });
};

module.exports = AnnotationsPanel;
