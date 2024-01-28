const Constants = require('Constants');
const Colors = require('util/Colors');
const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const OBB = require('geo/OBB');

const AxesDirs = [ new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
const AxesColors = [ new THREE.Color(0xff0000), new THREE.Color(0x00ff00), new THREE.Color(0x0000ff) ];

function lineWidthToUnit(lineWidth) {
  return lineWidth/100 * Constants.metersToVirtualUnit;
}

class BoxMinMaxHelper extends THREE.Mesh {
  constructor(min, max, materialOrColor) {
    const material = Object3DUtil.getBasicMaterial(materialOrColor);
    super(new THREE.BoxGeometry(1, 1, 1), material);
    this.min = new THREE.Vector3();
    this.max = new THREE.Vector3();
    this.min.copy(min);
    this.max.copy(max);
    // NOTE: the min/max of the box is tied directly to the min and max
    this.box = new THREE.Box3(this.min, this.max);

    this.box.getSize(this.scale);
    this.box.getCenter(this.position);
  }

  update(min, max) {
    if (min && max) {
      this.box.set(min, max);
    }
    this.box.getSize(this.scale);
    this.box.getCenter(this.position);
  }

  toWireFrame(linewidth, showNormal, materialOrColor) {
    materialOrColor = materialOrColor || this.material;
    const color = (materialOrColor.color != null) ? materialOrColor.color : Object3DUtil.getColor(materialOrColor);
    let boxwf = new THREE.BoxHelper(this, color);
    if (linewidth > 0) {
      boxwf = new FatLinesHelper(boxwf, linewidth, materialOrColor);
    }
    return boxwf;
  }
}

class OBBHelper extends THREE.Mesh {
  constructor(obb, materialOrColor) {
    const material = Object3DUtil.getBasicMaterial(materialOrColor);
    super(new THREE.BoxGeometry(1, 1, 1), material);
    this.update(obb);
  }

  update(obb) {
    if (obb instanceof OBB) {
      this.__updateFromOBB(obb);
    } else if (obb.centroid && obb.axesLengths && obb.normalizedAxes) {
      this.__updateFromJson(obb);
    } else {
      console.error('Invalid OBB: ' + obb);
    }
    if (obb.orientation) {
      this.orientation = obb.orientation;
    }
  }

  __updateFromOBB(obb) {
    this.obb = obb;
    this.dominantNormal = obb.dominantNormal;
    this.position.copy(obb.position);
    this.scale.copy(obb.halfSizes).multiplyScalar(2);
    this.quaternion.setFromRotationMatrix(obb.basis);
    this.updateMatrix();
    this.updateMatrixWorld();
  }

  __updateFromJson(obb) {
    this.obb = obb;
    const dn = obb.dominantNormal;
    this.dominantNormal = dn ? new THREE.Vector3(dn[0], dn[1], dn[2]) : undefined;
    this.position.set(obb.centroid[0], obb.centroid[1], obb.centroid[2]);
    this.scale.set(obb.axesLengths[0], obb.axesLengths[1], obb.axesLengths[2]);
    const m = this.obb.normalizedAxes;
    const matrix = new THREE.Matrix4();
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
    this.updateMatrixWorld();
  }

  __createOrientationArrows(linewidth) {
    const colors = AxesColors;
    const axesLength = 0.50;
    const minLength = this.scale.clone().multiplyScalar(0.1).length();
    const worldToLocalRot = new THREE.Quaternion();
    worldToLocalRot.copy(this.quaternion);
    worldToLocalRot.invert();
    if (this.orientation && this.orientation.length) {
      const arrowGroup = new THREE.Group();
      for (let i = 0; i < this.orientation.length; i++) {
        const v = this.orientation[i];
        if (v) {
          const nv = v.clone().normalize();
          const lv = nv.clone().applyQuaternion(worldToLocalRot);
          const length = Math.max(Math.abs(this.scale.dot(lv)) * axesLength * 2, minLength);
          const arrow = this.__createArrow(nv, length, linewidth, colors[i]);
          arrow.traverse(function (node) {
            node.userData.isOrientationArrow = true;
            if (node.material) {
              node.axisMaterial = node.material;
            }
          });
          arrowGroup.add(arrow);
        } else {
          console.warn('Missing orientation ' + i, this.orientation);
        }
      }
      return arrowGroup;
    }
  }

  __createArrow(direction, length, linewidth, materialOrColor) {
    if (direction) {
      if (linewidth > 0) {
        return new FatArrowHelper(direction, this.position, length, linewidth, undefined, undefined, materialOrColor);
      } else {
        return new THREE.ArrowHelper(direction, this.position, length, undefined, undefined, materialOrColor);
      }
    }
  }

  __createNormal(linewidth, materialOrColor) {
    const axesLength = 0.25;
    const length = this.scale.clone().multiplyScalar(axesLength).length();
    return this.__createArrow(this.dominantNormal, length, linewidth, materialOrColor);
  }

  __createAxes(linewidth) {
    const axesLength = 0.25;
    if (linewidth > 0) {
      const lengths = this.scale.clone().multiplyScalar(axesLength).toArray();
      return new FatAxesHelper(lengths, linewidth, this.position, this.quaternion);
    } else {
      const axes = new THREE.AxesHelper(axesLength);
      axes.position.copy(this.position);
      axes.scale.copy(this.scale);
      axes.quaternion.copy(this.quaternion);
      axes.isAxis = true;
      return axes;
    }
  }

  toWireFrame(linewidth, showNormal, materialOrColor, showAxes, showOrientation) {
    materialOrColor = materialOrColor || this.material;
    const color = (materialOrColor.color != null) ? materialOrColor.color : Object3DUtil.getColor(materialOrColor);
    let boxwf = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), color);
    boxwf.position.copy(this.position);
    boxwf.scale.copy(this.scale);
    boxwf.quaternion.copy(this.quaternion);
    boxwf.updateMatrix();
    if (linewidth > 0) {
      boxwf = new FatLinesHelper(boxwf, linewidth, materialOrColor);
    }
    Object3DUtil.traverseMeshes(boxwf, true, function (x) {
      x.userData.isOBB = true;
    });
    boxwf.userData.desc = 'obb-wireframe';
    if (showNormal || showAxes || showOrientation) {
      const normalArrow = showNormal ? this.__createNormal(linewidth, materialOrColor) : null;
      const axes = showAxes ? this.__createAxes(linewidth) : null;
      const orientArrows = showOrientation ? this.__createOrientationArrows(linewidth) : null;
      if (normalArrow || axes || orientArrows) {
        //console.log('Create box with normal');
        const boxWithNormal = new THREE.Group();
        boxWithNormal.add(boxwf);
        if (normalArrow) {
          normalArrow.userData.name = 'obb-dominantNormal';
          boxWithNormal.add(normalArrow);
        }
        if (axes) {
          axes.userData.name = 'obb-axes';
          boxWithNormal.add(axes);
        }
        if (orientArrows) {
          orientArrows.userData.name = 'obb-orient-arrows';
          boxWithNormal.add(orientArrows);
        }
        return boxWithNormal;
      }
    }
    return boxwf;
  }
}

