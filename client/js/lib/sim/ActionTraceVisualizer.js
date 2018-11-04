var Constants = require('Constants');
var Colors = require('util/Colors');
var MeshHelpers = require('geo/MeshHelpers');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Use to visualizes action trace files
 * @param opts
 * @param [opts.baseHeight] {float} Vertical height of trace (in virtual units).
 * @param [opts.subsampleBy] {float} Subsamples every n points (if specified)
 * @param [opts.lineWidth=0.10] {float} Line width of trace (in virtual units)
 * @param [opts.goalSize=0.10] {float} Goal size (for points, in virtual units)
 * @param [opts.showPath=true] {boolean} Whether to show trace path (in orange)
 * @param [opts.showForces=true] {boolean} Whether to show force lines (in red)
 * @param [opts.showOrientations=false] {boolean} Whether to show orientation lines (in blue)
 * @param [opts.showStartOrientation=false] {boolean} Whether to show start orientation (as view triangle in orange)
 * @param [opts.showEndOrientation=false] {boolean} Whether to show end orientation (as view triangle in orange)
 * @param [opts.fov=pi/4] {float} Field of view (in radians) to use for view triangle
 * @param [opts.agentRadius=0.25] {float} Agent radius (in meters) used as length of force, orientation lines.
 * @param [opts.colors] {Object} Map of name to color to use in visualization.
 * @constructor
 *  @memberOf sim
 */
function ActionTraceVisualizer(opts) {
  opts = opts || {};
  this.baseHeight = opts.baseHeight || 0;
  this.subsampleBy = opts.subsampleBy;
  this.lineWidth = opts.lineWidth || 0.10*Constants.metersToVirtualUnit;
  this.goalSize = opts.goalSize || 0.10*Constants.metersToVirtualUnit;
  this.showPath = (opts.showPath !== undefined)? opts.showPath : true;
  this.showForces = (opts.showForces !== undefined)? opts.showForces : true;
  this.showOrientations = (opts.showOrientations !== undefined)? opts.showOrientations : false;
  this.showStartOrientation = (opts.showStartOrientation !== undefined)? opts.showStartOrientation : false;
  this.showEndOrientation = (opts.showEndOrientation !== undefined)? opts.showEndOrientation : false;
  this.fov = opts.fov || THREE.Math.degToRad(45);
  this.agentRadius = opts.agentRadius || 0.25;
  this.colors = _.defaults(Object.create(null), opts.colors || {}, {
    orientations: 0x1f77b4,  // tableau blue
    forces: 0xd62728,  // tableau red
    start: 0x9467bd,  // tableau purple
    view: 0xffbb78,  // orange
    trace1: 0xffbb78, // orange
    trace2: 0xff7f0e  // orange
});
  this.colors = _.mapValues(this.colors, function(c) { return Object3DUtil.getColor(c); });
}

function atSamePosition(a,b) {
  return a.px === b.px /*&& a.py === b.py */&& a.pz === b.pz;
}

ActionTraceVisualizer.prototype.__getLineMaterial = function(color) {
  if (!this.__materialCache) {
    this.__materialCache = {};
  }
  color = Object3DUtil.getColor(color);
  var key = color.getHexString();
  if (this.__materialCache[key]) {
    return this.__materialCache[key];
  } else {
    var material = new THREE.LineBasicMaterial({ color: color });
    this.__materialCache[key] = material;
    return material;
  }
};

