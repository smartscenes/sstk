var Constants = require('Constants');
var BBox = require('geo/BBox');
var OBB = require('geo/OBB');
var Index = require('ds/Index');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Loader for house files
 * @param params
 * @param params.fs {{readAsync: function(name, encoding, callback)}} API to File system to use for loading house files
 * @constructor
 * @memberOf loaders
 */
function HouseLoader(params) {
  this.fs = params.fs;
  this.debug = params.debug;
}

/**
 * Load and parses house file
 * @param file
 * @param callback {function(err, House)}
 */
HouseLoader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        var parsed = scope.parse(filename, data);
        callback(null, parsed);
      } catch(e) {
        callback(e);
      }
    }
  });
};

/**
 * Parses house file
 * @param filename {string}
 * @param data {string}
 * @return {House}
 */
HouseLoader.prototype.parse = function(filename, data) {
  var house;
  if (filename.endsWith('.json')) {
    house = new House(JSON.parse(data));
  } else {
    house = new House(this.__parseHouseFormat(data));
  }
  if (this.debug) {
    checkHouse(house);
  }
  return house;
};

function parseString(str) {
  return (str === '-')? undefined : str;
}

function parseVector3(array) {
  var values = array.map(function(x) { return parseFloat(x); });
  return new THREE.Vector3(values[0], values[1], values[2]);
}

function parseBBox(array) {
  var values = array.map(function(x) { return parseFloat(x); });
  return new BBox(
    new THREE.Vector3(values[0], values[1], values[2]),
    new THREE.Vector3(values[3], values[4], values[5])
  );
}

function parseObb(array) {
  var center = parseVector3(array.slice(0,3));
  var a1 = parseVector3(array.slice(3,6));
  var a2 = parseVector3(array.slice(6,9));
  var a3 = new THREE.Vector3();
  a3.crossVectors(a1, a2);
  var radius = parseVector3(array.slice(9,12));
  var basis = new THREE.Matrix4();
  basis.set(
    a1.x, a2.x, a3.x, 0,
    a1.y, a2.y, a3.y, 0,
    a1.z, a2.z, a3.z, 0,
    0, 0, 0, 1
  );
  return new OBB(center, radius, basis);
}

function parseMatrix4(array) {
  var m = new THREE.Matrix4();
  m.set.apply(m, array);
  return m;
}

var regionCodes = {
  'a': 'bathroom', // with toilet and sink
  'b': 'bedroom',
  'c': 'closet',
  'd': 'dining room',  // includes “breakfast rooms” other rooms people mainly eat in
  'e': 'entryway/foyer/lobby', // should be the front door, not any door
  'f': 'familyroom/lounge', // should be a room that a family hangs out in, not any area with couches
  'g': 'garage',
  'h': 'hallway',
  'i': 'library', // should be room like a library at a university, not an individual study
  'j': 'laundryroom/mudroom', // place where people do laundry, etc.
  'k': 'kitchen',
  'l': 'living room', // should be the main “showcase” living room in a house, not any area with couches
  'm': 'meetingroom/conferenceroom',
  'n': 'lounge', // any area where people relax in comfy chairs/couches that is not the family room or living room
  'o': 'office', // usually for an individual, or a small set of people
  'p': 'porch/terrace/deck', // must be outdoors on ground level
  'r': 'rec/game', // should have recreational objects, like pool table, etc.
  's': 'stairs',
  't': 'toilet',  // should be a small room with ONLY a toilet
  'u': 'utilityroom/toolroom',
  'v': 'tv', // must have theater-style seating
  'w': 'workout/gym/exercise',
  'x': 'outdoor', // outdoor areas containing grass, plants, bushes, trees, etc.
  'y': 'balcony', // must be outside and must not be on ground floor
  'z': 'other room', // it is clearly a room, but the function is not clear
  'B': 'bar',
  'C': 'classroom',
  'D': 'dining booth',
  'S': 'spa/sauna',
  'Z': 'junk' // reflections of mirrors, random points floating in space, etc.
};

var surfaceCodes = {
  'F': { name: 'Floor', normal: new THREE.Vector3(0,0,1) }
};

