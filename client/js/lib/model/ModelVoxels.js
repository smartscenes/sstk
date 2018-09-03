'use strict';

var ColorGrid = require('geo/ColorGrid');
var crossfilter = require('crossfilter');
var MeshSampling = require('geo/MeshSampling');
var Object3DUtil = require('geo/Object3DUtil');
var RNG = require('math/RNG');
var Voxels = require('geo/Voxels');
var _ = require('util');

/**
 * Represents a set of voxels for a model (can be used by model instances)
 * @param params
 * @param [params.voxelsField='voxels-surface'] {string} What voxels to use
 * @constructor
 * @memberOf model
 */
var ModelVoxels = function (params) {
  Voxels.call(this, params);
  this.voxelsField = 'voxels-surface';
  if (params) {
    if (params.voxelsField) { this.voxelsField = params.voxelsField; }
  }
};

ModelVoxels.prototype = Object.create(Voxels.prototype);
ModelVoxels.prototype.constructor = ModelVoxels;

ModelVoxels.prototype.init = function (model) {
  this.model = model;
  Voxels.prototype.init.call(this);
};

/**
 * Return transform from voxel grid coordinates to world coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getGridToWorld = function () {
  return this._gridToModel;
};

/**
 * Return transform from world coordinates to voxel grid coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getWorldToGrid = function () {
  return this._modelToGrid;
};

/**
 * Return transform from voxel grid coordinates to model coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getGridToModel = function () {
  return this._gridToModel;
};

/**
 * Return transform from model coordinates to voxel grid coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getModelToGrid = function () {
  return this._modelToGrid;
};

/**
 * Updates the voxel grid and transforms
 * @param grid
 * @private
 */
ModelVoxels.prototype.__updateVoxelGrid = function (grid) {
  Voxels.prototype.__updateVoxelGrid.call(this, grid);
  this._gridToModel = this.voxelGrid.gridToWorld;
  this._modelToGrid = this.voxelGrid.worldToGrid;
  if (this._useVoxelGridTransforms) {
    // Nothing to do
  } else if (this.model.info) {
    var mi = this.model.info;
    if (mi.modelSpaceMetadata && mi.voxelsUp && mi.voxelsFront) {
      // Hack to handle alignment of shapenet v2 voxels to original kmz models
      // Align from original to voxel
      var modelToGrid = Object3DUtil.getAlignmentMatrix(this.model.getUp(), this.model.getFront(),
        Object3DUtil.toVector3(mi.voxelsUp), Object3DUtil.toVector3(mi.voxelsFront));

      // Center (use weighted vertex centroid computed on obj)
      var dims = new THREE.Vector3();
      dims.subVectors(Object3DUtil.toVector3(mi.modelSpaceMetadata.max), Object3DUtil.toVector3(mi.modelSpaceMetadata.min));
      var centroid = Object3DUtil.toVector3(mi.modelSpaceMetadata.centroid);
      modelToGrid.setPosition(centroid.multiplyScalar(1.0/dims.length()).negate());

      // Scale to model
      // We need the bb of the the untransformed modelObject
      var modelBB = Object3DUtil.computeBoundingBoxLocal(this.model.object3D, modelToGrid);
      var scale = 1.0/modelBB.dimensions().length();
      modelToGrid.scale(new THREE.Vector3(scale, scale, scale)); // Scale ours to unit

      var gridToModel = new THREE.Matrix4();
      gridToModel.getInverse(modelToGrid);

      var voxelNodeModelSpace = this.voxelNode;
      Object3DUtil.setMatrix(voxelNodeModelSpace, gridToModel);
      voxelNodeModelSpace.updateMatrixWorld();

      this.voxelNode = new THREE.Object3D();
      this.voxelNode.name = 'ModelVoxel-' + mi.fullId;
      this.voxelNode.add(voxelNodeModelSpace);

      this._gridToModel = new THREE.Matrix4();
      this._gridToModel.multiplyMatrices(voxelNodeModelSpace.matrixWorld, this.voxelGrid.gridToWorld);
      this._modelToGrid = new THREE.Matrix4();
      this._modelToGrid.multiplyMatrices(this.voxelGrid.worldToGrid, modelToGrid);
    } else if (mi.voxelsNormalizedAligned || mi.voxelsAligned || mi.voxelsToModelTransform || mi.voxelsCentered) {
      // Align from grid to original model
      var voxelNodeModelSpace = this.voxelNode;
      if (mi.voxelsToModelTransform) {
        var m = Object3DUtil.arrayToMatrix4(mi.voxelsToModelTransform);
        Object3DUtil.setMatrix(voxelNodeModelSpace, m);
      } else if (mi.voxelsNormalizedAligned || mi.voxelsAligned) {
        Object3DUtil.alignToUpFrontAxes(voxelNodeModelSpace,
          Object3DUtil.toVector3(mi.voxelsUp), Object3DUtil.toVector3(mi.voxelsFront),
          this.model.getUp(), this.model.getFront()
        );
      }
      if (mi.voxelsNormalizedAligned || mi.voxelsCentered) {
        // Scale to model
        // We need the bb of the the untransformed modelObject
        var modelBB = Object3DUtil.computeBoundingBoxLocal(this.model.object3D);
        // Assumes normalized to diagonal unit
        if (mi.voxelsNormalizedAligned) {
          var scale = modelBB.dimensions().length();
          voxelNodeModelSpace.scale.multiplyScalar(scale);
        }
        if (mi.voxelsCentered) {
          // Voxels need to be centered
          var centroid = modelBB.centroid();
          voxelNodeModelSpace.position.add(centroid);
        }
        voxelNodeModelSpace.updateMatrix();
        Object3DUtil.clearCache(voxelNodeModelSpace);
      }
      voxelNodeModelSpace.updateMatrixWorld();
      this.voxelNode = new THREE.Object3D();
      this.voxelNode.name = 'ModelVoxel-' + mi.fullId;
      this.voxelNode.add(voxelNodeModelSpace);

      this._gridToModel = new THREE.Matrix4();
      this._gridToModel.multiplyMatrices(voxelNodeModelSpace.matrixWorld, this.voxelGrid.gridToWorld);
      this._modelToGrid = new THREE.Matrix4();
      this._modelToGrid.getInverse(voxelNodeModelSpace.matrixWorld);
      this._modelToGrid.multiplyMatrices(this.voxelGrid.worldToGrid, this._modelToGrid);
    }
  }
};

