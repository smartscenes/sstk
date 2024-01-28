var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var FileUtil = require('io/FileUtil');
var _ = require('util/util');

/**
 * Export a mesh as PLY
 * @param options
 * @param options.fs File system to use for exporting (defaults to FileUtil)
 * @param [options.format='binary_little_endian'] {string} PLY file format.  Options are `ascii|binary_little_endian`.
 * @param [options.vertexAttributes=PLYExporter.VertexAttributes.rgbColor] {Object} Vertex attributes to export.
 * @param [options.faceAttributes] {Object} Face attributes to export
 * @constructor
 * @memberOf exporters
 */
function PLYExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
  //this.format = "ascii";
  this.format = options.format || 'binary_little_endian';
  this.vertexAttributes = options.vertexAttributes || [ PLYExporter.VertexAttributes.rgbColor ];
  this.faceAttributes = options.faceAttributes;
  this.includeChildModelInstances = false;
}

/* Predefined vertex attributes */
PLYExporter.VertexAttributes = {
  rgbColor: {
    name: 'color',
    stride: 3,
    properties: [
      {
        name: 'red',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[0] * 255);
        }
      },
      {
        name: 'green',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[1] * 255);
        }
      },
      {
        name: 'blue',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[2] * 255);
        }
      }
    ]
  },
  normal: {
    name: 'normal',
    stride: 1,
    properties: [
      {
        name: 'nx',
        type: 'float'
      },
      {
        name: 'ny',
        type: 'float'
      },
      {
        name: 'nz',
        type: 'float'
      }
    ]
  },
  opacity: {
    name: 'opacity',
    stride: 1,
    properties: [
      {
        name: 'opacity',
        type: 'float'
      }
    ]
  },
  // FIXME: Why are names inconsistent with property names? e.g. "Object" != "objectId".  Will need to fix Segments.colorSegments()
  // Segmentation types are upper case
  objectId: {
    name: 'Object',
    stride: 1,
    properties: [{
      name: 'objectId',
      type: 'uint16'
    }]
  },
  segmentId: {
    name: 'Segment',
    stride: 1,
    properties: [{
      name: 'segmentId',
      type: 'uint16'
    }]
  },
  categoryId: {
    name: 'Category',
    stride: 1,
    properties: [{
      name: 'categoryId',
      type: 'uint16'
    }]
  },
  labelId: {
    name: 'Label',
    stride: 1,
    properties: [{
      name: 'labelId',
      type: 'uint16'
    }]
  },
  nodeIndex: {
    name: 'nodeIndex',
    stride: 1,
    properties: [{
      name: 'nodeIndex',
      type: 'uint16'
    }]
  }
};

// Mapping of type to sizes
PLYExporter.TypeSizes = Object.freeze({
  'int8': 1,
  'uint8': 1,
  'char': 1,
  'uchar': 1,
  'int16': 2,
  'uint16': 2,
  'short': 2,
  'ushort': 2,
  'int32': 4,
  'uint32': 4,
  'int': 4,
  'uint': 4,
  'float32': 4,
  'float': 4,
  'float64': 8,
  'double': 8
});

// [{
//   name: 'NYU40',
//   stride: 1,
//   properties: [{
//     name: 'NYU40',
//     type: 'uint8'
//   },...]
function __appendCustomAttributesToProps(props, customAttrs) {
  if (customAttrs) {
    for (var i = 0; i < customAttrs.length; i++) {
      var attr = customAttrs[i];
      for (var j = 0; j < attr.properties.length; j++) {
        var prop = attr.properties[j];
        props.push(prop);
      }
    }
  }
  return props;
}