HouseLoader.prototype.__parseHouseFormat = function(data) {
  var lines = data.split('\n');
  // Check first line is ASCII 1.0
  var header_parts = lines[0].split(/\s+/);
  var header_type = header_parts[0];
  var header_version = header_parts[1];
  if (header_type !== 'ASCII') {
    throw 'Invalid house format';
  }
  if (header_version === '1.0') {
    return this.__parseHouseFormatv10(lines);
  } else if (header_version === '1.1') {
    return this.__parseHouseFormatv11(lines);
  } else {
    throw 'Unsupported house version';
  }
};

HouseLoader.prototype.__parseHouseFormatv10 = function(lines) {
  var house = null;
  var levels = [];
  var regions = [];
  var surfaces = [];
  var vertices = [];
  // ASCII 1.0
  // H  -  -  0 0 56 10 10 1  -11.5795 -2.88429 -0.0415621  5.99388 5.84667 2.6074  0 0 0 0 0 0 0 0
  // L  0  10  -  -2.92031 0.50208 0.00312996  -11.2995 -2.84965 -0.00842175  4.65722 5.32133 2.6074  0 0 0 0 0
  // R  0 0  0 1  b  -8.84465 1.00624 -0.00842175  -11.0959 0.517162 0.0898792  -6.7388 4.80697 2.2792  0 0 0 0 0
  // S  0 0  6  F  -9.26133 2.13581 -0.00842175  0 0 1  -11.0959 0.517162 -0.00842175  -6.7388 4.80697 0.0898792  0 0 0 0 0
  // V  0 0  F  -10.1414 0.587867 0.0898792  0 0 1  0 0 0
  // Parse house file
  for (var i = 1; i < lines.length; i++) {
    var lineno = i + 1;
    var line = lines[i];
    line = line.trim();
    if (line.length === 0) { continue; }
    var parts = line.split(/\s+/);
    if (parts.length > 0) {
      var cmd = parts[0];
      switch (cmd) {
        case 'H':
          house = {
            name: parseString(parts[1]),
            label: parseString(parts[2]),
            nimages: parseInt(parts[3]),
            npanoramas: parseInt(parts[4]),
            nvertices: parseInt(parts[5]),
            nsurfaces: parseInt(parts[6]),
            nregions: parseInt(parts[7]),
            nlevels: parseInt(parts[8]),
            bbox: parseBBox(parts.slice(9, 15)),
            levels: levels,
            regions: regions,
            surfaces: surfaces,
            vertices: vertices
          };
          break;
        case 'L':
          var level = {
            index: parseInt(parts[1]),
            //nregions: parseInt(parts[2]),
            labelCode: parseString(parts[3]),
            position: parseVector3(parts.slice(4, 7)),
            bbox: parseBBox(parts.slice(7, 13)),
            regions: []
          };
          levels.push(level);
          break;
        case 'R':
          // Each region belongs to a level
          var region = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            //npanoramas: parseInt(parts[3]),
            //nsurfaces: parseInt(parts[4]),
            labelCode: parseString(parts[5]),
            position: parseVector3(parts.slice(6, 9)),
            bbox: parseBBox(parts.slice(9, 15)),
            surfaces: []
          };
          region.regionType = regionCodes[region.labelCode];
          regions.push(region);
          levels[region.parentIndex].regions.push(region);
          break;
        case 'S':
          // Each surface belong to a region
          // Each region should have one surface (the floor)
          var surface = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            //nvertices: parseInt(parts[3]),
            labelCode: parseString(parts[4]),
            position: parseVector3(parts.slice(5, 8)),
            normal: parseVector3(parts.slice(8, 11)),
            bbox: parseBBox(parts.slice(11, 17)),
            vertices: []
          };
          surfaces.push(surface);
          if (surface.parentIndex >= 0) {
            regions[surface.parentIndex].surfaces.push(surface);
          } else {
            console.warn('Surface not associated with a region', Constants.isBrowser? surface : surface.index);
          }
          break;
        case 'V':
          // Each vertex belongs to a surface
          var vertex = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            labelCode: parseString(parts[3]),
            position: parseVector3(parts.slice(4, 7)),
            normal: parseVector3(parts.slice(7, 13))
          };
          vertices.push(vertex);
          surfaces[vertex.parentIndex].vertices.push(vertex);
          break;
        default:
          console.warn('Ignoring line ' + lineno + ' with unknown command ', line);
      }
    }
  }
  house.statistics = computeStatistics(house);
  return house;
};

