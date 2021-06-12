'use strict';

require('gl-matrix');

function CameraControlsPanel(params) {
  this.app = params.app;
  this.container = params.container;
  this.controls = params.controls;
  this.iconsPath = params.iconsPath;
  this.cameraWidgetSettings = params.cameraWidgetSettings;

  /** Set up the controls **/

  // Main camera button
  this.container.append(this.makeCameraButton(this.iconsPath));

  // Control panel
  var controlPanel = $('<div></div>').attr('id', 'cameraControlPanel');
  this.container.append(controlPanel);

  // Orbit control
  controlPanel.append(this.makeOrbitControl(this.iconsPath, this.cameraWidgetSettings));

  // Move control
  controlPanel.append(this.makeMoveControl(this.iconsPath, this.cameraWidgetSettings));

  // Zoom control
  controlPanel.append(this.makeZoomControl(this.iconsPath, this.cameraWidgetSettings));

  // Home button
  controlPanel.append(this.makeHomeButton(this.iconsPath));

  // Initially hide the controls
  controlPanel.hide();
}

CameraControlsPanel.prototype.setControls = function(controls) {
  this.controls = controls;
};

function NoDrag(event) {
  event.preventDefault();
}

CameraControlsPanel.prototype.makeImageButtonHighlightCorrectly = function (button, iconURL) {
  // Change the icon color when the button is active
  button.mousedown(function (event) {
    button.attr('src', iconURL + '_active.png');
    var mouseup = function (event) {
      button.attr('src', iconURL + '_normal.png');
      $(document).unbind('mouseup', mouseup);
    };
    $(document).mouseup(mouseup);
  });
};

CameraControlsPanel.prototype.makeCameraButton = function (iconsPath) {
  var iconURL = iconsPath + 'camera';
  var showTooltip = 'Show camera controls';
  var hideTooltip = 'Hide camera controls';
  var button = $('<img/>')
    .attr('src', iconURL + '_normal.png')
    .attr('id', 'cameraButton')
    .attr('title', showTooltip)
    .addClass('cameraControlsButton')
    .bind('dragstart', NoDrag)
    .click(function (event) {
      var controlPanel = $('#cameraControlPanel');
      if (controlPanel.is(':visible')) {
        controlPanel.hide();
        button.attr('title', showTooltip);
      } else {
        controlPanel.show();
        button.attr('title', hideTooltip);
      }
    });
  this.makeImageButtonHighlightCorrectly(button, iconURL);
  return button;
};

CameraControlsPanel.prototype.hookupRotateKeys = function(opts) {
  opts = opts || {};
  var keymap = require('controls/keymap');
  keymap({ on: opts.left || 'left' },  this.orbitControls.left);
  keymap({ on: opts.right || 'right' }, this.orbitControls.right);
  keymap({ on: opts.up || 'up' },    this.orbitControls.up);
  keymap({ on: opts.down ||'down' },  this.orbitControls.down);
};

CameraControlsPanel.prototype.makeOrbitControl = function (iconsPath, cameraWidgetSettings) {
  var scope = this;
  this.orbitControls =
    {
      'left': function (event) {
        scope.animate(0, -cameraWidgetSettings.orbitLeftAmt, cameraWidgetSettings.orbitDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.rotateLeft(prevVal - currVal);
          });
      },
      'right': function (event) {
        scope.animate(0, cameraWidgetSettings.orbitLeftAmt, cameraWidgetSettings.orbitDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.rotateLeft(prevVal - currVal);
          });
      },
      'up': function (event) {
        scope.animate(0, cameraWidgetSettings.orbitUpAmt, cameraWidgetSettings.orbitDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.rotateUp(currVal - prevVal);
          });
      },
      'down': function (event) {
        scope.animate(0, -cameraWidgetSettings.orbitUpAmt, cameraWidgetSettings.orbitDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.rotateUp(currVal - prevVal);
          });
      }
    };
  return this.makeDpadControl('orbitControl', iconsPath + 'orbit.png', 'Orbit camera (Right mouse drag)', this.orbitControls);
};