ActionTraceVisualizer.prototype.__createTrace = function(sceneState, trace, opts) {
  var scaleBy = Constants.metersToVirtualUnit;
  var lineWidth = this.lineWidth;
  var subsampleBy = this.subsampleBy;
  var goalSize = this.goalSize;

  var traceNode = new THREE.Group();

  var goals = _.filter(trace, function(d) { return d.actions === 'goal'; } );
  var steps = _.filter(trace, function(d) { return d.actions !== 'goal'; } );
  var allSteps = steps;
  if (opts.maxSteps) {
    steps = steps.slice(0, opts.maxSteps); // Limit number of steps
  }

  // Process goals
  var colors = opts.colors;
  var color;
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    var colorKey;
    g.position = new THREE.Vector3(g.px*scaleBy, g.py*scaleBy, g.pz*scaleBy);
    if (g.actionArgs) {
      // Try to get object
      g.object3D = sceneState.findNodeById(g.actionArgs);
      if (g.object3D) {
        g.bbox = Object3DUtil.getBoundingBox(g.object3D);
      }
      colorKey = g.actionArgs;
    } else {
      colorKey = g.px.toFixed(4) + '-' + g.py.toFixed(4) + '-' + g.pz.toFixed(4);
    }
    if (color == undefined) {
      color = colors[colorKey];
      if (color == undefined) {
        var c = Object3DUtil.createColor(_.size(colors) + 1);  //, Colors.palettes.d3_category18);
        colors[colorKey] = c;
        color = c;
      }
    }
    if (g.bbox) {
      var box = new MeshHelpers.BoxMinMax(g.bbox.min, g.bbox.max, color);
      box.name = 'Goal' + i;
      traceNode.add(box);
    } else {
      var ball = Object3DUtil.makeBall(g.position, goalSize, color);
      ball.name = 'Goal' + i;
      traceNode.add(ball);
    }
  }

  // Visualize steps
  if (subsampleBy) {
    steps = steps.filter(function (p, i) {
      return i % subsampleBy === 0;
    });
  }
  var points = [];
  var prevStep = null;
  var prevPoint = null;
  var orientations = [];
  var forces = [];
  var dist = this.agentRadius*Constants.metersToVirtualUnit;
  var dfy = 0.15*Constants.metersToVirtualUnit;
  var startTheta = 0;
  var endTheta = Math.PI*2;
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!prevStep || !atSamePosition(step, prevStep)) {
      prevStep = step;
      prevPoint = new THREE.Vector3(step.px*scaleBy, step.py*scaleBy, step.pz*scaleBy);
      if (this.baseHeight) {
        prevPoint.y = this.baseHeight;
      }
      prevPoint.ticks = 1;
      points.push(prevPoint);
    } else {
      prevPoint.ticks++;
    }
    if (opts.showOrientations) {
      orientations[i] = [prevPoint.clone(), new THREE.Vector3(prevPoint.x + dist * Math.sin(step.rotation + Math.PI), prevPoint.y, prevPoint.z + dist * Math.cos(step.rotation + Math.PI))];
    }
    if (opts.showForces && step.forces) {
      var dTheta = (endTheta - startTheta)/step.forces.length;
      var theta = step.rotation + startTheta;
      for (var j = 0; j < step.forces.length; j++) {
        var f = step.forces[j];
        if (f) {
          //console.log('showForces', j, theta, f, Math.sin(theta), Math.cos(theta), f*dist*Math.sin(theta), f*dist*Math.cos(theta));
          var p = prevPoint.clone();
          p.y += dfy;
          forces.push([
            p,
            new THREE.Vector3(prevPoint.x + f*dist*Math.sin(theta), p.y, prevPoint.z + f*dist*Math.cos(theta))
          ]);
        }
        theta += dTheta;
      }
    }
  }
  var totalSteps = allSteps.length;
  var totalWeight = 0;
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    p.weight = p.ticks/totalSteps;
    totalWeight += p.weight;
    p.totalWeight = totalWeight;
  }

  if (opts.showPath) {
    // var colorhsl = color.getHSL();
    // var color1 = color.clone();
    // color1.setHSL(colorhsl.h, colorhsl.s, 0.15);
    var color1 = this.colors['trace1'];
    var color2 = this.colors['trace2'];
    var fatlines = new MeshHelpers.FatLines(points, lineWidth, [color1, color2], {
      getWeight: function (iGroup, iPoint) {
        var p = points[iPoint];
        return p.totalWeight;
      }
    });

    traceNode.add(fatlines);
  }

  function makeViewCone(position, angle, fov, size, material) {
    var geometry = new THREE.Geometry();
    var a1 = angle - fov + Math.PI;
    var a2 = angle + fov + Math.PI;
    var d = 0;  // 0.13*Constants.metersToVirtualUnit;
    geometry.vertices[0] = position.clone();
    geometry.vertices[1] = new THREE.Vector3(position.x + size*Math.sin(a1), position.y + d, position.z + size*Math.cos(a1));
    geometry.vertices[2] = new THREE.Vector3(position.x + size*Math.sin(a2), position.y + d, position.z + size*Math.cos(a2));

    var face = new THREE.Face3(0, 1, 2);
    var normal = new THREE.Vector3(0, 1, 0);
    face.normal.copy( normal );
    face.vertexNormals.push( normal.clone(), normal.clone(), normal.clone() );
    geometry.faces.push( face );
    return new THREE.Mesh(geometry, material);
  }

  var viewConeMat = Object3DUtil.getBasicMaterial(this.colors['view'], 1);
  if (opts.showStartOrientation) {
    var triangle = makeViewCone(points[0], steps[0].rotation, this.fov, 2*dist, viewConeMat);
    triangle.name = 'startOrientation';
    traceNode.add(triangle);
  }
  if (opts.showEndOrientation) {
    var triangle = makeViewCone(points[points.length-1], steps[steps.length-1].rotation, this.fov, 2*dist, viewConeMat);
    triangle.name = 'endOrientation';
    traceNode.add(triangle);
  }

  if (orientations.length > 0) {
    var orientationLines = new MeshHelpers.Lines(orientations, this.__getLineMaterial(this.colors['orientations']));
    //orientationLines.material.depthTest = false;
    //orientationLines.material.depthWrite = false;
    orientationLines.name = 'orientations';
    traceNode.add(orientationLines);
  }
  if (forces.length > 0) {
    //console.log('forces', forces);
    var forceLines = new MeshHelpers.FatLines(forces, 0.03 * Constants.metersToVirtualUnit,
      this.__getLineMaterial(this.colors['forces']));
    //forceLines.material.depthTest = false;
    //forceLines.material.depthWrite = false;
    forceLines.name = 'forces';
    traceNode.add(forceLines);
  }
  return traceNode;
};