HouseLoader.prototype.__parseHouseFormatv11 = function(lines) {
  var house = null;
  var levels = [];
  var regions = [];
  var surfaces = [];
  var vertices = [];
  var panoramas = [];
  var images = [];
  var segments = [];
  var objects = [];
  var categories = [];
  var portals = [];
  // ASCII 1.1
  // Parse house file
  for (var i = 1; i < lines.length; i++) {
    var lineno = i + 1;
    var line = lines[i];
    line = line.trim();
    if (line.length === 0) { continue; }
    var parts = line.split(/\s+/);
    if (parts.length > 0) {
      var cmd = parts[0];
      switch (cmd) {
        case 'H':
          //H name label #images #panoramas #vertices #surfaces #segments #objects #categories #regions #portals #levels  0 0 0 0 0  xlo ylo zlo xhi yhi zhi  0 0 0 0 0
          house = {
            name: parseString(parts[1]),
            label: parseString(parts[2]),
            nimages: parseInt(parts[3]),
            npanoramas: parseInt(parts[4]),
            nvertices: parseInt(parts[5]),
            nsurfaces: parseInt(parts[6]),
            nsegments: parseInt(parts[7]),
            nobjects: parseInt(parts[8]),
            ncategories: parseInt(parts[9]),
            nregions: parseInt(parts[10]),
            nportals: parseInt(parts[11]),
            nlevels: parseInt(parts[12]),
            bbox: parseBBox(parts.slice(13, 19)),
            levels: levels,
            regions: regions,
            surfaces: surfaces,
            vertices: vertices,
            objects: objects,
            segments: segments,
            portals: portals,
            categories: categories,
            panoramas: panoramas,
            images: images
          };
          break;
        case 'L':
          //L level_index #regions label  px py pz  xlo ylo zlo xhi yhi zhi  0 0 0 0 0
          var level = {
            index: parseInt(parts[1]),
            //nregions: parseInt(parts[2]),
            labelCode: parseString(parts[3]),
            position: parseVector3(parts.slice(4, 7)),
            bbox: parseBBox(parts.slice(7, 13)),
            regions: []
          };
          levels.push(level);
          break;
        case 'R':
          //R region_index level_index 0 0 label  px py pz  xlo ylo zlo xhi yhi zhi  0 0 0 0 0
          // Each region belongs to a level
          var region = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            //npanoramas: parseInt(parts[3]),
            //nsurfaces: parseInt(parts[4]),
            labelCode: parseString(parts[5]),
            position: parseVector3(parts.slice(6, 9)),
            bbox: parseBBox(parts.slice(9, 15)),
            surfaces: [],
            objects: [],
            panoramas: []
          };
          region.regionType = regionCodes[region.labelCode];
          regions.push(region);
          levels[region.parentIndex].regions.push(region);
          break;
        case 'S':
          //S surface_index region_index 0 label px py pz  nx ny nz  xlo ylo zlo xhi yhi zhi  0 0 0 0 0
          // Each surface belong to a region
          // Each region should have one surface (the floor)
          var surface = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            //nvertices: parseInt(parts[3]),
            labelCode: parseString(parts[4]),
            position: parseVector3(parts.slice(5, 8)),
            normal: parseVector3(parts.slice(8, 11)),
            bbox: parseBBox(parts.slice(11, 17)),
            vertices: []
          };
          surfaces.push(surface);
          if (surface.parentIndex >= 0) {
            regions[surface.parentIndex].surfaces.push(surface);
          } else {
            console.warn('Surface not associated with a region', Constants.isBrowser? surface : surface.index);
          }
          break;
        case 'V':
          //V vertex_index surface_index label  px py pz  nx ny nz  0 0 0
          // Each vertex belongs to a surface
          var vertex = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            labelCode: parseString(parts[3]),
            position: parseVector3(parts.slice(4, 7)),
            normal: parseVector3(parts.slice(7, 13))
          };
          vertices.push(vertex);
          surfaces[vertex.parentIndex].vertices.push(vertex);
          break;
        case 'P':
          if (portals.length < house.nportals) {
            // Could be P or could be R!
            //P portal_index region0_index region1_index label  xlo ylo zlo xhi yhi zhi  0 0 0 0
            var portal = {
              index: parseInt(parts[1]),
              regionIndex0: parseInt(parts[2]),
              regionIndex1: parseInt(parts[3]),
              labelCode: parseString(parts[4]),
              bbox: parseBBox(parts.slice(5, 11))
            };
            portals.push(portal);
            regions[portal.regionIndex0].portals.push(portal);
            regions[portal.regionIndex1].portals.push(portal);
          } else {
            //P name  panorama_index region_index 0  px py pz  0 0 0 0 0
            var panorama = {
              name: parseString(parts[1]),
              index: parseInt(parts[2]),
              regionIndex: parseInt(parts[3]),
              // skip dummy
              position: parseVector3(parts.slice(5, 8)),
              images: []
            };
            panoramas.push(panorama);
            if (panorama.regionIndex >= 0) {
              regions[panorama.regionIndex].panoramas.push(panorama);
            } else {
              console.warn('Panorama not associated with a region', Constants.isBrowser? panorama : panorama.index);
            }
          }
          break;
        case 'C':
          // Class categories (subset of information in full category mapping file)
          //C category_index category_mapping_index category_mapping_name mpcat40_index mpcat40_name 0 0 0 0 0
          var category = {
            index: parseInt(parts[1]),
            categoryMappingIndex: parseInt(parts[2]),
            categoryMappingName: parseString(parts[3]).replace('#', ' '),
            mpcat40Index: parseInt(parts[4]),
            mpcat40Name: parseString(parts[5])
          };
          categories[category.index] = category;
          break;
        case 'O':
          // Object
          //O object_index region_index category_index px py pz  a0x a0y a0z  a1x a1y a1z  r0 r1 r2 0 0 0 0 0 0 0 0
          var object = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            categoryIndex: parseInt(parts[3]),
            obb: parseObb(parts.slice(4,16)),
            segments: []
          };
          objects.push(object);
          if (object.parentIndex >= 0) {
            regions[object.parentIndex].objects.push(object);
          } else {
            console.warn('Object not associated with a region', object);
          }
          break;
        case 'I':
          //I image_index panorama_index  name camera_index yaw_index e00 e01 e02 e03 e10 e11 e12 e13 e20 e21 e22 e23 e30 e31 e32 e33  i00 i01 i02  i10 i11 i12 i20 i21 i22  width height  px py pz  0 0 0 0 0
          var image = {
            index: parseInt(parts[1]),
            panoramaIndex: parseInt(parts[2]),
            name: parseString(parts[3]),
            cameraIndex: parseInt(parts[4]),
            yawIndex: parseInt(parts[5]),
            extrinsicMatrix: parseMatrix4(parts.slice(6,22)),
            intrinsicMatrix: parseMatrix4(parts.slice(22,38)),
            width: parseInt(parts[38]),
            height: parseInt(parts[39]),
            position: parseVector3(parts.slice(40, 43))
          };
          images.push(image);
          panoramas[image.panoramaIndex].images.push(image);
          break;
        case 'E':
          //E segment_index object_index id area px py pz xlo ylo zlo xhi yhi zhi  0 0 0 0 0
          var segment = {
            index: parseInt(parts[1]),
            parentIndex: parseInt(parts[2]),
            id: parseInt(parts[3]),
            area: parseFloat(parts[4]),
            position: parseVector3(parts.slice(5,8)),
            bbox: parseBBox(parts.slice(8,14))
          };
          segments.push(segment);
          objects[segment.parentIndex].segments.push(segment);
          break;
        default:
          console.warn('Ignoring line ' + lineno + ' with unknown command ', line);
      }
    }
  }
  house.statistics = computeStatistics(house);
  return house;
};

