#!/usr/bin/env node

var async = require('async');
var cmd = require('commander');
var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var BBox = STK.geo.BBox;
var BVH = STK.geo.BVH;
var _ = STK.util;


cmd
  .version('0.0.1')
  .description('Create BVH given a directory of objects (specified as object_0.pts, object_1.pts,...)')
  .option('--input <directory>', 'Path to directory with objects as points files (object_0.pts, object_1.pts, ...)')
  .option('--output <filename>', 'Output filename')
  .parse(process.argv);
var argv = cmd;

if (!cmd.input) {
  console.error('Please specify --input <drectory>');
  process.exit(-1);
}

if (!cmd.output) {
  console.error('Please specify --output <filename>');
  process.exit(-1);
}

function read_object_files(files, opts, callback) {
  opts = opts || {};
  opts = _.defaults(opts, { savePoints: false, limit: 4 });
  var results = [];
  async.eachOfLimit(files, opts.limit, function (file, index, cb) {
    STK.fs.loadDelimited(file, { delimiter: ' ', header: false, skipEmptyLines: true, dynamicTyping: false }, function(err, records) {
      var result;
      if (err) {
        console.error('Error parsing object file ' + file, err);
      } else {
        var position = new THREE.Vector3();
        var id = file.split('.')[0].split('_')[1];
        var points = _.map(records.data, function(row) { return _.map(row, function(x) { return parseFloat(x); })});
        //console.log(points);
        var bbox = new BBox();
        for (var i = 0; i < points.length; i++) {
          var p = points[i];
          position.set(p[0], p[1], p[2]);
          bbox.includePoint(position);
        }
        result = { id: id, npoints: points.length, bbox: bbox };
        //console.log('got ', result);
        if (opts.savePoints) {
          result.points = points;
        }
      }
      results[index] = result;
      cb(err);
    });
  }, function(err) {
    if (results) {
      var filtered = _.filter(results);
      console.log('Loaded ' + filtered.length + '/' + results.length + ' objects');
    }
    callback(err, results);
  });
}

function build_bvh(objects, opts) {
  opt = opts || {};
  var bvhConfig = _.defaults(Object.create(null), opts, {
    splitStrategy: BVH.SplitStrategy.SURFACE_AREA_HEURISTIC,
    axisChoiceStrategy: BVH.AxisChoiceStrategy.OPTIMAL,
    getBoundingBox: function(objs) {
      if (Array.isArray(objs)) {
        var bbox = new BBox();
        objs.forEach(function (o) {
          var oBBox = o.bbox;
          //console.log('got bbox', o.bbox);
          if (oBBox && oBBox.valid()) {
            bbox.includeBBox(oBBox);
          }
        });
        //console.log('got aggr bbox', bbox);
        return bbox;
      } else {
        //console.log('got bbox', objs.bbox);
        return objs.bbox;
      }
    }
  });
  var bvh = new BVH(objects, bvhConfig);
  var leafs = bvh.getLeaves();
  var maxOid = -1;
  for (var i = 0; i < leafs.length; i++) {
    leafs[i].oid = leafs[i].objects[0].id;
    var oid = leafs[i].oid;
    if (_.isString(oid)) {
      oid = parseInt(oid);
    }
    if (oid > maxOid) {
      maxOid = oid;
    }
  }
  bvh.traverse(null, function(x) {
    if (x.oid == undefined) {
      maxOid++;
      x.oid = maxOid;
    }
  });
  return bvh;
}

function write_bvh(bvh, filename) {
  shell.mkdir('-p', path.dirname(filename));
  var nodes = bvh.getNodeArray();
  nodes = _.filter(nodes, function(node) { return node.parent; });
  var rows = _.map(nodes, function(node) {
    if (node.isLeaf) {
      return node.parent.oid + ' ' + node.oid + ' ' + node.oid;
    } else {
      return node.parent.oid + ' ' + node.oid + ' null';
    }
  });
  STK.fs.writeFileSync(filename, rows.join('\n'));
}

var files = fs.readdirSync(cmd.input);
var object_filename_pattern = /object_(\d+).pts/;
var object_files = _.filter(files, function(f) {
  return f.match(object_filename_pattern);
});

read_object_files(object_files, null, function(err, objects) {
  if (objects) {
    var bvh = build_bvh(objects);
    write_bvh(bvh, cmd.output);
  } else {
    console.error('Error reading object files', err);
  }
});