ModelVoxels.prototype.getVoxelsPath = function (pathField) {
  pathField = pathField || this.voxelsField;
  if (this.model && this.model.info) {
    var info = this.model.info;
    if (info[pathField]) {
      var p = info[pathField];
      if (p.isSupported !== false) {
        return _.isString(p) ? p : p.path;
      } else {
        console.log('No voxels (' + pathField + ') for model: ' + pathField);
      }
    } else {
      console.log('No voxels (' + pathField + ') for model: ' + pathField);
    }
  } else {
    console.log('No model');
  }
};

ModelVoxels.prototype.exists = function () {
  return this.model && this.model.info && this.model.info[this.voxelsField] && this.model.info[this.voxelsField].isSupported !== false;
};

ModelVoxels.prototype.getModelObject3D = function () {
  return this.model.object3D;
};

ModelVoxels.prototype.__computeGridTransforms = function(opts) {
  var targetUp = opts.up;
  var targetFront = opts.front;
  var gridDims = Object3DUtil.toVector3(opts.dims);

  var modelToGrid = new THREE.Matrix4();
  if (targetUp && targetFront) {
    Object3DUtil.getAlignmentMatrix(this.model.getUp(), this.model.getFront(),
      Object3DUtil.toVector3(targetUp), Object3DUtil.toVector3(targetFront));
  }

  // We need the bb of the the untransformed modelObject
  var modelBB = Object3DUtil.computeBoundingBoxLocal(this.model.object3D, modelToGrid);
  var bbDims = modelBB.dimensions();
  var maxDim = Math.max(bbDims.x, bbDims.y, bbDims.z);
  var scale = opts.scale? Object3DUtil.toVector3(opts.scale) : new THREE.Vector3((gridDims.x-1)/maxDim, (gridDims.y-1)/maxDim, (gridDims.z-1)/maxDim);
  if (opts.center) {
    var centroid = modelBB.centroid();
    var offset = new THREE.Vector3(gridDims.x/2, gridDims.y/2, gridDims.z/2);
    modelToGrid.setPosition(centroid.clone().negate().multiply(scale).add(offset));
  } else {
    modelToGrid.setPosition(modelBB.min.clone().negate().multiply(scale));
  }

  // Scale to grid
  modelToGrid.scale(scale);

  var gridToModel = new THREE.Matrix4();
  gridToModel.getInverse(modelToGrid);

  return { gridToModel: gridToModel, modelToGrid: modelToGrid };
};

