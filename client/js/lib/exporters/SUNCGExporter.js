// Exports a scene in SUNCG format
var BBox = require('geo/BBox');
var FileUtil = require('io/FileUtil');
var Index = require('ds/Index');
var Object3DUtil = require('geo/Object3DUtil');
var SceneUtil = require('scene/SceneUtil');
var async = require('async');
var _ = require('util');

var SUNCG_VERSION_STRING = 'suncg@1.0.2';
var SUNCG_ARCH_VERSION_STRING = 'suncg-arch@1.0.2';

function SUNCGExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
}
SUNCGExporter.prototype.export = function (sceneState, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  opts.name = (opts.name != undefined)? opts.name : 'scene';
  opts.dir = (opts.dir != undefined)? opts.dir + '/' : '';
  var filename = opts.dir + opts.name + '.json';
  var callback = opts.callback;

  var json = this.convert(sceneState, opts);
  fileutil.fsWriteToFile(filename, JSON.stringify(json), function () {
    fileutil.fsExportFile(filename, filename);
    console.log('finished processing ' + sceneState.getFullID());
    if (callback) { callback(); }
  });
};

function getParsedItem(sceneState, id) {
  var parsed = sceneState.parsedData;
  var splitIds = id.split('_').map(function(x) { return parseInt(x); });
  for (var i = 0; i < splitIds.length; i++) {
    parsed = parsed.children[splitIds[i]];
  }
  return parsed;
}


function splitWalls(walls) {
  // Split walls by door holes
  var wallSegs = [];
  for (var i = 0; i < walls.length; i++) {
    var wall = walls[i];
    var doorHoles = wall.holes.filter(function(h) { return h.type === 'Door'; });
    if (doorHoles.length > 0) {
      var doorBoxes = doorHoles.map(function(h) {
        return new THREE.Box2(Object3DUtil.toVector2(h.box.min), Object3DUtil.toVector2(h.box.max));
      });
      doorBoxes = Object3DUtil.mergeHoles(doorBoxes);
      // Non-overlapping boxes, sort by min
      doorBoxes = _.sortBy(doorBoxes, function(b) { return b.min.x; });
      if (doorHoles.length !== doorBoxes.length) {
        console.warn('Merged ' + doorHoles.length + ' door holes to ' + doorBoxes.length + ' for wall ' + wall.id);
      }
      var p0 = Object3DUtil.toVector3(wall.points[0]);
      var p1 = Object3DUtil.toVector3(wall.points[1]);
      var wallDir = p1.clone().sub(p0).normalize();
      var width = p1.distanceTo(p0);
      var last = p0;
      var lw = 0;
      for (var j = 0; j < doorBoxes.length; j++) {
        var box = doorBoxes[j];
        var start = p0.clone().addScaledVector(wallDir, box.min.x);
        var end = p0.clone().addScaledVector(wallDir, box.max.x);
        wallSegs.push({
          id: wall.id + '_' + j,
          roomId: wall.roomId,
          height: wall.height,
          points: [ last.toArray(), start.toArray() ]
        });
        //console.log('added ' + JSON.stringify(wallSegs[wallSegs.length-1]));
        last = end;
        lw = box.max.x;
      }
      if (lw < width) {
        wallSegs.push({
          id: wall.id + '_' + j,
          roomId: wall.roomId,
          height: wall.height,
          points: [ last.toArray(), p1.toArray() ]
        });
        //console.log('added ' + JSON.stringify(wallSegs[wallSegs.length-1]));
      }
    } else {
      wallSegs.push(_.omit(wall, ['holes']));
    }
  }
  return wallSegs;
}

