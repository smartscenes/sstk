'use strict';

var Slider = require('bootstrap-slider');

function createGlyphIconButton(name) {
  return $('<button></button>')
    .attr('class', 'btn btn-default')
    .append($('<i></i>').attr('class', 'glyphicon ' + name));
}

var ConstraintGui = function (params) {
  // Schema
  this.schema = params.schema;
  // Jquery dom
  this.jdom = null;
  // Input elements
  this.field = null;
  this.input = null;
  this.slider = null;

  this._create(params);
  // private members
  this.__onRemove = undefined;
};

// Save the function as a callback for changes to this constraint
ConstraintGui.prototype.onRemove = function (fnc) {
  this.__onRemove = fnc;
  return this;
};

ConstraintGui.prototype.getConstraint = function () {
  if (this.field && this.input) {
    var value = this.__getValue();
    if (value != undefined) {
      var queryString = this.__getQueryString(this.field, value);
      return { field: this.field, value: value, queryString: queryString };
    }
  }
};

ConstraintGui.prototype.__getQueryString = function (field, value) {
  var inputType = field.type;
  var fieldname = this.schema.getQueryField(field.name);
  // TODO: escaping
  if (inputType === 'categorical') {
    return fieldname + ':' + value;
  } else if (inputType === 'numeric') {
    return fieldname + ':[' + value[0] + ' TO ' + value[1] + ']';
  } else if (inputType === 'boolean') {
    if (value) {
      return fieldname + ':true';
    } else {
      return '!' + fieldname + ':true';
    }
  }
};

ConstraintGui.prototype.__getValue = function () {
  var inputType = this.field.type;
  if (inputType === 'categorical') {
    var s = this.input.val().trim();
    if (s !== '') return s;
  } else if (inputType === 'numeric') {
    return this.slider.getValue();
  } else if (inputType === 'boolean') {
    return this.input.prop('checked');
  }
};

ConstraintGui.prototype._create = function (params) {
  var $constraint = params.elem || $('<div class="queryDiv input-group"></div>');
  this.jdom = $constraint;
  var scope = this;

  if (params.allowRemove) {
    //add close button
    var closeButton = createGlyphIconButton('glyphicon-remove').css('vertical-align', 'top');

    $constraint.append(closeButton);
    closeButton.click(function () {
      $constraint.remove();
      if (scope.__onRemove) {
        scope.__onRemove(this);
      }
    });
  }

  var $select = $('<select></select>').addClass('selectAttribute');
  if (!params.field) {
    $select.append($('<option>Pick an Attribute</option>'));
    // add attributes to options
    var attributes = scope.schema.getFieldNames();
    attributes.forEach(function (attribute) {
      $select.append(scope._createFieldOption(attribute));
    });
  } else {
    $select.append(scope._createFieldOption(params.field));
  }

  $constraint.append($select);
  $constraint.append($('<div></div>').addClass('constraintDetails'));

  if (!params.field) {
    $select.selectmenu({
      change: function () {
        return scope._expandValueSelection($constraint);
      }
    });
  } else {
    $select.selectmenu({});
    scope._expandValueSelection($constraint, params.values);
  }

  return $constraint;
};

ConstraintGui.prototype._addAutoComplete = function (input, name, values) {
  input.autocomplete({
    source: values,
    minLength: 0
  });
};

ConstraintGui.prototype._createFieldOption = function (fieldname) {
  return $('<option>').attr('value', fieldname).text(this.schema.getDisplayText(fieldname));
};