function __estimatePropBytes(props, initialSize) {
  var estSize = initialSize || 0;
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (prop.type.startsWith('list')) {
      var pieces = prop.type.split(' ');
      var elementType = pieces[2];
      var lengthType = pieces[1];
      var lengthSize = PLYExporter.TypeSizes[lengthType];
      var elementSize = PLYExporter.TypeSizes[elementType];
      if (lengthType && elementSize) {
        prop.lengthSize = lengthSize;
        prop.elementSize = elementSize;
        if (prop.n != null) {
          prop.size = lengthSize + prop.n * elementSize;
          estSize += prop.size;
        } else {
          console.warn('No n for list ' + prop.name + ' of type ' + prop.type);
        }
      } else {
        console.warn('No size for property ' + prop.name + ' of type ' + prop.type);
      }
    } else {
      prop.size = PLYExporter.TypeSizes[prop.type];
      if (prop.size) {
        estSize += prop.size;
      } else {
        console.warn('No size for property ' + prop.name + ' of type ' + prop.type);
      }
    }
  }
  return estSize;
}

PLYExporter.prototype.__computeProperties = function(opts) {
  // Figure out vertex and face properties and vertex and face sizes (in bytes)
  var vertexProps = [
    { name: 'x', type: 'float'},
    { name: 'y', type: 'float'},
    { name: 'z', type: 'float'}
  ];
  __appendCustomAttributesToProps(vertexProps, opts.vertexAttributes);
  opts.vertexProperties = vertexProps;
  opts.vertexSize = __estimatePropBytes(vertexProps, 0); // 3*4 bytes for position (float) + 3 bytes for (r,g,b)

  var faceProps = [{name: 'vertex_indices', type: 'list uchar int', n: 3}];
  __appendCustomAttributesToProps(faceProps, opts.faceAttributes);
  opts.faceProperties = faceProps;
  opts.faceSize = __estimatePropBytes(faceProps, 0);
//  opts.faceSize = 1 + 3*4; // 1 byte for face type, 3*4 (uint) bytes for vertex index
//  console.log('got vertexProps, faceProps', vertexProps, faceProps, opts.vertexSize, opts.faceSize);
};

PLYExporter.prototype.__getHeader = function(opts) {
  var vertexProps = opts.vertexProperties.map(function(x) { return 'property ' + x.type + ' ' + x.name; });
  var faceProps = opts.faceProperties.map(function(x) { return 'property ' + x.type + ' ' + x.name; });
  var lines = ['ply', 'format ' + opts.format + ' 1.0', 'comment STK generated']
    .concat(['element vertex ' + opts.nverts])
    .concat(vertexProps)
    .concat(['element face ' + opts.nfaces])
    .concat(faceProps)
    .concat(['end_header']);
  return lines.join('\n') + '\n';
};

PLYExporter.prototype.exportSampledPoints = function(points, opts) {
    opts = opts || {};
    var callback = opts.callback;
    var filename = (opts.name != undefined)? opts.name : 'points';
    if (!filename.endsWith('.ply')) {
        filename = filename + '.ply';
    }
    var nverts = points.length;
    var params = _.defaults({ vertexOffset: 0, nverts: nverts, nfaces: 0 }, opts,
        { format: this.format, vertexAttributes: this.vertexAttributes, faceAttributes: this.faceAttributes });
    this.__computeProperties(params);
    var header = this.__getHeader(params);
    var data = this.__appendSampledPoints(points, params);
    var fileutil = this.__fs;
    function appendVertexData() {
        fileutil.fsAppendToFile(filename, data.getVertexData(), appendFaceData);
    }
    function appendFaceData() {
        fileutil.fsAppendToFile(filename, data.getFaceData(), finishFile);
    }
    function finishFile() {
        fileutil.fsExportFile(filename, filename);
        console.log('finished exporting mesh to ' + filename);
        if (callback) { callback(); }
    }
    fileutil.fsWriteToFile(filename, header, appendVertexData);
};