function checkHouse(house) {
  function checkLength(array, expectedLength, desc) {
    array = array || [];
    expectedLength = expectedLength || 0;
    if (array.length !== expectedLength) {
      console.warn('Mismatch ' + desc + ', expected ' + expectedLength + ', got ' + array.length);
    }
  }
  checkLength(house.images, house.nimages, 'images');
  checkLength(house.panoramas, house.npanoramas, 'panoramas');
  checkLength(house.vertices, house.nvertices, 'vertices');
  checkLength(house.surfaces, house.nsurfaces, 'surfaces');
  checkLength(house.segments, house.nsegments, 'segments');
  checkLength(house.objects, house.nobjects, 'objects');
  checkLength(house.categories, house.ncategories, 'categories');
  checkLength(house.regions, house.nregions, 'regions');
  checkLength(house.portals, house.nportals, 'portals');
  checkLength(house.levels, house.nlevels, 'levels');
}

function computeStatistics(house) {
  var statistics = {};
  if (house.regions) {
    var regionTypeCounts = {};
    _.each(house.regions, function (region) {
      regionTypeCounts[region.regionType] = (regionTypeCounts[region.regionType] || 0) + 1;
    });
    statistics.regionTypes = regionTypeCounts;
  }
  if (house.objects) {
    var objectTypeCounts = {};
    var mpr40Counts = {};
    var objectTypeCountsByRegion = {};
    var mpr40CountsByRegion = {};
    _.each(house.objects, function (object) {
      var category = house.categories[object.categoryIndex];
      if (category) {
        var objectType = category.categoryMappingName;
        var mpr40name = category.mpcat40Name;
        object.category = objectType;
        object.mpr40 = mpr40name;
        objectTypeCounts[objectType] = (objectTypeCounts[objectType] || 0) + 1;
        mpr40Counts[mpr40name] = (mpr40Counts[mpr40name] || 0) + 1;
        objectTypeCountsByRegion[object.parentIndex] = objectTypeCountsByRegion[object.parentIndex] || {};
        objectTypeCountsByRegion[object.parentIndex][objectType] = (objectTypeCountsByRegion[object.parentIndex][objectType] || 0) + 1;
        mpr40CountsByRegion[object.parentIndex] = mpr40CountsByRegion[object.parentIndex] || {};
        mpr40CountsByRegion[object.parentIndex] = (mpr40CountsByRegion[object.parentIndex][objectType] || 0) + 1;
      }
    });
    statistics.categoryCounts = objectTypeCounts;
    statistics.mpr40Counts = mpr40Counts;
    statistics.categoryCountsByRegion = objectTypeCountsByRegion;
    statistics.mpr40CountsByRegion = mpr40CountsByRegion;
  }
  return statistics;
}

