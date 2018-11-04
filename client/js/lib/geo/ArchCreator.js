var Intersections = require('geo/Intersections');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Create architecture consisting of walls with holes cut out for windows and door
 * @param params
 * @param params.up {THREE.Vector3|string|number[]} Up direction for the architecture
 * @param params.front {THREE.Vector3|string|number[]} Front direction for the architecture
 * @param [params.unit=0.01] {number} Unit in meters
 * @param [params.defaults] {{'Wall': { depth: number, extraHeight: number }}} Default values to use for different architectural elements
 * @memberOf geo
 * @constructor
 */
function ArchCreator(params) {
  this.up = Object3DUtil.toVector3(params.up);
  this.front = Object3DUtil.toVector3(params.front);
  this.left = new THREE.Vector3();
  this.left.crossVectors(this.up, this.front);
  this.unit = params.unit || 0.01;
  this.defaults = _.defaultsDeep(Object.create(null), params.defaults || {}, { 'Wall': { depth: 0.10 / this.unit, extraHeight: 0 }}); // in cm
}

Object.defineProperty(ArchCreator.prototype, 'wallDepth', {
  get: function () {return this.defaults.Wall.depth; },
  set: function (v) { this.defaults.Wall.depth = v; }
});

Object.defineProperty(ArchCreator.prototype, 'wallExtraHeight', {
  get: function () {return this.defaults.Wall.extraHeight; },
  set: function (v) { this.defaults.Wall.extraHeight = v; }
});

/**
 * Create architecture
 * @param arch
 * @param opts
 * @param [opts.filterElements] {function()}
 * @returns {{rooms, outside: Array, elementsById, holeToWalls}}
 */
ArchCreator.prototype.createArch = function(arch, opts) {
  var archElements = this.createArchElements(arch, opts);
  var elementsByRoom = _.groupBy(_.values(archElements), function(x) { return (x instanceof THREE.Object3D)? x.userData.roomId : x.roomId; });
  var rooms = {};
  var outsideElements = [];
  _.each(elementsByRoom, function(relements, roomId) {
    if (roomId != null) {
      var room = new THREE.Group();
      room.name = 'Room#' + roomId;
      room.userData.id = roomId;
      room.userData.type = 'Room';
      for (var i = 0; i < relements.length; i++) {
        if (!opts.filterElements || opts.filterElements(relements[i])) {
          room.add((relements[i] instanceof THREE.Object3D) ? relements[i] : relements[i].object3D);
        }
      }
      rooms[roomId] = room;
    } else {
      outsideElements = relements;
    }
  });
  var walls = _.filter(arch.elements, function(x) { return x.type === 'Wall'; });
  var holeToWalls = {};
  _.each(walls, function(w) {
    if (w.holes) {
      _.each(w.holes, function(h) {
        holeToWalls[h.id] = holeToWalls[h.id] || [];
        holeToWalls[h.id].push(w.id);
      });
    }
  });
  return { rooms: rooms, outside: outsideElements, elementsById: archElements, holeToWalls: holeToWalls };
};


