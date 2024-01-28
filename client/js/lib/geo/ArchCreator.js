const Intersections = require('geo/Intersections');
const BBox = require('geo/BBox');
const MeshHelpers = require('geo/MeshHelpers');
const OBBFitter = require('geo/OBBFitter');
const Object3DUtil = require('geo/Object3DUtil');
const ArchUtil = require('geo/ArchUtil');
const MatrixUtil = require('math/MatrixUtil');
const _ = require('util/util');

/**
 * Create architecture consisting of walls with holes cut out for windows and door
 * @param params
 * @param params.up {THREE.Vector3|string|number[]} Up direction for the architecture
 * @param params.front {THREE.Vector3|string|number[]} Front direction for the architecture
 * @param [params.unit=0.01] {number} Unit in meters
 * @param [params.defaults] {{'Wall': { depth: number, extraHeight: number }}} Default values to use for different architectural elements
 * @param [params.assetManager] {assets.AssetManager} AssetManager (used to fetch textures)
 * @param [params.useDefaultMaterials] {boolean} Whether to use the default materials or the materials specified in this arch files
 * @param [params.skipWallHoleCutouts=false] {boolean} Whether to skip cutting out wall holes (for debugging)
 * @param [params.skipWallCeilingProfile=false] {boolean} Whether to skip ceiling cutout (for debugging)
 * @param [params.includeWallCeilingProfilePolys=false] {boolean} Whether to create polygons for wall ceiling profile (for debugging)
 * @param [params.includeWallHoleBoundingBoxes=false] {boolean} Whether to create bounding boxes for wall holes (for debugging)
 * @param [params.createGround] {boolean} Whether to create a large bottom plane
 * @param [params.coords2d=[0,2]] {int[]} two elements indicating what elements (0,1,2) should be used for the 2D floor coordinates
 *  (the 2nd coordinate should be the front direction)
 * @memberOf geo
 * @constructor
 */
function ArchCreator(params) {
  this.setCoords(params.up, params.front, params.coords2d || [0,2], params.unit || 0.01, params.flip);
  this.defaults = _.defaultsDeep(Object.create(null), params.defaults || {}, { 'Wall': { depth: 0.10 / this.unit, extraHeight: 0 }}); // in cm
  this.useDefaultMaterials = params.useDefaultMaterials;
  this.assetManager = params.assetManager;
  this.skipWallHoleCutouts = params.skipWallHoleCutouts;
  this.skipWallCeilingProfile = params.skipWallCeilingProfile;
  this.includeWallCeilingProfilePolys = params.includeWallCeilingProfilePolys;
  this.includeWallHoleBoundingBoxes = params.includeWallHoleBoundingBoxes;
  this.createGround = params.createGround;
}

function getIsFlipped(coords2d) {
  console.assert(coords2d.length === 2);
  console.assert(coords2d[0] >= 0 && coords2d[0] <= 2);
  console.assert(coords2d[1] >= 0 && coords2d[1] <= 2);
  if (coords2d[0] === 0) {
    return coords2d[1] !== 1;
  } else if (coords2d[0] === 1) {
    return coords2d[1] !== 2;
  } else if (coords2d[0] === 2) {
    return (coords2d[1] !== 0);
  }
}

/**
 * Set parameters for interpreting coordinates
 * @param up {THREE.Vector3|string|number[]} Up direction for the architecture
 * @param front {THREE.Vector3|string|number[]} Front direction for the architecture
 * @param coords2d {int[]} two elements indicating what elements (0,1,2) should be used for the 2D floor coordinates
 * @param unit {number} Unit in meters
 * @param [params.flip=null] {boolean} Whether there is a flip in interpretation of the coordinates (if omitted, try to determine from coords2d)
 */
ArchCreator.prototype.setCoords = function(up, front, coords2d, unit, flip) {
  this.up = Object3DUtil.toVector3(up);
  this.front = Object3DUtil.toVector3(front);
  this.flip = (flip != null)? flip : getIsFlipped(coords2d);
  this.left = new THREE.Vector3();
  this.left.crossVectors(this.up, this.front);
  this.coords2d = coords2d;
  this.heightCoord = [0,1,2].filter(c => this.coords2d.indexOf(c) < 0)[0];
  this.frontCoord = coords2d[1]; // Assumes 2nd coordinate is front
  this.unit = unit;
  this.__checkParameters();
};

ArchCreator.prototype.__checkParameters = function() {
  if (this.coords2d.length !== 2) {
    console.error('ArchCreator: Invalid coords2d specified ' + this.coords2d);
  }
  for (let i = 0; i < this.coords2d.length; i++) {
    if (this.coords2d[i] < 0 || this.coords2d > 2) {
      console.error('ArchCreator: Invalid coords2d specified ' + this.coords2d);
    }
  }

  function checkCoordsDir(name, dir, coordIndex) {
    const message = `ArchCreator: Inconsistent coords2d and ${name}} specified, coord2d=${this.coords2d}, ${name}}=${dir.toArray()}`;
    for (let i = 0; i < 3; i++) {
      if (i === coordIndex) {
        if (Math.abs(dir.getComponent(i) - 1) > 0.00001) {
          console.error(message);
        }
      } else {
        if (dir.getComponent(i) !== 0) {
          console.error(message);
        }
      }
    }
  }
  if (this.up) {
    checkCoordsDir('up', this.up, this.heightCoord);
  }
  if (this.front) {
    checkCoordsDir('front', this.front, this.frontCoord);
  }
}

Object.defineProperty(ArchCreator.prototype, 'wallDepth', {
  get: function () {return this.defaults.Wall.depth; },
  set: function (v) { this.defaults.Wall.depth = v; }
});

Object.defineProperty(ArchCreator.prototype, 'wallExtraHeight', {
  get: function () {return this.defaults.Wall.extraHeight; },
  set: function (v) { this.defaults.Wall.extraHeight = v; }
});

ArchCreator.getFilter = function(opts) {
  return function(element) {
    let include = true;
    if (element.hidden) {
      include = include && opts.keepHidden;
    }
    if (!opts.includeCeiling) {
      include = include && (element.type !== 'Ceiling');
    }
    if (!opts.includeFloor) {
      include = include && (element.type !== 'Floor');
    }
    if (!opts.includeWalls) {
      include = include && (element.type !== 'Wall');
    }
    if (!include) {
      return false;
    }
    if (opts.room != undefined && opts.level != undefined) {
      return element.roomId === (opts.level + '_' + opts.room);
    } else if (opts.level != undefined) {
      return element.roomId && element.roomId.startsWith(opts.level + '_');
    } else if (opts.archIds) {
      return opts.archIds.indexOf(element.roomId) >= 0 || opts.archIds.indexOf(element.id) >= 0;
    } else {
      return true;
    }
  };
};

