'use strict';

define(['Constants','util/ImageUtil','geo/Object3DUtil','three-shaders', 'gfx/EDLPass'], function (Constants, ImageUtil, Object3DUtil) {

  /**
   * Main rendering class (wrapper around THREE.Renderer)
   * @param opt
   * @constructor
   * @memberOf gfx
   */
  function Renderer(opt) {
    this.container = opt.container;
    this.isOffscreen = opt.isOffscreen;
    this.renderer = opt.renderer;
    this.width = opt.width || opt.container.clientWidth;
    this.height = opt.height || opt.container.clientHeight;
    this.useAmbientOcclusion = (opt.useAmbientOcclusion !== undefined) ? opt.useAmbientOcclusion : false;
    this.useOutlineShader = (opt.useOutlineShader !== undefined) ? opt.useOutlineShader : false;
    this.useEDLShader = (opt.useEDLShader !== undefined) ? opt.useEDLShader : false;
    this.outlineColor = (opt.outlineColor !== undefined) ? opt.outlineColor : 0xffffff;
    this.ambientOcclusionOptions = _.merge({
      type: opt.ambientOcclusionType || 'ssao'
    }, this.ambientOcclusionOptions);
    this.useShadows = (opt.useShadows !== undefined) ? opt.useShadows : false;
    this.useLights = (opt.useLights !== undefined) ? opt.useLights : false; // Default to false
    this.__reuseBuffers = opt.reuseBuffers;  // Reuse buffers?
    this.renderPass = null;
    this.ssaoPass = null;
    this.domElement = null;
    this.composer = null;

    this.__needFlipY = false;  // Do we need to flip about Y for rendering?
    this.__maxViewportDims = null;  // Maximum viewport dimensions before we need to have tiles?
    this.__tiles = null;

    this.init(opt);
  }

  Renderer.prototype.init = function (opt) {
    this.renderer = this.renderer || new THREE.WebGLRenderer({
      width: this.width,
      height: this.height,
      context: opt.context || null,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: opt.logarithmicDepthBuffer
    });
    if (this.useLights) {
      this.renderer.physicallyCorrectLights = true;
      //this.renderer.toneMapping = THREE.ReinhardToneMapping;
      this.renderer.toneMapping = THREE.Uncharted2ToneMapping;
      this.renderer.gammaInput = true;
      this.renderer.gammaOutput = true;
    }

    if (this.isOffscreen) {
      this.__rtTexture = new THREE.WebGLRenderTarget(this.width, this.height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat
      });
    }

    //this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(this.width, this.height);

    if (this.useShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    if (this.useAmbientOcclusion || this.useOutlineShader || this.useEDLShader) {
      //var pixelRatio = this.renderer.getPixelRatio();
      //var width  = Math.floor(this.width  / pixelRatio) || 1;
      //var height = Math.floor(this.height / pixelRatio) || 1;
      var rt = new THREE.WebGLRenderTarget(this.width, this.height,
        { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: true });
      this.composer = new THREE.EffectComposer(this.renderer, rt);
      this.composer.renderTarget1.stencilBuffer = true;
      this.composer.renderTarget2.stencilBuffer = true;
      this.renderPass = new THREE.RenderPass();
      this.composer.addPass(this.renderPass);

      var scene = {};
      var camera = new THREE.PerspectiveCamera( 65, this.width / this.height, 1, 4000 );

      if (this.useAmbientOcclusion) {
        var ssao = null;
        if (this.ambientOcclusionOptions.type === 'ssao') {
          ssao = new THREE.SSAOPass(scene, camera /*, this.width, this.height*/);
          ssao.radius = this.ambientOcclusionOptions.radius || (0.5*Constants.virtualUnitToMeters);
          console.log('set ssao.radius to ', ssao.radius);
          ssao.lumInfluence = 0.1;
        } else if (this.ambientOcclusionOptions.type === 'sao') {
          ssao = new THREE.SAOPass(scene, camera, false, true);
          ssao.params.saoScale = this.ambientOcclusionOptions.scale || 20000;  // TODO(MS): set this parameter more intelligently
          // ssao.params.saoScaleFixed = 0.03;
          // ssao.params.saoScale = ssao.params.saoScaleFixed*camera.far;  // TODO(MS): set this parameter more intelligently
          //console.log('set sao.params.soaScale to ', ssao.params.saoScale, camera.far );
        } else {
          console.warn('Unsupported ambientOcclusion configuration', this.ambientOcclusionOptions)
        }
        if (ssao) {
          if (!this.useOutlineShader) {
            ssao.renderToScreen = true;
          }
          this.composer.addPass(ssao);
        }
        this.ssaoPass = ssao;
      }

      if (this.useOutlineShader) {
        var outline = new THREE.OutlinePass(new THREE.Vector2(this.width, this.height), scene, camera);
        outline.edgeStrength = 100.0;
        outline.edgeThickness = 1.0;
        outline.visibleEdgeColor.set(this.outlineColor);
        outline.hiddenEdgeColor.set(this.outlineColor);
        // outline.clear = false;
        // if (!this.useAmbientOcclusion) { outline.renderToScreen = true; }
        if (!this.useEDLShader) { outline.renderToScreen = true; }
        this.outlinePass = outline;
        // this.outlineMaskPass = new THREE.MaskPass(scene, camera);
        // this.outlineMaskPass.inverse = true;
        // var colorCorrection = new THREE.ShaderPass(THREE.ColorCorrectionShader);
        // colorCorrection.uniforms.mulRGB.value = new THREE.Vector3(0, 0, 0);
        // var clearMaskPass = new THREE.ClearMaskPass();
        // var copyPass = new THREE.ShaderPass(THREE.CopyShader);
        // copyPass.renderToScreen = true;

        // this.composer.addPass(this.outlineMaskPass);
        this.composer.addPass(outline);
        // this.composer.addPass(colorCorrection);
        // this.composer.addPass(clearMaskPass);
        // this.composer.addPass(copyPass);

        // var effectGrayScale = new THREE.ShaderPass( THREE.LuminosityShader );
        // this.composer.addPass(effectGrayScale);
        // effectSobel = new THREE.ShaderPass( THREE.SobelOperatorShader );
        // effectSobel.renderToScreen = true;
        // effectSobel.uniforms.resolution.value.x = this.width;
        // effectSobel.uniforms.resolution.value.y = this.height;
        // this.composer.addPass(effectSobel);
      }

      if (this.useEDLShader) {
        var edlPass = new THREE.EDLPass(scene, camera, this.width, this.height);
        edlPass.renderToScreen = true;
        this.edlPass = edlPass;
        this.composer.addPass(edlPass);
      }

    }

    if (this.renderer.domElement) {
      this.domElement = this.renderer.domElement;
      this.domElement.setAttribute('tabindex','1');
      if (this.container) { this.container.appendChild(this.domElement); }
      // Grabs focus when mouse is over this element
      this.domElement.addEventListener('mouseover', function () { this.domElement.focus(); }.bind(this),false);
      this.domElement.addEventListener('mouseout', function () { this.domElement.blur(); }.bind(this),false);
    }
  };

  Renderer.prototype.createPixelBuffer = function() {
    return new Uint8Array(4 * this.width * this.height);
  };

  Renderer.prototype.__getPixelBuffer = function() {
    var createNewBuffer = !this.__reuseBuffers || !this.__pixelBuffer || (this.width * this.height * 4 !== this.__pixelBuffer.length);
    if (createNewBuffer) {
      this.__pixelBuffer = this.createPixelBuffer();
    }
    return this.__pixelBuffer;
  };

  // handle y flip due to WebGL render target
  Renderer.prototype.__flipY = function (p) {
    var t;
    var numElementsPerRow = 4 * this.width;
    for (var row = 0; row < this.height / 2; row++) {
      var yOut = this.height - row - 1;
      var base = numElementsPerRow * row;
      var baseOut = numElementsPerRow * yOut;
      for (var col = 0; col < this.width; col++) {
        var step = col << 2;  // 4*x
        var idx = base + step;
        var idxOut = baseOut + step;
        t = p[idxOut    ]; p[idxOut    ] = p[idx    ]; p[idx    ] = t;  // R
        t = p[idxOut + 1]; p[idxOut + 1] = p[idx + 1]; p[idx + 1] = t;  // G
        t = p[idxOut + 2]; p[idxOut + 2] = p[idx + 2]; p[idx + 2] = t;  // B
        t = p[idxOut + 3]; p[idxOut + 3] = p[idx + 3]; p[idx + 3] = t;  // A
      }
    }
  };

  function copyPixels(source, target, flipY) {
    // TODO: make more efficent
    //console.log('copyPixels', _.omit(source, ['buffer']), _.omit(target, ['buffer']), flipY);
    var sourceNumElementPerRow = 4 * source.fullWidth;
    var targetNumElementPerRow = 4 * target.fullWidth;
    var sourceColOffset = 4 * source.x;
    var targetColOffset = 4 * target.x;
    var bytesToCopyPerRow = 4 * source.width;
    //console.log('bytesToCopyPerRow is ', bytesToCopyPerRow);
    for (var row = 0; row < source.height; row++) {
      var sourceRow = flipY? (source.fullHeight - source.height + source.y + row) : (source.y + row);
      var base = sourceNumElementPerRow * sourceRow + sourceColOffset;
      var targetRow = target.y + row;
      if (flipY) {
        targetRow = target.y + (source.height - row - 1);
        //targetRow = target.fullHeight - targetRow;
      }
      var baseOut = targetNumElementPerRow * targetRow + targetColOffset;
      //console.log('source start/end is ', base, base + bytesToCopyPerRow, source.buffer.length);
      //console.log('target start/end is ', baseOut, baseOut + bytesToCopyPerRow, target.buffer.length);
      var s = source.buffer.subarray(base, base + bytesToCopyPerRow);
      target.buffer.set(s, baseOut);
      //for (var j = 0; j < bytesToCopyPerRow; j++) {
      //  target.buffer[baseOut+j] = source.buffer[base+j];
      //}
    }
  }

  function updateSAO(sao, scene, camera) {
    sao.scene = scene;
    sao.camera = camera;
    //sao.params.saoScale = sao.params.saoScaleFixed*camera.far;  // TODO(MS): set this parameter more intelligently
    //console.log('set sao.params.soaScale to ', sao.params.saoScale, camera.far );
    sao.saoMaterial.uniforms[ 'cameraNear' ].value = camera.near;
    sao.saoMaterial.uniforms[ 'cameraFar' ].value = camera.far;
    sao.saoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.getInverse(camera.projectionMatrix);
    sao.saoMaterial.uniforms[ 'cameraProjectionMatrix' ].value = camera.projectionMatrix;
    sao.saoMaterial.defines[ 'PERSPECTIVE_CAMERA' ] = (camera.isPerspectiveCamera || camera.inPerspectiveMode) ? 1 : 0;
  }

  function updateAmbientOcclusion(ssaoPass, scene, camera) {
    if (ssaoPass instanceof THREE.SSAOPass) {
      ssaoPass.setScene(scene);
      ssaoPass.setCamera(camera);
    } else if (ssaoPass instanceof THREE.SAOPass) {
      updateSAO(ssaoPass, scene, camera);
    }
  }

  Renderer.prototype.__render = function(scene, camera, fullWidth, fullHeight, renderTarget, forceClear) {
    if (camera.isArrayCamera) {
      var oldAutoClear = this.renderer.autoClear;
      for (var i = 0; i < camera.cameras.length; i++) {
        var cam = camera.cameras[i];
        var bounds = cam.bounds;

        var x = bounds.x * fullWidth;
        var y = bounds.y * fullHeight;
        var width = bounds.z * fullWidth;
        var height = bounds.w * fullHeight;

        this.renderer.autoClear = (i === 0)? oldAutoClear : false;
        this.renderer.setViewport( x, y, width, height );
        this.renderer.render(scene, cam, renderTarget, forceClear);
      }
      this.renderer.autoClear = oldAutoClear;
      this.renderer.setViewport( 0, 0, fullWidth, fullHeight );
    } else {
      this.renderer.render(scene, camera, renderTarget, forceClear);
    }
  };


  Renderer.prototype.__renderScene = function (scene, camera, opts) {
    opts = opts || {};
    var height = opts.height;
    var width = opts.width;
    var offsetX = opts.offsetX || 0;
    var offsetY = opts.offsetY || 0;
    if ((this.useAmbientOcclusion && this.ssaoPass.enabled) ||
        (this.useOutlineShader && this.outlinePass.enabled) ||
        (this.useEDLShader && this.edlPass.enabled)) {
      // Render to composer
      // Bad RenderPass API design requires setting scene and camera
      this.renderPass.scene = scene; this.renderPass.camera = camera;
      if (this.useAmbientOcclusion) {
        updateAmbientOcclusion(this.ssaoPass, scene, camera);
      }
      if (this.useOutlineShader) {
        this.outlinePass.renderScene = scene;
        this.outlinePass.renderCamera = camera;
        // this.outlineMaskPass.scene = scene;
        // this.outlineMaskPass.camera = camera;
        var meshes = Object3DUtil.getVisibleMeshList(scene, true);
        meshes = meshes.filter(function (m) { return !m.name.startsWith('Wall') && !m.name.startsWith('Floor'); });
        this.outlinePass.selectedObjects = meshes;
        // console.log(this.outlinePass.selectedObjects);
      }
      if (this.useEDLShader) {
        this.edlPass.setScene(scene);
        this.edlPass.setCamera(camera);
      }
      this.composer.render();
    } else {
      if (this.domElement) {
        // Render to canvas
        this.__render(scene, camera, width, height);
      } else {
        // Render to offscreen texture
        this.__render(scene, camera, width, height, this.__rtTexture, true);
      }
    }
    if (this.isOffscreen) {
      if (this.domElement) {
        // We also want to return the pixels
        // Let's try to read it from the domElement
        var pixels = opts.pixelBuffer;
        this.renderer.context.readPixels(offsetX, offsetY, width, height, this.renderer.context.RGBA, this.renderer.context.UNSIGNED_BYTE, pixels);
        return pixels;
      } else {
        var renderTarget = this.useAmbientOcclusion ? this.composer.writeBuffer : this.__rtTexture;
        var pixels = opts.pixelBuffer;
        this.renderer.readRenderTargetPixels(renderTarget, offsetX, offsetY, width, height, pixels);
        return pixels;
      }
    }
  };

  Renderer.prototype.__renderTiles = function (scene, camera, opts) {
    // TODO: Handle array cameras and tiles!
    var fullWidth = this.width;
    var fullHeight = this.height;
    if (this.__tiles) {
      //console.log('render with tiles');
      var tileBuffer = this.__getTileBuffer();
      //var oldAutoClear = this.renderer.autoClear;
      //this.renderer.autoClear = false;
      var pixels = opts.pixelBuffer || this.__getPixelBuffer();
      for (var i = 0; i < this.__tiles.length; i++) {
        var tile = this.__tiles[i];
        //console.log('render with tile', tile.x, tile.y, tile.width, tile.height);
        camera.setViewOffset(fullWidth, fullHeight, tile.x, tile.y, this.__tileWidth, this.__tileHeight);
        var tilePixels = this.__renderScene(scene, camera, _.defaults({pixelBuffer: tileBuffer, width: this.__tileWidth, height: this.__tileHeight}, opts));
        if (opts.postprocess) {
          tilePixels = this.postprocessPixels(tilePixels, opts.postprocess, camera);
        }
        if (this.isOffscreen) {
          // copy from tilePixels into our pixels
          copyPixels(
            { buffer: tilePixels, x: 0, y: 0, width: tile.width, height: tile.height, fullWidth: this.__tileWidth, fullHeight: this.__tileHeight },
            { buffer: pixels, x: tile.x, y: tile.y, width: tile.width, height: tile.height, fullWidth: fullWidth, fullHeight: fullHeight },
            this.__needFlipY
          );
        }
      }
      camera.clearViewOffset(); // TODO: restore old view offset
      //this.renderer.autoClear = oldAutoClear;
      return this.isOffscreen? pixels : null;
    } else {
      //console.log('render no tiles');
      var pixelBuffer = opts.pixelBuffer || this.__getPixelBuffer();
      var pixels = this.__renderScene(scene, camera, _.defaults({pixelBuffer: pixelBuffer, width: fullWidth, height: fullHeight}, opts));
      if (this.__needFlipY) {
        this.__flipY(pixels);
      }
      if (opts.postprocess) {
        pixels = this.postprocessPixels(pixels, opts.postprocess, camera);
      }
      return pixels;
    }
  };

  Renderer.prototype.render = function (scene, camera, opts) {
    opts = opts || {};
    return this.__renderTiles(scene, camera, opts);
  };

  Renderer.prototype.setSize = function (width, height) {
    this.__setSize(width, height);
    var maxTileWidth = this.__maxViewportDims? this.__maxViewportDims[0] : Infinity;
    var maxTileHeight = this.__maxViewportDims? this.__maxViewportDims[1] : Infinity;
    if (this.width < maxTileWidth && this.height < maxTileHeight) {
      this.__setTileSize(width, height);
      this.__tiles = null;
    } else {
      var tilew = maxTileWidth;
      var tileh = maxTileHeight;
      this.__setTileSize(tilew, tileh);
      this.__tiles = [];
      var nw = Math.ceil(width / tilew);
      var nh = Math.ceil(height / tileh);
      for (var i = 0; i < nw; i++) {
        var sx = i*tilew;
        var w = Math.min(width-sx, tilew);
        for (var j = 0; j < nh; j++) {
          var sy = j*tileh;
          var h = Math.min(height-sy, tileh);
          this.__tiles.push({ x: sx, y: sy, width: w, height: h });
        }
      }
    }
  };

  Renderer.prototype.__getTileBuffer = function() {
    var createNewBuffer = !this.__tileBuffer || (this.__tileWidth * this.__tileHeight * 4 !== this.__tileBuffer.length);
    if (createNewBuffer) {
      this.__tileBuffer = new Uint8Array(4 * this.__tileWidth * this.__tileHeight);
    }
    return this.__tileBuffer;
  };

  Renderer.prototype.__setSize = function (width, height) {
    this.width = width;
    this.height = height;
  };

  Renderer.prototype.__setTileSize = function(width, height) {
    this.__tileWidth = width;
    this.__tileHeight = height;
    if (this.renderer) {
      this.renderer.setSize(width, height);
    }
    if (this.__rtTexture) {
      this.__rtTexture.setSize(width, height);
    }
    // Update ambient occlusion sizes
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  };

  Renderer.prototype.getMaxAnisotropy = function() {
    return this.renderer.capabilities.getMaxAnisotropy();
  };

  Renderer.prototype.postprocessPixels = function(pixels, operation, camera) {
    if (operation === 'unpackRGBAdepth') {
      pixels = ImageUtil.unpackRGBAdepth(pixels, camera);
    }
    return pixels;
  };

  // Exports
  return Renderer;
});