/**
 * Information about an architectural element.
 * @typedef ArchElement
 * @type {geo.WallDef|geo.CeilingDef|geo.FloorDef}
 * @property {string} type - Type of architectural element (`Wall|Ceiling|Floor|Ground`)
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
 * @property {Object[]} holes - Array with information about the holes in the wall (include box)
 * @property {BBox[]} mergedHoleBoxes - Merged holes bounding boxes
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
 * Information about a floor.
 * @typedef FloorDef
 * @type {object}
 * @property {THREE.Vector3[]} points - List of points associated with the floor
 * @property {number} depth - Thickness of the floor
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
  var oldDefaults = this.defaults;
  if (arch.defaults) {
    this.defaults = arch.defaults;
  }
  function __to2D(groupedPoints) {
    return _.map(groupedPoints, function(g) {
      return _.map(g, function(p) {
        return new THREE.Vector2(p[0], p[2]);
      });
    });
  }

  var elements = _.keyBy(arch.elements, 'id');
  var partitioned = _.partition(arch.elements, function(x) { return x.type === 'Wall'; });
  var wallObject3Ds = this.createWalls(partitioned[0],
    function(wall) {
      return wall.points;
    }, opts.getMaterials);
  _.each(wallObject3Ds, function(w) {
    elements[w.userData.id].object3D = w;
  });
  if (opts.groupWalls) {
    var wallsByRoomId = _.groupBy(wallObject3Ds, function(x) { return x.userData.roomId; });
    _.each(wallsByRoomId, function(ws, roomId) {
      elements[roomId + 'w'] = _.map(ws, function(w) { return elements[w.userData.id]; });
    });
  }

  var rest = partitioned[1];
  for (var i = 0; i < rest.length; i++) {
    var e = rest[i];
    var object3D;
    if (e.type === 'Ceiling') {
      var depth = e.depth || _.get(this.defaults, e.type + '.depth');
      var mats = opts.getMaterials(e);
      object3D = this.makeCeiling(__to2D(e.points), depth, mats[0], 0);
    } else if (e.type === 'Floor' || e.type === 'Ground') {
      var depth = e.depth || _.get(this.defaults, e.type + '.depth');
      var mats = opts.getMaterials(e);
      object3D = this.makeGround(__to2D(e.points), depth, mats[0], 0);
    }
    if (object3D) {
      object3D.name = e.type + '#' + e.id;
      object3D.userData.id = e.id;
      object3D.userData.type = e.type;
      object3D.userData.roomId = e.roomId;
      if (e.offset) {
        object3D.position.set(e.offset[0], e.offset[1], e.offset[2]);
      }
      elements[e.id].object3D = object3D;
    } else {
      console.warn('Ignoring unknown arch type ' + e.type);
    }
  }
  this.defaults = oldDefaults;
  return elements;
};

ArchCreator.prototype.makeGround = function(pointGroups, depth, materialOrColor, heightPos) {
  heightPos = heightPos || 0;
  var bevelSize = this.wallDepth/5;
  var up = this.up;
  var front = this.front;

  var material = Object3DUtil.getMaterial(materialOrColor);
  var shapes = pointGroups.map(function (points) { return new THREE.Shape(points); });
  var geometry = null;
  if (depth !== 0) {  // extrude box
    geometry = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: true, bevelThickness: 0, bevelSize: bevelSize });
  } else {  // single plane
    geometry = new THREE.ShapeGeometry(shapes);
  }
  var mesh = new THREE.Mesh(geometry, material);
  Object3DUtil.alignToUpFrontAxes(mesh,
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0),
    up, front
  );
  mesh.userData.isSupportObject = true;
  mesh.userData.isPickable = true;
  mesh.userData.isEditable = false;
  mesh.userData.isSelectable = false;
  mesh.position.set(0, heightPos, 0);
  return mesh;
};

ArchCreator.prototype.makeCeiling = function(pointGroups, depth, materialOrColor, heightPos) {
  heightPos = heightPos || 0;
  var material = Object3DUtil.getMaterial(materialOrColor);
  var bevelSize = this.wallDepth/5;
  var up = this.up;
  var front = this.front;

  var shapes = pointGroups.map(function (points) { return new THREE.Shape(points); });
  var geometry = null;
  if (depth !== 0) {  // extrude box
    geometry = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: true, bevelThickness: 0, bevelSize: bevelSize });
  } else {  // single plane
    geometry = new THREE.ShapeGeometry(shapes);
  }
  var mesh = new THREE.Mesh(geometry, material);
  Object3DUtil.alignToUpFrontAxes(mesh,
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0),
    up, front
  );
  mesh.userData.isSupportObject = true;
  mesh.userData.isPickable = true;
  mesh.userData.isEditable = false;
  mesh.userData.isSelectable = false;
  mesh.position.set(0, heightPos, 0);
  return mesh;
};

/**
 * Create geometry and meshes for walls
 * @param walls {geo.WallDef[]} Array of walls
 * @param getWallPoints {function(geo.WallDef): number[][]} Function returning points for wall
 * @param getMaterials {function(geo.WallDef): THREE.Materials[]} Function returning inside and outside materials for wall
 * @returns {THREE.Object3D[]}
 */
ArchCreator.prototype.createWalls = function(walls, getWallPoints, getMaterials) {
  var up = this.up;
  var wallExtraHeight = this.wallExtraHeight;

  // HACK: merge pairs of intersecting holes into bigger holes
  // TODO: check more than pairs, and do proper box-box union
  function mergeHoles(holeBBoxes) {
    //a4fcb9fb91c4018fc9b54623c674d121
    return Object3DUtil.mergeHoles(holeBBoxes);
  }

  var wallObject3Ds = [];
  for (var iWall = 0; iWall < walls.length; iWall++) {
    var wall = walls[iWall];
    var wallPoints = getWallPoints(wall);
    if (wallPoints[0][0] === wallPoints[1][0] && wallPoints[0][2] === wallPoints[1][2]) {
      // Not real wall, skip
      continue;
    }
    if (wall.holes) {
      var holeBoxes = wall.holes.map(function(x) {
        var box = Object3DUtil.toBox2(x.box);
        return box.clone();
      });
      wall.mergedHoleBoxes = mergeHoles(holeBoxes);
    }
    var baseStart = new THREE.Vector3(wallPoints[0][0], wallPoints[0][1], wallPoints[0][2]);
    var baseEnd = new THREE.Vector3(wallPoints[1][0], wallPoints[1][1], wallPoints[1][2]);
    var roomId = (wall.roomId != undefined)? wall.roomId : wall.parent.id;
    var materials = getMaterials(wall);
    //console.log('wall:', wall);
    var mesh = Object3DUtil.makeWallWithHoles(baseStart, baseEnd,
      up, wall.height, wallExtraHeight, wall.depth, wall.mergedHoleBoxes, materials);
    Object3DUtil.traverseMeshes(mesh, false, function(w) {
      w.userData.type = w.name;
      w.userData.id = wall.id; // Same id as actual wall (not cool)
      w.userData.roomId = roomId;
      w.userData.isEditable = false;
    });
    wall.object3D = mesh;
    Object3DUtil.setVisible(mesh, wall.json? !wall.json.hidden : true);
    mesh.name = 'Wall#' + wall.id;
    mesh.userData.type = 'Wall';
    mesh.userData.id = wall.id;
    mesh.userData.roomId = roomId;
    mesh.userData.holeIds = _.map(wall.holes, 'id');
    mesh.userData.isSupportObject = true;
    mesh.userData.isPickable = true;
    mesh.userData.isEditable = false;

    wallObject3Ds.push(mesh);
  }
  return wallObject3Ds;
};