function checkSurface(surface) {
  var checkOkay = true;
  var surfaceType = surfaceCodes[surface.labelCode];
  var expectedNormal = surfaceType.normal;
  var vertices = surface.vertices;
  if (vertices.length < 3) {
    console.warn('Not enough points for ' + surfaceType.name + ': ' + vertices.length, Constants.isBrowser? surface : surface.index);
    return false;
  }
  if (surfaceType.name === 'Floor') {
    // Floor - assume z is constant and normal is z-up
    var minZ = _.minBy(vertices, 'position.z').position.z;
    var maxZ = _.maxBy(vertices, 'position.z').position.z;
    if (minZ !== maxZ) {
      console.warn(surfaceType.name + ' at different heights: ' + minZ + ' to ' + maxZ, Constants.isBrowser? surface : surface.index);
      //checkOkay = false;
    }
  }

  for (var k = 0; k < vertices.length; k++) {
    var v = vertices[k];
    if (!v.normal.equals(expectedNormal)) {
      console.warn(surfaceType.name + ' normal is not oriented correctly!', v, expectedNormal);
      checkOkay = false;
    }
  }
  return checkOkay;
}

HouseLoader.prototype.createHouseGeometry = function(house) {
  return house.createGeometry();
};

/**
 * House - most fabulous house
 * @param opts
 * @constructor
 */
