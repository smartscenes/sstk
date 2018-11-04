'use strict';
/* jshint esversion: 6 */

var async = require('async');
var expect = require('chai').expect;
var csvparser = require('papaparse');
var STK = require('../../stk-ssc');

var testutil = require('./render-testutil');
var referenceImagesDir = __dirname + '/ref/suncg-fixed/';
var outputImagesDir = __dirname + '/out/suncg-fixed/';

var sscdir = __dirname + "/../../";
var data = STK.util.readSync(__dirname + '/data/suncg/testScenes.csv');
var parsed = csvparser.parse(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
var testEntries = parsed.data;
testEntries = STK.util.take(testEntries, 5);
var config_file =  `--config_file  ${sscdir}/../ssg/config/render_fixed.json`;

describe('Scene Toolkit Server-side Compute Render SUNCG Scenes', function () {
  before(function (done) {  // runs before all tests in this block
    // clear out previous test images
    testutil.clear_dir(outputImagesDir);
    done();
  });

  after(function (done) {  // runs after all tests in this block
    done();
  });

  async.each(testEntries, function (entry, cb) {
    var id = entry.id;
    it('render diff for p5d.' + id, function (done) {
      var cmd = `${sscdir}/render.js ${config_file} --compress_png --output_dir ${outputImagesDir} --id ${id}`;
      testutil.run_and_compare(cmd, referenceImagesDir, outputImagesDir, id, 0.01);
      done();
    }).timeout(120000);  // wait up to two minutes
    cb();
  });
});
