'use strict';

var Object3DUtil = require('geo/Object3DUtil');
var Constants = require('Constants');

function AlignPanel(params) {
  this.rotateXDeg = 90;
  this.rotateZDeg = 90;
  this.submitAlignmentUrl = Constants.baseUrl + '/submitAlignment';

  if (params) {
    this.container = params.container;

    // Application callback indicating alignment submitted
    this.onAlignSubmittedCallback = params.onAlignSubmittedCallback;

    // Application callback fetching next target to align
    this.nextTargetCallback = params.nextTargetCallback;
  }
  this.init();
}

AlignPanel.prototype.setTarget = function (target) {
  this.target = target;
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.init = function () {
  this.createSlider($('#sliderRotateX'), $('#rotateX'), this.rotateXDeg,
    function (value) {
      this.rotateXDeg = value;
      this.rotateX = Math.PI * this.rotateXDeg / 180.0;
    }.bind(this)
  );
  this.createSlider($('#sliderRotateZ'), $('#rotateZ'), this.rotateZDeg,
    function (value) {
      this.rotateZDeg = value;
      this.rotateZ = Math.PI * this.rotateZDeg / 180.0;
    }.bind(this)
  );
  // Hook up submit button
  this.submitButton = $('#submitAlignment');
  this.submitButton.click(this.submit.bind(this));
  // Hook up reset button
  this.resetButton = $('#resetAlignment');
  this.resetButton.click(this.reset.bind(this));
  // Hook up clear button
  this.clearButton = $('#clearAlignment');
  this.clearButton.click(this.clear.bind(this));
  // Hook up next button
  this.nextButton = $('#alignNext');
  this.nextButton.click(this.next.bind(this));
  this.submitButtons = $().add(this.submitButton).add(this.resetButton).add(this.nextButton);

  // Elements to display up/front
  this.alignUpText = $('#alignUp');
  this.alignFrontText = $('#alignFront');

  $(document).keydown(this.arrowKeyHandler.bind(this));
};

AlignPanel.prototype.createSlider = function (sliderElem, textElem, initialValue, callback) {
  sliderElem.slider({
    orientation: 'horizontal',
    range: 'min',
    min: 0,
    max: 90,
    value: initialValue,
    slide: function (event, ui) {
      textElem.val(ui.value);
      callback(ui.value);
    }.bind(this)
  });
  textElem.change(function (event) {
    var value = textElem.val();
    if (sliderElem.value !== value) {
      sliderElem.slider('value', value);
      callback(value);
    }
  });
  sliderElem.find('.ui-slider-handle').unbind('keydown');
  callback(initialValue);
};

AlignPanel.prototype.arrowKeyHandler = function (event) {
  if (event.target.type && (event.target.type === 'text')) { return; }
  var target = this.target;
  if (!target) { return; }

  var mult = ((event.shiftKey) ? 0.5 : 1.0);

  switch (event.which) {
    case 37: // left
      target.rotate(new THREE.Vector3(0, -this.rotateZ * mult, 0));
      break;
    case 38: // up
      target.rotate(new THREE.Vector3(+this.rotateX * mult, 0, 0));
      break;
    case 39: // right
      target.rotate(new THREE.Vector3(0, +this.rotateZ * mult, 0));
      break;
    case 40: // down
      target.rotate(new THREE.Vector3(-this.rotateX * mult, 0, 0));
      break;
    default:
      break;
  }

  // Compute up/front for display
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.updateUpFrontAxes = function (target) {
  var upFront = target.getUpFrontAxes(Constants.worldUp, Constants.worldFront);
  this.targetUp = Object3DUtil.vectorToString(upFront.up);
  this.targetFront = Object3DUtil.vectorToString(upFront.front);
  this.alignUpText.text(this.targetUp);
  this.alignFrontText.text(this.targetFront);
};

AlignPanel.prototype.next = function () {
  if (this.nextTargetCallback) {
    this.nextTargetCallback();
  }
};

AlignPanel.prototype.reset = function () {
  var target = this.target;
  if (!target) { return; }

  target.clearRotation(false);
  // Compute up/front for display
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.clear = function () {
  var target = this.target;
  if (!target) { return; }

  target.clearRotation(true);
  // Compute up/front for display
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.submit = function () {
  var target = this.target;
  if (!target) { return; }

  // Resize everything to meters for backend storage
  var modelId = target.model.getFullID();
  var params = {
    modelId: modelId,
    up: this.targetUp,
    front: this.targetFront,
    // userId: (window.globals)? window.globals.userId : "unknown",
    updateMain: Constants.submitUpdateMain
  };
  if (!target.model.isIndexed()) {
    params.updateSourceId = true;
  }
  var alignData = jQuery.param(params);
  var inputs = this.submitButtons;
  inputs.prop('disabled', true);
  $.ajax({
    type: 'POST',
    url: this.submitAlignmentUrl,
    data: alignData,
    success: function (response, textStatus, jqXHR) {
      console.log('Align successfully submitted for ' + modelId + '!!!');
      // Refresh to next model
      if (this.onAlignSubmittedCallback) {
        this.onAlignSubmittedCallback();
      }
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error submitting alignment for ' + modelId + '!!!');
    },
    complete: function () {
      // Re-enable inputs
      inputs.prop('disabled', false);
    }
  });
};

module.exports = AlignPanel;
