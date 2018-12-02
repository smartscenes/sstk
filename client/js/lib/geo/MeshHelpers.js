'use strict';

var Constants = require('Constants');
var Colors = require('util/Colors');
var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var OBB = require('geo/OBB');

function lineWidthToUnit(lineWidth) {
  return lineWidth/100 * Constants.metersToVirtualUnit;
}

var BoxMinMaxHelper = function (min, max, materialOrColor) {
  this.min = new THREE.Vector3();
  this.max = new THREE.Vector3();
  this.min.copy(min);
  this.max.copy(max);
  // NOTE: the min/max of the box is tied directly to the min and max
  this.box = new THREE.Box3(this.min, this.max);

  var material = Object3DUtil.getBasicMaterial(materialOrColor);
  THREE.Mesh.call(this, new THREE.BoxGeometry(1, 1, 1), material);
  this.box.getSize(this.scale);
  this.box.getCenter(this.position);
};

BoxMinMaxHelper.prototype = Object.create(THREE.Mesh.prototype);
BoxMinMaxHelper.prototype.constructor = BoxMinMaxHelper;

BoxMinMaxHelper.prototype.update = function (min, max) {
  if (min && max) {
    this.box.set(min,max);
  }
  this.box.getSize(this.scale);
  this.box.getCenter(this.position);
};

var OBBHelper = function (obb, materialOrColor) {
  var material = Object3DUtil.getBasicMaterial(materialOrColor);
  THREE.Mesh.call(this, new THREE.BoxGeometry(1, 1, 1), material);
  this.update(obb);
};

OBBHelper.prototype = Object.create(THREE.Mesh.prototype);
OBBHelper.prototype.constructor = OBBHelper;

OBBHelper.prototype.update = function (obb) {
  if (obb instanceof OBB) {
    this._updateFromOBB(obb);
  } else if (obb.centroid && obb.axesLengths && obb.normalizedAxes) {
    this._updateFromJson(obb);
  } else {
    console.error("Invalid OBB: " + obb);
  }
};

OBBHelper.prototype._updateFromOBB = function (obb) {
  this.obb = obb;
  this.dominantNormal = obb.dominantNormal();
  this.position.copy(obb.position);
  this.scale.copy(obb.halfSizes).multiplyScalar(2);
  this.quaternion.setFromRotationMatrix(obb.basis);
  this.updateMatrix();
};

OBBHelper.prototype._updateFromJson = function (obb) {
  this.obb = obb;
  var dn = obb.dominantNormal;
  this.dominantNormal = dn? new THREE.Vector3(dn[0], dn[1], dn[2]) : undefined;
  this.position.set(obb.centroid[0], obb.centroid[1], obb.centroid[2]);
  this.scale.set(obb.axesLengths[0], obb.axesLengths[1], obb.axesLengths[2]);
  var m = this.obb.normalizedAxes;
  var matrix = new THREE.Matrix4();
  if (obb.matrixIsRowMajor) {
    matrix.set(
      m[0], m[1], m[2], 0,
      m[3], m[4], m[5], 0,
      m[6], m[7], m[8], 0,
      0, 0, 0, 1);
  } else {
    matrix.set(
      m[0], m[3], m[6], 0,
      m[1], m[4], m[7], 0,
      m[2], m[5], m[8], 0,
      0, 0, 0, 1);
  }
  this.quaternion.setFromRotationMatrix(matrix);
  this.updateMatrix();
};

OBBHelper.prototype.toWireFrame = function(linewidth, showNormal, materialOrColor) {
  materialOrColor = materialOrColor || this.material;
  var boxwf = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), Object3DUtil.getBasicMaterial(materialOrColor)));
  boxwf.position.copy(this.position);
  boxwf.scale.copy(this.scale);
  boxwf.quaternion.copy(this.quaternion);
  boxwf.updateMatrix();
  if (linewidth > 0) {
    var boxwffat = new FatLinesHelper(boxwf, linewidth, materialOrColor);
    if (showNormal) {
      var normal = this.dominantNormal;
      if (normal) {
        var boxWithNormal = new THREE.Object3D();
        var fatArrow = new FatArrowHelper(normal, this.position, linewidth * 5, linewidth, undefined, undefined, materialOrColor);
        boxWithNormal.add(boxwffat);
        boxWithNormal.add(fatArrow);
        return boxWithNormal;
      }
    }
    return boxwffat;
  } else {
    if (showNormal) {
      var normal = this.dominantNormal;
      if (normal) {
        var boxWithNormal = new THREE.Object3D();
        var arrow = new THREE.ArrowHelper(normal, this.position, 0.05*Constants.metersToVirtualUnit, undefined, undefined, materialOrColor);
        boxWithNormal.add(boxwf);
        boxWithNormal.add(arrow);
        return boxWithNormal;
      }
    }
    return boxwf;
  }
};

