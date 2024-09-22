const STK = require("./stk-ssc");
const path = require("path");
const async = require('async');
const shell = require('shelljs');
const fs = require("fs");
const _ = STK.util;

function processAssets(cmd, files, assetManager, callback) {
  if (!fs.existsSync(cmd.output_dir)) {
    shell.mkdir('-p', cmd.output_dir);
  }

  if (cmd.render_dir && !fs.existsSync(cmd.render_dir)) {
    shell.mkdir('-p', cmd.render_dir);
  }

  const memcheckOpts = { heapdump: { limit: cmd.heapdump } };
  async.forEachOfSeries(files, function (file, index, cb) {
    STK.util.clearCache();
    if (cmd.heapdump != null) {
      STK.util.checkMemory('Processing ' + id + ' index=' + index, memcheckOpts);
    }

    var outputDir = cmd.output_dir;
    var basename = cmd.output;
    var scenename;
    var id;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
        basename = basename + '_' + index;
      }
      scenename = basename;
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      if (cmd.inputType === 'id') {
        var idparts = file.split('.');
        id = idparts[idparts.length-1];
        basename = id;
        scenename = basename;
        basename = (outputDir ? outputDir : '.') + '/' + basename;
      } else if (cmd.inputType === 'path') {
        basename = path.basename(file, path.extname(file)) || 'mesh';
        scenename = basename;
        basename = (outputDir ? outputDir : path.dirname(file)) + '/' + basename;
      }
    }

    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else {
      var info;
      var timings = new STK.Timings();
      var metadata = {};
      if (cmd.inputType === 'id') {
        info = { fullId: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.id = id;
      } else if (cmd.inputType === 'path') {
        info = { file: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.path = file;
      }
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      timings.start('load');
      assetManager.loadAsset(info, function (err, asset) {
        timings.stop('load');
        if (err) {
          cb(err);
        } else {
          STK.util.waitImagesLoaded(callback(asset, { basename: basename, scenename: scenename }, cb));
        }
      });
    }
  }, function (err, results) {
    if (err) {
      console.error('Error ' + err);
    }
    console.log('DONE');
  });
}

function prepareAssetInfo(inputType, input, opts) {
  function adjustForRoomLevel(assetname, level, room) {
    if (level != null) {
      assetname += '_' + level;
      if (room != null) {
        assetname += '_' + room;
      }
    }
    return assetname;
  }

  if (inputType === 'id') {
    const id = input;
    const sid = STK.assets.AssetManager.toSourceId(opts.source, id);
    let assetname = sid.id;
    assetname = adjustForRoomLevel(assetname, opts.level, opts.room);
    const outputname = (opts.outputDir ? opts.outputDir : '.') + '/' + assetname;

    const loadInfo = {fullId: sid.fullId, format: opts.inputFormat, assetType: opts.assetType, floor: opts.level, room: opts.room};
    if (opts.assetInfo) {
      _.defaults(loadInfo, opts.assetInfo);
    }
    const metadata = opts.assetsDb? opts.assetsDb.getAssetInfo(sid.fullId) : null;
    return { id: id, assetname: assetname, outputname: outputname, loadInfo: loadInfo, metadata: metadata };
  } else {
    const filename = input;
    let assetname = path.basename(filename, path.extname(filename));
    assetname = adjustForRoomLevel(assetname, opts.level, opts.room);
    // use path.dirname(filename) if we want to place relative to original input
    const defaultOutputDir = opts.useInputDirForOutput? path.dirname(filename) : '.';
    const outputname = (opts.outputDir ? opts.outputDir : defaultOutputDir) + '/' + assetname;
    const loadInfo = { file: filename, format: opts.inputFormat, assetType: opts.assetType, floor: opts.level, room: opts.room };
    if (opts.assetInfo) {
      _.defaults(loadInfo, opts.assetInfo);
    }
    return { filename: filename, assetname: assetname, outputname: outputname, loadInfo: loadInfo, metadata: null };
  }
}

module.exports = {
  processAssets: processAssets,
  prepareAssetInfo: prepareAssetInfo
};