ArchCreator.prototype.__getMaterial = function (materialOptions, customMaterials) {
  if (materialOptions.materialId != null) {
    // TODO: Allow for a blend of material with material id with some custom settings
    if (customMaterials != null) {
      const material = customMaterials[materialOptions.materialId];
      // console.log('got material', material);
      return material;
    }
  }
  if (materialOptions.diffuse != null || materialOptions.texture != null) {
    // Old style textured material
    const mat = this.__getTexturedMaterial(materialOptions.diffuse, materialOptions.texture, materialOptions);
    if (mat.name == null && materialOptions.name != null) {
      mat.name = materialOptions.name;
    }
    return mat;
  } else {
    // More advanced materials
    return this.assetManager.getMaterial(materialOptions);
  }
};

ArchCreator.prototype.__getTexturedMaterial = function (color, texture, options) {
  // Old style textured material
  if (texture) {
    const out = this.assetManager?
      this.assetManager.getTexturedMaterial(this.defaults['textureSource'], texture, options) : null;
    if (out) {
      out.color = new THREE.Color(color || '#ffffff');
      return out;
    } else {
      console.warn('Cannot get textured material for ' + texture);
      return Object3DUtil.getMaterial(color);
    }
  } else {
    return Object3DUtil.getMaterial(color);
  }
};

ArchCreator.prototype.__getMaterials = function(w, customMaterials) {
  const scope = this;
  const materials = (!this.useDefaultMaterials && w.materials && w.materials.length)? w.materials :
    _.get(this.defaults, w.type + '.materials');
  // console.log("materials", materials);
  return _.map(materials, function (m) {
    return scope.__getMaterial(m, customMaterials);
  });
};

/**
 * Create architecture
 * @param arch Json specifying the architecture (note that this is modified to include object3D associated with each element)
 * @param opts
 * @param [opts.filterElements] {function()}
 * @param [opts.groupWalls] {boolean} Whether to group walls by room id (under `<roomId>w`)
 * @param [opts.getMaterials] {function(geo.ArchElement): THREE.Material[]}
 * @param [opts.groupRoomsToLevels] {boolean} Whether to group rooms into levels
 * @param [opts.customMaterials] {Map<id,THREE.Material>} Special materials specified by id
 * @returns {{rooms, outside: Array, elementsById, holeToWalls}}
 */
ArchCreator.prototype.createArch = function(arch, opts) {
  const scope = this;
  let customMaterials = null;
  if (arch.materials && arch.textures && arch.images) {
    const resourcePath = _.get(arch, ['defaults', 'texturePath']) || this.defaults.texturePath;
    customMaterials = this.assetManager.loadMaterials(arch, { resourcePath: resourcePath });
  }
  if (opts.customMaterials) {
    if (customMaterials) {
      customMaterials = _.defaults(customMaterials, opts.customMaterials);
    } else {
      customMaterials = opts.customMaterials;
    }
  }
  opts = _.defaults(Object.create(null), opts || {}, { getMaterials: function(x) { return scope.__getMaterials(x, customMaterials); } });
  const archElements = this.createArchElements(arch, opts);
  const elementsByRoom = _.groupBy(_.values(archElements), function(x) { return (x instanceof THREE.Object3D)? x.userData.roomId : x.roomId; });
  const regions = arch.regions;
  const regionsById = regions? _.keyBy(regions, 'id') : null;
  const rooms = {};
  let outsideElements = [];
  _.each(elementsByRoom, function(relements, roomId) {
    if (roomId != null) {
      const room = new THREE.Group();
      room.name = 'Room#' + roomId;
      room.userData.id = roomId;
      room.userData.type = 'Room';
      room.userData.isPickable = false;
      room.userData.isSelectable = false;
      room.userData.isEditable = false;
      room.userData.isSupportObject = false;
      for (let i = 0; i < relements.length; i++) {
        if (!opts.filterElements || opts.filterElements(relements[i])) {
          room.add((relements[i] instanceof THREE.Object3D) ? relements[i] : relements[i].object3D);
          if (room.userData.level == null && relements[i].level != null) {
            room.userData.level = relements[i].level;
          }
        }
      }
      if (regionsById && regionsById[roomId]) {
        room.userData.roomType = regionsById[roomId].type;
      }
      rooms[roomId] = room;
    } else {
      outsideElements = relements;
    }
  });
  const walls = _.filter(arch.elements, function(x) { return x.type === 'Wall'; });
  const holeToWalls = {};
  _.each(walls, function(w) {
    if (w.holes) {
      _.each(w.holes, function(h) {
        holeToWalls[h.id] = holeToWalls[h.id] || [];
        holeToWalls[h.id].push(w.id);
      });
    }
  });
  const res = { rooms: rooms, outside: outsideElements, elementsById: archElements, holeToWalls: holeToWalls };
  if (opts.groupRoomsToLevels) {
    res.levels = this.roomsToLevels(rooms);
  }
  return res;
};

ArchCreator.prototype.applyModification = function(arch, modifications) {
  // TODO: handle modifications
};

ArchCreator.prototype.roomsToLevels = function(rooms) {
  const regex = /^(\d+)_(\d+)$/;
  const levels = [];
  _.each(rooms, function (room, roomId) {
    if (room.userData.level == null) {
      const matched = regex.exec(roomId);
      if (matched) {
        room.userData.level = parseInt(matched[1]);
      } else {
        room.userData.level = 0;
      }
    }

    const li = room.userData.level;
    if (!levels[li]) {
      const group = new THREE.Group();
      group.name = 'Level#' + li;
      group.userData.id = li;
      group.userData.type = 'Level';
      levels[li] = group;
    }
    const level = levels[li];
    level.add(room);
  });
  return levels;
};

/**
 * Information about an architectural element.
 * @typedef ArchElement
 * @type {geo.WallDef|geo.CeilingDef|geo.FloorDef|ColumnDef|StairsDef}
 * @property {string} type - Type of architectural element (`Wall|Ceiling|Floor|Ground|Landing|Column|Stairs`)
 * @property {string} id - Id of the element
 * @property {string} roomId - Room the architectural element is associated with
 * @property {THREE.Vector3} offset - Amount of offset for the points
 * @memberOf geo
 */

