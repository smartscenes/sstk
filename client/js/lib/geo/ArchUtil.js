var Materials = require('materials/Materials');
var MatrixUtil = require('math/MatrixUtil');
var MeshHelpers = require('geo/MeshHelpers');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

// Utility functions for making architecture components
var ArchUtil = {};

function getInterpolatedValue(x0, x1, v0, v1, mx) {
  // assumes mx is between x0 and x1
  var t = x1 - x0;
  var d = mx - x0;
  var r = d/t;
  return (1-r)*v0 + r*v1;
}

ArchUtil.__prepareWallHoles = function(wallId, holes, ceilingContour, width, height) {
  holes = holes || [];
  holes.forEach((hole,i) => hole.holeIndex = i);
  var holePolyBoxes = _.partition(holes.filter(h => h.mark !== 'remove'), function(x) { return x.poly; });
  var holeBoxes = holePolyBoxes[1].map(function(h) {
    var box2 = Object3DUtil.toBox2(h.box);
    box2.holeIndex = h.holeIndex;
    return box2;
  });
  var holePolys = holePolyBoxes[0].map(function(h) {
    var polyPoints = h.poly.map(p => Object3DUtil.toVector2(p));
    return {
      points: polyPoints,
      holeIndex: h.holeIndex
    }
  });
  var mergedHoleBoxes = ArchUtil.mergeHoleBoxes(holeBoxes);
  return {
    mergedHoleBoxes: mergedHoleBoxes,
    holePolys: holePolys,
    ceilingContour: ceilingContour
  };
};

ArchUtil.__checkCeilingIntersect = function(hole, ceiling, height) {
  var ceilingMinY = height;
  var firstCeilingIndex = -1;
  var lastCeilingIndex = -1;
  var firstCeilingY;
  var lastCeilingY;
  for (var i = 0; i < ceiling.length; i++) {
    var cx = ceiling[i][0];
    var cy = ceiling[i][1];
    if (cx >= hole.min.x && cx <= hole.max.x) {
      // ceiling point is within hole x range
      if (firstCeilingIndex < 0) {
        if (cx > hole.min.x && i > 0) {
          firstCeilingIndex = i-1;
          // interpolate between y0 and cy
          firstCeilingY = getInterpolatedValue(ceiling[i-1][0], cx, ceiling[i-1][1], cy, hole.min.x);
        } else {
          firstCeilingIndex = i;
          firstCeilingY = cy;
        }
        if (firstCeilingY < ceilingMinY) {
          ceilingMinY = firstCeilingY;
        }
      }
      lastCeilingIndex = i;
      lastCeilingY = cy;
      if (cy < ceilingMinY) {
        ceilingMinY = cy;
      }
    } else if (cx > hole.max.x) {
      if (lastCeilingIndex < 0 || ceiling[lastCeilingIndex][0] < hole.max.x) {
        lastCeilingIndex = i;
        lastCeilingY = (i > 0)? getInterpolatedValue(ceiling[i-1][0], cx, ceiling[i-1][1], cy, hole.max.x) : cy;
        if (lastCeilingY < ceilingMinY) {
          ceilingMinY = lastCeilingY;
        }
        break;
      }
    }
  }
  if (firstCeilingIndex < 0) {
    console.warn('Cannot find ceiling portion for hole', ceiling, hole);
    firstCeilingIndex = ceiling.length-1;
    lastCeilingIndex = ceiling.length-1;
    firstCeilingY = ceiling[firstCeilingIndex][1];
    lastCeilingY = ceiling[lastCeilingIndex][1];
  }
  var isTopHole = hole.max.y > ceilingMinY;
  if (isTopHole) {
    var poly = [];
    poly.push([hole.max.x, lastCeilingY]);
    poly.push([hole.max.x, hole.min.y]);
    poly.push([hole.min.x, hole.min.y]);
    poly.push([hole.min.x, firstCeilingY]);
    hole.ceilingCutout = {
      poly: poly,
      firstCeilingIndex: firstCeilingIndex,
      lastCeilingIndex: lastCeilingIndex
    };
  }
  return isTopHole;
};

