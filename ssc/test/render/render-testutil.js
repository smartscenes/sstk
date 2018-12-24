var PixelDiff = require('pixel-diff');
var shell = require('shelljs');
var fs = require('fs');
var expect = require('chai').expect;

function clear_dir(dir) {
  if (shell.test('-d', dir)) {
    shell.rm('-rf', dir);
  }
  shell.mkdir('-p', dir);
}

function run_and_compare(cmd, referenceImageDir, outputImageDir, outputName, percent_diff) {
  console.log('Running ' + cmd);
  shell.exec(cmd);
  compare_image(referenceImageDir, outputImageDir, outputName, percent_diff);
}

function compare_image(referenceImagesDir, outputImagesDir, outputName, percent_diff) {
  var refFilename = referenceImagesDir + outputName;
  var outFilename = outputImagesDir + outputName;
  console.log('compare ' + refFilename + ' with ' + outFilename);
  expect(fs.existsSync(outFilename), 'Has output file ' + outFilename).to.be.ok;
  expect(fs.existsSync(refFilename), 'Has reference file ' + refFilename).to.be.ok;
  percent_diff = (percent_diff != null) ? percent_diff : 0.01; // 1% threshold
  var diff = new PixelDiff({
    imageAPath: refFilename,
    imageBPath: outFilename,
    thresholdType: PixelDiff.THRESHOLD_PERCENT,
    threshold: percent_diff,
    imageOutputPath: outputImagesDir + outputName.replace('.png', '.diff.png')
  });
  try {
    var result = diff.runSync();
    expect(diff.hasPassed(result.code),
      'Reference file ' + refFilename + ' to be similar to output file ' + outFilename).to.be.ok;
  } catch (err) {
    throw err;
  }
}

module.exports = {
  clear_dir: clear_dir,
  compare_image: compare_image,
  run_and_compare: run_and_compare
};