/**
 * Information about a wall.
 * @typedef WallDef
 * @type {object}
 * @property {THREE.Vector3[]} points - List of points associated with the wall
 * @property {Object} parent - Parent of the wall
 * @property {OpeningSpec[]} holes - Array with information about the holes in the wall (include box)
 * @property {number[][]} ceiling - Array of points defining the ceiling profile
 * @property {number} height - Height of the wall
 * @property {number} depth - Thickness of the wall
 * @property {Object} json - Original json object from which the wall is parsed
 * @memberOf geo
 */

/**
 * Information about a ceiling.
 * @typedef CeilingDef
 * @type {object}
 * @property {THREE.Vector3[]} points - List of points associated with the ceiling
 * @property {number} depth - Thickness of the ceiling
 * @memberOf geo
 */

/**
 * Information about a floor (used for Floor, Ground, Landing)
 * @typedef FloorDef
 * @type {object}
 * @property {THREE.Vector3[]} points - List of points associated with the floor
 * @property {number} depth - Thickness of the floor
 * @memberOf geo
 */

/**
 * Information about a column / pillar that consists of a base shape that is extended vertically upwards
 * @typedef ColumnDef
 * @type {object}
 * @property {string} baseShape - Shape (circle|square|poly)
 * @property {THREE.Vector[]} basePoint - Center of circle or square
 * @property {THREE.Vector[]} basePoints - Points for poly outline
 * @property {number} height - Height of column
 * @property {number} width - Radius of column for circle and square
 * @memberOf geo
 */

/**
 * Information about a set of stairs.
 * @typedef StairsDef
 * @type {object}
 * @property {StepSpec[]} steps - Specification of steps making up the stair
 * @property {RailingSpec[]} railing - Specification of railings associated with the stair
 * @memberOf geo
 */


/**
 * Information about a railing.
 * @typedef RailingSpec
 * @type {object}
 * @property {THREE.Vector3[]} points - Base points for railing
 * @property {number[]} base - Relative offset from start of wall
 * @property {number} height - Railing height
 * @property {number} depth - Railing depth
 * @memberOf geo
 */

/**
 * Information about an opening.
 * @typedef OpeningSpec
 * @type {object}
 * @property {string} type - Opening type (Opening|Door|Doorway|Window|Glass)
 * @property {{min: number[], max: number[]}} box - Opening is a box with coordinates specified relative to wall lower left
 * @property {number[][]} poly - Opening is polygon with coordinates specified relative to wall lower left
 * @memberOf geo
 */

/**
 * Information about a step.  The step width is automatically computed from the number of steps and base and end points
 *  (currently assuming no gap)
 * @typedef StepSpec
 * @type {object}
 * @property {int} nSteps - Opening is a box with coordinates specified relative to wall lower left
 * @property {THREE.Vector3[]} basePoints - Opening is polygon with coordinates specified relative to wall lower left
 * @property {THREE.Vector3[]} endPoints - Opening is polygon with coordinates specified relative to wall lower left
 * @property {number} stepHeight - Height of each step
 * @property {number} treadDepth - How thick is the tread (the top surface of each step)
 * @property {boolean} hasRiser - Whether there is riser (the vertical part between steps).  Most stairs have risers.
 * @property {number} riserDepth - How thick is the riser
 * @property {boolean} hasStringer - Whether there is a side surface to the steps
 * @memberOf geo
 */

/**
 * Create architecture elements
 * @param arch Architectural specification of walls
 * @param [arch.elements] {geo.ArchElement[]} Architectural elements
 * @param opts
 * @param [opts.groupWalls] {boolean} Whether to group walls by room id (under `<roomId>w`)
 * @param [opts.getMaterials] {function(geo.ArchElement): THREE.Material[]}
 * @returns {Map<id,geo.ArchElement>}
 */
ArchCreator.prototype.createArchElements = function(arch, opts) {
  const oldValues = _.pick(this, ['defaults', 'up', 'front', 'coords2d', 'unit', 'flip']);
  if (arch.defaults) {
    this.defaults = _.defaultsDeep({}, arch.defaults, oldValues.defaults);
  }
  if (arch.up || arch.front || arch.coords2d || arch.unit || arch.flip != null) {
    const p = _.defaults(_.pick(arch, 'up', 'front', 'coords2d', 'unit'), oldValues);
    this.setCoords(p.up, p.front, p.coords2d, p.unit, arch.flip);
  }
  const coord1 = this.coords2d[0];
  const coord2 = this.coords2d[1];
  const heightCoord = this.heightCoord;

  const elements = _.keyBy(arch.elements, 'id');
  const partitioned = _.partition(arch.elements, function(x) { return x.type === 'Wall'; });
  const wallElements = partitioned[0];
  const wallObject3Ds = this.createWalls(wallElements,
    function(wall) {
      return wall.points;
    }, opts.getMaterials);
  _.each(wallObject3Ds, function(w) {
    elements[w.userData.id].object3D = w;
  });
  if (opts.groupWalls) {
    const wallsByRoomId = _.groupBy(wallObject3Ds, function(x) { return x.userData.roomId; });
    _.each(wallsByRoomId, function(ws, roomId) {
      elements[roomId + 'w'] = _.map(ws, function(w) { return elements[w.userData.id]; });
    });
  }

  const rest = partitioned[1];
  const defaultElementOpts = {
    coords: [coord1, coord2, heightCoord],
    bevelSize: this.wallDepth/5,
    flip: this.flip,
    up: this.up,
    front: this.front,
    epsilon: 0.1
  };
  const ceilingOpts = _.defaults( { useMaxHeight: true }, defaultElementOpts);
  const floorOpts = _.defaults( { useMaxHeight: false }, defaultElementOpts);
  for (let i = 0; i < rest.length; i++) {
    const e = rest[i];
    let object3D;
    if (e.type === 'Ceiling') {
      const mats = opts.getMaterials(e);
      object3D = this.__makeFloorOrCeiling(e, elements, mats, ceilingOpts);
    } else if (e.type === 'Floor' || e.type === 'Ground' || e.type === 'Landing') {
      const mats = opts.getMaterials(e);
      if (e.type === 'Landing') {
        console.log(e);
      }
      object3D = this.__makeFloorOrCeiling(e, elements, mats, floorOpts);
    } else if (e.type === 'Stairs') {
      const mats = opts.getMaterials(e);
      object3D = this.__makeStairs(e, elements, mats, defaultElementOpts);
    } else if (e.type === 'Column') {
      const mats = opts.getMaterials(e);
      object3D = this.__makeColumn(e, mats, defaultElementOpts);
    } else if (e.type === 'Railing') {
      const mats = opts.getMaterials(e);
      object3D = this.__makeRailing(e, mats, { up: defaultElementOpts.up } );
    }
    if (object3D) {
      object3D.name = e.type + '#' + e.id;
      object3D.userData.id = e.id;
      object3D.userData.type = e.type;
      object3D.userData.roomId = e.roomId;
      if (e.mark) {
        object3D.userData.mark = e.mark;
      }
      if (e.markNote) {
        object3D.userData.mark = e.markNote;
      }
      if (e.level != null) {
        object3D.userData.level = e.level;
      }
      if (e.offset) {
        object3D.position.add(new THREE.Vector3(e.offset[0], e.offset[1], e.offset[2]));
      }
      elements[e.id].object3D = object3D;
    } else {
      console.warn('Ignoring unknown arch type ' + e.type);
    }
  }
  if (this.createGround) {
    // Get bounding box and provide a large flat plane at bottom
    const boundingBox = new BBox();
    _.each(elements, function(element) {
      if (element.object3D) {
        boundingBox.includeObject3D(element.object3D);
      }
    });
    const groundBoundingBox = boundingBox.clone();
    groundBoundingBox.max.setComponent(heightCoord, groundBoundingBox.min.getComponent(heightCoord) + 0.00001);
    const ground = new MeshHelpers.BoxMinMax(groundBoundingBox.min, groundBoundingBox.max, 'gray');
    const e = {
      id: "g0",
      type: "Ground",
      roomId: "Outside",
      object3D: ground
    }
    ground.name = e.type + '#' + e.id;
    ground.userData.id = e.id;
    ground.userData.type = e.type;
    ground.userData.roomId = e.roomId;
    setArchUserData(ground, true);
    elements['Ground'] = e;
  }

  this.defaults = oldValues.defaults;
  this.setCoords(oldValues.up, oldValues.front, oldValues.coords2d, oldValues.unit, oldValues.flip);
  return elements;
};

