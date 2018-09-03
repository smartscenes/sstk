'use strict';

var Constants = require('Constants');
var async = require('async');
var _ = require('util');

/**
 * Create a small panel for annotation fields
 * @param params
 * @param params.container {jQuery} container object
 * @param params.attributes {string[]} List of editable attributes
 * @param params.attributeLinks {Map<string,LinkInfo>} Map of attribute name to linkage properties
 * @param params.attributeInfos {Map<string,Object>} Map of attribute name to custom attribute info
 * @param params.attributesReadOnly {string[]} List of readonly attributes
 * @param params.hideEmptyFields {boolean} Whether to hide empty fields or not
 * @param params.searchController {search.SearchController} Search controller for looking up field information
 * @memberOf ui
 * @constructor
 */
function AnnotationsPanel(params) {
  // Where to submit annotaiton
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

  // Target specific fields
  // Model instance to annotate
  this.target = null;
  this.targetIds = null;
  // Annotations on the model instance
  this.annotations = {};

  this.init();
}

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
 */
AnnotationsPanel.prototype.setTarget = function(target, keepNewAnnotations) {
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
      var name = this.submittableAttributes[i];
      var isMainAttribute = this.attributes.indexOf(name) >= 0;
      if (modelInfo.hasOwnProperty(name)) {
        this.annotations.orig[name] = modelInfo[name];
        if (isMainAttribute) {
          this.setAnnotation(name, modelInfo[name], keepNewAnnotations);
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
        if (this.hideEmptyFields) {
          var field = this.attributesMap[name];
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
    this.annotations.update[fieldName] = update;
    // Update the UI
    this.showAttribute(fieldName, field, value, update);
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

AnnotationsPanel.prototype.initPanel = function () {
  for (var i = 0; i < this.displayAttributes.length; i++) {
    var name = this.displayAttributes[i];
    var field = this.attributesMap[name];
    if (field) {
      var fieldUi = this.__createAnnotationField(field);
      this.container.append(fieldUi);
    }
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
    var fieldLabel = $('<label></label>').text(fieldName).addClass('readonly');
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
    var fieldInput = $('<input/>').attr('id', 'anno_' + fieldName).attr('type', inputType);
    var fieldLabel = $('<label></label>').attr('for', 'anno_' + fieldName).text(fieldName);
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
      var fieldValues = $('<span></span>').attr('id', 'annolist_' + fieldName);
      fieldUi.append(fieldValues);
      fieldUi.append(fieldInput);
      // TODO: Make into add icon
      addButton = $('<input/>').attr('type', 'button').attr('value', 'Add');
      addButton.click(function () {
        var fieldValue = fieldInput.val().trim();
        if (fieldValue.length) {
          if (field.linker) {
            field.linker.linkLabel(fieldValue, function(err, linked) {
              if (linked) {
                scope.addLinkedAnnotation(fieldName, fieldValue, linked);
              }
            });
          } else {
            scope.addAnnotation(fieldName, fieldValue);
          }
        }
      });
      fieldUi.append(addButton);
    } else {
      fieldInput.change(function () {
        if (field.type === 'boolean') {
          scope.setAnnotation(fieldName, fieldInput.prop('checked'));
        } else {
          scope.setAnnotation(fieldName, fieldInput.val());
        }
      });
      fieldUi.append(fieldInput);
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

/**
 * Lookup attribute fields and populate our ui panel
 * @private
 */
AnnotationsPanel.prototype.lookupAttributeFields = function () {
  var saveFieldsCallback = function (err, data) {
    if (err) {
      console.error('Error looking up fields', err);
    } else if (data && data.fields) {
      var map = {};
      for (var i = 0; i < data.fields.length; i++) {
        var field = data.fields[i];
        map[field.name] = field;
        if (this.attributeInfos) {
          var info = this.attributeInfos[field.name];
          if (info) {
            _.merge(field, info);
          }
        }
      }
      this.attributesMap = map;
      this.displayAttributes = _.filter(this.__displayableAttributes, function(name) { return map.hasOwnProperty(name); });
      // Populate all attributes and isReadOnly flag
      for (var i = 0; i < this.attributes.length; i++) {
        var name = this.attributes[i];
        if (this.attributesMap.hasOwnProperty(name)) {
          this.attributesMap[name].isReadOnly = false;
        }
      }
      for (var i = 0; i < this.attributesReadOnly.length; i++) {
        var name = this.attributesReadOnly[i];
        if (this.attributesMap.hasOwnProperty(name)) {
          this.attributesMap[name].isReadOnly = true;
        }
      }
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
              console.error('Unknown field to link: ' + field);
            }
          }
        }
      }

      this.initPanel();
    }
  }.bind(this);
  this.searchController.lookupFields(Constants.models3dFieldsUrl, saveFieldsCallback);
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
        this.annotations['update'][name] = this.__computeFieldDelta(lf);
      }
    }
  }
};

AnnotationsPanel.prototype.preview = function () {
  this.__updateLinked();
  console.log(this.targetIds, this.annotations);
};

AnnotationsPanel.prototype.submit = function () {
  this.__updateLinked();
  var modelId = this.targetIds;
  if (modelId == undefined) {
    return;
  }
  var params = {
    modelId: modelId,
    // userId: (window.globals)? window.globals.userId : "unknown",
    updateMain: Constants.submitUpdateMain
  };
  var newAnno = this.annotations['new'];
  for (var i = 0; i < this.submittableAttributes.length; i++) {
    var name = this.submittableAttributes[i];
    if (newAnno.hasOwnProperty(name) && newAnno[name] !== undefined) {
      params[name] = newAnno[name];
    }
  }
  var data = params;
  var inputs = this.submitButtons;
  inputs.prop('disabled', true);
  $.ajax({
    type: 'POST',
    url: this.submitAnnotationsUrl,
    contentType: 'application/json;charset=utf-8',
    data: JSON.stringify(data),
    success: function (response, textStatus, jqXHR) {
      console.log('Annotations successfully submitted for ' + modelId + '!!!');
      this.saveNew();
      // Callback
      if (this.onSubmittedCallback) {
        this.onSubmittedCallback();
      }
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error submitting annotations for '  + modelId + '!!!');
    },
    complete: function () {
      // Re-enable inputs
      inputs.prop('disabled', false);
    }
  });
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
    return JSON.stringify(_.omit(linked.record, ['wnhyperlemmas', 'wnhypersynsets']), null, ' ');
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
  node.synset.wnhyperlemmas = node.ancestors? _.uniq(_.flatMap(node.ancestors, function(x) { return x.words; })) : undefined;
  node.synset.wnhypersynsets = node.ancestors? _.uniq(_.flatMap(node.ancestors, function(x) { return x[linkField]; })) : undefined;
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