/**
 * Load existing voxelization and populate it with colors
 * @param voxels
 * @param opts
 * @return {geo.ColorGrid}
 * @private
 */
ModelVoxels.prototype.__createColorGridFromExisting = function(voxels, opts) {
  console.time('createColorGridFromExisting');
  var downsampleBy = opts.downsampleBy || 1;
  var samplesPerVoxel = opts.samplesPerVoxel || 0;
  var scale = 1 / downsampleBy;

  var colorGrid = new ColorGrid();
  colorGrid.init({ dims: [voxels.voxelGrid.dims[0] * scale,
    voxels.voxelGrid.dims[1] * scale,
    voxels.voxelGrid.dims[2] * scale]});
  colorGrid.copyTransform(voxels.voxelGrid, downsampleBy);  // scale factor
  // Initial copying of voxels
  var numVoxels = 0;
  colorGrid.copyReducedValues(voxels.voxelGrid, function(c, k) {
    var hasValues = _.any(c, function(x) { return x; });
    if (hasValues) {
      numVoxels++;
      return {r: 0, g: 0, b: 0, a: 0.1};
    }
  }, downsampleBy);

  var numSamples = Math.max(opts.numSamples, numVoxels*samplesPerVoxel);
  console.log('numVoxels', numVoxels, samplesPerVoxel, numSamples);
  var worldToGridS = new THREE.Matrix4();
  worldToGridS.makeScale(scale, scale, scale);
  var gridToWorldS = new THREE.Matrix4();
  gridToWorldS.makeScale(downsampleBy, downsampleBy, downsampleBy);
  this.__populateColorGrid(colorGrid, _.merge({}, opts, {
    gridToWorld: gridToWorldS.multiplyMatrices(this.getGridToWorld(), gridToWorldS),
    worldToGrid: worldToGridS.multiplyMatrices(worldToGridS, this.getWorldToGrid()),
    keepOriginalVoxels: true,
    numSamples: numSamples
  }));
  console.timeEnd('createColorGridFromExisting');
  return colorGrid;
};

ModelVoxels.prototype.__createColorGrid = function(opts) {
  console.time('createColorGrid');
  var dims = [opts.dim, opts.dim, opts.dim];

  var gridTransforms = this.__computeGridTransforms({ dims: dims, center: opts.center, scale: opts.scale });
  var colorGrid = new ColorGrid();
  colorGrid.init({ dims: dims });
  colorGrid.worldToGrid = gridTransforms.modelToGrid;
  colorGrid.gridToWorld = gridTransforms.gridToModel;

  this._useVoxelGridTransforms = true;
  this.__updateVoxelGrid(colorGrid);

  this.__populateColorGrid(colorGrid, _.merge({}, opts, {
    gridToWorld: this.getGridToWorld(),
    worldToGrid: this.getWorldToGrid()
  }));
  console.timeEnd('createColorGrid');
  return colorGrid;
};

ModelVoxels.prototype.__populateColorGrid = function(colorGrid, opts) {
  if (opts.limitToVisible) {
    var ViewUtils = require('gfx/ViewUtils');
    var modelObject3D = this.getModelObject3D();
    var maxDim = _.max(colorGrid.dims);
    var d =  Math.max(maxDim*2, 256); // Make sure resolution is at least somewhat okay
    var visible = ViewUtils.identifyVisibleTriangles({ scene: modelObject3D, width: d, height: d });
    opts = _.defaults({skipInnerMaterial: false, visibleTriangles: visible, minMaterialScoreRange: [0, 0.3]}, opts);
  }
  if (opts.useTwoPass) {
    return this.__populateColorGridTwoPass(colorGrid, opts);
  } else {
    return this.__populateColorGridPass(colorGrid, opts);
  }
};