PLYExporter.prototype.exportMesh = function(mesh, opts) {
  opts = opts || {};
  var callback = opts.callback;
  var filename = (opts.name != undefined)? opts.name : 'scene';
  if (!filename.endsWith('.ply')) {
    filename = filename + '.ply';
  }
  mesh.updateMatrixWorld();
  var nverts = GeometryUtil.getGeometryVertexCount(mesh);
  var nfaces = GeometryUtil.getGeometryFaceCount(mesh);
  var params = _.defaults({ vertexOffset: 0, nverts: nverts, nfaces: nfaces }, opts,
    { format: this.format, vertexAttributes: this.vertexAttributes, faceAttributes: this.faceAttributes });
  this.__computeProperties(params);
  var header = this.__getHeader(params);
  var data = this.__appendMesh(mesh, params);
  var fileutil = this.__fs;
  function appendVertexData() {
    fileutil.fsAppendToFile(filename, data.getVertexData(), appendFaceData);
  }
  function appendFaceData() {
    fileutil.fsAppendToFile(filename, data.getFaceData(), finishFile);
  }
  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting mesh to ' + filename);
    if (callback) { callback(); }
  }
  fileutil.fsWriteToFile(filename, header, appendVertexData);
};

function __PlyAscii(opts) {
  this.v = [];
  this.f = [];
}
__PlyAscii.prototype.getVertexData = function() {
  return this.v.join('\n') + '\n';
};
__PlyAscii.prototype.getFaceData = function() {
  return this.f.join('\n') + '\n';
};
__PlyAscii.prototype.appendFace = function(verts, attrs) {
  var fs = verts.length + ' ' + verts.join(' ');
  if (attrs.length) {
    fs = fs + ' ' + attrs.join(' ');
  }
  this.f.push(fs);
};
__PlyAscii.prototype.appendVertex = function(v) {
  this.v.push(v.join(' '));
};


function __PlyBinary(opts) {
  this.isLittleEndian = (opts.format === 'binary_little_endian');
  this.opts = opts;
  var vertSize = opts.vertexSize;
  this.v = new ArrayBuffer(opts.nverts * vertSize);
  this.vdata = new DataView(this.v);
  this.voffset = 0;
  var faceSize = opts.faceSize;
  this.f = new ArrayBuffer(opts.nfaces * faceSize);
  this.fdata = new DataView(this.f);
  this.foffset = 0;
}
__PlyBinary.prototype.binaryWrite = function(dataview, value, at, type) {
  var little_endian = this.isLittleEndian;
  switch ( type ) {
    // correspondences for non-specific length types here match rply:
    case 'int8':    case 'char':   dataview.setInt8( at, value ); return 1;
    case 'uint8':   case 'uchar':  dataview.setUint8( at, value ); return 1;
    case 'int16':   case 'short':  dataview.setInt16( at, value, little_endian ); return 2;
    case 'uint16':  case 'ushort': dataview.setUint16( at, value, little_endian ); return 2;
    case 'int32':   case 'int':    dataview.setInt32( at, value, little_endian ); return 4;
    case 'uint32':  case 'uint':   dataview.setUint32( at, value, little_endian ); return 4;
    case 'float32': case 'float':  dataview.setFloat32( at, value, little_endian ); return 4;
    case 'float64': case 'double': dataview.setFloat64( at, value, little_endian ); return 8;
  }
};
__PlyBinary.prototype.getVertexData = function() {
  return this.v;
};
__PlyBinary.prototype.getFaceData = function() {
  return this.f;
};
__PlyBinary.prototype.appendFace = function(verts, attrs) {
  // Assumes 3 verts
  this.fdata.setUint8(this.foffset, 3); this.foffset++;
  this.fdata.setUint32(this.foffset, verts[0], this.isLittleEndian); this.foffset+=4;
  this.fdata.setUint32(this.foffset, verts[1], this.isLittleEndian); this.foffset+=4;
  this.fdata.setUint32(this.foffset, verts[2], this.isLittleEndian); this.foffset+=4;
  var props = this.opts.faceProperties;
  for (var i = 1; i < props.length; i++) {
    var p = props[i];
    var d = this.binaryWrite(this.fdata, attrs[i-1], this.foffset, p.type);
    this.foffset += d;
  }
};
__PlyBinary.prototype.appendVertex = function(v) {
  var props = this.opts.vertexProperties;
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    var d = this.binaryWrite(this.vdata, v[i], this.voffset, p.type);
    this.voffset += d;
  }
};