class LinesHelper extends THREE.LineSegments {
  constructor(lines, materialOrColor) {
    const material = (materialOrColor instanceof THREE.Material) ? materialOrColor : new THREE.LineBasicMaterial({color: materialOrColor});
    const geometry = new THREE.BufferGeometry();
    super(geometry, material);
    this.lines = null;
    this.__update(lines);
  }

  __update(input) {
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
    const geometry = this.geometry;
    const vertices = [];
    if (this.lines && this.lines.length) {
      for (let i = 0; i < this.lines.length; i++) {
        for (let j = 1; j < this.lines[i].length; j++) {
          vertices.push(...this.lines[i][j - 1]);
          vertices.push(...this.lines[i][j]);
        }
      }
    }
    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute(vertices, 3));
  }
}

function linesFromBoxCorners(points) {
  // Assumes points[0] and points[4] should be paired
  var lines = [];
  for (var i = 0; i < 4; i++) {
    lines.push([points[i], points[(i+1)%4]]);
    lines.push([points[i], points[i+4]]);
    lines.push([points[4+i], points[4+(i+1)%4]]);
  }
  return lines;
}

function toLineSegments(input) {
  var lines = null;
  if (input instanceof THREE.Line) {
    // Lets make these into our fat lines!!!
    var verts = GeometryUtil.getVertices(input);
    if (input.geometry.index) {
      var index = input.geometry.index.array;
      lines = [];
      for (var i = 0; i < index.length; i += 2) {
        var a = verts[index[i]];
        var b = verts[index[i + 1]];
        lines.push([a,b]);
      }
    } else {
      lines = [];
      for (var i = 0; i < verts.length; i += 2) {
        var a = verts[i];
        var b = verts[i + 1];
        lines.push([a,b]);
      }
    }

  } else if (input.length) {
    if (input[0] instanceof THREE.Vector3) {
      // Bunch of points in line
      lines = [input];
    } else if (input[0].length && input[0][0] instanceof THREE.Vector3) {
      // Bunch of line segments
      lines = input;
    }
  }
  if (!lines) {
    console.error('Unsupported line input');
  }
  return lines;
}