// Experimental two pass coloring of grid
ModelVoxels.prototype.__populateColorGridTwoPass = function(colorGrid, opts) {
  // Two stage population of colors
  if (opts.limitToVisible) {
    var opts1 = _.defaults({skipInnerMaterial: false, skipPropagateToUncolored: true}, opts);
    this.__populateColorGridPass(colorGrid, opts1);
    var initialColorGrid = new ColorGrid();
    initialColorGrid.init({ dims: colorGrid.dims });
    initialColorGrid.copy(colorGrid);
    initialColorGrid.minThreshold = 0.5;
    console.log('num voxels in initial grid', initialColorGrid.countSetVoxels());
    var opts2 = opts.useMaterialScores? _.defaults({skipInnerMaterial: true, initialColorGrid: initialColorGrid}, opts) :
        _.defaults({weightFn: 'area', scoreFn: 'smoothedVisibility', initialColorGrid: initialColorGrid}, opts);
    this.__populateColorGridPass(colorGrid, opts2);
    return colorGrid;
  } else {
    return this.__populateColorGridPass(colorGrid, opts);
  }
};

/**
 * Populate colored grid with colors!
 * @param colorGrid {geo.ColorGrid}
 * @param opts
 * @param opts.numSamples {int} Number of samples to take
 * @param [opts.worldToGrid] {THREE.Matrix4} Transform taking world to grid coordinate frame (uses colorGrid.worldToGrid if not specified)
 * @param [opts.gridToWorld] {THREE.Matrix4} Transform taking grid to world coordinate frame (uses colorGrid.gridToWorld if not specified)
 * @param [opts.jitter=false] {boolean} Whether to jitter sampled points
 * @param [opts.limitToVisible=false] {boolean} Whether to limit voxelization to visible triangles
 * @param [opts.keepOriginalVoxels=false] {boolean} Whether to keep original voxelization
 * @param [opts.skipInnerMaterial=false] {boolean} Whether to skip inner material
 * @param [opts.skipPropagateToUncolored=false] {boolean} Whether to skip propagation of colors
 * @param [opts.weightFn] {function(THREE.Mesh,MeshSampling.Face): number|{name:string, args:{}}|string} Function for weighted scoring of mesh faces
 * @param [opts.scoreFn] {function(THREE.Mesh,MeshSampling.Face): number|{name:string, args:{}}|string} Function for scoring final sample
 * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
 * @param [opts.minMaterialScoreRange] {number[]} Min and max (as array) of low and high material score
 * @param [opts.rng] {math.RNG} Random number generator
 * @return {geo.ColorGrid}
 * @private
 */