PLYExporter.prototype.__createData = function(opts) {
  if (opts.format === 'ascii') {
    return new __PlyAscii(opts);
  } else if (opts.format === 'binary_little_endian') {
    return new __PlyBinary(opts);
  } else {
    throw 'Unsupported PLY format: ' + opts.format;
  }
};

PLYExporter.prototype.__appendSampledPoints = function (sampledPoints, params, data) {
  var vertexOffset = params.vertexOffset;
  //console.log('appendMesh', JSON.stringify(params));

  var result = data || this.__createData(params);
  var transform = params.transform;
  var normalMatrix;
  if (transform) {
    normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  }
  var vattrs = params.vertexAttributes;
  var tmpp = new THREE.Vector3();
  var tmpn = new THREE.Vector3();
  for (var i = 0; i < sampledPoints.length; i++) {
    var point = sampledPoints[i];
    var p = point.worldPoint;
    var n = point.worldNormal;
    var c = point.color;
    if (transform) {
      tmpp.copy(p);
      tmpp.applyMatrix4(transform);
      p = tmpp;
      tmpn.copy(n);
      tmpn.applyMatrix3(normalMatrix);
      tmpn.normalize();
      n = tmpn;
    }
    var row = p.toArray();
    if (vattrs) {
      for (var j = 0; j < vattrs.length; j++) {
        var vattr = vattrs[j];
        var attr = [];
        if (vattr.name === 'index') {
          attr = [i];
        } else if (vattr.name === 'color') {
          attr = [c.r, c.g, c.b];
        } else if (vattr.name === 'opacity') {
          attr = [point.opacity];
        } else if (vattr.name === 'normal') {
          attr = [n.x, n.y, n.z];
        } else if (point[vattr.name] != undefined) {
          attr = _.isArray(point[vattr.name])? point[vattr.name] : [point[vattr.name]];
        } else {
          console.warn('Unknown attr ' + vattr.name);
        }
        if (attr.length) {
          var props = vattr.properties;
          for (var k = 0; k < props.length; k++) {
            var p = props[k];
            if (p.convert) {
              row.push(p.convert(attr));
            } else {
              row.push(_.isArray(attr)? attr[k] : attr);
            }
          }
        }
      }
    }
    result.appendVertex(row);
  }

  if (params) {
      params.vertexOffset = vertexOffset + sampledPoints.length;
  }
  return result;
};

function appendAttrs(row, attrvalues, attrspecs) {
  if (attrvalues) {
    for (var i = 0; i < attrvalues.length; i++) {
      var attr = attrvalues[i];
      var props = attrspecs[i].properties;
      for (var j = 0; j < props.length; j++) {
        var p = props[j];
        if (p.convert) {
          row.push(p.convert(attr));
        } else {
          row.push(_.isArray(attr)? attr[j] : attr);
        }
      }
    }
  }
  return row;
}

