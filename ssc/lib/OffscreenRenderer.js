var async = require('async');
var PNG = require('pngjs').PNG;
var _ = require('lodash');

function __getTempFilename(prefix, ext) {
  var crypto = require('crypto');
  var os = require('os');
  var token = crypto.randomBytes(8).toString('hex');
  return os.tmpdir() + '/' + prefix + '_' + token + '.' + ext;
}

function OffscreenRendererFactory (baseRendererClass, ImageUtil, Colors) {
  var OffscreenRenderer = function (params) {
    var gl = require('gl');
    // var _gl = gl(1000, 1000);  // gl context will be resized later
    // var ext = _gl.getExtension('STACKGL_resize_drawingbuffer');
    // ext.resize(params.width, params.height);
    // params.context = _gl;
    params.context = gl(params.width, params.height);
    params.isOffscreen = true;
    this.compress = params.compress;  // whether to compress PNG output
    this.skip_existing = params.skip_existing;  // whether to skip rendering existing files
    this.flipxy = params.flipxy; // whether to flip xy when writing out the png image
    this.__fs = params.fs || require('./file-util.js');  // filesystem to use for IO
    this.__debugCount = 0; // For debug output
    this.__debugFilename = params.debugFilename;
    baseRendererClass.call(this, params);
    this.__needFlipY = true;
    this.__maxViewportDims = [1000, 1000];
    this.canvas = params.canvas;  // Reference to dummy canvas
    this.viewlogFilename = params.viewlogFilename;  // Log of views that were generated
  };
  OffscreenRenderer.prototype = Object.create(baseRendererClass.prototype);
  OffscreenRenderer.prototype.super = baseRendererClass.prototype;
  OffscreenRenderer.prototype.constructor = OffscreenRenderer;

  OffscreenRenderer.prototype.makePowerOfTwo = function(image) {
    return ImageUtil.makePowerOfTwoSync(image);
  };

  OffscreenRenderer.prototype.setSize = function(width, height) {
    if (width !== this.width || height !== this.height) {
      console.warn('Set size is not properly supported in offscreen mode');
    }
    baseRendererClass.prototype.setSize.call(this, width, height);
  };

  // Renders scene from given camera into pngFile and returns raw RGBA pixels
  OffscreenRenderer.prototype.renderToPng = function (scene, camera, basename, opts) {
    var pngfile = _.endsWith(basename, '.png') ? basename : basename + '.png';
    if (this.skip_existing && this.__fs.existsSync(pngfile)) {
      console.log('Skipping render for existing file: ' + pngfile);
      return;
    }
    var pixels = this.render(scene, camera, opts);
    this.writePNG(pngfile, this.width, this.height, pixels);
    var viewlogFilename = (opts? opts.viewlogFilename : null) || this.viewlogFilename;
    if (viewlogFilename) {
      var logdata = opts? opts.logdata : null;
      var getIndexInfoFn = null;
      if (opts && opts.includeIndexInfo) {
        if (opts.index) {
          var colorToIndexMap = opts.index.colorToIndex(Colors);
          getIndexInfoFn = function(v) {
            var index = colorToIndexMap[v];
            return {
              index: index,
              color: v,
              label: opts.index.get(index)
            };
          };
        }
        const indexInfo = ImageUtil.getIndexInfo({ data: pixels, width: this.width, height: this.height }, null, getIndexInfoFn, true);
        if (logdata) {
          logdata = _.defaults({indexInfo: indexInfo}, logdata);
        }
      }

      this.logCameraInfo(viewlogFilename, camera, { filename: pngfile,  logdata: logdata });
    }
    if (this.compress) {
      this.__fs.execSync('pngquant -f --ext .png ' + pngfile, { encoding: 'utf8' });
    }
    return pixels;
  };

  OffscreenRenderer.prototype.logCameraInfo = function (viewlogFilename, camera, opts) {
    var logdata = { width: this.width, height: this.height, worldCamera: camera.toJSON() };
    if (opts && opts.filename) {
      logdata.filename = opts.filename;
    }
    if (opts && opts.logdata) {
      _.defaults(logdata, opts.logdata);
    }
    this.__fs.writeToFile(viewlogFilename, JSON.stringify(logdata) + '\n', { append: true });
  };

  // Renders scene from given camera into raw RGBA pixels
  OffscreenRenderer.prototype.render = function (scene, camera, opts) {
    var pixels = this.super.render.call(this, scene, camera, opts);
    if (this.__debugFilename) {
      this.writePNG(this.__debugFilename + '-' + this.__debugCount + '.png', this.width, this.height, pixels);
      this.__debugCount++;
    }
    return pixels;
  };

  // Renders scene from given camera into raw RGBA pixels
  OffscreenRenderer.prototype.renderToRawPixels = function (scene, camera, opts) {
    return this.render(scene, camera, opts);
  };

  OffscreenRenderer.prototype.renderToBuffer = function (scene, camera, opts) {
    var pixels = this.render(scene, camera, opts);
    var png = new PNG({ width: this.width, height: this.height });
    png.data = Buffer.from(pixels);
    var buff = PNG.sync.write(png);
    return buff;
  };

  // Renders turntable views of scene and saves into pngs strippedId_<0-359>.png
  OffscreenRenderer.prototype.renderTurntable = function (scene, opts) {
    var cameraControls = opts.cameraControls;
    var targetBBox = opts.targetBBox;
    var basename = opts.basename;
    var format = opts.videoFormat;
    var onDone = opts.callback;
    var tilt = opts.tilt || 60;
    var theta = tilt  / 180 * Math.PI;
    var distanceScale = opts.distanceScale || 1.5;
    var angleStart = opts.angleStart || 0;
    var angleEnd = opts.angleEnd || 360;
    var angleStep = opts.angleStep || 1;
    var framerate = opts.framerate || 25;

    var scope = this;
    var pngfiles = [];
    var angles = _.range(angleStart, angleEnd, angleStep);
    async.forEachOfSeries(angles, function (angle, key, callback) {
      var phi = angle / 180 * Math.PI;
      cameraControls.viewTarget({
        targetBBox: targetBBox, distanceScale: distanceScale,
        theta: theta,
        phi: phi
      });
      var pngfile = basename + '-' + _.padStart(key.toString(), 4, '0') + '.png';
      pngfiles.push(pngfile);
      cameraControls.camera.updateProjectionMatrix();
      var renderOpts = _.clone(opts);
      renderOpts.logdata = _.defaults({ cameraConfig: cameraControls.lastViewConfig },
        opts.logdata || {});
      scope.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);
      setTimeout(function () { callback(); });
    }, function () {
      if (!opts.skipVideo) {
        var pattern = scope.getMatchingPngPattern(basename, format);
        scope.pngSeqToVideo(pattern, basename + '.' + format,
          {width: scope.width, height: scope.height, framerate: framerate});
        if (opts.clearPngs) {
          for (let pngfile of pngfiles) {
            scope.removeFile(pngfile);
          }
        }
      }
      onDone();
    });
  };

  // Renders all defauit views of scene and saves into pngs strippedId_<viewName>.png
  OffscreenRenderer.prototype.renderAllViews = function (scene, opts) {
    var cameraControls = opts.cameraControls;
    var targetBBox = opts.targetBBox;

    var views = cameraControls.generateViews(targetBBox, this.width, this.height);
    this.__renderViews(scene, views, opts);
  };

  OffscreenRenderer.prototype.renderViews = function(scene, views, opts) {
    if (views === 'turntable') {
      this.renderTurntable(scene, opts);
    } else if (views === 'all') {
      this.renderAllViews(scene, opts);
    } else  {
      this.__renderViews(scene, views, opts);
    }
  };

  // Renders specified views of scene and saves into pngs
  OffscreenRenderer.prototype.__renderViews = function (scene, views, opts) {
    var cameraControls = opts.cameraControls;
    var basename = opts.basename;
    var onDone = opts.callback;

    var scope = this;
    async.forEachOfSeries(views, function (view, i, callback) {
      cameraControls.viewTarget(view);
      const name = (view.name != null) ? view.name : ((view.id != null) ? view.id : i);
      const pngfile = basename + '-' + name + '.png';
      const renderOpts = _.clone(opts);
      renderOpts.logdata = _.defaults({cameraConfig: cameraControls.lastViewConfig},
        opts.logdata || {});
      scope.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);
      setTimeout(function () { callback(); });
    }, function () {
      onDone();
    });
  };

  // Flip XY with respect to upper left corner
  OffscreenRenderer.prototype.__flipXY_ul = function (p, width, height, pout, bpp) {
    var numElementsPerRow = bpp * width;
    var numElementsPerColumn = bpp * height;
    for (var row = 0; row < height; row++) {
      var base = numElementsPerRow * row;
      for (var col = 0; col < width; col++) {
        var idx = base + (col * bpp);
        var idxOut = numElementsPerColumn*col + (row * bpp);
        for (var k = 0; k < bpp; k++) {
          pout[idxOut + k] = p[idx + k];
        }
      }
    }
  };

  // Flip XY with respect to lower left corner
  OffscreenRenderer.prototype.__flipXY_ll = function (p, width, height, pout, bpp) {
    var numElementsPerRow = bpp * width;
    var numElementsPerColumn = bpp * height;
    for (var row = 0; row < height; row++) {
      var base = numElementsPerRow * row;
      var rowOut = height - row - 1;
      for (var col = 0; col < width; col++) {
        var colOut = width - col - 1;
        var idx = base + (col * bpp);
        var idxOut = numElementsPerColumn*colOut + (rowOut * bpp);
        for (var k = 0; k < bpp; k++) {
          pout[idxOut + k] = p[idx + k];
        }
      }
    }
  };

  OffscreenRenderer.prototype.writePNG = function (pngFile, width, height, pixels) {
    // colorType (0 = grayscale, 2 = RGB, 4 = grayscale alpha, 6 = RGBA)
    var opts = { width: width, height: height, bpp: 4 };
    if (pixels instanceof Uint16Array) {  // 16-bit depth
      opts.inputColorType = 0;
      opts.inputHasAlpha = false;
      opts.colorType = 0; // grayscale
      opts.bitDepth = 16;
      opts.bpp = 2;
    } else if (pixels instanceof Uint8Array && pixels.length === width*height) { // 8 bit png
      opts.inputColorType = 0;
      opts.inputHasAlpha = false;
      opts.colorType = 0; // grayscale
      opts.bitDepth = 8;
      opts.bpp = 1;
    }
    var buf = Buffer.alloc(opts.bpp * opts.width * opts.height);
    if (this.flipxy) {
      opts.width = height;  opts.height = width;
      if (this.flipxy === 'lower_left') {
        this.__flipXY_ll(pixels, width, height, buf, opts.bpp);
      } else {
        this.__flipXY_ul(pixels, width, height, buf, opts.bpp);
      }
    } else {
      var pixbuf = new Uint8Array(pixels.buffer);
      for (var i = 0; i < pixbuf.length; i++) {
        buf[i] = pixbuf[i];
      }
    }
    var outbuf = PNG.sync.write({ width: opts.width, height: opts.height, data: buf}, opts);
    this.__fs.writeFileSync(pngFile, outbuf);
    console.log('Saved ' + pngFile);
  };

  // converts png sequence input to video file out (uses ffmpeg)
  OffscreenRenderer.prototype.pngSeqToVideo = function (input, out, opts) {
    if (out.endsWith('.mp4')) {
      this.pngSeqToMp4(input, out, opts);
    } else if (out.endsWith('.webp')) {
      this.pngSeqToWebp(input, out, opts);
    } else if (out.endsWith('.gif')) {
      this.pngSeqToGif(input, out, opts);
    } else {
      console.log('Skipping video output: unsupported video type ' + out);
    }
  };

  OffscreenRenderer.prototype.getMatchingPngPattern = function(basename, format) {
    if (format === 'gif') {
      return basename + '-*.png';         // convert
    } else {
      return basename + '-%04d.png';      // ffmpeg pattern
    }
  };

  OffscreenRenderer.prototype.pngSeqToWebp = function (input, out, opts) {
    var framerate = opts.framerate || 25;
    var cmdWithArgs = ['ffmpeg', '-y', '-i', input, '-loop','0',
      '-filter:v', 'fps=fps=' + framerate, '-r', framerate, out];
    var cmdline = cmdWithArgs.join(' ');
    this.__fs.execSync(cmdline);
  };

  // converts png sequence input to video file out (uses ffmpeg)
  OffscreenRenderer.prototype.pngSeqToMp4 = function (input, out, opts) {
    var tmpfilename = __getTempFilename('white', 'png');
    var width = opts.width || this.width;
    var height = opts.height || this.height;
    var whitePixels = new Uint8Array(width * height * 4).fill(255);
    this.writePNG(tmpfilename, width, height, whitePixels);
    var framerate = opts.framerate || 25;
    var cmdWithArgs = ['ffmpeg', '-y', '-loop','1','-i',tmpfilename,
      '-r', framerate, '-i', input, '-filter_complex','overlay=shortest=1',
      '-r', framerate, out];
    var cmdline = cmdWithArgs.join(' ');
    this.__fs.execSync(cmdline);
    this.__fs.execSync('rm -f ' + tmpfilename);
  };

  // converts png sequence input to gif file out (uses convert)
  OffscreenRenderer.prototype.pngSeqToGif = function (input, out, opts) {
    //parallel --plus --eta convert -dispose previous -delay 10 *.png -coalesce -layers OptimizePlus -loop 0 2.gif
    opts = opts || {};
    let delay = 10;
    if (opts.delay != null) {
      delay = opts.delay;
    } else if (opts.framerate != null) {
      delay = '1x' + opts.framerate;
    }
    var cmdWithArgs = ['convert','-dispose', 'background', '-delay', delay, input, '-loop','0', out];
    var cmdline = cmdWithArgs.join(' ');
    this.__fs.execSync(cmdline);
    //this.__fs.execSync('rm -f ' + input);
  };

  // converts gif sequence input to gif file out (uses convert)
  OffscreenRenderer.prototype.gifSeqToGif = function (input, out) {
    this.__fs.execSync('rm -f ' + out);
    var cmdWithArgs = ['convert', input, out];
    var cmdline = cmdWithArgs.join(' ');
    this.__fs.execSync(cmdline);
  };

  // merge video sequence
  OffscreenRenderer.prototype.mergeVideoSequence = function (input, out) {
    if (out.endsWith('.gif')) {
      this.gifSeqToGif(input, out);
    } else {
      console.log('Skipping merging of videos: unsupported video type ' + out);
    }
  };

  OffscreenRenderer.prototype.removeFile = function (input) {
    this.__fs.execSync('rm -f ' + input);
  };

  return OffscreenRenderer;
}

module.exports = OffscreenRendererFactory;