function reduceWallsExactMatch(allwalls, opts) {
  opts = opts || {};
  // Remove walls that are duplicates and combine walls that should be together
  var reducedWalls = [];
  var groupedByVerticalPosition = _.groupBy(allwalls, function(w) {
    var p = [w.points[0][1], w.points[1][1]];
    if (opts.fixedPrecision) {
      p = _.map(p, function(v) { return v.toFixed(opts.fixedPrecision); });
    }
    return p.join(',');
  });
  _.forEach(groupedByVerticalPosition, function(walls, vp) {
    var grouped = _.groupBy(walls, function (w) {
      var p0 = [w.points[0][0], w.points[0][2]];
      var p1 = [w.points[1][0], w.points[1][2]];
      if (p0[0] > p1[0] || (p0[0] === p1[0] && p0[1] > p1[1])) {
        // swap
        var tmp = p0;
        p0 = p1;
        p1 = tmp;
      }
      var p = [p0[0], p0[1], p1[0], p1[1]];
      if (opts.fixedPrecision) {
        p = _.map(p, function (v) {
          return v.toFixed(opts.fixedPrecision);
        });
      }
      return p.join(',');
    });
    _.forEach(grouped, function (g, k) {
      if (g.length > 1) {
        //console.log('Grouped', k, JSON.stringify(g, null, 2));
        var wall = {
          id: _.map(g, function (x) {
            return x.id;
          }).join(','),
          roomId: _.map(g, function (x) {
            return x.roomId;
          }).join(','),
          height: _.maxBy(g, 'height').height,
          points: g[0].points
        };
        //console.log(JSON.stringify(wall, null, 2));
        reducedWalls.push(wall);
      } else {
        reducedWalls.push(g[0]);
      }
    });
  });
  console.log('Reduced walls: ' + allwalls.length + ' to ' + reducedWalls.length);
  return reducedWalls;
}

function reduceWallsOverlap(allwalls, opts) {
  opts = opts || {};
  // Remove walls that are duplicates and combine walls that should be together
  var reducedWalls = [];
  var groupedByVerticalPosition = _.groupBy(allwalls, function(w) {
    var p = [w.points[0][1], w.points[1][1]];
    if (opts.fixedPrecision) {
      p = _.map(p, function(v) { return v.toFixed(opts.fixedPrecision); });
    }
    return p.join(',');
  });
  _.forEach(groupedByVerticalPosition, function(walls, vp) {
    var grouped0 = {};
    var grouped1 = {};
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var p0 = [w.points[0][0], w.points[0][2]];
      var p1 = [w.points[1][0], w.points[1][2]];
      if (p0[0] > p1[0] || (p0[0] === p1[0] && p0[1] > p1[1])) {
        // swap
        var tmp = p0;
        p0 = p1;
        p1 = tmp;
      }
      var p = [p0[0], p0[1], p1[0], p1[1]];
      if (opts.fixedPrecision) {
        p = _.map(p, function (v) {
          return v.toFixed(opts.fixedPrecision);
        });
      }
      if (p[0] === p[2]) {
        if (!grouped0[p[0]]) {
          grouped0[p[0]] = [w];
        } else {
          grouped0[p[0]].push(w);
        }
      } else if (p[1] === p[3]) {
        if (!grouped1[p[1]]) {
          grouped1[p[1]] = [w];
        } else {
          grouped1[p[1]].push(w);
        }
      } else {
        reducedWalls.push(w);
      }
    }
    _.forEach(grouped1, function (g, k) {
      if (g.length > 1) {
        g = _.sortBy(g, function(x) { return Math.abs(x.points[1][1] - x.points[0][1]); });
        //console.log('Grouped', k, JSON.stringify(g, null, 2));
        var wall = {
          id: _.map(g, function (x) {
            return x.id;
          }).join(','),
          roomId: _.map(g, function (x) {
            return x.roomId;
          }).join(','),
          height: _.maxBy(g, 'height').height,
          points: g[0].points
        };
        //console.log(JSON.stringify(wall, null, 2));
        reducedWalls.push(wall);
      } else {
        reducedWalls.push(g[0]);
      }
    });
  });
  console.log('Reduced walls: ' + allwalls.length + ' to ' + reducedWalls.length);
  return reducedWalls;
}

