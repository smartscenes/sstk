'use strict';

define(['Constants', 'geo/Object3DUtil', 'loaders/VoxelLoader', 'util/util', 'voxel-mesh', 'voxel-browser'],
  function (Constants, Object3DUtil, VoxelLoader, _, VoxelMesh) {
  /**
   * Helper class for handling loading of binary Voxel grids in binvox format,
   * rendering and manipulation.
   * @param params
   * @constructor
   */
  function Voxels(params) {
    params = params || {};
    this.mesher = params.mesher || 'greedy';
    this.material = params.material;
    this.name =  params.name || params.voxelsField || 'voxels';
    this.path = params.path;
    this.size = params.size;
    this.sizeBy = params.sizeBy;
    this.labelColorIndex = params.labelColorIndex; // Label to color index
    this.init();
  }

  Voxels.prototype.constructor = Voxels;

  Voxels.prototype.getVoxelMeshes = function () {
    return this.voxelMeshes;
  };

  Voxels.prototype.getVoxelNode = function () {
    return this.voxelNode;
  };

  Voxels.prototype.getVoxelGrid = function () {
    return this.voxelGrid;
  };

  Voxels.prototype.getLabels = function () {
    return this.voxelGrid.labels;
  };

  Voxels.prototype.init = function () {
    // Reset rest
    this.sliceDim = 0;  // Which dimension (0,1,2) to slice along
    this.iSlice = [-1,-1,-1];   // Index of current slice
    this.isSliceMode = false;
    this.isVoxelsVisible = false;
    this.voxelMeshes = null; // Voxel meshes used to create the voxelNode
    this.voxelNode = null;   // If in slice mode, then the voxelNode is shown with a transparent material
    this.voxelGrid = null;   // Grid of voxels
    this.voxelSliceNode = null;  // Current slice of the voxels
  };

  Voxels.prototype.reset = function() {
    this.init();
  };

  Voxels.prototype.isVisible = function () {
    return this.isVoxelsVisible;
  };

  Voxels.prototype.setLabelColorIndex = function(labelColorIndex) {
    this.labelColorIndex = labelColorIndex;
  };

  Voxels.prototype.showVoxels = function (flag) {
    if (this.voxelNode) {
      this.isVoxelsVisible = flag;
      Object3DUtil.setVisible(this.voxelNode, flag);
    } else {
      this.isVoxelsVisible = false;
    }
  };

  Voxels.prototype.loadVoxels = function (onSuccess, onError) {
    var path = this.getVoxelsPath();
    this.__loadVoxels(path, function(err,v) {
      if (err) {
        if (onError) { onError(err); }
      } else{
        if (onSuccess) { onSuccess(v); }
      }
    });
  };

  Voxels.prototype.getVoxelsPath = function (pathField) {
    return this.path;
  };

  Voxels.prototype.__loadVoxels = function (path, callback) {
    if (this.voxelMeshes) {
      // Already loaded...
      if (callback) {
        callback(null, this);
      }
      return;
    }
    if (path) {
      this.__loadVoxelsFromUrlOrFile(path, callback);
    }
  };

  Voxels.prototype.__loadVoxelsFromUrlOrFile = function (url, callback) {
    var loader = new VoxelLoader();
    loader.load(url, function (err, grid) {
      if (grid) {
        console.time('updateVoxelGrid');
        this.__updateVoxelGrid(grid);
        console.timeEnd('updateVoxelGrid');
      }
      if (callback) {
        callback(err, this);
      }
    }.bind(this));
  };

  Voxels.prototype.__getVoxelMeshOptions = function () {
    return {
      mesher: voxel.meshers[this.mesher],
      size: this.size,
      sizeBy: this.sizeBy,
      useBufferGeometry: false
    };
  };

  Voxels.prototype.__createVoxelMesh = function (grid, start, end, targetValue) {
    var voxelData;
    var hexcolors = this.hexcolors;
    var numSetVoxels = 0;
    if (targetValue) {
      voxelData = voxel.generate(start, end, function (x, y, z) {
        var isSet = grid.getVoxel(x, y, z) === targetValue;
        if (isSet) {
          numSetVoxels++;
        }
        return isSet;
      });
    } else {
      voxelData = voxel.generate(start, end, function (x, y, z) {
        var label = grid.getVoxel(x, y, z);
        if (label) {
          numSetVoxels++;
          if (label instanceof THREE.Color) {
            var h = label.getHex();
            return (h > 0)? h : 1;
          } else {
            return (hexcolors) ? hexcolors[label - 1] : label;
          }
        }
      });
    }

    var material;
    if (targetValue || grid.labels.length === 1) {
      material = this.material;
    } else {
      material = new THREE.MeshPhongMaterial({ vertexColors: THREE.FaceColors, wireframe: false });
    }
    var opts = this.__getVoxelMeshOptions();
    var voxelMesh = new VoxelMesh(voxelData, opts);
    var surfaceMesh = voxelMesh.createSurfaceMesh(material);
    surfaceMesh.name = this.name + '-mesh';
    voxelMesh.setPosition(start[0] * voxelMesh.scale.x, start[1] * voxelMesh.scale.y, start[2] * voxelMesh.scale.z);
    voxelMesh.numSetVoxels = numSetVoxels;

    return voxelMesh;
  };

  Voxels.prototype.getGridToWorld = function () {
    if (this.voxelGrid) {
      return this.voxelGrid.gridToWorld;
    }
  };

  Voxels.prototype.getWorldToGrid = function () {
    if (this.voxelGrid) {
      return this.voxelGrid.worldToGrid;
    }
  };

  Voxels.prototype.__updateVoxelGrid = function (grid) {
    // TODO: refactor this code (setting up the coloring
    var labelToIndex = this.labelColorIndex || {};
    var vals = _.filter(_.values(labelToIndex), function (x) { return _.isNumber(x); });
    var maxIdx = (vals.length > 0) ? _.max(vals) : 0;
    function indexOf(labels, label) {
      if (labels.indexOf(label) < 0) {
        labels.push(label);
      }
      if (labelToIndex[label] == undefined) {
        maxIdx++;
        labelToIndex[label] = maxIdx;
      }
      return labelToIndex[label];
    }

    // Initialize
    this.voxelGrid = grid;
    this.voxelMeshes = [];
    this.voxelNode = new THREE.Object3D();
    this.voxelNode.name ='Voxels';
    this.materials = [];
    this.hexcolors = grid.labels.length? [] : null;

    for (var i = 0; i < grid.labels.length; i++) {
      var colorIdx = this.labelColorIndex? indexOf(grid.labels, grid.labels[i]) : (i+1);
      var color = Object3DUtil.createColor(colorIdx);
      this.hexcolors[i] = color.getHex();
      var material = (grid.labels.length > 1) ?
        Object3DUtil.getSimpleFalseColorMaterial(colorIdx, color) : this.material;
      this.materials[i] = material;
    }

    var voxelMesh = this.__createVoxelMesh(grid, [0, 0, 0], grid.dims);
    var voxelNodeModelSpace = new THREE.Object3D();
    //voxelNodeModelSpace.add(voxelMesh.wireMesh);
    voxelNodeModelSpace.add(voxelMesh.surfaceMesh);

    // Take voxels to model space
    voxelNodeModelSpace.applyMatrix(grid.gridToWorld);

    this.voxelNode.add(voxelNodeModelSpace);
    this.voxelMeshes[0] = voxelMesh;
  };

  Voxels.prototype.__updateVoxelMesh = function() {
    if (this.voxelMeshes[0]) {
      var oldSurfaceMesh = this.voxelMeshes[0].surfaceMesh;
      var parent = oldSurfaceMesh.parent;
      parent.remove(oldSurfaceMesh);

      var grid = this.voxelGrid;
      var voxelMesh = this.__createVoxelMesh(grid, [0, 0, 0], grid.dims);
      parent.add(voxelMesh.surfaceMesh);
      this.voxelMeshes[0] = voxelMesh;
    }
  };

  Voxels.prototype.updateField = function(field, v) {
    this[field] = v;
    this.__updateVoxelMesh();
  };

  Voxels.prototype.updateGridField = function(field, v) {
    this.voxelGrid[field] = v;
    this.__updateVoxelMesh();
  };

  Voxels.prototype.setVoxelGrid = function(grid) {
    this.__updateVoxelGrid(grid);
  };

  Voxels.prototype.clearVoxelSlice = function (parentNode) {
    if (this.voxelSliceNode) {
      // Remove old voxel node from parent
      parentNode.remove(this.voxelSliceNode);
      delete this.voxelSliceNode;
    }
  };

  Voxels.prototype.showNextSliceDim = function (parentNode, incr, skipEmptySlices) {
    var dim = this.sliceDim + incr;
    if (dim < 0) { dim = 2; }
    if (dim > 2) { dim = 0; }
    this.showSliceDim(parentNode, dim, skipEmptySlices);
  };

  Voxels.prototype.showSliceDim = function (parentNode, dim, skipEmptySlices) {
    this.showNextVoxelSlice(parentNode, 0, dim, skipEmptySlices);
  };

  Voxels.prototype.showNextVoxelSlice = function (parentNode, incr, dim, skipEmptySlices) {
    if (!this.voxelGrid) return;
    if (dim === undefined) {
      dim = this.sliceDim;
    }
    if (dim < 0 || dim > 2) {
      console.error('Invalid dim: ' + dim);
      return;
    }
    if (this.voxelSliceNode) {
      // Remove old voxel node from parent
      parentNode.remove(this.voxelSliceNode);
    }
    this.getNextSlice(incr, dim);
    if (skipEmptySlices) {
      if (skipEmptySlices < 0) {
        skipEmptySlices = this.voxelGrid.dims[dim];
      }
      var nSkipped = 1;
      var incrDir = (incr >= 0) ? +1 : -1;
      while (this.voxelSliceNode.userData['numSetVoxels'] === 0 && nSkipped < skipEmptySlices) {
        this.getNextSlice(incrDir, dim);
        nSkipped++;
      }
    }
    var currNumSetVoxels = this.voxelSliceNode.userData['numSetVoxels'];
    console.log('Current slice: ' + this.iSlice[dim] + ' for dim ' + dim + ' with ' + currNumSetVoxels + ' set voxels');
    if (currNumSetVoxels > 0) {
      parentNode.add(this.voxelSliceNode);
    }
    this.setSliceMode(true);
  };

  Voxels.prototype.toggleSliceMode = function () {
    this.setSliceMode(!this.isSliceMode);
  };

  Voxels.prototype.setSliceMode = function (flag) {
    if (this.isSliceMode === flag) return;
    this.isSliceMode = flag;
    if (flag) {
      Object3DUtil.setMaterial(this.voxelNode, Object3DUtil.ClearMat, Object3DUtil.MaterialsCompatible, true);
    } else {
      Object3DUtil.revertMaterials(this.voxelNode);
    }
    if (this.voxelSliceNode) {
      Object3DUtil.setVisible(this.voxelNode, flag);
    }
  };

  /**
   * Increments along dimension dim by incr and wraps around if needed.
   *  and returns the appropriate voxel slice
   * @param incr (amount to increment)
   * @param dim (from 0 to 2)
   * @returns {voxelSliceNode|THREE.Object3D|*}
   */
  Voxels.prototype.getNextSlice = function (incr, dim) {
    if (incr === undefined) {
      incr = +1;
    }
    if (dim === undefined) {
      dim = this.sliceDim;
    }
    if (dim < 0 || dim > 2) {
      console.error('Invalid dim: ' + dim);
      return;
    }
    this.sliceDim = dim;
    this.iSlice[dim] = (this.iSlice[dim] + incr);
    if (this.iSlice[dim] < 0) {
      this.iSlice[dim] = this.voxelGrid.dims[dim] - 1;
    }
    if (this.iSlice[dim] >= this.voxelGrid.dims[dim]) {
      this.iSlice[dim] = 0;
    }

    return this.getVoxelSlice(this.iSlice[dim], dim);
  };

  /**
   * Create voxelSliceNode representing the given slice and dim
   * @param slice
   * @param dim (from 0 to 2)
   * @returns {voxelSliceNode|THREE.Object3D|*}
   */
  Voxels.prototype.getVoxelSlice = function (slice, dim) {
    if (dim === undefined) {
      dim = this.sliceDim;
    }
    if (dim < 0 || dim > 2) {
      console.error('Invalid dim: ' + dim);
      return;
    }
    var grid = this.voxelGrid;
    var start = [0,0,0];
    var finish = [grid.dims[0], grid.dims[1], grid.dims[2]];
    start[dim] = slice;
    finish[dim] = slice + 1;

    var voxelSliceMesh = this.__createVoxelMesh(grid, start, finish);

    var voxelSliceMeshNode = new THREE.Object3D();
    voxelSliceMeshNode.name = this.name + '-voxelSlice-' + '-' + slice + '-' + dim;
    voxelSliceMeshNode.userData['numSetVoxels'] = voxelSliceMesh.numSetVoxels;
    voxelSliceMeshNode.add(voxelSliceMesh.surfaceMesh);
    var matrix = this.voxelMeshes[0].surfaceMesh.matrixWorld.clone();
    voxelSliceMeshNode.applyMatrix(matrix);

    this.voxelSliceNode = voxelSliceMeshNode;
    return this.voxelSliceNode;
  };

  // Exports
  return Voxels;

});