// Make geometry for one pieces of a wall
ArchUtil.__makeWallWithHolesGeometry = function(opts) {
  var bboxHoles = opts.bboxHoles;
  var ceiling = opts.ceiling; // points indicating ceiling contour
  var height = opts.height;
  var depth = opts.depth;
  var width = opts.width;

  var initialHeight = opts.initialHeight;
  var initialWidth = opts.initialWidth;

  var wdelta = (width - initialWidth) / 2;

  // Assume holes are disjoint
  // Split holes into outside (on border) and inside holes (inside wall)
  var outsideHoles = [];
  var leftHoles = [], rightHoles = [], topHoles = [], bottomHoles = [];
  var insideHoles = [];
  var unprocessedHoles = bboxHoles;

  var hasCeiling = ceiling && ceiling.length > 0;
  if (hasCeiling) {
    if (opts.debug) {
      console.log('got ceiling contour for ' + opts.wallId, ceiling);
    }
    // Assume ceiling points are sorted by x (for processing holes)
    // ceiling = _.sortBy(ceiling, function (p) { return p[0]; });
    // inside holes
    if (bboxHoles) {
      var partitionedHoles = _.partition(bboxHoles, (hole) => {
        // TODO: determine if this is an inside hole or not
        var isTopHole = this.__checkCeilingIntersect(hole, ceiling, initialHeight);
        return isTopHole;
      });
      unprocessedHoles = partitionedHoles[1];
      if (partitionedHoles[0].length) {
        topHoles = partitionedHoles[0];
        outsideHoles.push.apply(outsideHoles, topHoles);
        if (opts.debug) {
          console.log('Group ' + topHoles.length + ' holes to above ceiling');
        }
      }
    }
 }

  if (unprocessedHoles) {
    for (var iHole = 0; iHole < unprocessedHoles.length; iHole++) {
      var hole = unprocessedHoles[iHole];
      var isOutsideHole = false;
      if (hole.min.x <= 0 && hole.max.x < initialWidth) {
        leftHoles.push(hole);
        isOutsideHole = true;
      } else if (hole.min.x > 0 && hole.max.x >= initialWidth) {
        rightHoles.push(hole);
        isOutsideHole = true;
      } else if (hole.min.y <= 0 && hole.max.y < initialHeight) {
        bottomHoles.push(hole);
        isOutsideHole = true;
      } else if (hole.min.y > 0 && hole.max.y >= initialHeight) {
        topHoles.push(hole);
        isOutsideHole = true;
      }

      if (isOutsideHole) {
        outsideHoles.push(hole);
      } else {
        insideHoles.push(hole);
      }
    }
  }

  if (opts.debug) {
    console.log('processing wall ' + opts.wallId + ' with ' + outsideHoles.length + ' outside holes: ' +
      [bottomHoles.length, leftHoles.length, rightHoles.length, topHoles.length] + ', ' + insideHoles.length + ' inside holes');
  }
  var wallShape = new THREE.Shape();
  // Create wall by going from lower left (0,0) to lower right (w,0) to upper right (w,h) to upper left (0,h) and down
  if (outsideHoles.length > 0) {
    //console.log('processing outside holes', bottomHoles, rightHoles, topHoles, leftHoles);
    bottomHoles = _.sortBy(bottomHoles, function(hole) { return hole.min.x; });
    rightHoles = _.sortBy(rightHoles, function(hole) { return hole.min.y; });
    topHoles = _.sortBy(topHoles, function(hole) { return -hole.max.x; });
    leftHoles = _.sortBy(leftHoles, function(hole) { return -hole.max.y; });

    // Start at lower left
    wallShape.moveTo(0, 0);

    // Process bottom holes
    for (var i = 0; i < bottomHoles.length; i++) {
      var hole = bottomHoles[i];
      wallShape.lineTo(wdelta + hole.min.x, 0);
      wallShape.lineTo(wdelta + hole.min.x, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, 0);
    }
    if (wallShape.currentPoint.x < width) {
      wallShape.lineTo(width, 0);
    }

    // Process right holes
    for (var i = 0; i < rightHoles.length; i++) {
      var hole = rightHoles[i];
      wallShape.lineTo(width, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, hole.max.y);
      wallShape.lineTo(width, hole.max.y);
    }

    // Process top holes
    if (hasCeiling) {
      // Account for ceiling contour
      var ceilingIndex = ceiling.length - 1;
      for (var i = 0; i < topHoles.length; i++) {
        var hole = topHoles[i];
        while (ceilingIndex >= hole.ceilingCutout.lastCeilingIndex) {
          var c = ceiling[ceilingIndex];
          wallShape.lineTo(wdelta + c[0], c[1]);
          ceilingIndex--;
        }
        for (var j = 0; j < hole.ceilingCutout.poly.length; j++) {
          var p = hole.ceilingCutout.poly[j];
          wallShape.lineTo(wdelta + p[0], p[1]);
        }
        ceilingIndex = hole.ceilingCutout.firstCeilingIndex;
        if (hole.min.x === ceiling[ceilingIndex][0]) {
          ceilingIndex--;
        }
      }
      while (ceilingIndex >= 0) {
        var c = ceiling[ceilingIndex];
        wallShape.lineTo(wdelta + c[0], c[1]);
        ceilingIndex--;
      }
      if (wallShape.currentPoint.x > 0) {
        wallShape.lineTo(0, wallShape.currentPoint.y);
      }
    } else {
      // Go to top
      if (wallShape.currentPoint.y < height) {
        wallShape.lineTo(width, height);
      }
      // No ceiling contour (straight horizontal line
      for (var i = 0; i < topHoles.length; i++) {
        hole = topHoles[i];
        wallShape.lineTo(wdelta + hole.max.x, height);
        wallShape.lineTo(wdelta + hole.max.x, hole.min.y);
        wallShape.lineTo(wdelta + hole.min.x, hole.min.y);
        wallShape.lineTo(wdelta + hole.min.x, height);
      }
      if (wallShape.currentPoint.x > 0) {
        wallShape.lineTo(0, height);
      }
    }

    // Process left holes
    for (var i = 0; i < leftHoles.length; i++) {
      hole = leftHoles[i];
      var ymax = Math.min(hole.max.y, wallShape.currentPoint.y);
      var ymin = Math.min(hole.min.y, wallShape.currentPoint.y);
      if (ymax > ymin && ymin < wallShape.currentPoint.y) {
        if (wallShape.currentPoint.y > ymax) {
          wallShape.lineTo(0, ymax);
        }
        wallShape.lineTo(wdelta + hole.max.x, ymax);
        wallShape.lineTo(wdelta + hole.max.x, ymin);
        wallShape.lineTo(0, ymin);
      }
    }

    if (wallShape.currentPoint.y > 0) {
      wallShape.lineTo(0, 0);
    }
  } else if (hasCeiling) {
    wallShape.moveTo(0, 0);
    wallShape.lineTo(width, 0);
    for (i = ceiling.length-1; i >= 0; i--) {
      var c = ceiling[i];
      wallShape.lineTo(c[0], c[1]);
    }
    wallShape.lineTo(0, 0);
  } else {
    wallShape.moveTo(0, 0);
    wallShape.lineTo(width, 0);
    wallShape.lineTo(width, height);
    wallShape.lineTo(0, height);
    wallShape.lineTo(0, 0);
  }
  if (opts.debug) {
    console.log('wallShape for ' + opts.wallId, wallShape.toJSON());
  }

  // Carve out interior holes
  if (insideHoles.length) {
    for (var iHole = 0; iHole < insideHoles.length; iHole++) {
      var hole = insideHoles[iHole];
      var holePath = new THREE.Path();
      // Make sure holes are inside wall...
      var minx = Math.max(wdelta + hole.min.x, 0.000);
      var maxx = Math.min(wdelta + hole.max.x, width - 0.000);
      var miny = Math.max(hole.min.y, 0.000);
      var maxy = Math.min(hole.max.y, height - 0.000);

      holePath.moveTo(minx, miny);
      holePath.lineTo(maxx, miny);
      holePath.lineTo(maxx, maxy);
      holePath.lineTo(minx, maxy);
      holePath.lineTo(minx, miny);
      wallShape.holes.push(holePath);
    }
  }

  // Carve out poly holes (assume non-overlapping and interior)
  var polyHoles = opts.polyHoles;
  if (polyHoles && polyHoles.length) {
    for (var iHole = 0; iHole < polyHoles.length; iHole++) {
      var hole = polyHoles[iHole];
      var holePath = new THREE.Path();

      // Make sure hole points are inside wall...
      var points = hole.points.map(p => {
        var q = new THREE.Vector2();
        q.x = Math.min(Math.max(wdelta + p.x, 0.0), width);
        q.y = Math.min(Math.max(p.y, 0.0), height);
        return q;
      });
      holePath.moveTo(points[0].x, points[0].y);
      for (var i = 0; i < points.length; i++) {
        var p = points[(i+1)%points.length];
        holePath.lineTo(p.x, p.y);
      }
      wallShape.holes.push(holePath);
    }
  }


  var extrudeSettings = { depth: depth / 2, bevelEnabled: false };
  var geo = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
  return geo;
};