SUNCGExporter.prototype.exportArch = function (sceneState, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  var filename = opts.filename || 'wall.json';
  var callback = opts.callback;

  var arch = this.getArch(sceneState, opts);
  var walls = _.filter(arch.elements, function(x) { return x.type === 'Wall'; })
  var jsonFilename = filename;
  var textFilename = filename.replace('.json', '').replace('.arch','.wall');
  async.parallel([
      function(cb) {
        // Output json
        var json = {
          version: SUNCG_ARCH_VERSION_STRING,
          id: sceneState.info.id,
          // Following fields are a bit redundant with the house file but allows architecture to be recreated on its own
          up: sceneState.info.defaultUp,
          front: sceneState.info.defaultFront,
          scaleToMeters: opts.unit,
          defaults: arch.defaults,
          // Actual archtectural elements
          elements: arch.elements
        };
        fileutil.fsWriteToFile(jsonFilename, JSON.stringify(json), function () {
          fileutil.fsExportFile(jsonFilename, jsonFilename);
          cb();
        });
      },
      function(cb) {
        // Output txt
        walls = splitWalls(walls);
        walls = reduceWallsExactMatch(walls, { fixedPrecision: 2 });
        var wallLines = walls.map(function(w,index) {
          var fields = [];
          var p0 = w.points[0];
          var p1 = w.points[1];
          fields.push('wall');
          fields.push(index);
          fields.push(p0[2]);
          fields.push(p0[0]);
          fields.push(p0[1]);
          fields.push(p1[2]);
          fields.push(p1[0]);
          fields.push(p1[1] + w.height);
          fields.push(0);
          fields.push(0);
          return fields.join(' ');
        });
        var text = 'filetype wall\n' + wallLines.join('\n');
        fileutil.fsWriteToFile(textFilename, text, function () {
          fileutil.fsExportFile(textFilename, textFilename);
          cb();
        });
      }
    ],
    // optional callback
    function(err, results) {
      console.log('finished processing ' + sceneState.getFullID());
      if (callback) { callback(err, results); }
    }
  );
};