ActionTraceVisualizer.prototype.__createTraces = function(sceneState, traceGroup, opts) {
  var sceneId = sceneState.getFullID();
  var records = sceneId? traceGroup.filter(function(r) {
    return r.sceneId === sceneId;
  }) : traceGroup;
  if (records.length > 0) {
    var traces = _.groupBy(records, function(rec) {
      return rec.episode;
    });
    var scope = this;
    var traceNode = new THREE.Group();
    _.forEach(traces, function(trace, i) {
      var trace = scope.__createTrace(sceneState, trace, opts);
      trace.name = 'Trace' + i;
      traceNode.add(trace);
    });
    return traceNode;
  } else {
    console.log('No traces for scene ' + sceneId);
  }
};

ActionTraceVisualizer.prototype.visualize = function(sceneState, traceGroups, opts) {
  opts = opts || {};
  this.clear(sceneState.debugNode);
  var traceNode = new THREE.Group();
  traceNode.name = 'ActionTraceNode';
  for (var i = 0; i < traceGroups.length; i++) {
    var traces = this.__createTraces(sceneState, traceGroups[i],
      _.defaults({ group: i, colors: {} }, opts,
        _.pick(this, ['showForces', 'showOrientation', 'showPath', 'showStartOrientation', 'showEndOrientation']))
    );
    if (traces) {
      traces.name = 'TraceGroup' + i;
      traceNode.add(traces);
    }
  }
  sceneState.debugNode.add(traceNode);
  // Make sure debugNode is visible
  Object3DUtil.setVisible(sceneState.debugNode, true);
};

ActionTraceVisualizer.prototype.clear = function(node) {
  Object3DUtil.removeNodes(node, function(x) { return x.name === 'ActionTraceNode'; });
};

module.exports = ActionTraceVisualizer;