/**
 * Creates a wall based on provided information
 * @param opts
 * @param opts.wallId {string}
 * @param opts.wallBaseStart {THREE.Vector3}
 * @param opts.wallBaseEnd {THREE.Vector3}
 * @param opts.wallUpDir {THREE.Vector3}
 * @param opts.wallHeight {number}
 * @param opts.wallExtraHeight {number}
 * @param opts.wallDepth {number}
 * @param opts.wallHoles {holes}
 * @param opts.ceilingContour {float[][]}
 * @param opts.materials {THREE.Material[]}
 * @param [opts.normalizedMaterialRepeat=false] {boolean}
 * @returns {Object3D}
 */
ArchUtil.makeWallWithHoles = function (opts) {
  var baseStart = opts.wallBaseStart;
  var baseEnd = opts.wallBaseEnd;
  var depth = opts.wallDepth || 10;
  var height = opts.wallHeight + opts.wallExtraHeight;
  var wallDir = baseEnd.clone().sub(baseStart).normalize();
  var wallFrontDir = new THREE.Vector3();
  wallFrontDir.crossVectors(wallDir, opts.wallUpDir).normalize();
  var wallEndOffset = wallDir.clone().multiplyScalar(depth / 2 - depth / 10);
  var materials = opts.materials;
  var normalizeMaterialRepeat = opts.normalizedMaterialRepeat;

  var p0 = baseStart.clone().sub(wallEndOffset);
  var p1 = baseEnd.clone().add(wallEndOffset);
  var width = p1.distanceTo(p0);

  // Account for slight difference in original width and extended width
  var initialWidth = baseStart.distanceTo(baseEnd);
  // console.log('initial width vs width', initialWidth, width);

  var prep = ArchUtil.__prepareWallHoles(opts.wallId, opts.wallHoles, opts.ceilingContour, initialWidth, opts.wallHeight);
  for (var i = 0; i < prep.mergedHoleBoxes.length; i++) {
    var merged = prep.mergedHoleBoxes[i];
    if (merged.holeIndices.length > 1) {
      for (var j = 0; j < merged.holeIndices.length; j++) {
        var hole = opts.wallHoles[merged.holeIndices[j]];
        hole.mergedHoleIndices = merged.holeIndices;
      }
    }
  }

  if (normalizeMaterialRepeat) {
    materials = materials.map(mat => Materials.getMaterialWithRepeat(mat, 1 / width, 1 / height, true));
  }
  // Try to identify materials by name
  var materialIn = _.find(materials, mat => mat && mat.name === 'inside');
  var materialOut = _.find(materials, mat => mat && mat.name === 'outside');
  var materialBetween = _.find(materials, mat => mat && mat.name === 'side') || Materials.getBasicMaterial('gray');
  if (materialIn == null && materialOut == null) {
    // If not then just use indices
    materialIn = materials[0];
    materialOut = materials[1];
    if (materialIn == null && materialOut == null) {
      materialIn = Materials.getBasicMaterial('gray');
      materialOut = Materials.getBasicMaterial('gray');
    }
  }
  var meshIn, meshOut;
  if (materialIn) {
    // console.log('wall ' + opts.wallId, 'mergedHoles', prep.mergedHoleBoxes)
    var geo = ArchUtil.__makeWallWithHolesGeometry({
      wallId: opts.wallId,
      bboxHoles: prep.mergedHoleBoxes,
      polyHoles: prep.holePolys,
      ceiling: prep.ceilingContour,
      height: height,
      depth: depth,
      width: initialWidth,
      initialWidth: initialWidth,
      initialHeight: opts.wallHeight
    });
    meshIn = new THREE.Mesh(geo, [materialIn, materialBetween]);
    meshIn.name = 'WallInside';
  }
  if (materialOut) {
    // console.log('wall ' + opts.wallId, 'mergedHoles', prep.mergedHoleBoxes)
    var geo = ArchUtil.__makeWallWithHolesGeometry({
      wallId: opts.wallId,
      bboxHoles: prep.mergedHoleBoxes,
      polyHoles: prep.holePolys,
      ceiling: prep.ceilingContour,
      height: height,
      depth: depth,
      width: width,
      initialWidth: initialWidth,
      initialHeight: opts.wallHeight
    });
    meshOut = new THREE.Mesh(geo, [materialOut, materialBetween]);
    meshOut.name = 'WallOutside';
  }

  var alignMatrix = MatrixUtil.getAlignmentMatrix(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
    opts.wallUpDir, wallFrontDir);
  alignMatrix.setPosition(baseStart.clone());
  if (meshIn) {
    Object3DUtil.setMatrix(meshIn, alignMatrix);
  }

  var offset = wallFrontDir.clone().multiplyScalar(-depth / 2 + depth / 19);  // NOTE: d/19 offset to avoid z-fighting
  alignMatrix.setPosition(p0.clone().add(offset));
  if (meshOut) {
    Object3DUtil.setMatrix(meshOut, alignMatrix);
  }

  var merged = new THREE.Object3D();
  if (meshIn && meshOut) {
    merged.add(meshIn);
    merged.add(meshOut);
    merged.name = 'DoubleSidedWall';
  } else {
    merged.add(meshIn || meshOut);
    merged.name = 'SingleSidedWall';
  }
  merged.userData.initialWidth = initialWidth;
  if (materialOut) {
    merged.userData.width = width;
  } else {
    merged.userData.width = initialWidth;
  }
  return merged;
};