ModelVoxels.prototype.__populateColorGridPass = function(colorGrid, opts) {
  var rng = opts.rng || RNG.global;
  var numSamples = opts.numSamples;
  var worldToGrid = opts.worldToGrid || colorGrid.worldToGrid;
  var gridToWorld = opts.gridToWorld || colorGrid.gridToWorld;

  var modelObject3D = this.getModelObject3D();

  console.log('Sampling ' + numSamples + ' for coloring');
  var samples = MeshSampling.sampleObject(modelObject3D, numSamples, {
    weightFn: {
//      name: opts.limitToVisible? 'visibleWithArea' : 'area',
      name: opts.weightFn || (opts.limitToVisible? (opts.skipInnerMaterial? 'areaWithVisibleMaterial' : 'visibility') : 'area'),
      args: { scene: modelObject3D, visibleTriangles: opts.visibleTriangles,
        ignoreMaterialWithMinScore: opts.skipInnerMaterial, minMaterialScoreRange: opts.minMaterialScoreRange }
    },
    scoreFn: {
      name: opts.scoreFn || (opts.limitToVisible? 'smoothedVisibility' : 'area'),
      args: { scene: modelObject3D, visibleTriangles: opts.visibleTriangles }
    },
    rng: rng
  });
  var flatSamples = _.flatten(samples);
  //console.log('samples', flatSamples, modelObject3D);
  if (opts.jitter) {
    _.forEach(flatSamples, function (s) {
      s.worldPoint.x += (rng.random() - 0.5) * 5e-2;
      s.worldPoint.y += (rng.random() - 0.5) * 5e-2;
      s.worldPoint.z += (rng.random() - 0.5) * 5e-2;
    });
  }
  //console.log('before',flatSamples.length);
  flatSamples = _.filter(flatSamples, function (s) {
    return s.opacity > 0;  // Ignore samples with zero opacity
  });
  //console.log('after',flatSamples.length);

  _.forEach(flatSamples, function (s) {
    colorGrid.toGrid(s.worldPoint, s, { transform: worldToGrid, clamp: true });
  });
  var cf = crossfilter(flatSamples);
  cf.voxelCoord = cf.dimension(function (s) {
    return [s.x, s.y, s.z].join(',');
  });

  if (opts.initialColorGrid) {
    // TODO: Fix the logic here (copy does not work!)
    // Copy color from initialColorGrid to here
    //colorGrid.copyValuesPartial(opts.initialColorGrid, function(v,k) { return v; });
  }

  // Create voxels directly from samples (may have some holes)
  var extraSampledVoxels = 0;
  var overlappedVoxels = 0;
  cf.voxelCoord.group().all().forEach(function (bin) {
    var coords = bin.key.split(',').map(function (x) { return parseInt(x); });
    var value = bin.value;
    if (value) {
      if (opts.keepOriginalVoxels) {
        var originalRawVoxel = colorGrid.getRawVoxel(coords[0], coords[1], coords[2]);
        if (originalRawVoxel && originalRawVoxel[3] > 0) {
          colorGrid.setOpacity(coords[0], coords[1], coords[2], 1);
          overlappedVoxels++;
        } else {
          colorGrid.setOpacity(coords[0], coords[1], coords[2], 1);
          extraSampledVoxels++;
        }
      } else {
        colorGrid.setOpacity(coords[0], coords[1], coords[2], 1);
        extraSampledVoxels++;
        //colorGrid.setRawVoxel(coords[0], coords[1], coords[2], [255, 255, 255, 255]);
      }
    }
  });
  console.log('Sampled voxels (overlapped,extra)', extraSampledVoxels + overlappedVoxels, overlappedVoxels, extraSampledVoxels);

  var normalMatrix = new THREE.Matrix3().getNormalMatrix(gridToWorld);
  var canonicalDirs = Object3DUtil.OutNormals;
  var canonicalDirWeights = [1,1,0.5,1.5,1,1]; // Favor world up
  var worldDirections = colorGrid.getNeighborDirections(function (n) {
    return n.clone().applyMatrix3(normalMatrix).normalize();
  });
  var dirWeights = _.map(worldDirections, function(wd) {
    var ws = _.map(canonicalDirs, function(d, i) {
      var w = canonicalDirWeights[i];
      var s = d.dot(wd);
      return s > 0? s*w : 0;
    });
    return _.sum(ws);
  });
  //console.log('dirWeights', dirWeights);
  var gridDirections = colorGrid.getNeighborDirections();
  var voxelSamplePoint = new THREE.Vector3();
  var voxelCentroid = new THREE.Vector3();
  var basePoint = new THREE.Vector3();
  var fromBase = new THREE.Vector3();
  var colorGridMinThreshold = colorGrid.minThreshold;
  colorGrid.minThreshold = 0.5;
  function computeWeight(acc, s) {
    if (!acc.freeNeighborIndices) {
      var freeNeighborIndices = [];
      var neighborOccupancy = colorGrid.getNeighborOccupancy(s.x, s.y, s.z);
      for (var i = 0; i < neighborOccupancy.length; i++) {
        if (!neighborOccupancy[i]) {
          freeNeighborIndices.push(i);
        }
      }
      acc.freeNeighborIndices = freeNeighborIndices;
    }
    if (acc.freeNeighborIndices.length === 0 || acc.freeNeighborIndices.length === 6) {
      return 1;
    } else {
      voxelSamplePoint.copy(s.worldPoint);
      voxelSamplePoint.applyMatrix4(worldToGrid);
      voxelCentroid.set(s.x + 0.5, s.y + 0.5, s.z + 0.5);
      var max = _.max(_.map(acc.freeNeighborIndices, function(idx) {
        // Weight samples that point outwards from the voxel
        // (NOTE: This does not help with thin internal surfaces, but works for big solid stuff)
        var normDot = s.worldNormal.dot(worldDirections[idx]);
        basePoint.copy(voxelCentroid);
        basePoint.addScaledVector(gridDirections[idx], -0.5);
        fromBase.subVectors(voxelSamplePoint, basePoint);
        var fromDist = fromBase.dot(gridDirections[idx]);
        // console.log('computeWeight', fromDist, normDot, normDot * (fromDist + 1),
        //   s.face, s.x, s.y, s.z, JSON.stringify(s.color), JSON.stringify(gridDirections[idx]),
        //   JSON.stringify(s.worldNormal), JSON.stringify(worldDirections[idx]));
        var fw = opts.limitToVisible? s.face.score : 1;
        return fw * normDot * (fromDist + 1) * dirWeights[idx];
      }));
      return max;
    }
  }

  function isFiniteColor(c) {
    return isFinite(c.r) && isFinite(c.g) && isFinite(c.b);
  }
  function reduceAdd(acc, s) {
    if (isFiniteColor(s.color)) {
      var hsl = { h: 0, s: 0, l: 0};
      s.color.getHSL(hsl);
      hsl.w = computeWeight(acc, s);
      acc.colors.push(hsl);
    } else {
      console.log('Invalid color', s.color);
    }
    return acc;
  }
  function reduceRemove(acc, s) {
    console.error('Remove HSL unimplemented!');
    process.exit(-1);
    return acc;
  }
  function reduceInit() {
    return { colors: []};
  }

  function aggregateColors(colors, out, mode) {
    out = out || new THREE.Color();
    mode = mode || 'median';
    var sortedColors, avgColor, medianIdx, medianColor;
    if (mode === 'median') {
      sortedColors = _.sortBy(colors, function (c) {
        return c.h;
      });
      medianIdx = Math.min(Math.round(colors.length / 2), colors.length - 1);
      medianColor = sortedColors[medianIdx];
      out.setHSL(medianColor.h, medianColor.s, medianColor.l);
    } else if (mode === 'mean') {
      avgColor = _.reduce(colors, function (acc, c) {
        acc.h += c.h;
        acc.s += c.s;
        acc.l += c.l;
        ++acc.n;
        return acc;
      }, { h: 0, s: 0, l: 0, n: 0 });
      avgColor.h /= avgColor.n;
      avgColor.s /= avgColor.n;
      avgColor.l /= avgColor.n;
      out.setHSL(avgColor.h, avgColor.s, avgColor.l);
    } else if (mode === 'hmedian') {
      sortedColors = _.sortBy(colors, function (c) {
        return c.h;
      });
      medianIdx = Math.min(Math.round(colors.length / 2), colors.length - 1);
      medianColor = sortedColors[medianIdx];
      avgColor = _.reduce(colors, function (acc, c) {
        acc.s += c.s;
        acc.l += c.l;
        ++acc.n;
        return acc;
      }, { s: 0, l: 0, n: 0 });
      avgColor.s /= avgColor.n;
      avgColor.l /= avgColor.n;
      out.setHSL(medianColor.h, avgColor.s, avgColor.l);
    } else if (mode === 'hsmedian') {
      sortedColors = _.sortBy(colors, function (c) {
        return c.h;
      });
      medianIdx = Math.min(Math.round(colors.length / 2), colors.length - 1);
      medianColor = sortedColors[medianIdx];
      avgColor = _.reduce(colors, function (acc, c) {
        acc.l += c.l;
        ++acc.n;
        return acc;
      }, { s: 0, l: 0, n: 0 });
      avgColor.s /= avgColor.n;
      avgColor.l /= avgColor.n;
      out.setHSL(medianColor.h, medianColor.s, avgColor.l);
    }
    return out;
  }

  var tempColor = new THREE.Color();
  cf.voxelCoord.group().reduce(reduceAdd, reduceRemove, reduceInit).all().forEach(function (bin) {
    var coords = bin.key.split(',').map(function (x) { return parseInt(x); });
    var value = bin.value;
    if (opts.initialColorGrid && opts.initialColorGrid.isVoxelSet(coords[0], coords[1], coords[2])) {
      // Skip
    } else if (value && value.colors.length) {
      var maxWeight = _.max(_.map(value.colors, function(c) { return c.w; }));
      var colors = _.filter(value.colors, function(c) { return c.w >= maxWeight; });
      if (maxWeight < 0) {
        //console.log('filtered', value.colors, colors);
        //colorGrid.setRawVoxel(coords[0], coords[1], coords[2], [0,0,0,0]);
      }
      if (colors.length) {
        aggregateColors(colors, tempColor);
        colorGrid.setColor(coords[0], coords[1], coords[2], tempColor);
      }
    }
  });

  if (opts.keepOriginalVoxels && !opts.skipPropagateToUncolored)  {
    // There are maybe uncolored voxels, propagate until we reach all voxels
    var uncoloredVoxels = [];
    colorGrid.iterate(function(v,k) {
      if (v && (v[3] > 0 && v[3] < 255)) {
        uncoloredVoxels.push(k);
      }
    });
    var iter = 0;
    tempColor.a = 0.1;
    while (uncoloredVoxels.length) {
      if (opts.debug) {
        console.log('Coloring ' + uncoloredVoxels.length + ' uncolored voxels at iteration ' + iter);
      }
      var coloredVoxels = []; // Voxels colored in this iteration
      var remainingUncoloredVoxels = [];
      _.each(uncoloredVoxels, function(k) {
        var colors = [];
        colorGrid.iterateNeighborsCoords(k[0],k[1],k[2], function(ni,nj,nk) {
          var c = colorGrid.getColor(ni,nj,nk);
          if (c) {
            colors.push(c.getHSL());
          }
        });
        if (colors.length) {
          aggregateColors(colors, tempColor);
          colorGrid.setColor(k[0], k[1], k[2], tempColor);
          // aggregate colors
          coloredVoxels.push(k);
        } else {
          remainingUncoloredVoxels.push(k);
        }
      });
      // Set colored voxels to be fully opaque
      _.each(coloredVoxels, function(k) {
        colorGrid.setOpacity(k[0], k[1], k[2], 1);
      });
      iter++;
      if (uncoloredVoxels.length === remainingUncoloredVoxels.length) {
        console.warn('Giving up on coloring voxels after ' + iter + ' iterations, ' + remainingUncoloredVoxels.length + ' uncolored voxels remaining');
        break;
      }
      uncoloredVoxels = remainingUncoloredVoxels;
    }
  }
  colorGrid.minThreshold = colorGridMinThreshold;
  return colorGrid;
};