function setArchUserData(object3D, isSupportObject) {
  object3D.userData.isSupportObject = isSupportObject;
  object3D.userData.isPickable = true;
  object3D.userData.isEditable = false;
  object3D.userData.isSelectable = false;
  object3D.userData.isArch = true;
}

ArchCreator.prototype.__makeFlatShape = function(pointGroups2D, depth, materialOrColor, heightPos, opts) {
  heightPos = heightPos || 0;
  const bevelSize = opts.bevelSize;
  const coords = opts.coords;
  const flip = opts.flip;
  const up = opts.up;
  const front = opts.front;

  const minX = Math.min(..._.flatten(pointGroups2D).map(p => p.x));
  const minY = Math.min(..._.flatten(pointGroups2D).map(p => p.y));
  const shiftedPoints = pointGroups2D.map(points => { return points.map(p => new THREE.Vector2(p.x-minX, p.y-minY) )});
  const material = Object3DUtil.getMaterial(materialOrColor);
  const shapes = shiftedPoints.map(function (points) { return new THREE.Shape(points); });
  let geometry = null;
  if (depth !== 0) {  // extrude box
    geometry = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: true, bevelThickness: 0, bevelSize: bevelSize });
  } else {  // single plane
    geometry = new THREE.ShapeGeometry(shapes);
  }
  const mesh = new THREE.Mesh(geometry, material);
  // orient mesh
  if (up != null && front != null) {
    const z = flip ? -1 : 1;
    Object3DUtil.alignToUpFrontAxes(mesh,
      new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 1, 0),
      up, front
    );
  }
  // set mesh position
  mesh.position.setComponent(coords[0], minX);
  mesh.position.setComponent(coords[1], minY);
  mesh.position.setComponent(coords[2], heightPos);
  // add mesh userData
  const object3D = new THREE.Object3D();
  setArchUserData(object3D, true);
  object3D.add(mesh);
  return object3D;
};

ArchCreator.prototype.__makeHorizontalPlanes = function(pointGroups, depth, mats, heightPos, opts) {
  if (mats.length === 1 || pointGroups.length === 1) {
    return this.__makeFlatShape(pointGroups, depth, mats[0], heightPos, opts);
  } else {
    // TODO: check this multimaterial for multiple pointgroups
    return this.__makeFlatShape(pointGroups, depth, mats, heightPos, opts);
  }
};

ArchCreator.prototype.__makeSlantedPlane = function(pointGroup, depth, materialOrColor, opts) {
  // Fit OBB to the pointGroup (this will give us a dominant normal/plane to project the points to)
  const points3D = pointGroup.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const obb = OBBFitter.fitPointsOBB(points3D, { constrainVertical: false });
  const center = obb.getCenter();
  const q = obb.getRotationQuaternion().invert();
  const transformedPoints3D = points3D.map(p => p.clone().sub(center).applyQuaternion(q));
  const hi = obb.getSmallestIndex();
  const c0 = (hi + 1) % 3;
  const c1 = (hi + 2) % 3;
  const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  obb.extractBasis(basis[0], basis[1], basis[2]);
  const shapeOpts = _.clone(opts);
  shapeOpts.up = null;
  shapeOpts.front = null;
  const shape = this.__makeFlatShape([transformedPoints3D.map(p => new THREE.Vector2(p.getComponent(c0), p.getComponent(c1)))],
    depth, materialOrColor, 0, shapeOpts);
  Object3DUtil.alignToUpFrontAxes(shape,
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0),
    basis[hi], basis[c1]
  );
  shape.position.add(center);
  setArchUserData(shape, true);
  return shape;
};

ArchCreator.prototype.__makeSlantedPlanes = function(pointGroups, depth, mats, opts) {
  console.log("make slanted planes", pointGroups);
  const c0 = opts.coords[0];
  const c1 = opts.coords[1];
  const hi = opts.coords[2];
  const object3D = new THREE.Object3D();
  for (let i = 0; i < pointGroups.length; i++) {
    const pointGroup = pointGroups[i];
    const mat = mats[i] || mats[0];
    const heightMin = Math.min(...pointGroup.map(p => p[hi]));
    const heightMax = Math.max(...pointGroup.map(p => p[hi]));
    if (heightMax - heightMin > opts.epsilon) {
      console.log("make slanted plane", pointGroup);
      object3D.add(this.__makeSlantedPlane(pointGroup, depth, mat, opts));
    } else {
      console.log("make horizontal plane", pointGroup);
      const points2D = pointGroup.map(p => new THREE.Vector2(p[c0], p[c1]));
      object3D.add(this.__makeFlatShape([points2D], depth, mat,
        opts.useMaxHeight? heightMax : heightMin, opts));
    }
  }
  return object3D;
};