var LinesHelper = function (lines, materialOrColor) {
  this.lines = null;
  var material = (materialOrColor instanceof THREE.Material)? materialOrColor : new THREE.LineBasicMaterial( { color: materialOrColor });
  var geometry = new THREE.Geometry();
  THREE.LineSegments.call(this, geometry, material);
  this.__update(lines);
};

LinesHelper.prototype = Object.create(THREE.LineSegments.prototype);
LinesHelper.prototype.constructor = LinesHelper;

LinesHelper.prototype.__update = function (input) {
  if (input) {
    this.lines = null;
    if (input.length) {
      if (input[0] instanceof THREE.Vector3) {
        // Bunch of points in line
        this.lines = [input];
      } else if (input[0].length && input[0][0] instanceof THREE.Vector3) {
        // Bunch of line segments
        this.lines = input;
      }
    }
    if (!this.lines) {
      console.error('Unsupported input');
    }
  }

  // Add lines
  var geometry = this.geometry;
  if (this.lines && this.lines.length) {
    for (var i = 0; i < this.lines.length; i++) {
      for (var j = 1; j < this.lines[i].length; j++) {
        geometry.vertices.push(this.lines[i][j - 1]);
        geometry.vertices.push(this.lines[i][j]);
      }
    }
  }
};


var FatLinesHelper = function (lines, width, materialOrColor, opts) {
  opts = opts || {};
  THREE.Group.call(this);
  this.lines = null;
  this.width = width;
  if (Array.isArray(materialOrColor)) {
    this.material = new THREE.MeshBasicMaterial({ vertexColors: THREE.VertexColors });
    this.getColor = Colors.getColorFunction({
      type: 'interpolate',
      minWeight: 0,
      maxWeight: 1,
      colors: materialOrColor,
      space: 'hsl'
    });
  } else {
    this.material = Object3DUtil.getBasicMaterial(materialOrColor);
  }
  this.getWeight = opts.getWeight;
  this.update(lines);
};

FatLinesHelper.prototype = Object.create(THREE.Group.prototype);
FatLinesHelper.prototype.constructor = FatLinesHelper;

FatLinesHelper.prototype.update = function (input) {
  // Create big fat cylinders connecting everything
  // Remove everything
  var objects = this.children.slice(0);
  for (var i = 0; i < objects.length; i++) {
    objects[i].parent.remove(objects[i]);
  }

  if (input) {
    this.lines = null;
    if (input instanceof THREE.Line) {
      // Lets make these into our fat lines!!!
      var verts = GeometryUtil.getVertices(input);
      if (input.geometry.index) {
        var index = input.geometry.index.array;
        this.lines = [];
        for (var i = 0; i < index.length; i += 2) {
          var a = verts[index[i]];
          var b = verts[index[i + 1]];
          this.lines.push([a,b]);
        }
      } else {
        this.lines = [];
        for (var i = 0; i < verts.length; i += 2) {
          var a = verts[i];
          var b = verts[i + 1];
          this.lines.push([a,b]);
        }
      }

    } else if (input.length) {
      if (input[0] instanceof THREE.Vector3) {
        // Bunch of points in line
        this.lines = [input];
      } else if (input[0].length && input[0][0] instanceof THREE.Vector3) {
        // Bunch of line segments
        this.lines = input;
      }
    }
    if (!this.lines) {
      console.error('Unsupported input');
    }
    //if (input.matrix) {
    // Object3DUtil.setMatrix(this, input.matrix);
    //}
  }

  // Add lines
  if (this.lines && this.lines.length) {
    for (var i = 0; i < this.lines.length; i++) {
      var totalPoints = this.lines[i].length;
      for (var j = 1; j < this.lines[i].length; j++) {
        var cylinder = Object3DUtil.makeCylinder(this.lines[i][j - 1], this.lines[i][j],
          this.width / 2, this.material);
        if (this.getColor) {
          var colors = this.getWeight?
            [this.getColor(this.getWeight(i, j-1)), this.getColor(this.getWeight(i, j))]
            : [this.getColor((j-1)/totalPoints), this.getColor(j/totalPoints)];
          GeometryUtil.colorCylinderVertices(cylinder.geometry, colors[0], colors[1]);
        }
        this.add(cylinder);
      }
    }
  }
};