class FatLinesHelper extends THREE.Group {
  constructor(lines, width, materialOrColor, opts) {
    super();
    opts = opts || {};
    this.lines = null;
    this.width = width;
    if (Array.isArray(materialOrColor)) {
      this.material = new THREE.MeshBasicMaterial({vertexColors: true});
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
    if (opts.inputType === 'boxCorners') {
      lines = linesFromBoxCorners(lines);
    }
    this.update(lines);
  }

  setFromObject(input) {
    this.lines = toLineSegments(input);
    //if (input.matrix) {
    // Object3DUtil.setMatrix(this, input.matrix);
    //}
  }

  __addLine(linePoints) {
    const totalPoints = linePoints.length;
    for (let j = 1; j < linePoints.length; j++) {
      const cylinder = Object3DUtil.makeCylinderStartEnd(linePoints[j - 1], linePoints[j],
        this.width / 2, this.material);
      if (this.getColor) {
        const colors = this.getWeight ?
          [this.getColor(this.getWeight(i, j - 1)), this.getColor(this.getWeight(i, j))]
          : [this.getColor((j - 1) / totalPoints), this.getColor(j / totalPoints)];
        GeometryUtil.colorCylinderVertices(cylinder.geometry, colors[0], colors[1]);
      }
      this.add(cylinder);
    }
  }

  update(input) {
    // Create big fat cylinders connecting everything
    // Remove everything
    const objects = this.children.slice(0);
    for (let i = 0; i < objects.length; i++) {
      objects[i].parent.remove(objects[i]);
    }

    if (input) {
      this.setFromObject(input);
    }

    // Add lines
    if (this.lines && this.lines.length) {
      for (let i = 0; i < this.lines.length; i++) {
        this.__addLine(this.lines[i]);
      }
    }
  }
}

class FatArrowHelper extends THREE.Group {
  constructor(dir, origin, length, lineWidth, headLength, headWidth, materialOrColor) {
    super();
    this.name = 'Arrow';

    if (length == null) length = 1;
    if (lineWidth == null) lineWidth = lineWidthToUnit(1);
    if (headLength == null) headLength = Math.min(0.2 * length, lineWidth * 7.5);
    if (headWidth == null) headWidth = lineWidth + Math.min(0.2 * headLength, lineWidth * 7.5);
    if (materialOrColor == null) materialOrColor = 0xffff00;

    this.start = origin.clone();
    this.dir = dir.clone();
    this.length = length;

    this.material = Object3DUtil.getBasicMaterial(materialOrColor);
    this.line = Object3DUtil.makeCylinderStartDir(this.start, this.dir, this.length - headLength,
      lineWidth / 2, this.material);
    this.add(this.line);

    const coneGeometry = new THREE.CylinderGeometry(0, 0.5, 1, 5, 1);
    coneGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.5, 0));

    this.cone = new THREE.Mesh(coneGeometry, this.material);
    this.cone.matrixAutoUpdate = false;
    Object3DUtil.setCylinderDirection(this.cone, dir);
    this.cone.scale.set(headWidth, headLength, headWidth);
    const end = this.start.clone().add(this.dir.clone().multiplyScalar(this.length));
    this.cone.position.copy(end);
    this.cone.updateMatrix();

    this.add(this.cone);
  }

  setOrigin(start) {
    const delta = new THREE.Vector3();
    delta.subVectors(start, this.start);
    this.line.position.addVectors(this.line.position, delta);
    this.cone.position.addVectors(this.cone.position, delta);
  }

  setDirection(dir) {
    this.dir = dir.clone();
    Object3DUtil.setCylinderDirection(this.line, dir);
    Object3DUtil.setCylinderDirection(this.cone, dir);
  }

  setLength(length, lineWidth, headLength, headWidth) {

    if (lineWidth == null) lineWidth = lineWidthToUnit(1);
    if (headLength == null) headLength = 0.2 * length;
    if (headWidth == null) headWidth = lineWidth + 0.2 * headLength;

    this.remove(this.line);
    this.length = length;
    this.line = Object3DUtil.makeCylinderStartDir(this.start, this.dir, this.length - headLength,
      lineWidth / 2, this.material);
    this.add(this.line);

    this.cone.scale.set(headWidth, headLength, headWidth);
    const end = this.start.clone().add(this.dir.clone().multiplyScalar(this.length));
    this.cone.position.copy(end);
    this.cone.updateMatrix();
  }
}

class FatAxesHelper extends THREE.Group {
  constructor(length, lineWidth, origin, quaternion) {
    super();
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
    for (let i = 0; i < AxesDirs.length; i++) {
      const axisLength = (Array.isArray(this.length)) ? this.length[i] : this.length;
      this.axes[i] = new FatArrowHelper(AxesDirs[i], new THREE.Vector3(), axisLength, this.lineWidth, undefined, undefined, AxesColors[i]);
      this.add(this.axes[i]);
    }
    this.traverse(function (node) {
      node.userData.isAxis = true;
      if (node.material) {
        node.axisMaterial = node.material;
      }
    });
  }

  update() {
    if (this.object) {
      this.object.updateMatrixWorld();
      this.position.setFromMatrixPosition(this.object.matrixWorld);
      this.object.getWorldQuaternion(this.quaternion);
    }
  }

  attach(object) {
    this.object = object;
    this.update();
  }

  detach() {
    this.object = null;
    this.update();
  }
}

module.exports = { BoxMinMax: BoxMinMaxHelper, OBB: OBBHelper, Lines: LinesHelper, FatLines: FatLinesHelper, FatArrow: FatArrowHelper, FatAxes: FatAxesHelper };
