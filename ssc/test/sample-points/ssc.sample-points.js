'use strict';
/* jshint esversion: 6 */

var async = require('async');
var expect = require('chai').expect;
var shell = require('shelljs');
var fs = require('fs');
var path = require('path');
//var csvparser = require('papaparse');
var STK = require('../../stk-ssc');
var _ = STK.util;

var testutil = require('../render/render-testutil');
var referenceDir = __dirname + '/ref/';
var outputDir = __dirname + '/out/';

var sscdir = __dirname + "/../../";
//var data = STK.util.readSync(__dirname + '/data/suncg/testScenes.csv');
//var parsed = csvparser.parse(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
//var testEntries = parsed.data;

var shapeNetTestIds = [
  '2c55ab36465941714dad8cf98230ae26', // Bookcase with books (white redundant surface)
  'd8358969dad764edbb6f5a9e4b6b8b34', // Chair with cover (cover has patterned surface and inner side has material as chair)
  '146d5859bbd8d629bbf88898fc491e0c', // Microwave with cup inside (white inner surface that should be kept)
  '9ae261771f20269a2cc2573cdc390405', // Keyboard - lots of pieces so current hausdorff distance takes too long (white redundant surface)
  '11c8463ba58a134b68661782af60b711', // Clock with texture - some issue in getting image data in branch with three r84, okay with three r95
  '2b4f2fc77c47056eaefb25a27e962525', // not so great chair with inner surface that is visible
  '77daa3ded63dc634d83e8d4109d37961', // glass table (white redundant surface)
  'eeabc27816119ff429ae5ea47a8f21e0', // ping pong table (white redundant surface)
  '5ef9520bbefc05c9e8b292c1c2152aed', // weird transparent coffee table box
  '537c7bd16e8a00adbbc9440457e303e',   // Chair with texture
  '764abaffc5872775f0dff71ec76b46f7',  // Transparent png
  '4b71f633ddb55c6e309160eb001312fe',  // Chair with inner red surface, other white surface
  'dac4af24e2facd7d3000ca4b04fcd6ac',  // Chair with patterned green and white
  '7aabc57856fc6659597976c675750537',  // Chair with fine texture
];
function getShapeNetFileEntry(id) {
  return {
    'source': '3dw',
    'input': `/Users/angelx/work/sample-points/${id}/${id}.kmz`,
    input_type: "path",
    samples: 1000000
  };
}
function getShapeNetIdEntry(id) {
  return {
    source: "3dw",
    id: `${id}`,
    input_type: "id",
    samples: 100000
  }
}
var testEntries = [];
for (var i = 0; i < shapeNetTestIds.length; i++) {
//  testEntries.push(getShapeNetFileEntry(shapeNetTestIds[i]));
  testEntries.push(getShapeNetIdEntry(shapeNetTestIds[i]));
}

describe('STK SSC sample-points', function () {
  before(function (done) {  // runs before all tests in this block
    // clear out previous test images
    testutil.clear_dir(outputDir);
    done();
  });

  after(function (done) {  // runs after all tests in this block
    done();
  });

  async.each(testEntries, function (entry, cb) {
    var name;
    if (entry.input_type === 'id') {
      name = (entry.id != undefined)? entry.id : entry.input;
    } else {
      name = path.basename(entry.input).split('.')[0];
    }
    it('sample points for ' + name, function (done) {
      var opts = _.map(entry, function(v,k) { return `--${k} ${v}`}).join(' ');
      var sample_cmd = `${sscdir}/sample-points.js --limit_to_visible --output_dir ${outputDir} ${opts}`;
      console.log("Running " + sample_cmd);
      shell.exec(sample_cmd);
      var sampledPointsFilename = `${outputDir}/${name}.ply`;
      expect(fs.existsSync(sampledPointsFilename), 'Has sampled output file ' + sampledPointsFilename).to.be.ok;
      var render_cmd = `${sscdir}/render-file.js --width 500 --height 500 --compress_png --input ${sampledPointsFilename} --output_dir ${outputDir}`;
      testutil.run_and_compare(render_cmd, referenceDir, outputDir, name + '.png', 0.01);
      done();
    }).timeout(120000);  // wait up to two minutes
    cb();
  });
});