SUNCGExporter.prototype.getArch = function (sceneState, opts) {
  var archTypes = ['Wall', 'Ground', 'Ceiling', 'Floor'];
  var transformInfo = this.__getTransformInfo(sceneState, opts);
  var s = transformInfo.scaleBy;
  var rooms = sceneState.getRooms();
  var archElements = [];
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var parsedRoom = getParsedItem(sceneState, room.userData.id);
    var groundLevel = room.parent.position.y;
    for (var k = 0; k < archTypes.length; k++) {
      var archType = archTypes[k];
      var nodes = Object3DUtil.findNodes(room, function(x) { return x.userData.type === archType; });
      if (archType === 'Wall') {
        for (var j = 0; j < nodes.length; j++) {
          var wall = nodes[j];
          var parsedWall = getParsedItem(sceneState, wall.userData.id);
          var holes = parsedWall.holes || [];
          holes = holes.map(function(h) {
            var h2 = _.cloneDeep(h);
            h2.box.min = [h2.box.min.x*s, h2.box.min.y*s];
            h2.box.max = [h2.box.max.x*s, h2.box.max.y*s];
            return h2;
          });
          var points = parsedWall.points2DFinal.map(function(p) { return [p.x*s, groundLevel*s, p.y*s]; });
          var materials = _.map(parsedWall.materials, function(m) {
            return { name: m.name, texture: m.texture, diffuse: m.color };
          });
          var w = {
            id: parsedWall.id, type: archType, roomId: room.userData.id,
            height: parsedWall.height*s,
            points: points, holes: holes, materials: materials
          };
          if (parsedWall.depth != undefined) {
            w.depth = parsedWall.depth*s;
          }
          archElements.push(w);
        }
      } else {
        // Ceiling/Floor/Ground
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          var u = node.userData;
          var planeHeight = groundLevel*s + u.planeHeight*s;
          var groupedPoints = _.map(u.groupedPoints, function(gp) {
            return gp.map(function(p) { return [p.x*s, 0, p.y*s]; });
          });
          var materials = [{ name: 'surface', texture: u.material.texture, diffuse: u.material.color }];
          var w = {
            id: node.userData.id, type: archType, roomId: room.userData.id,
            offset: [u.offset.x*s, planeHeight, u.offset.y*s],
            points: groupedPoints, materials: materials
          };
          if (u.depth != undefined) {
            w.depth = u.depth*s;
          }
          archElements.push(w);
        }
      }
    }
  }
  var grounds = sceneState.findNodes(function(x) { return x.userData.type === 'Ground' && x.userData.groupedPoints; });
  for (var i = 0; i < grounds.length; i++) {
    var node = grounds[i];
    var u = node.userData;
    var groundLevel = node.parent.position.y;
    var planeHeight = groundLevel*s + u.planeHeight*s;
    var groupedPoints = _.map(u.groupedPoints, function(gp) {
      return gp.map(function(p) { return [p.x*s, 0, p.y*s]; });
    });
    var materials = [{ name: 'surface', texture: u.material.texture, diffuse: u.material.color }];
    var w = {
      id: u.id, type: u.type,
      offset: [u.offset.x*s, planeHeight, u.offset.y*s],
      points: groupedPoints, materials: materials
    };
    if (u.depth != undefined) {
      w.depth = u.depth*s;
    }
    archElements.push(w);
  }
  var archDefaults;
  if (sceneState.archDefaults) {
    archDefaults = _.mapValues(sceneState.archDefaults, function(m) {
      return _.mapValues(m, function(v) { return v*s; });
    });
  }
  return { elements: archElements, defaults: archDefaults };
};

function getFilter(item) {
  var filter;
  if (item.object3D instanceof THREE.Group) {
    filter = function(obj) {
      return !obj.userData.isInvalid && obj.visible;
    };
  }
  return filter;
}

SUNCGExporter.prototype.__getTransformInfo = function (sceneState, opts) {
  var transform = opts.transform;
  var scaleBy = opts.unit ? (sceneState.info.defaultUnit / opts.unit) : 1.0;
  if (opts.transform) {
    transform = opts.transform.clone();
  } else {
    var sceneTransformMatrixInverse = new THREE.Matrix4();
    sceneTransformMatrixInverse.getInverse(sceneState.scene.matrixWorld);
    transform = sceneTransformMatrixInverse;
  }
  if (opts.unit) {
    var scaleMat = new THREE.Matrix4();
    scaleMat.makeScale(scaleBy, scaleBy, scaleBy);
    transform.multiply(scaleMat);
  }
  return { scaleBy: scaleBy, transform: transform };
};