function House(opts) {
  _.extend(this, opts);
}

House.prototype.getRegionTypeIndex = function() {
  if (!House.__regionTypeIndex) {
    var regionTypeIndex = new Index();
    _.each(regionCodes, function(regionType, regionCode) {
      regionTypeIndex.add(regionType);
    });
    House.__regionTypeIndex = regionTypeIndex;
  }
  return House.__regionTypeIndex;
};

House.prototype.__getColorFn = function(colorBy, palette) {
  if (colorBy === 'regionType' || colorBy === 'roomType') {
    var regionTypeIndex = this.getRegionTypeIndex();
    return function(region) {
      var colorIdx = regionTypeIndex.indexOf(region.regionType, true);
      return Object3DUtil.createColor(colorIdx, palette);
    };
  } else if (colorBy === 'level') {
    return function(region) {
      return Object3DUtil.createColor(region.parentIndex, palette);
    };
  } else if (colorBy === 'regionId' || colorBy === 'roomId') {
    return function(region) {
      return Object3DUtil.createColor(region.index, palette);
    };
  } else {
    console.warn('Ignoring unknown colorBy: ' + colorBy);
  }
};

House.prototype.setBBoxOpacity = function(opacity) {
  Object3DUtil.traverseMeshes(this.object3D, false, function(mesh) {
    if (mesh.userData.type === 'BBox') {
      mesh.material.opacity = opacity;
    }
  });
};

House.prototype.setRegionOpacity = function(opacity) {
  Object3DUtil.traverseMeshes(this.object3D, false, function(mesh) {
    if (mesh.userData.type === 'RegionShape') {
      mesh.material.opacity = opacity;
    }
  });
};

House.prototype.setObjectsVisible = function(flag) {
  Object3DUtil.traverse(this.object3D, function(obj) {
    if (obj.userData.type === 'Object') {
      Object3DUtil.setVisible(obj, flag);
      return false;
    } else {
      return true;
    }
  });
};

House.prototype.recolor = function(colorFn, palette) {
  if (typeof colorFn === 'string') {
    colorFn = this.__getColorFn(colorFn, palette);
    if (!colorFn) { return; }
  }
  var house = this;
  for (var i = 0; i < house.regions.length; i++) {
    var region = house.regions[i];
    if (region.object3D) {
      var color = colorFn(region);
      Object3DUtil.traverseMeshes(region.object3D, false, function(mesh) {
        mesh.material.color.copy(color);
      });
    }
  }
};