ArchUtil.makeWallHoleShape = function(hole, holeIndex, depth, surfaceOpts, frameOpts, holeOpts) {
  var includeSurface = surfaceOpts;
  var includeFrame = frameOpts || (!surfaceOpts && !frameOpts);
  if (includeFrame && !frameOpts) {
    frameOpts = { color: 'yellow' };
  }
  var i = holeIndex;
  var surface;
  var frame;
  var object3D;
  if (hole.box && !hole.poly) {
    var min = new THREE.Vector3(hole.box.min[0], hole.box.min[1], -depth / 2);
    var max = new THREE.Vector3(hole.box.max[0], hole.box.max[1], depth / 2);
    if (includeSurface) {
      surface = new MeshHelpers.BoxMinMax(min, max, Materials.getStandardMaterial(surfaceOpts.color, surfaceOpts.alpha));
    }
    if (includeFrame) {
      var box = new THREE.Box3(min, max);
      var boxwf = new THREE.Box3Helper(box, frameOpts.color);
      frame = new MeshHelpers.FatLines(boxwf, 0.03, frameOpts.color);
    }
  } else if (hole.poly) {
    if (includeSurface) {
      var extrudeSettings = {depth: depth / 2, bevelEnabled: false};
      var points = hole.poly.map( p => new THREE.Vector3(p[0], p[1], 0));
      var geo = new THREE.ExtrudeGeometry(new THREE.Shape(points), extrudeSettings);
      surface = new THREE.Mesh(geo, Materials.getStandardMaterial(surfaceOpts.color, surfaceOpts.alpha));
    }
    if (includeFrame) {
      var points1 = hole.poly.map( p => new THREE.Vector3(p[0], p[1], -depth/2));
      var points2 = hole.poly.map( p => new THREE.Vector3(p[0], p[1], depth/2));
      var points = [points1, points2];
      _.forEach(hole.poly, p => {
        points.push(new THREE.Vector3(p[0], p[1], -depth/2), new THREE.Vector3(p[0], p[1], depth/2));
      });
      frame = new MeshHelpers.FatLines(points, 0.03, frameOpts.color);
    }
  } else {
    console.warn('Ignoring hole', hole);
    return;
  }
  if (includeSurface && includeFrame) {
    object3D = new THREE.Object3D();
    object3D.add(surface);
    object3D.add(frame);
  } else if (includeFrame) {
    object3D = frame;
  } else if (includeSurface) {
    object3D = surface;
  }
  if (hole.box && !hole.poly) {
    object3D.userData.box = hole.box;
  } else if (hole.poly) {
    object3D.userData.poly = hole.poly;
  }
  var offset = holeOpts? Object3DUtil.toVector3(holeOpts.offset) : null;
  if (offset) {
    object3D.position.copy(offset);
  }
  object3D.name = hole.type + '#' + i + '_' + hole.id;
  object3D.userData.type = hole.type;
  object3D.userData.id = 'Hole#' + i + '-' + hole.type + '#' + hole.id;
  object3D.userData.holeIndex = i;
  object3D.userData.isWallHole = true;
  object3D.userData.mark = hole.mark;
  return object3D;
};