ArchCreator.prototype.__makeFloorOrCeilingPlanes = function(pointGroups, depth, mats, opts) {
  const hi = opts.coords[2];
  const heightMin = Math.min(...pointGroups.map(pg =>Math.min(...pg.map(p => p[hi]))));
  const heightMax = Math.max(...pointGroups.map(pg =>Math.max(...pg.map(p => p[hi]))));
  if (heightMax - heightMin > opts.epsilon) {
    return this.__makeSlantedPlanes(pointGroups, depth, mats, opts);
  } else {
    const c0 = opts.coords[0];
    const c1 = opts.coords[1];
    const points2D = pointGroups.map(pg => pg.map(p => new THREE.Vector2(p[c0], p[c1])));
    return this.__makeHorizontalPlanes(points2D, depth, mats,
      opts.useMaxHeight? heightMax : heightMin, opts);
  }
};

ArchCreator.prototype.__makeFloorOrCeilingExtruded = function(extrudeOpts, mats, opts) {
  const extrudeLength = extrudeOpts.length;
  const basePoints = extrudeOpts.basePoints;
  const baseStart = new THREE.Vector3(basePoints[0][0], basePoints[0][1], basePoints[0][2]);
  const baseEnd = new THREE.Vector3(basePoints[1][0], basePoints[1][1], basePoints[1][2]);
  const depth = extrudeOpts.depth;
  const profile = extrudeOpts.profile;
  const wallDir = baseEnd.clone().sub(baseStart).normalize();
  const wallFrontDir = new THREE.Vector3();
  wallFrontDir.crossVectors(wallDir, opts.up).normalize();

  // make ceiling profile
  const points = profile.map(p => new THREE.Vector2(p[0], p[1] - depth/2));
  for (let i = profile.length - 1; i >=0; i--) {
    const p = profile[i];
    points.push(new THREE.Vector2(p[0], p[1] + depth/2));
  }

  const ceilingProfileShape = new THREE.Shape(points);
  const extrudeSettings = { depth: extrudeLength, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(ceilingProfileShape, extrudeSettings);
  const mesh = new THREE.Mesh(geo, [mats[0], mats[0]]);

  // align and position
  const pos = baseStart.clone();
  if (extrudeOpts.offset) {
    pos.add(extrudeOpts.offset);
  }
  const alignMatrix = MatrixUtil.getAlignmentMatrix(
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1), opts.up, wallFrontDir);
  alignMatrix.setPosition(pos);
  Object3DUtil.setMatrix(mesh, alignMatrix);
  setArchUserData(mesh, true);
  return mesh;
};

ArchCreator.prototype.__makeFloorOrCeiling = function(element, otherElementsById, mats, opts) {
  function __ensureGroupedPoints(points) {
    // Makes sure that points is an array of polygons
    if (points && points.length) {
      const pg = points[0];
      if (pg.length) {
        const p = pg[0];
        // This should be a point (array of length 3)
        // If it is a number, then let's puts points inside another array
        if (typeof p === 'number') {
          points = [points];
        }
      }
    }
    return points;
  }
  const depth = element.depth || _.get(this.defaults, element.type + '.depth');
  if (element.extrude) {
    // make extrude shape
    let extrudeProfilePoints = element.extrude.profile;
    let extrudeBasePoints = element.extrude.basePoints;
    const extrudeLength = element.extrude.length;
    if (!extrudeProfilePoints || !extrudeBasePoints) {
      if (element.extrude.baseElementId != null) {
        const extrudeElement = otherElementsById[element.extrude.baseElementId];
        if (extrudeElement) {
          console.log('got extrude element', extrudeElement);
          if (!extrudeBasePoints) {
            extrudeBasePoints = extrudeElement.points;
          }
          if (!extrudeProfilePoints) {
            const extrudeField = element.type.toLowerCase();
            extrudeProfilePoints = extrudeElement[extrudeField];
            if (!extrudeProfilePoints) {
              console.warn(`Cannot find extrude field ${extrudeField} for extrude element ${element.extrude.baseElementId} for ${element.id}`);
            }
          }
        } else {
          console.warn(`Cannot find extrude element ${element.extrude.baseElementId} for ${element.id}`);
        }
      } else {
        console.warn(`Cannot find extrude parameter 'baseElementId' for ${element.id}`);
      }
    }
    if (!extrudeLength) {
      console.warn(`Cannot find extrude parameter 'length' for ${element.id}`);
    }

    if (extrudeProfilePoints && extrudeBasePoints && extrudeLength) {
      const offset = element.offset;
      const extrudeShape = this.__makeFloorOrCeilingExtruded({
         profile: extrudeProfilePoints,
         basePoints: extrudeBasePoints,
         length: extrudeLength,
         // hackyiness so we can have both points and extrude (mainly for debugging), we should get rid of points/offset if using extrude
         offset: offset ? new THREE.Vector3(offset[0], offset[1], offset[2]).negate() : null,
         depth: depth
       }, mats, opts);
       if (extrudeShape != null) {
         return extrudeShape;
       }
     }
  }
  element.points = __ensureGroupedPoints(element.points);
  return this.__makeFloorOrCeilingPlanes(element.points, depth, mats, opts);
};

ArchCreator.prototype.__makeColumn = function(element, mats, opts) {
  if (element.baseShape === 'poly') {
    const basePoints = element.basePoints.map(p => Object3DUtil.toVector3(p));
    return ArchUtil.makeColumn(basePoints, element.baseShape, opts.up, element.height, element.width, mats[0]);
  } else {
    const basePoint = Object3DUtil.toVector3(element.basePoint);
    return ArchUtil.makeColumn(basePoint, element.baseShape, opts.up, element.height, element.width, mats[0]);
  }
};

ArchCreator.prototype.__makeStairs = function(element, otherElementsById, mats, opts) {
  // TODO: handles other types of steps (curved/spiral)
  const stairs = this.__makeStraightStairs(element.steps, element.railing, mats, opts);
  return stairs;
};

function getComponent(p, i) {
  if (Array.isArray(p)) { return p[i]; }
  else { return p.getComponent(i); }
}