CameraControlsPanel.prototype.makeMoveControl = function (iconsPath, cameraWidgetSettings) {
  var scope = this;
  this.moveControls =
    {
      'left': function (event) {
        scope.animate(0, cameraWidgetSettings.dollyAmt, cameraWidgetSettings.dollyDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.panLeft(currVal - prevVal);
          });
      },
      'right': function (event) {
        scope.animate(0, -cameraWidgetSettings.dollyAmt, cameraWidgetSettings.dollyDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.panLeft(currVal - prevVal);
          });
      },
      'up': function (event) {
        scope.animate(0, cameraWidgetSettings.dollyAmt, cameraWidgetSettings.dollyDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.panUp(currVal - prevVal);
          });
      },
      'down': function (event) {
        scope.animate(0, -cameraWidgetSettings.dollyAmt, cameraWidgetSettings.dollyDuration, quadraticEaseInOutScalarInterpolator,
          function (prevVal, currVal) {
            scope.controls.panUp(currVal - prevVal);
          });
      }
    };
  return this.makeDpadControl('moveControl', iconsPath + 'move.png', 'Dolly camera (Middle mouse drag)', this.moveControls);
};

CameraControlsPanel.prototype.makeDpadControl = function (id, iconUrl, tooltip, callbacks) {
  var container = $('<div></div>')
    .attr('id', id)
    .addClass('dpadContainer');

  // Icon
  container.append(
    $('<div></div>')
      .addClass('dpadIconHolder')
      .append(
        $('<img/>')
          .attr('src', iconUrl)
          .attr('id', id + 'Icon')
          .attr('title', tooltip)
          .addClass('dpadIcon')
          .bind('dragstart', NoDrag)
      )
  );

  // Left button
  container.append(
    $('<div>\u25C4</div>')
      .attr('id', id + 'LeftButton')
      .addClass('cameraControlsButton')
      .addClass('dpadButton')
      .addClass('dpadLeftButton')
      .click(callbacks && callbacks.left)
  );

  // Right button
  container.append(
    $('<div>\u25BA</div>')
      .attr('id', id + 'RightButton')
      .addClass('cameraControlsButton')
      .addClass('dpadButton')
      .addClass('dpadRightButton')
      .click(callbacks && callbacks.right)
  );

  // Up button
  container.append(
    $('<div>\u25B2</div>')
      .attr('id', id + 'UpButton')
      .addClass('cameraControlsButton')
      .addClass('dpadButton')
      .addClass('dpadUpButton')
      .click(callbacks && callbacks.up)
  );

  // Down button
  container.append(
    $('<div>\u25BC</div>')
      .attr('id', id + 'DownButton')
      .addClass('cameraControlsButton')
      .addClass('dpadButton')
      .addClass('dpadDownButton')
      .click(callbacks && callbacks.down)
  );

  return container;
};

CameraControlsPanel.prototype.makeZoomControl = function (iconsPath, cameraWidgetSettings) {
  var container = $('<div></div>').attr('id', 'zoomControl');
  var scope = this;

  // Icon
  container.append(
    $('<div></div>')
      .addClass('zoomIconHolder')
      .append(
        $('<img/>')
          .attr('src', iconsPath + 'zoom.png')
          .attr('id', 'zoomIcon')
          .attr('title', 'Zoom camera (Mouse wheel)')
          .bind('dragstart', NoDrag)
      )
  );

  this.zoomControls = {
    'out': function (event) {
      scope.animate(0, cameraWidgetSettings.zoomAmt, cameraWidgetSettings.zoomDuration, quadraticEaseInOutScalarInterpolator,
        function (prevVal, currVal) {
          scope.controls.dollyOut(1.01);//TODO: apply interpolation
        });
    },
    'in': function (event) {
      scope.animate(0, cameraWidgetSettings.zoomAmt, cameraWidgetSettings.zoomDuration, quadraticEaseInOutScalarInterpolator,
        function (prevVal, currVal) {
          scope.controls.dollyIn(1.01);//TODO: apply interpolation
        });
    }
  };

  // Minus button
  container.append(
    $('<div>-</div>')
      .attr('id', 'zoomMinusButton')
      .addClass('cameraControlsButton')
      .addClass('zoomButton')
      .click( this.zoomControls.out )
  );

  // Plus button
  container.append(
    $('<div>+</div>')
      .attr('id', 'zoomPlusButton')
      .addClass('cameraControlsButton')
      .addClass('zoomButton')
      .click( this.zoomControls.in )
  );

  return container;
};