var FatArrowHelper = function (dir, origin, length, lineWidth, headLength, headWidth, materialOrColor) {
  THREE.Group.call(this);
  this.name = 'Arrow';

  if (length === undefined) length = 1;
  if (lineWidth === undefined) lineWidth = 1;
  if (headLength === undefined) headLength = 0.2 * length;
  if (headWidth === undefined) headWidth = lineWidth + 0.2 * headLength;
  if (materialOrColor === undefined) materialOrColor = 0xffff00;

  this.start = origin.clone();
  this.dir = dir.clone();
  this.length = length;

  this.material = Object3DUtil.getBasicMaterial(materialOrColor);
  this.line = Object3DUtil.makeColumn(this.start, this.dir, this.length - headLength,
    lineWidthToUnit(lineWidth) / 2, this.material);
  this.add(this.line);

  var coneGeometry = new THREE.CylinderGeometry(0, 0.5, 1, 5, 1);
  coneGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, -0.5, 0));

  this.cone = new THREE.Mesh(coneGeometry, this.material);
  this.cone.matrixAutoUpdate = false;
  Object3DUtil.setCylinderDirection(this.cone, dir);
  this.cone.scale.set(headWidth, headLength, headWidth);
  var end = this.start.clone().add(this.dir.clone().multiplyScalar(this.length));
  this.cone.position.copy(end);
  this.cone.updateMatrix();

  this.add(this.cone);

};

FatArrowHelper.prototype = Object.create(THREE.Group.prototype);
FatArrowHelper.prototype.constructor = FatArrowHelper;

FatArrowHelper.prototype.setOrigin = function (start) {
  var delta = new THREE.Vector3();
  delta.subVectors(start, this.start);
  this.line.position.addVectors(this.line.position, delta);
  this.cone.position.addVectors(this.cone.position, delta);
};

FatArrowHelper.prototype.setDirection = function (dir) {
  this.dir = dir.clone();
  Object3DUtil.setCylinderDirection(this.line, dir);
  Object3DUtil.setCylinderDirection(this.cone, dir);
};

FatArrowHelper.prototype.setLength = function (length, lineWidth, headLength, headWidth) {

  if (lineWidth === undefined) lineWidth = 1;
  if (headLength === undefined) headLength = 0.2 * length;
  if (headWidth === undefined) headWidth = lineWidth + 0.2 * headLength;

  this.remove(this.line);
  this.length = length;
  this.line = Object3DUtil.makeColumn(this.start, this.dir, this.length - headLength,
    lineWidthToUnit(lineWidth) / 2, this.material);
  this.add(this.line);

  this.cone.scale.set(headWidth, headLength, headWidth);
  var end = this.start.clone().add(this.dir.clone().multiplyScalar(this.length));
  this.cone.position.copy(end);
  this.cone.updateMatrix();
};

var AxesDirs = [ new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
var AxesColors = [ new THREE.Color(0xff0000), new THREE.Color(0x00ff00), new THREE.Color(0x0000ff) ];
var FatAxesHelper = function (length, lineWidth, origin, quaternion) {
  THREE.Group.call(this);
  this.name = 'Axes';

  if (origin) {
    this.position.copy(origin);
  }
  if (quaternion) {
    this.quaternion.copy(quaternion);
  }
  this.length = length || 1;
  this.lineWidth = lineWidth || 1;
  this.axes = [];
  for (var i = 0; i < AxesDirs.length; i++) {
    this.axes[i] = new FatArrowHelper(AxesDirs[i], new THREE.Vector3(), this.length, this.lineWidth, undefined, undefined, AxesColors[i]);
    this.add(this.axes[i]);
  }
};

FatAxesHelper.prototype = Object.create(THREE.Group.prototype);
FatAxesHelper.prototype.constructor = FatAxesHelper;

FatAxesHelper.prototype.update = function () {
  if (this.object) {
    this.object.updateMatrixWorld();
    this.position.setFromMatrixPosition(this.object.matrixWorld);
    this.object.getWorldQuaternion(this.quaternion);
  }
};

FatAxesHelper.prototype.attach = function (object) {
  this.object = object;
  this.update();
};

FatAxesHelper.prototype.detach = function () {
  this.object = null;
  this.update();
};

module.exports = { BoxMinMax: BoxMinMaxHelper, OBB: OBBHelper, Lines: LinesHelper, FatLines: FatLinesHelper, FatArrow: FatArrowHelper, FatAxes: FatAxesHelper };