/**
 * Create color grid
 * @param opts
 * @param opts.numSamples {int} Number of samples to take
 * @param [opts.jitter=false] {boolean} Whether to jitter sampled points
 * @param [opts.rng] {math.RNG} Random number generator
 * @param [opts.downsampleBy=1] {int} How much to downsample existing voxelization (used when coloring existing voxelization)
 * @param [opts.dim] {boolean} Voxelization resolution (used when creating new voxelization)
 * @param [opts.center] {boolean} Whether to center the object in the voxel grid (used when creating new voxelization)
 * @param [opts.scale] {THREE.Vector3} Scale factor (used when creating new voxelization)
 * @param [opts.limitToVisible=false] {boolean} Whether to limit voxelization to visible triangles
 * @param callback
 */
ModelVoxels.prototype.createColorGrid = function (opts, callback) {
  var scope = this;
  var hasVoxels = this.getVoxelsPath();
  if (hasVoxels) {
    this.loadVoxels(function (v) {
      var colorGrid = scope.__createColorGridFromExisting(v, opts);
      callback(colorGrid);
    });
  } else {
    var colorGrid = scope.__createColorGrid(opts);
    callback(colorGrid);
  }
};

ModelVoxels.prototype.createColorVoxels = function (opts, callback) {
  var scope = this;
  this.createColorGrid(opts, function (grid) {
    // Make a copy of our voxels and set the grid to be the returned grid
    var mv = new ModelVoxels({ voxelField: scope.voxelField });
    mv._useVoxelGridTransforms = scope._useVoxelGridTransforms;
    mv.init(scope.model);
    mv.setVoxelGrid(grid);
    callback(mv);
  });
};

module.exports = ModelVoxels;