ArchUtil.makeWallHoleShapes = function(holes, depth, surfaceOpts, frameOpts, holeOpts) {
  return holes.map((hole,i) => {
    return this.makeWallHoleShape(hole, i, depth, surfaceOpts, frameOpts, holeOpts);
  });
};

ArchUtil.makeVerticalSurface = function (type, baseStart, baseEnd, upDir, height, depth, materialOrColor) {
  var width = baseEnd.distanceTo(baseStart);
  // x = width, y = height, z = depth
  // Build box geo
  var boxGeo = new THREE.BoxGeometry(width, height, depth);
  var material = Materials.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(boxGeo, material);
  mesh.name = type;

  // Take start --> end to be right, front to be normal
  var startToEnd = baseEnd.clone().sub(baseStart).normalize();
  var frontDir = new THREE.Vector3();
  frontDir.crossVectors(startToEnd, upDir).normalize();
  var alignMatrix = MatrixUtil.getAlignmentMatrix(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1),
    upDir, frontDir);

  var centerTo = baseStart.clone().add(baseEnd).multiplyScalar(0.5);
  centerTo.add(upDir.clone().multiplyScalar(height / 2));
  alignMatrix.setPosition(centerTo);

  Object3DUtil.setMatrix(mesh, alignMatrix);
  return mesh;
};

