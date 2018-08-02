'use strict';

var Object3DUtil = require('geo/Object3DUtil');
var Constants = require('Constants');

function AlignPanel(params) {
  this.rotateXDeg = 90;
  this.rotateZDeg = 90;
  this.submitAlignmentUrl = Constants.baseUrl + '/submitAlignment';
  this.transformControls = null;
  this._useTransformControls = false;

  if (params) {
    this.container = params.container;

    // Application callback indicating alignment submitted
    this.onAlignSubmittedCallback = params.onAlignSubmittedCallback;

    // Application callback fetching next target to align
    this.nextTargetCallback = params.nextTargetCallback;

    // Application callback to add transform controls to the scene
    this.addControlCallback = params.addControlCallback;

    // Application that the align panel is part of
    this.app = params.app;
  }
  this.init();
}

Object.defineProperty(AlignPanel.prototype, 'useTransformControls', {
  get: function () {return this._useTransformControls; },
  set: function (v) {
    this._useTransformControls = v;
    if (v) {
      this.__ensureTransformControls();
      var target = this.target;
      if (target) {
        if (!target.modelBaseObject3D) {
          target.ensureNormalizedModelCoordinateFrame();
          target.setAttachmentPoint({position: new THREE.Vector3(0.5, 0.5, 0.5), coordFrame: 'childBB'});
        }
      }
      this.transformControls.attach(target.object3D);
    } else {
      if (this.transformControls) {
        this.transformControls.detach();
      }
    }
  }
});

AlignPanel.prototype.setTarget = function (target) {
  this.target = target;
  this.useTransformControls = this.useTransformControls; // Make sure transform controls are updated with the target
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.init = function () {
  this.__createSlider($('#sliderRotateX'), $('#rotateX'), this.rotateXDeg,
    function (value) {
      this.rotateXDeg = value;
      this.rotateX = Math.PI * this.rotateXDeg / 180.0;
    }.bind(this)
  );
  this.__createSlider($('#sliderRotateZ'), $('#rotateZ'), this.rotateZDeg,
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

  $(document).keydown(this.__keyHandler.bind(this));
};

AlignPanel.prototype.__createSlider = function (sliderElem, textElem, initialValue, callback) {
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

AlignPanel.prototype.__ensureTransformControls = function() {
  if (!this.transformControls) {
    var scope = this;
    this.transformControls = new THREE.TransformControls(this.app.cameraControls.camera, this.app.renderer.domElement);
    this.transformControls.setMode('rotate');
    this.transformControls.addEventListener('change', function() {
      if (scope.target) {
        scope.updateUpFrontAxes(scope.target);
      };
      scope.app.render();
    });
    scope.addControlCallback(this.transformControls);
  }
};

AlignPanel.prototype.redisplay = function() {
  if (this.transformControls) {
    this.transformControls.update();
  }
};

AlignPanel.prototype.__keyHandler = function (event) {
  if (event.target.type && (event.target.type === 'text')) { return; }

  // Handle keys for transform controls
  switch (event.which) {
    case 74: // 'J'
      if (event.shiftKey) {
        this.useTransformControls = !this.useTransformControls;
        return false;
      }
      break;

    case 17: // Ctrl
      if (this.transformControls) {
        this.transformControls.setRotationSnap(THREE.Math.degToRad(15));
        return false;
      }
      break;
  }

  // Handle arrow keys for rotation
  var target = this.target;
  if (!target) { return; }

  var mult = ((event.shiftKey) ? 0.5 : 1.0);

  switch (event.which) {
    case 37: // left
      target.rotateAboutAxis(new THREE.Vector3(0, 1, 0), -this.rotateZ * mult);
      break;
    case 38: // up
      target.rotateAboutAxis(new THREE.Vector3(1, 0, 0), +this.rotateX * mult);
      break;
    case 39: // right
      target.rotateAboutAxis(new THREE.Vector3(0, 1, 0), +this.rotateZ * mult);
      break;
    case 40: // down
      target.rotateAboutAxis(new THREE.Vector3(1, 0, 0), -this.rotateX * mult);
      break;
    default:
      break;
  }

  // Compute up/front for display
  this.updateUpFrontAxes(target);
};

AlignPanel.prototype.updateUpFrontAxes = function (target) {
  var upFront = target.getUpFrontAxes(Constants.worldUp, Constants.worldFront, 0.0000001);
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