House.prototype.createGeometry = function(opts) {
  opts = _.defaultsDeep(Object.create(null), opts || {}, {
    includeParts: { 'BBox': true, 'RegionShape': true, 'Surface': true, 'Object': true }
  });
  var house = this;
  var Object3DUtil = require('geo/Object3DUtil');
  var MeshHelpers = require('geo/MeshHelpers');
  for (var i = 0; i < house.regions.length; i++) {
    var region = house.regions[i];
    var level = house.levels[region.parentIndex];

    var regionObject = new THREE.Group();
    regionObject.name = 'region' + i;
    regionObject.userData.id = 'R' + i;
    regionObject.userData.index = region.index;
    regionObject.userData.type = 'Region';
    regionObject.userData.regionType = region.regionType;
    regionObject.userData.level = region.parentIndex;
    if (region.regionType) {
      regionObject.name = regionObject.name + ' (' + region.regionType + ')';
    }

    // Surfaces
    if (region.surfaces) {
      var regionFloorShapes = [];
      var regionFloorHeight = Infinity;
      var regionArea = 0;
      for (var j = 0; j < region.surfaces.length; j++) {
        var surface = region.surfaces[j];
        if (surface.labelCode === 'F') {
          var surfaceOkay = checkSurface(surface);
          if (surfaceOkay) {
            var vertices = surface.vertices;
            var shape = new THREE.Shape();
            var v = vertices[0];
            shape.moveTo(v.position.x, v.position.y);
            for (var k = 1; k < vertices.length; k++) {
              v = vertices[k];
              shape.lineTo(v.position.x, v.position.y);
            }
            v = vertices[0];
            shape.lineTo(v.position.x, v.position.y);

            if (opts.includeParts['Surface']) {
              var geometry = new THREE.ShapeGeometry([shape]);
              //geometry.addShape(shape, { material: j});
              geometry.computeFaceNormals();
              var mesh = new THREE.Mesh(geometry, Object3DUtil.getSimpleFalseColorMaterial(i));
              mesh.name = 'Surface' + j;
              mesh.userData.id = 'S' + j;
              mesh.userData.index = surface.index;
              mesh.userData.type = 'Floor';
              mesh.userData.region = surface.parentIndex;
              mesh.userData.level = region.parentIndex;
              mesh.position.z = /*level.position.z + */surface.position.z;
              regionObject.add(mesh);
              surface.area = Object3DUtil.getSurfaceArea(mesh);
              regionArea += surface.area;
            }
            regionFloorHeight = Math.min(surface.position.z, regionFloorHeight);
            regionFloorShapes.push(shape);
          }
        } else {
          console.warn('Ignoring unknown surface type: ' + surface.labelCode);
        }

        if (regionFloorShapes.length > 0 && opts.includeParts['RegionShape']) {
          var height = region.bbox.max.z - regionFloorHeight;
          var extrudeGeom = new THREE.ExtrudeGeometry(regionFloorShapes, { depth: height, bevelEnabled: false });
          var mat2 = Object3DUtil.getSimpleFalseColorMaterial(i);
          mat2.transparent = true;
          mat2.opacity = 0.25;
          var prism = new THREE.Mesh(extrudeGeom, mat2);
          prism.name = 'RegionShape' + i;
          prism.userData.type = 'RegionShape';
          prism.position.z = regionFloorHeight;
          regionObject.add(prism);
        }
      }
      region.area = regionArea;
    }

    if (region.objects && region.objects.length && opts.includeParts['Object']) {
      var objectsGroup = new THREE.Group();
      objectsGroup.name = 'Objects';
      regionObject.add(objectsGroup);
      for (var j = 0; j < region.objects.length; j++) {
        var object = region.objects[j];
        // TODO: color (instance, category, mpr40)
        var objectOBBSolid = new MeshHelpers.OBB(object.obb, 'yellow');
//        var objectOBB = objectOBBSolid.toWireFrame(0.001*Constants.metersToVirtualUnit);
        var objectOBB = objectOBBSolid.toWireFrame(0);
        objectOBB.name = 'Object' + j + ' (' + object.category +')';
        objectOBB.userData.id = 'O' + j;
        objectOBB.userData.index = object.index;
        objectOBB.userData.type = 'Object';
        objectOBB.userData.category = object.category;
        objectOBB.userData.mpr40 = object.mpr40;
        objectsGroup.add(objectOBB);
      }
    }

    if (opts.includeParts['BBox']) {
      var mat = Object3DUtil.getSimpleFalseColorMaterial(i);
      mat.transparent = true;
      mat.opacity = 0.25;
      var regionBBox = new MeshHelpers.BoxMinMax(region.bbox.min, region.bbox.max, mat);
      regionBBox.name = 'BBox' + i;
      regionBBox.userData.type = 'BBox';
      regionObject.add(regionBBox);
    }
    region.object3D = regionObject;
  }
  house.object3D = new THREE.Group();
  for (var i = 0; i < house.levels.length; i++) {
    var level = house.levels[i];
    var group = new THREE.Group();
    for (var j = 0; j < level.regions.length; j++) {
      var region = level.regions[j];
      group.add(region.object3D);
    }
    group.name = 'Level' + i;
    group.userData.id = 'L' + i;
    group.userData.type = 'Level';
    level.object3D = group;
    house.object3D.add(level.object3D);
  }
  house.object3D.name = house.name;
  house.object3D.userData.id = house.name;
  return house.object3D;
};

module.exports = HouseLoader;