ArchCreator.prototype.__makeStraightStairs = function(stepSpec, railingSpec, mats, opts) {
  // Straight steps go from basePoints to endPoints
  // Make steps
  const coords = opts.coords;
  const nSteps = stepSpec.nSteps;
  const basePoints = stepSpec.basePoints; //map(p => Object3DUtil.toVector3(p));
  const endPoints = stepSpec.endPoints; //map(p => Object3DUtil.toVector3(p));
  let stepHeight = stepSpec.stepHeight;
  const stepHeightFiller = 0;
  if (!stepHeight) {
    // Try to autocompute stepHeight
    const heightDiff = getComponent(endPoints[0],coords[2]) - getComponent(basePoints[0],coords[2]);
    stepHeight = heightDiff/nSteps;
  }
  const baseStepPoints = basePoints.map(p => {
    return new THREE.Vector2(getComponent(p,coords[0]), getComponent(p,coords[1]));
  });
  const endStepPoints = endPoints.map(p => {
    return new THREE.Vector2(getComponent(p,coords[0]), getComponent(p,coords[1]));
  });
  // Try to autocompute stepDelta
  const stepDelta = endStepPoints[0].clone();
  stepDelta.sub(baseStepPoints[0]).divideScalar(nSteps);
  for (let i = basePoints.length-1; i >=0; i--) {
    const p = baseStepPoints[i];
    baseStepPoints.push(p.clone().add(stepDelta));
  }
  let baseRiserPoints = null;
  if (stepSpec.hasRiser) {
     baseRiserPoints = basePoints.map(p => Object3DUtil.toVector3(p));
     // TODO: have option for riser to be inset a bit
  }
  const treadDepth = stepSpec.treadDepth || 0.03;  // TODO: get from defaults
  let stepHeightPos = getComponent(basePoints[0], coords[2]);
  const steps = new THREE.Object3D();
  const riserHeight = stepHeight - treadDepth;
  const riserDepth = stepSpec.riserDepth || 0.03;  // TODO: get from defaults
  for (let i = 0; i < nSteps; i++) {
    // make tread
    const tread = this.__makeHorizontalPlanes([baseStepPoints], treadDepth, mats, stepHeightPos, opts);
    tread.position.setComponent(coords[0], tread.position.getComponent(coords[0]) + stepDelta.x*i);
    tread.position.setComponent(coords[1], tread.position.getComponent(coords[1]) + stepDelta.y*i);
    steps.add(tread);
    if (baseRiserPoints) {
      // make riser
      const riser = ArchUtil.makeVerticalSurface('Riser', baseRiserPoints[0], baseRiserPoints[1], opts.up,
        riserHeight, riserDepth, mats);
      setArchUserData(riser, true);
      riser.position.setComponent(coords[0], riser.position.getComponent(coords[0]) + stepDelta.x*(i+1));
      riser.position.setComponent(coords[1], riser.position.getComponent(coords[1]) + stepDelta.y*(i+1));
      riser.position.setComponent(coords[2], riser.position.getComponent(coords[2]) + (stepHeight+stepHeightFiller)*i + treadDepth);
      steps.add(riser);
    }
    if (stepSpec.hasStringer) {
      // TODO: make stringer
    }
    stepHeightPos += stepHeight + stepHeightFiller;
  }
  // TODO: Make railing
  if (railingSpec) {

  }
  return steps;
};

ArchCreator.prototype.__makeRailing = function(railingSpec, railingMaterials, baseElement) {
  const railingHeight = (railingSpec.height != null)? railingSpec.height : _.get(this.defaults, 'Railing.height');
  const railingDepth = (railingSpec.depth != null)? railingSpec.depth : _.get(this.defaults, 'Railing.depth');
  let rbaseStart;
  let rbaseEnd;
  // use points from railing if specified
  if (railingSpec.points) {
    rbaseStart = new THREE.Vector3(...railingSpec.points[0]);
    rbaseEnd = new THREE.Vector3(...railingSpec.points[1]);
  } else if (baseElement) {
    rbaseStart = baseElement.baseStart.clone();
    rbaseEnd = baseElement.baseEnd.clone();
    if (railingSpec.base) {
      const baseDir = baseElement.baseEnd.clone().sub(baseElement.baseStart).normalize();
      rbaseStart = baseElement.baseStart.clone().addScaledVector(baseDir, railingSpec.base[0]);
      rbaseEnd = baseElement.baseStart.clone().addScaledVector(baseDir, railingSpec.base[1]);
    }
    if (baseElement.height) {
      const heightCoord = this.heightCoord
      rbaseStart.setComponent(heightCoord, rbaseStart.getComponent(heightCoord) + baseElement.height);
      rbaseEnd.setComponent(heightCoord, rbaseEnd.getComponent(heightCoord) + baseElement.height);
    }
  } else {
    console.warn('No base element specified and no base points specified for railing');
  }
  const railingObject3D = ArchUtil.makeWallWithHoles({
    wallId: railingSpec.id,
    wallBaseStart: rbaseStart,
    wallBaseEnd: rbaseEnd,
    wallUpDir: baseElement.up,
    wallHeight: railingHeight,
    wallExtraHeight: 0,
    wallDepth: railingDepth,
    materials: railingMaterials,
    normalizedMaterialRepeat: false
  });
  setArchUserData(railingObject3D, false);
  console.log('railing', railingObject3D);
  return railingObject3D;
}

/**
 * Create geometry and meshes for walls
 * @param walls {geo.WallDef[]} Array of walls
 * @param getWallPoints {function(geo.WallDef): number[][]} Function returning points for wall
 * @param getMaterials {function(geo.WallDef): THREE.Materials[]} Function returning inside and outside materials for wall
 * @returns {THREE.Object3D[]}
 */
