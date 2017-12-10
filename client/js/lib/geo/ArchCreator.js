var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

function ArchCreator(params) {
  this.up = Object3DUtil.toVector3(params.up);
  this.front = Object3DUtil.toVector3(params.front);
  this.unit = params.unit || 0.01;
  this.defaults = _.defaultsDeep(Object.create(null), params.defaults, { 'Wall': { depth: 0.10 / this.unit, extraHeight: 0 }}); // in cm
}

Object.defineProperty(ArchCreator.prototype, 'wallDepth', {
  get: function () {return this.defaults.Wall.depth; },
  set: function (v) { this.defaults.Wall.depth = v; }
});

Object.defineProperty(ArchCreator.prototype, 'wallExtraHeight', {
  get: function () {return this.defaults.Wall.extraHeight; },
  set: function (v) { this.defaults.Wall.extraHeight = v; }
});

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
        room.add((relements[i] instanceof THREE.Object3D)? relements[i] : relements[i].object3D);
      }
      rooms[roomId] = room;
    } else {
      outsideElements = relements;
    }
  });
  return { rooms: rooms, outside: outsideElements, elementsById: archElements };
};

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
  })
  if (opts.groupWalls) {
    var wallsByRoomId = _.groupBy(wallObject3Ds, function(x) { return x.userData.roomId; });
    _.each(wallsByRoomId, function(ws, roomId) {
      elements[roomId + 'w'] = _.map(ws, function(w) { return elements[w.userData.id]; })
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
    geometry = new THREE.ExtrudeGeometry(shapes, { amount: depth, bevelEnabled: true, bevelThickness: 0, bevelSize: bevelSize });
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
}

ArchCreator.prototype.makeCeiling = function(pointGroups, depth, materialOrColor, heightPos) {
  heightPos = heightPos || 0;
  var material = Object3DUtil.getMaterial(materialOrColor);
  var bevelSize = this.wallDepth/5;
  var up = this.up;
  var front = this.front;

  var shapes = pointGroups.map(function (points) { return new THREE.Shape(points); });
  var geometry = null;
  if (depth !== 0) {  // extrude box
    geometry = new THREE.ExtrudeGeometry(shapes, { amount: depth, bevelEnabled: true, bevelThickness: 0, bevelSize: bevelSize });
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
}

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
    mesh.userData.holeIds = wall.holeIds;
    mesh.userData.isSupportObject = true;
    mesh.userData.isPickable = true;
    mesh.userData.isEditable = false;

    wallObject3Ds.push(mesh);
  }
  return wallObject3Ds;
}

// Exports
module.exports = ArchCreator;
