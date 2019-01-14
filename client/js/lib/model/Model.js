'use strict';

define(['model/ModelInstance','geo/Object3DUtil','geo/GeometryUtil','assets/AssetGroups','Constants', 'util/util'],
    function (ModelInstance, Object3DUtil, GeometryUtil, AssetGroups, Constants, _) {

      /**
       * Metadata associated with each model.  The metadata is pretty much a freeform set of attributes and values.
       * It must include the id,source of the model.  Other information are optional and typically populated after retrieving information from solr.
       * @typedef {Object} ModelInfo
       * @memberOf model
       *
       * @property fullId {string} Unique identifier for this model (concatenation of source and id)
       * @property source {string} 3D model database from which this model is taken ("wss" or "archive3d")
       * @property id {string} Unique id (for given source)
       * @property [name] {string} Name of model
       * @property [tags] {string[]} Tags associated with the model
       * @property [unit] {number} Number specifying the physical unit (in meters) the model is specified in (defaults to Constants.defaultModelUnit)
       * @property [up] {number[]|THREE.Vector3} Up vector for model ( defaults to the z-vector (0,0,1) )
       * @property [front] {number[]|THREE.Vector3} Front vector for model ( defaults to the y-vector (0,1,0)? )
       * @property [category] {string[]} Category of model
       * @property [nfaces] {int} Number of faces
       * @property [nvertices] {int} Number of vertices
       * @property [nmaterials] {int} Number of materials
       */

      /**
       * Create a new Model - a Model represents a 3D geometry with texture from which
       *   we can instantiate new ModelInstance(s).  Each ModelInstance has the same
       *   basic geometry as the original Model, but can be transformed (scaled, rotated, positioned)
       *   in different ways.  The original Model is not used directly in a scene.
       *   Only ModelInstance(s) are used in scenes.
       *
       * @param object3D {THREE.Object3D} Object3D that contains geometry/texture for the model
       * @param info {Object} Additional metadata about the model
       * @constructor
       * @memberOf model
       * @property object3D {THREE.Object3D}
       * @property info {model.ModelInfo} The metadata associated with this model.
       */
      function Model(object3D, info) {
        this.init(object3D, info);
      }

      Model.prototype.init = function (object3D, info) {
        this.__origObject3D = object3D;              // Original input model
        this.object3D = new THREE.Object3D();       // Physically scaled model
        this.object3D.add(this.__origObject3D);
        this.object3D.userData.type = 'Model';
        this.object3D.userData = this.__origObject3D.userData;

        if (!info) info = {};
        this.info = info;

        if (info.fullId) {
          this.__origObject3D.name = info.fullId + '-orig';
          this.object3D.name = info.fullId;
          this.object3D.userData.modelId = info.fullId;
        }

        if (!this.info.source && this.info.options && this.info.options.source) {
          this.info.source = this.info.options.source;
        }

        if (this.info.options && this.info.options.autoAlign) {
          this.alignToWorld();
        }
        if (this.info.materials) {
          this.applyMaterials();
        } else if (this.info.options && this.info.options.defaultMaterial) {
          Object3DUtil.setMaterial(this.object3D, this.info.options.defaultMaterial);
        }

        // Initialize object3D to physical scale
        if (this.info.options && this.info.options.autoScale) {
          this.initialBBDims = this.getBBoxDims();
          console.log('Initial model ' + this.getFullID() +
              ' bbdims: [' + this.initialBBDims.x + ',' + this.initialBBDims.y + ',' + this.initialBBDims.z + ']');

          var scale = this.getVirtualUnit();
          this.object3D.scale.set(scale, scale, scale);
          this.object3D.updateMatrix();
          Object3DUtil.clearCache(this.object3D);

          this.physicalBBDims = this.getBBoxDims();
          console.log('Rescaled model ' + this.getFullID() + ' with scale ' + scale +
              ' bbdims: [' + this.physicalBBDims.x + ',' + this.physicalBBDims.y + ',' + this.physicalBBDims.z + ']');
        }
        if (this.info.options && this.info.options.autoCenter) {
          Object3DUtil.placeObject3D(this.object3D);
        }
      };

      Model.prototype.getAlignmentMatrix = function () {
        var up = this.getUp();
        var front = this.getFront();
        var matrix =  Object3DUtil.getAlignmentMatrix(up, front, Constants.worldUp, Constants.worldFront);
        if (this.info.alignments) {
          //console.log('Got alignments', this.info.alignments);
          if (this.info.alignments.data) {
            var alns = this.info.alignments.data;
            if (alns.length) {
              var aln = alns[0].matrix;
              // Premultiply (right multiply) matrix with aln
              var transform = new THREE.Matrix4();
              transform.multiplyMatrices(matrix, aln);
              matrix = transform;
            }
          }
        }
        return matrix;
      };

      Model.prototype.applyMaterials = function () {
        // Apply materials to this model
        Object3DUtil.applyMaterialMappings(this.object3D, JSON.parse(this.info.materials));
      };

      Model.prototype.alignToWorld = function () {
        var up = this.getUp();
        var front = this.getFront();
        //console.log('aligning model to world: up=' + JSON.stringify(up) + ', front=' + JSON.stringify(front));
        Object3DUtil.alignToUpFrontAxes(this.object3D, up, front, Constants.worldUp, Constants.worldFront);
        if (this.info.alignments) {
          //console.log('Got alignments', this.info.alignments);
          if (this.info.alignments.data) {
            var alns = this.info.alignments.data;
            if (alns.length) {
              var aln = alns[0].matrix;
              // Premultiply (right multiply) matrix with aln
              var transform = new THREE.Matrix4();
              transform.multiplyMatrices(this.object3D.matrix, aln);
              Object3DUtil.setMatrix(this.object3D, transform);
            }
          }
        }
      };

      Model.prototype.getUp = function () {
        if (this.info.up && !(this.info.up instanceof THREE.Vector3)) {
          this.info.up = Object3DUtil.toVector3(this.info.up);
        }
        return (this.info.up) ? this.info.up : AssetGroups.getDefaultUp(this.info);
      };

      Model.prototype.getFront = function () {
        if (this.info.front && !(this.info.front instanceof THREE.Vector3)) {
          this.info.front = Object3DUtil.toVector3(this.info.front);
        }
        return (this.info.front) ? this.info.front : AssetGroups.getDefaultFront(this.info);
      };

      Model.prototype.getDefaultUp = function () {
        return AssetGroups.getDefaultUp(this.info);
      };

      Model.prototype.getDefaultFront = function () {
        return AssetGroups.getDefaultFront(this.info);
      };

      Model.prototype.getVersion = function () {
        return (this.info.version) ? this.info.version : 0;
      };

      Model.prototype.getFullID = function () {
        return this.info.fullId;
      };

      Model.prototype.getAssetSource = function() {
        return this.info.source;
      };

      Model.prototype.getBBox = function () {
        return Object3DUtil.getBoundingBox(this.object3D);
      };

      Model.prototype.getBBoxDims = function () {
        return Object3DUtil.getBoundingBoxDims(this.object3D, this.getBBox());
      };

      // Returns unit scale of this model
      Model.prototype.getUnit = function () {
        var unit = (this.info.unit) ? this.info.unit : AssetGroups.getDefaultUnit(this.info);
        return unit;
      };

      // Returns unit in centimeters
      Model.prototype.getVirtualUnit = function () {
        // Get stored unit (in meters)
        var unit = (this.info.unit) ? this.info.unit : AssetGroups.getDefaultUnit(this.info);
        // Convert from stored physical unit to centimeters
        unit = unit * Constants.metersToVirtualUnit;
        return unit;
      };

      // Assumes this.object3D and correspondingly its BBox are already physically scaled
      Model.prototype.getPhysicalDims = function () {
        return this.physicalBBDims;
      };

      Model.prototype.newInstance = function (clone) {
        return new ModelInstance(this,clone);
      };

      Model.prototype.deepClone = function() {
        return new Model(Object3DUtil.deepClone(this.__origObject3D), this.info);
      };

      Model.prototype.isDoor = function () {
        return this.hasCategory('door', true) || this.hasCategory('arch', true) || this.hasCategory('garage_door', true);
      };

      Model.prototype.isWindow = function () {
        return this.hasCategory('window', true);
      };

      Model.prototype.isStairs = function () {
        return this.hasCategory('stairs', true);
      };

      Model.prototype.isRoof = function () {
        return this.hasCategory('roof', true);
      };

      Model.prototype.isPlant = function () {
        return this.hasCategory('plant', true);
      };

      Model.prototype.isPerson = function () {
        return this.hasCategory('person', true);
      };

      Model.prototype.isPartition = function () {
        return this.hasCategory('partition', true);
      };

      Model.prototype.isStructure = function () {
        return this.hasCategory('partition', true) || this.hasCategory('column', true) || this.hasCategory('roof', true);
      };

      Model.prototype.hasCategory = function (cat, ignoreCase) {
        if (ignoreCase) {
          var cats = this.getAllCategoryTags().map( function(x) { return x.toLowerCase(); });
          return cats.indexOf(cat.toLowerCase()) >= 0;
        } else {
          var cats = this.getAllCategoryTags();
          return cats.indexOf(cat) >= 0;
        }
      };

      Model.prototype.hasCategoryIn = function (cats, ignoreCase) {
        for (var i = 0; i < cats.length; i++) {
          var cat = cats[i];
          if (this.hasCategory(cat, ignoreCase)) {
            return true;
          }
        }
        return false;
      };

      Model.prototype.hasCategorySimilar = function (cat) {
        // HACKY Similar category (exact match not required)
        var cats = this.getCategories().map( function(x) { return x.toLowerCase(); });
        var lower = cat.toLowerCase();
        if (cats.indexOf(lower) >= 0) {
          return true;
        } else {
          // Do better check
          for (var i = 0; i < cats.length; i++) {
            var c = cats[i];
            var pieces = c.split(/[\s,_.]+/);
            //if (pieces[pieces.length-1] === lower || pieces[pieces.length-1] === (lower + 's')) {
            if (pieces.indexOf(lower) >= 0 || pieces.indexOf(lower + 's') >= 0) {
              return true;
            }
          }
        }
        return false;
      };

      Model.prototype.getMatchingCategory = function (validCategories) {
        //var cats = this.getCategories();
        var cats = this.getAllCategoryTags();
        if (cats.length > 0) {
          for (var i = 0; i < cats.length; i++) {
            var cat = cats[i];
            if (validCategories.has(cat)) {
              return cat;
            }
          }
          return null;
        } else { return null; }
      };

      Model.prototype.getCategory = function (useFine) {
        var cats = this.getCategories();
        if (cats.length > 0) {
          return useFine? cats[cats.length-1] : cats[0];
        } else { return null; }
      };

      Model.prototype.getCategories = function () {
        if (this.info && this.info.category) {
          var categories = this.info.category;
          if (!Array.isArray(categories)) {
            categories = [categories];
          }
          var cats = categories.filter( function(x) { return !x.startsWith('_'); });
          if (this.info.categoryOrdering === 'coarse-to-fine') {
            cats = _.reverse(cats);
          }
          return cats;
        } else {
          return [];
        }
      };

      Model.prototype.getInternalCategoryTags = function() {
        // Return internal categories
        return this.getAllCategoryTags().filter(function (x) {
            return x.startsWith('_');
        });
      };

      Model.prototype.getAllCategoryTags = function() {
        if (this.info && this.info.category) {
          var categories = this.info.category;
          if (!Array.isArray(categories)) {
            categories = [categories];
          }
          return categories;
        } else {
          return [];
        }
      };

      Model.prototype.getDatasets = function () {
        if (this.info && this.info.datasets) {
          return this.info.datasets;
        } else {
          return [];
        }
      };

      Model.prototype.isScan = function() {
        return (this.info && Constants.assetSources.scan.indexOf(this.info.source) >= 0);
      };

      Model.prototype.getAudioFile = function(soundName) {
        if (this.info && this.info.sounds) {
          if (soundName) {
            return this.info.sounds[soundName];
          } else {
            for (var s in this.info.sounds) {
              if (this.info.sounds.hasOwnProperty(s)) {
                return this.info.sounds[s];
              }
            }
          }
        }
      };

      Model.prototype.getAnnotatedContactPoint = function () {
        if (this.info && this.info.contactPoint) {
          return Object3DUtil.toVector3(this.info.contactPoint);
        }
      };

      Model.prototype.isIndexed = function () {
        return this.info && !this.info.isCustomAsset;
      };

      // Exports
      return Model;

    });