ArchCreator.prototype.associateWallsWithHoles = function(walls, holes, getHoleBBox, getPoints2D, threshold) {
  //console.log('associateWallsWithHoles');

  // For each wall, figure out holes to cut
  var holeBBoxes = holes.map(function(hole) { return getHoleBBox(hole); });
  // associate each hole with appropriate wall by clipping line walls against hole BBox
  for (var i = 0; i < holeBBoxes.length; i++) {
    var holeBBox = holeBBoxes[i];
    var holeObject = holes[i].object3D;

    // assign hole to intersecting wall
    for (var iWall = 0; iWall < walls.length; iWall++) {
      var wall = walls[iWall];
      //console.log('check if hole ' + i + ' intersects wall ' + iWall);
      if (!wall.height) {
        console.error('No wall height!!!!');
      } else if (wall.height < 0) {
        console.error('Negative wall height: ' + wall.height);
      }
      var points2D = getPoints2D(wall);
      var wallLine = { a: points2D[0], b: points2D[1] };
      wall.width = wallLine.a.distanceTo(wallLine.b);

      // Check whether box intersects wall (from top down view)
      // console.log('check', wallLine.a, wallLine.b, holeBBox.min, holeBBox.max);
      var clip = Intersections.clipLine(holeBBox.min, holeBBox.max, wallLine);
      if (clip.intersects) {
        // console.log('intersected', holeBBox, wallLine);
        // Consider wall not axis aligned if more than 2.5 cm different in x or y
        var min = new THREE.Vector2(wall.width*Math.max(clip.E, 0), Math.max(holeBBox.min.z, wall.height * 0));
        var max = new THREE.Vector2(wall.width*Math.min(clip.L, 1), Math.min(holeBBox.max.z, wall.height * 1));
        if (Math.abs(wallLine.a.x - wallLine.b.x) >= threshold && Math.abs(wallLine.a.y - wallLine.b.y) >= threshold) {
          //console.log('Wall not axis-aligned: ', wallLine);
          // Take corners of bbox in original model coordinates and project onto wall
          var corners = Object3DUtil.computeBoundingBoxLocal(holeObject).getCorners();
          var points = corners.map(function(c) {
            var v3 = c.clone().applyMatrix4(holeObject.matrixWorld);
            return new THREE.Vector2(v3.x, v3.z);
          });
          var ratios = Intersections.projectPointsToRatio(wallLine, points);
          var rmin = Math.min.apply(null, ratios);
          var rmax = Math.max.apply(null, ratios);
          min = new THREE.Vector2(wall.width*Math.max(rmin, 0), Math.max(holeBBox.min.z, wall.height * 0));
          max = new THREE.Vector2(wall.width*Math.min(rmax, 1), Math.min(holeBBox.max.z, wall.height * 1));
        }
        // Make sure it is a valid hole
        if (min.x >= max.x || min.y >= max.y) {
          continue; // Skip this
        }
        var holeBox = new THREE.Box2(min, max);
        if (!wall.holes) { wall.holes = []; }
        var holeType;
        if (holes[i].modelInstance.model.isDoor()) { holeType = 'Door'; }
        else if (holes[i].modelInstance.model.isWindow()) { holeType = 'Window'; }
        wall.holes.push({ id: holeObject.userData.id, modelId: holes[i].modelId, type: holeType, box: holeBox});
        if (!wall.holeIds) { wall.holeIds = []; }
        wall.holeIds.push(holeObject.userData.id);

        if (!(wall.json && wall.json.hidden) || !this.keepHidden) {
          if (!holeObject.userData.wallIds) { holeObject.userData.wallIds = []; }
          holeObject.userData.wallIds.push(wall.id);
        }

        //console.log('INTERSECTS wall ' + iWall, holes[i], wall);
      }
    }
  }

  return walls;
};


// Exports
module.exports = ArchCreator;