ArchCreator.prototype.createWalls = function(walls, getWallPoints, getMaterials) {
  const up = this.up;
  const wallExtraHeight = this.wallExtraHeight;

  const coord1 = this.coords2d[0];
  const coord2 = this.coords2d[1];
  const wallObject3Ds = [];
  for (let iWall = 0; iWall < walls.length; iWall++) {
    const wall = walls[iWall];
    const wallPoints = getWallPoints(wall);
    if (wallPoints[0][coord1] === wallPoints[1][coord1] && wallPoints[0][coord2] === wallPoints[1][coord2]) {
      // Not real wall, skip
      continue;
    }
    const baseStart = new THREE.Vector3(wallPoints[0][0], wallPoints[0][1], wallPoints[0][2]);
    const baseEnd = new THREE.Vector3(wallPoints[1][0], wallPoints[1][1], wallPoints[1][2]);
    const roomId = (wall.roomId != undefined)? wall.roomId : (wall.parent? wall.parent.id : null);
    const materials = getMaterials(wall);
    const wallHeight = (wall.height != null)? wall.height : _.get(this.defaults, 'Wall.height');
    const wallDepth = (wall.depth != null && wall.depth > 0)? wall.depth : _.get(this.defaults, 'Wall.depth');
    const wallObject3D = wallHeight > 0? ArchUtil.makeWallWithHoles({
      wallId: wall.id,
      wallBaseStart: baseStart,
      wallBaseEnd: baseEnd,
      wallUpDir: up,
      wallHeight: wallHeight,
      wallExtraHeight: wallExtraHeight,
      wallDepth: wallDepth,
      wallHoles: this.skipWallHoleCutouts? null : wall.holes,
      ceilingContour: this.skipWallCeilingProfile? null : wall.ceiling,
      materials: materials,
      normalizedMaterialRepeat: false
    }) : new THREE.Group();
    Object3DUtil.traverseMeshes(wallObject3D, false, function(w) {
      w.userData.type = w.name;
      w.name = w.userData.type + '#' + wall.id;
      w.userData.id = wall.id; // Same id as actual wall (not cool)
      w.userData.roomId = roomId;
      w.userData.isEditable = false;
    });
    if (wall.railing && wall.railing.length) {
      for (let i = 0; i < wall.railing.length; i++) {
        const railingSpec = wall.railing[i];
        const railingMaterials = getMaterials(railingSpec);
        const baseElement = {
          id: wall.id,
          up: up,
          baseStart: baseStart,
          baseEnd: baseEnd,
          height: wallHeight,
          roomId: roomId
        }
        const railingObject3D = this.__makeRailing(railingSpec, railingMaterials, baseElement);
        railingObject3D.userData.type = railingSpec.type;
        railingObject3D.name = railingSpec.type + '#' + railingSpec.id;
        railingObject3D.userData.id = railingSpec.id;
        railingObject3D.userData.wallId = wall.id;
        railingObject3D.userData.roomId = roomId;
        wallObject3D.add(railingObject3D);
      }
    }
    if (wall.holes && wall.holes.length) {
      const hasFillInHoles = _.some(wall.holes, h => h.type === 'Glass');
      if (this.includeWallHoleBoundingBoxes || hasFillInHoles) {
        // include bounding boxes for wall holes
        let holeShapeObject3Ds;
        if (this.includeWallHoleBoundingBoxes) {
          const color = 0x00ffff;
          holeShapeObject3Ds = ArchUtil.makeWallHoleShapes(wall.holes, wallDepth,
            {color: color, alpha: 0.2}, {color: color});
        } else if (hasFillInHoles) {
          const wdelta = (wallObject3D.userData.initialWidth - wallObject3D.userData.width)/2;
          holeShapeObject3Ds = wall.holes.map((hole, i) => {
            if (hole.type === 'Glass') {
              const color = hole.color != null? hole.color : 0x777777;
              const alpha = (hole.opacity != null)? hole.opacity : (hole.alpha != null? hole.alpha : 0.1);
              return ArchUtil.makeWallHoleShape(hole, i, wallDepth, { color: color, alpha: alpha }, { offset: [wdelta, 0,0] });
            }
          });
        }

        const holeGroup = new THREE.Object3D();
        const firstWall = wallObject3D.children[0];
        Object3DUtil.setMatrix(holeGroup, firstWall.matrix);
        holeGroup.name = 'Wall#' + wall.id + '-Holes';
        for (let i = 0; i < holeShapeObject3Ds.length; i++) {
          const holeObject3D = holeShapeObject3Ds[i];
          if (holeObject3D) {
            holeObject3D.userData.roomId = roomId;
            holeObject3D.userData.wallId = wall.id;
            setArchUserData(holeObject3D, false);
            holeGroup.add(holeObject3D);
          }
        }
        wallObject3D.add(holeGroup);
      }
    }
    if (wall.ceiling && wall.ceiling.length) {
      if (this.includeWallCeilingProfilePolys) {
        const color = 0xff0000;
        const points = _.concat(wall.ceiling, [[wallObject3D.userData.width, wall.height], [0, wall.height]]);
        const wallCeilingObject3D = ArchUtil.makeWallHoleShape({ 'type': 'WallCeiling', 'id': '0', 'poly': points },
          0, wallDepth, {color: color, alpha: 0.2}, {color: color});
        const ceilingGroup = new THREE.Object3D();
        ceilingGroup.name = 'Wall#' + wall.id + '-Ceiling';
        const firstWall = wallObject3D.children[0];
        Object3DUtil.setMatrix(ceilingGroup, firstWall.matrix);
        ceilingGroup.add(wallCeilingObject3D);
        wallObject3D.add(ceilingGroup);
      }
    }
    wall.object3D = wallObject3D;
    Object3DUtil.setVisible(wallObject3D, wall.json? !wall.json.hidden : true);
    wallObject3D.name = 'Wall#' + wall.id;
    setArchUserData(wallObject3D, true);
    wallObject3D.userData.type = 'Wall';
    wallObject3D.userData.id = wall.id;
    wallObject3D.userData.roomId = roomId;
    wallObject3D.userData.holeIds = _.map(wall.holes, 'id');
    wallObject3D.userData.wallId = wall.id;
    wallObject3D.userData.mark = wall.mark;
    wallObject3D.userData.markNote = wall.markNote;

    if (materials.length === 1 && materials[0] && materials[0].uuid === 'mat_glass') {
      wallObject3D.userData.material = 'Glass';
    }
    wallObject3Ds.push(wallObject3D);
  }
  return wallObject3Ds;
};