SUNCGExporter.prototype.convert = function (sceneState, opts) {
  // console.log(sceneState);
  // Setup transform (default to some reasonable thing)
  var omitBBox = opts.omitBBox;
  var saveStats = opts.saveStats;
  var transformInfo = this.__getTransformInfo(sceneState, opts);
  var transform = transformInfo.transform;
  var sceneBBox = new BBox();
  // Prepare json data
  var json = {};
  json.version = SUNCG_VERSION_STRING;
  json.id = sceneState.info.id;
  json.up = sceneState.info.defaultUp;
  json.front = sceneState.info.defaultFront;
  json.scaleToMeters = opts.unit;
  var up = Object3DUtil.toVector3(json.up);
  if (opts.indexMaterials) {
    json.materials = [];
    var materialIndex = new Index({
      id: function (m) {
        return JSON.stringify(m);
      }
    });
  }
  json.levels = [];
  var parsed = sceneState.parsedData;
  var levels = parsed.children;
  for (var i = 0; i < levels.length; i++) {
    var l = levels[i];
    var nodes = l.children.map(function (item) {
      var nodeType = item.json.className;
      var modelId;
      var state;
      var includeTransform;
      var includeDimensions;
      if (nodeType === 'Door' || nodeType === 'Window' || nodeType === 'Ns') {
        nodeType = 'Object';
        modelId = item.modelId;
        state = item.json.aframe;
        includeTransform = true;
      } else if (nodeType === 'Pr') {
        nodeType = 'Box';
        includeTransform = true;
        includeDimensions = true;
      } else if (nodeType === 'Room') {
        modelId = 'fr_' + i + 'rm_' + item.index;
      } else if (nodeType === 'Ground') {
        modelId = 'fr_' + i + 'gd_' + item.index;
      } else {
        console.warn('Invalid nodeType: ' + nodeType);
        nodeType =  'None';
      }
      var node = {
        id: item.id,
        type: nodeType,
        valid: item.json.valid
      };
      if (item.json.hidden || nodeType === 'None') {  // set node to be invalid if hidden or unknown
        node.valid = 0;
      }
      if (node.type === 'Ground' && item.object3D && item.object3D.isDegenerate) {
        // invalidate ground if geometry is degenerate (i.e. not enough polygon points)
        node.valid = 0;
      }
      if (modelId != undefined) {
        node.modelId = modelId;
        node.state = state;
      }
      if (includeTransform) {
        if (item.object3D) {
          var object3D = item.object3D;
          var mInst = Object3DUtil.getModelInstance(object3D);
          if (mInst) {
            object3D = mInst.getObject3D('Model');
          }
          object3D.updateMatrixWorld();
          node.transform = object3D.matrixWorld;
          if (transform) {
            node.transform = transform.clone();
            node.transform.multiply(object3D.matrixWorld);
          }
          if (includeDimensions) {  // include dimensions in meters and undo scale in transform
            var tm = (item.json.tm || 100);
            node.dimensions = [item.json.sX / tm, item.json.sZ / tm, item.json.sY / tm];
            var scaleMat = new THREE.Matrix4();
            scaleMat.makeScale(tm, tm, tm);
            node.transform.multiply(scaleMat);
          }
          node.transform = node.transform.toArray();
        } else {
          console.warn('Warning: No object3D for scene ' + json.id + ', item ' + item.id, item);
        }
        var numFlips = (item.json.fX ? 1 : 0) + (item.json.fY ? 1 : 0);
        if (numFlips === 1) {
          node.isMirrored = 1;
        }
      }
      if (nodeType === 'Room') {
        node.nodeIndices = item.objectIndices;
        node.roomTypes = item.json.rtypeStr;
        if (item.json.rhidden || !item.hasCeiling) {
          node.hideCeiling = 1;
        }
        if (item.json.fhidden || !item.hasFloor) {
          node.hideFloor = 1;
        }
        if (item.object3D && item.object3D.isDegenerate) {
          // hide ceiling and floor for degenerate rooms since no corresponding geometry
          node.hideCeiling = 1;
          node.hideFloor = 1;
        }
        if (!item.walls || item.walls.length === 0) {  // invalid room if no walls
          node.valid = 0;
        } else {
          if (item.nVisibleWalls === 0) {  // no visible walls
            node.hideWalls = 1;
            if (node.hideCeiling && node.hideFloor) {
              // Invalid Room
              node.valid = 0;
            } else {
              console.log('No visible walls for Room in scene ' + json.id + ', item ' + item.id);
            }
          }
        }
        if (saveStats) {
          var area = SceneUtil.computeRoomFloorArea(item.object3D, { transform: transform, up: up });
          if (area != undefined) {
            node.stats = node.stats || {};
            node.stats.floorArea = area;
          }
        }
      }
      if (item.object3D && !omitBBox) {
        var filter = getFilter(item);
        var bbox = Object3DUtil.computeBoundingBox(item.object3D, transform, filter);
        if (bbox.valid()) {
          node.bbox = bbox.toJSON();
        } else {
          if (node.valid) {
            console.warn('Warning: No bbox for valid node ' + nodeType + ' in scene ' + json.id + ', item ' + item.id + '. Mark as invalid.');
            node.valid = 0; // Mark as invalid
          } else {
            console.log('No bbox for invalid node ' + nodeType + ' in scene ' + json.id + ', item ' + item.id);
          }
        }
      }
      if (nodeType !== 'None' && item.json.materials) {
        var materials;
        if (opts.useOrigMaterials) {
          materials = item.json.materials;
        } else {
          // Normalize materials
          materials = item.json.materials.map(function (material) {
            // Normalize color
            var color = material.texture ? material.tcolor : material.color;
            if (color) {
              var c = new THREE.Color(color);
              color = '#' + c.getHexString();
            }
            return {
              name: material.name,
              texture: material.texture,
              diffuse: color
            };
          });
        }
        if (opts.indexMaterials) {
          node.materialIndices = [];
          for (var iMat = 0; iMat < materials.length; iMat++) {
            var mat = materials[iMat];
            var jMat = materialIndex.indexOf(mat, true);
            if (!json.materials[jMat]) {
              json.materials[jMat] = mat;
            }
            node.materialIndices.push(jMat);
          }
        } else {
          node.materials = materials;
        }
      }
      return node;
    });
    if (!omitBBox && nodes) {
      var rooms = nodes.filter(function(x) { return x.type === 'Room'; });
      for (var j = 0; j < rooms.length; j++) {
        var room = rooms[j];
        var indices = room.nodeIndices;
        var roomBBox = room.bbox? Object3DUtil.toBBox(room.bbox) : new BBox();
        for (var k = 0; k < indices.length; k++) {
          var idx = indices[k];
          var node = nodes[idx];
          if (node && node.bbox) {
            var bbox = Object3DUtil.toBBox(node.bbox);
            if (bbox.valid()) {
              roomBBox.includeBBox(bbox);
            }
          }
        }
        if (roomBBox.valid()) {
          room.bbox = roomBBox.toJSON();
        }
      }
    }
    var validNodes = nodes? nodes.filter(function(x) { return x.valid; }) : [];
    //console.log('validNodes=' + validNodes.length);
    if (validNodes.length === 0) {
      console.log('No valid nodes for ' + json.id + ' ' + (i + 1) + '/' + levels.length);
    }

    var levelJson = { id: i.toString() };
    if (!omitBBox && validNodes.length > 0) {
      var filter = getFilter(l);
      var levelBBox = Object3DUtil.computeBoundingBox(l.object3D, transform, filter);
      if (levelBBox.valid()) {
        sceneBBox.includeBBox(levelBBox);
        levelJson.bbox = levelBBox.toJSON();
      } else {
        if (nodes.length > 0) {
          console.warn('Warning: No bbox for level ' + i + ' in scene ' + json.id);
        }
      }
    }
    levelJson.nodes = nodes;
    json.levels.push(levelJson);
  }

  // Go through levels and remove empty levels from the end
  var nLevels = json.levels.length;
  for (var i = nLevels - 1; i >= 0; i--) {
    var level = json.levels[i];
    if (level.nodes.length > 0) {
      break;
    } else {
      console.warn('Skipping empty level ' + json.id + ' ' + (i + 1) + '/' + levels.length);
      json.levels.pop();
    }
  }
  for (var i = 0; i < json.levels.length; i++) {
    if (level.nodes.length === 0) {
      console.warn('Warning: keeping empty level ' + json.id + ' ' + (i + 1) + '/' + levels.length);
    }
  }


  if (!omitBBox) {
    if (sceneBBox.valid()) {
      json.bbox = sceneBBox.toJSON();
    } else {
      console.warn('Warning: No bbox for scene ' + json.id);
    }
  }
  return json;
};

module.exports = SUNCGExporter;