ArchUtil.makeWall = function (baseStart, baseEnd, wallUpDir, height, depth, materialOrColor) {
  depth = depth || 10;
  return ArchUtil.makeVerticalSurface('Wall', baseStart, baseEnd, wallUpDir, height, depth, materialOrColor);
};

ArchUtil.addWall = function (scene, baseStart, baseEnd, wallUpDir, height, depth, color) {
  var wall = ArchUtil.makeWall(baseStart, baseEnd, wallUpDir, height, depth, color);
  scene.add(wall);
};

ArchUtil.makeColumn = function (basePoint, baseShape, columnDir, height, width, materialOrColor) {
  width = width || 10;
  var column;
  if (baseShape === 'circle') {
    column = Object3DUtil.makeCylinderStartDir(basePoint, columnDir, height, width, materialOrColor);
  } else if (baseShape === 'square') {
    column = Object3DUtil.makeCylinderStartDir(basePoint, columnDir, height, width, materialOrColor, 4);
  } else if (baseShape === 'poly') {
    var shape = new THREE.Shape(basePoint);
    column = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, bevelThickness: 0, bevelSize: 0.01 });
  } else {
    column = Object3DUtil.makeCylinderStartDir(basePoint, columnDir, height, width, materialOrColor);
    console.warn('Unsupported column baseShape ' + baseShape + ', default to circular base');
  }
  column.name = 'Column';
  return column;
};

ArchUtil.addColumn = function (scene, basePoint, columnDir, height, width, materialOrColor) {
  var column = ArchUtil.makeColumn(basePoint, 'circle', columnDir, height, width, materialOrColor);
  scene.add(column);
};

// HACK: merge pairs of intersecting holes into bigger holes
// TODO: check more than pairs, and do proper box-box union, also handle arbitrary polygon holes
function mergeHoleBoxes(holeBBoxes) {
  var mergedHoleIndices = [];
  var finalHoleBoxes = [];
  for (var i = 0; i < holeBBoxes.length; i++) {
    if (mergedHoleIndices.indexOf(i) >= 0) {
      continue;
    }
    var iHoleBBox = holeBBoxes[i];
    for (var j = i + 1; j < holeBBoxes.length; j++) {
      var jHoleBBox = holeBBoxes[j];
      if (iHoleBBox.intersects(jHoleBBox)) {
        mergedHoleIndices.push(j);
        //console.log('Merging ' + jHoleBBox.toString() + ' to ' + iHoleBBox.toString());
        iHoleBBox.includeBBox(jHoleBBox);
        iHoleBBox.holeIndices.push(...jHoleBBox.holeIndices);
        //console.log('Got ' + iHoleBBox.toString());
      }
    }
    finalHoleBoxes.push(iHoleBBox);
  }
  return { holeBBoxes: finalHoleBoxes, mergedHoleIndices: mergedHoleIndices };
}

function repeatedMergeHolesBoxes(holeBBoxes) {
  holeBBoxes = holeBBoxes.map(b => {
    var res  = b.clone()
    res.holeIndices = [b.holeIndex];
    return res;
  });
  var m = mergeHoleBoxes(holeBBoxes);
  while (m.mergedHoleIndices.length > 0) {
    m = mergeHoleBoxes(m.holeBBoxes);
  }
  return m.holeBBoxes;
}

ArchUtil.mergeHoleBoxes = repeatedMergeHolesBoxes;

module.exports = ArchUtil;