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

var suncgTestIds = [
  '85ef6f50abb4db8cabf661e45df8ebf1', // Scene with two levels, a tree that should be removed, lots of boxes, mirrored chairs
  "fc19b9e0cd9d71ede8065acfc781d75e",  // Scene with people in outside bathtub
];
var testEntries = [];
for (var i = 0; i < suncgTestIds.length; i++) {
  testEntries.push({
    id: suncgTestIds[i]
  });
}

describe('STK SSC compute-scene-relations', function () {
  before(function (done) {  // runs before all tests in this block
    // clear out previous test images
    testutil.clear_dir(outputDir);
    done();
  });

  after(function (done) {  // runs after all tests in this block
    done();
  });

  async.each(testEntries, function (entry, cb) {
    var name = entry.id;
    it('sample points for ' + name, function (done) {
      var opts = _.map(entry, function(v,k) { return `--${k} ${v}`}).join(' ');
      var compute_cmd = `${sscdir}/p5d/compute-scene-relations.js --output_dir ${outputDir} ${opts}`;
      console.log("Running " + compute_cmd);
      shell.exec(compute_cmd);
      var outputFilename = `${outputDir}/${name}/${name}.relations.json`;
      expect(fs.existsSync(outputFilename), 'Has output file ' + outputFilename).to.be.ok;
      done();
    }).timeout(120000);  // wait up to two minutes
    cb();
  });
});