ArchCreator.prototype.associateWallsWithHoles = function(walls, holes, getHoleBBox, getPoints2D, threshold, keepHidden) {
  //console.log('associateWallsWithHoles');

  // For each wall, figure out holes to cut
  const holeBBoxes = holes.map(function(hole) { return getHoleBBox(hole); });
  // associate each hole with appropriate wall by clipping line walls against hole BBox
  for (let i = 0; i < holeBBoxes.length; i++) {
    const holeBBox = holeBBoxes[i];
    const holeObject = holes[i].object3D;

    // assign hole to intersecting wall
    for (let iWall = 0; iWall < walls.length; iWall++) {
      const wall = walls[iWall];
      //console.log('check if hole ' + i + ' intersects wall ' + iWall);
      if (!wall.height) {
        console.error('No wall height!!!!');
      } else if (wall.height < 0) {
        console.error('Negative wall height: ' + wall.height);
      }
      const points2D = getPoints2D(wall);
      const wallLine = { a: points2D[0], b: points2D[1] };
      wall.width = wallLine.a.distanceTo(wallLine.b);

      // Check whether box intersects wall (from top down view)
      // console.log('check', wallLine.a, wallLine.b, holeBBox.min, holeBBox.max);
      const clip = Intersections.clipLine(holeBBox.min, holeBBox.max, wallLine);
      if (clip.intersects) {
        // console.log('intersected', holeBBox, wallLine);
        // Consider wall not axis aligned if more than 2.5 cm different in x or y
        let min = new THREE.Vector2(wall.width*Math.max(clip.E, 0), Math.max(holeBBox.min.z, wall.height * 0));
        let max = new THREE.Vector2(wall.width*Math.min(clip.L, 1), Math.min(holeBBox.max.z, wall.height * 1));
        if (Math.abs(wallLine.a.x - wallLine.b.x) >= threshold && Math.abs(wallLine.a.y - wallLine.b.y) >= threshold) {
          //console.log('Wall not axis-aligned: ', wallLine);
          // Take corners of bbox in original model coordinates and project onto wall
          const corners = Object3DUtil.computeBoundingBoxLocal(holeObject).getCorners();
          const points = corners.map(function(c) {
            const v3 = c.clone().applyMatrix4(holeObject.matrixWorld);
            return new THREE.Vector2(v3.x, v3.z);
          });
          const ratios = Intersections.projectPointsToRatio(wallLine, points);
          const rmin = Math.min.apply(null, ratios);
          const rmax = Math.max.apply(null, ratios);
          min = new THREE.Vector2(wall.width*Math.max(rmin, 0), Math.max(holeBBox.min.z, wall.height * 0));
          max = new THREE.Vector2(wall.width*Math.min(rmax, 1), Math.min(holeBBox.max.z, wall.height * 1));
        }
        // Make sure it is a valid hole
        if (min.x >= max.x || min.y >= max.y) {
          continue; // Skip this
        }
        const holeBox = new THREE.Box2(min, max);
        if (!wall.holes) { wall.holes = []; }
        let holeType;
        if (holes[i].modelInstance.model.isDoor()) { holeType = 'Door'; }
        else if (holes[i].modelInstance.model.isWindow()) { holeType = 'Window'; }
        wall.holes.push({ id: holeObject.userData.id, modelId: holes[i].modelId, type: holeType, box: holeBox});
        if (!wall.holeIds) { wall.holeIds = []; }
        wall.holeIds.push(holeObject.userData.id);

        if (!(wall.json && wall.json.hidden) || !keepHidden) {
          if (!holeObject.userData.wallIds) { holeObject.userData.wallIds = []; }
          holeObject.userData.wallIds.push(wall.id);
        }

        //console.log('INTERSECTS wall ' + iWall, holes[i], wall);
      }
    }
  }

  return walls;
};

ArchCreator.prototype.getWallPoints = function(elements, swapWallPoints) {
  const walls = _.filter(elements, function(x) { return x.type === 'Wall' && x.points.length; });
  const allWallPoints = [];
  const groupedWalls = [];
  if (walls.length) {
    const wallsGroupedByPoints = _.groupByMulti(walls, function (w) {
      return w.points;
    });
    let iter = 0;
    while (_.size(wallsGroupedByPoints) > 0 && iter < walls.length) {
      // Get points
      const wallPoints = [];
      const selectedWalls = [];
      let wall = _.find(wallsGroupedByPoints, function(x) { return true; })[0];
      let lastPt = null;
      while (wall != null && iter < walls.length) {
        // Add wall points
        iter++;
        selectedWalls.push(wall);
        const pts = wall.points;
        if (lastPt === null) {
          // Append all wallpoints
          wallPoints.push.apply(wallPoints, pts);
        } else {
          const index = _.findIndex(pts, function(x) { return x.toString() == lastPt; });
          const newWallPoints = [pts[index]];
          for (let i = index+1; i < pts.length; i++) {
            wallPoints.push(pts[i]);
            if (swapWallPoints) {
              newWallPoints.push(pts[i]);
            }
          }
          for (let i = 0; i < index; i++) {
            wallPoints.push(pts[i]);
            if (swapWallPoints) {
              newWallPoints.push(pts[i]);
            }
          }
          if (swapWallPoints) {
            wall.points = newWallPoints;
          }
        }
        lastPt = wallPoints[wallPoints.length - 1];

        _.each(pts, function (p) {
          const g = wallsGroupedByPoints[p];
          _.pull(g, wall);
          if (g.length === 0) {
            delete wallsGroupedByPoints[p];
          }
        });
        const g2 = wallsGroupedByPoints[lastPt];
        wall = g2? g2[0] : null;
      }
      allWallPoints.push(wallPoints);
      groupedWalls.push(selectedWalls);
    }
  }
  return { wallPoints: allWallPoints, groupedWalls: groupedWalls };
};

ArchCreator.prototype.toSceneState = function(json, arch, finalize) {
  const SceneState = require('scene/SceneState');
  const scene = new THREE.Scene();
  const sceneState = new SceneState(scene, {id: json.id, up: json.up, front: json.front, unit: json.scaleToMeters});
  //console.log(arch);
  _.each(arch.levels, function(level, levelId) {
    if (level) {
      scene.add(level);
    }
  });
  _.each(arch.rooms, function (room, roomId) {
    sceneState.addExtraObject(room, true, true);
  });
  if (finalize) {
    sceneState.finalizeScene();
  }
  return sceneState;
};

ArchCreator.DEFAULTS = {
  up: new THREE.Vector3(0,1,0),
  front: new THREE.Vector3(0,0,1),
  unit: 1,
  defaults: {
    'Wall': {
      depth: 0.1,
      height: 2.7,
      extraHeight: 0.035,
      materials: [
        {
          "name": "inside",                          // Name of material ("inside" for inside wall)
          "diffuse": "#ffffff"                       // Diffuse color in hex
        },
        {
          "name": "outside",                         // Name of material ("outside" for outside wall)
          "diffuse": "#ffffff"                       // Diffuse color in hex
        }
      ]
    },
    'Railing': {
      depth: 0.05,
      height: 1.0
    },
    'Ceiling': {
      depth: 0.05,
      offset: 0.04,    // Bit offset above wall extraHeight
      materials: [
        {
          "name": "surface",
          "diffuse": "#ffffff"
        }
      ]
    },
    'Floor': {
      depth: 0.05,
      materials: [
        {
          "name": "surface",
          "diffuse": "#ffffff"

        }
      ]
    },
    'Landing': {
      depth: 0.05,
      materials: [
        {
          "name": "surface",
          "diffuse": "#ffffff"

        }
      ]
    },
    'Ground': {
      depth: 0.08,
      materials: [
        {
          "name": "surface",
          "diffuse": "#ffffff"
        }
      ]
    }
  },
  filter: {
    includeCeiling: true,
    includeFloor: true,
    includeWalls: true
  }
};


// Exports
module.exports = ArchCreator;