ConstraintGui.prototype._expandValueSelection = function ($constraint, values) {
  var $select = $constraint.find('.selectAttribute');
  var attribute = $select.val();
  var field = this.schema.getField(attribute);
  var $constraintDetails = $constraint.find('.constraintDetails');

  //reset details pane
  $constraintDetails.empty();

  this.input = null;
  this.field = field;

  if (!field) {
    console.log('Cannot find field: ' + attribute);
    return;
  }

  var inputType = field.type;
  if (inputType === 'categorical') {
    var $inputElem = $('<input type="text" class="form-control"/>');
    $constraintDetails.append($inputElem);
    if (!values) { values = field.values; }
    if (values) {
      this._addAutoComplete($inputElem, field.label, values);
    }
    this.input = $inputElem;
  } else if (inputType === 'numeric') {
    $constraintDetails.css('padding-left', '10px');
    // Use a range slider (taking min/max from the field definitions)
    // Give id because we have trouble hooking the bootstrap-slider to jquery components
    var sliderId = $constraint.attr('id') + '-slider';
    var rangeSlider = $('<input type="text" class="slider"/>').attr('id', sliderId).css('width', '120px');
    var stats = field.stats || {};
    var min = (field.min != undefined) ? field.min : stats.min;
    var max = (field.max != undefined) ? field.max : stats.max;

    var minElem = $('<b></b>').text(min);
    var maxElem = $('<b></b>').text(max);

    $constraintDetails.append($('<span></span>')
      .append(minElem)
      .append(' to ')
      .append(maxElem).css('white-space', 'nowrap'))
      .append(rangeSlider);

    var slider = new Slider('#' + sliderId, {
      range: true,
      min: min,
      max: max,
      step: (max - min) > 3? 1 : (max - min)/10,
      value: [min, max],
      scale: (max - min) > 1000? 'logarithmic' : 'linear',
      tooltip: 'hide'
    });
    slider.on('change', function (obj) {
      minElem.text(obj.newValue[0]);
      maxElem.text(obj.newValue[1]);
    });
    this.input = rangeSlider;
    this.slider = slider;

  } else if (inputType === 'boolean') {
    //add a checkbox
    var checkbox = $('<input type="checkbox" class="form-control">');
    $constraintDetails.append(checkbox);
    this.input = checkbox;
  }
};

function DataConstraintsGui(params) {
  this.container = params.container;
  this.schema = params.schema;
  this.constraints = [];
  this.init();
}

DataConstraintsGui.prototype.init = function () {
  this.addButton = createGlyphIconButton('glyphicon-plus');
  this.addButton.attr('title', 'Add a filter');
  this.container.append(this.addButton);

  this._constraintId = 0;

  //this.__addConstraint({ allowRemove: true, field: 'datasets',
  //  values: ['ShapeNetCore', 'ShapeNetSem'] });

  this.addButton.click(this.__addConstraint.bind(this, { allowRemove: true }));
};

DataConstraintsGui.prototype.__addConstraint = function (params) {
  var $constraint = $('<div class="queryDiv input-group"></div>')
    .attr('id', 'queryDiv' + this._constraintId++);
  this.addButton.before($constraint);
  params.elem = $constraint;
  params.schema = this.schema;
  var constraint = new ConstraintGui(params);
  constraint.onRemove(this.__removeConstraintGui.bind(this));
  this.constraints.push(constraint);
  return constraint;
};

DataConstraintsGui.prototype.__removeConstraintGui = function (constraintGui) {
  var i = this.constraints.indexOf(constraintGui);
  if (i >= 0) {
    this.constraints.splice(i, 1);
  }
};

DataConstraintsGui.prototype.getConstraints = function () {
  var filtered = [];
  for (var i = 0; i < this.constraints.length; i++) {
    var constraint = this.constraints[i];
    // Only include constraints with values
    var c = constraint.getConstraint();
    if (c != undefined) {
      filtered.push(c);
    }
  }

  return filtered;
};

DataConstraintsGui.prototype.getQueryString = function () {
  var constraints = this.getConstraints();
  var queryString = '';

  if (constraints.length > 0) {
    queryString = constraints.map( function(x) { return x.queryString; }).join(' AND ');
  } else {
    showAlert('No query specified.  Please specify a query', 'alert-warning');
    // TODO: Search all
    //queryString = "*:*";
  }

  return queryString;
};

DataConstraintsGui.prototype.getFilterString = function () {
  var constraints = this.getConstraints();
  var filterString = constraints.map( function(x) {
    return '+' + x.queryString;
  }).join(' ');
  return filterString;
};

module.exports = DataConstraintsGui;