CameraControlsPanel.prototype.makeHomeButton = function (iconsPath) {
  var iconURL = iconsPath + 'home';
  var scope = this;
  var button = $('<img/>')
    .attr('src', iconURL + '_normal.png')
    .attr('id', 'homeButton')
    .attr('title', 'Reset camera')
    .addClass('cameraControlsButton')
    .bind('dragstart', NoDrag)
    .click(function (event) {
      //app.camera.ResetSavedState();
      //app.renderer.UpdateView();
      scope.controls.resetCamera();
    });
  this.makeImageButtonHighlightCorrectly(button, iconURL);
  return button;
};

/**
 * startVal: value to start the animation at
 * endVal: value to end the animation at
 * duration: how long (in milliseconds) the animation should last
 * interpolator: function(start, end, t) that interpolates the start and end
 *    values given a percentage of duration elapsed thus far
 * valueHandler: function(prevVal, currVal) that processes the difference in value
 *    that accumulates over a time step. This function generates the state
 *    changes that cause visual changes (i.e. changing camera state)
 **/
CameraControlsPanel.prototype.animate = function (startVal, endVal, duration, interpolator, valueHandler) {
  var startTime = Date.now();
  var prevVal = interpolator(0, startVal, endVal);

  function animStep() {
    var currTime = Date.now();
    var t = (currTime - startTime) / duration;
    var last = t > 1;
    if (last)
      t = 1;
    var currVal = interpolator(t, startVal, endVal);
    valueHandler(prevVal, currVal);
    prevVal = currVal;
    if (!last) {
      window.requestAnimationFrame(animStep);
    }
  }

  window.requestAnimationFrame(animStep);
};

// Adapted from http://gizma.com/easing/
function quadraticEaseInOutScalarInterpolator(t, start, end) {
  var b = start;
  var c = end - start;
  var d = 1.0;
  t /= d / 2;
  if (t < 1) return c / 2 * t * t + b;
  t--;
  return -c / 2 * (t * (t - 2) - 1) + b;
}

function quadraticEaseInOutVec3Interpolator(t, start, end) {
  /* globals vec3 */
  var b = start;
  var c = vec3.create();
  vec3.subtract(end, start, c);
  var d = 1.0;
  t /= d / 2;
  var tmp = vec3.create();
  if (t < 1) {
    vec3.scale(c, t * t / 2, tmp);
    vec3.add(tmp, b, tmp);
  } else {
    t--;
    vec3.scale(c, -(t * (t - 2) - 1) / 2, tmp);
    vec3.add(tmp, b, tmp);
  }
  return tmp;
}

function quadraticEaseInOutCameraStateInterpolator(t, start, end) {
  var result = {};
  result.eyePos = quadraticEaseInOutVec3Interpolator(t, start.eyePos, end.eyePos);
  result.lookAtPoint = quadraticEaseInOutVec3Interpolator(t, start.lookAtPoint, end.lookAtPoint);
  result.pitch = quadraticEaseInOutScalarInterpolator(t, start.pitch, end.pitch);
  result.yaw = quadraticEaseInOutScalarInterpolator(t, start.yaw, end.yaw);
  return result;
}

// Exports
module.exports = CameraControlsPanel;