PLYExporter.prototype.__appendMesh = function (mesh, params, data) {
  var vertexOffset = params.vertexOffset;
  //console.log('appendMesh', JSON.stringify(params));

  var result = data || this.__createData(params);
  mesh.updateMatrixWorld();
  var t = mesh.matrixWorld;
  if (params.transform) {
    t = params.transform.clone();
    t.multiply(mesh.matrixWorld);
  }
  var vattrs = params.vertexAttributes;
  GeometryUtil.forMeshVerticesWithTransform(mesh, function (v, attrvalues) {
    var row = [v.x, v.y, v.z];
    appendAttrs(row, attrvalues, vattrs);
    result.appendVertex(row);
  }, t, vattrs);

  var geometry = mesh.geometry;
  // Assumes faces are basically triangles
  //console.log(geometry);
  var fattrs = params.faceAttributes;
  //console.log('faceAttributes', fattrs);
  GeometryUtil.forFaceVertexIndices(geometry, function(iface, verts, attrvalues) {
    for (var i = 0; i < verts.length; i++) {
      verts[i] += vertexOffset;
    }
    var values = appendAttrs([], attrvalues, fattrs);
    result.appendFace(verts, values);
  }, fattrs);
  if (params) {
    params.vertexOffset = vertexOffset + GeometryUtil.getGeometryVertexCount(mesh.geometry);
  }
  return result;
};


PLYExporter.prototype.__appendObject = function (object3D, params, data, appendMeshCallback) {
  var result = data || this.__createData(params);
  object3D.updateMatrixWorld();
  if (params.visibleOnly) {
    Object3DUtil.traverseVisibleMeshes(object3D, !this.includeChildModelInstances, function(mesh) {
      appendMeshCallback(mesh, params, result);
    });
  } else {
    Object3DUtil.traverseMeshes(object3D, !this.includeChildModelInstances, function(mesh) {
      appendMeshCallback(mesh, params, result);
    });
  }
  return result;
};

/**
 * Export objects in PLY format
 * @param objects {THREE.Object3D[]|THREE.Object3D}
 * @param opts Options on how the objects should be exported
 * @param [opts.callback] {function()} Callback for when the export finishes
 * @param [opts.name=scene] {string} Filename to which the export ply would be saved to (`.ply` is appended if the name does not end with `.ply`)
 * @param [opts.onlyVisible=true] {boolean} Whether to only export visible meshes
 * @param [opts.transform] {THREE.Matrix4} Additional transform to apply to the object
 * @param [opts.format=this.format] {string} Export as`ascii|binary_little_endian`
 * @param [opts.vertexAttributes=this.vertexAttributes] Vertex attributes to export
 * @param [opts.faceAttributes=this.faceAttributes] Face attributes to export
 */
PLYExporter.prototype.export = function (objects, opts) {
  opts = opts || {};
  var callback = opts.callback;
  // Exports object3D to file using OBJ format
  var filename = (opts.name != undefined)? opts.name : 'scene';
  if (!filename.endsWith('.ply')) {
    filename = filename + '.ply';
  }
  console.log('export to PLY');

  if (objects instanceof THREE.Object3D) {
    objects = [objects];
  }

  var nverts = 0;
  var nfaces = 0;
  for (var i = 0; i < objects.length; i++) {
    var stats = Object3DUtil.getObjectStats(objects[i], this.includeChildModelInstances);
    nverts += stats.nverts;
    nfaces += stats.nfaces;
  }

  var data = null;
  console.log('processing ' + objects.length + ' objects with total '
    + nverts + ' vertices, ' + nfaces + ' faces');
  var params = _.defaults({ vertexOffset: 0, nverts: nverts, nfaces: nfaces }, opts,
    { format: this.format, vertexAttributes: this.vertexAttributes, faceAttributes: this.faceAttributes });
  this.__computeProperties(params);
  for (var i = 0; i < objects.length; i++) {
    console.log('appending object ' + i + '/' + objects.length);
    data = this.__appendObject(objects[i], params, data, this.__appendMesh.bind(this));
  }
  var fileutil = this.__fs;
  function appendVertexData() {
    fileutil.fsAppendToFile(filename, data.getVertexData(), appendFaceData);
  }
  function appendFaceData() {
    fileutil.fsAppendToFile(filename, data.getFaceData(), finishFile);
  }
  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting mesh to ' + filename);
    if (callback) { callback(); }
  }
  var header = this.__getHeader(params);
  fileutil.fsWriteToFile(filename, header, appendVertexData);
};

module.exports = PLYExporter;