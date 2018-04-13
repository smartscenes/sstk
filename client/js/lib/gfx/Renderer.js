'use strict';

define(['three-shaders'], function () {

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
    this.useAmbientOcclusion = false; //(opt.useAmbientOcclusion !== undefined) ? opt.useAmbientOcclusion : true;
    this.useShadows = (opt.useShadows !== undefined) ? opt.useShadows : false;
    this.useLights = (opt.useLights !== undefined) ? opt.useLights : false; // Default to false
    this.__reuseBuffers = opt.reuseBuffers;  // Reuse buffers?
    this.renderPass = null;
    this.domElement = null;
    this.depthMaterial = null;
    this.depthTarget = null;
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

    if (this.useAmbientOcclusion) {
      // Set up depth pass
      var depthShader = THREE.ShaderLib['distanceRGBA'];
      var depthUniforms = THREE.UniformsUtils.clone(depthShader.uniforms);
      this.depthMaterial = new THREE.ShaderMaterial({
        fragmentShader: depthShader.fragmentShader,
        vertexShader: depthShader.vertexShader,
        uniforms: depthUniforms
      });
      this.depthMaterial.blending = THREE.NoBlending;

      //var pixelRatio = this.renderer.getPixelRatio();
      //var width  = Math.floor(this.width  / pixelRatio) || 1;
      //var height = Math.floor(this.height / pixelRatio) || 1;
      var rt = new THREE.WebGLRenderTarget(this.width, this.height,
        { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: true });
      this.composer = new THREE.EffectComposer(this.renderer, rt);
      this.renderPass = new THREE.RenderPass();
      this.composer.addPass(this.renderPass);

      var fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      fxaa.uniforms['resolution'].value = new THREE.Vector2(1 / this.width, 1 / this.height);
      this.shaderPassFXAA = fxaa;
      this.composer.addPass(fxaa);

      this.depthTarget = new THREE.WebGLRenderTarget(this.width, this.height,
        { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });

      var effect = new THREE.ShaderPass(THREE.SSAOShader);
      effect.uniforms['tDepth'].value = this.depthTarget;
      effect.uniforms['size'].value.set(this.width, this.height);
      effect.uniforms['cameraNear'].value = (opt.camera !== undefined) ? opt.camera.near : 1;
      effect.uniforms['cameraFar'].value = (opt.camera !== undefined) ? opt.camera.far : 4000;
      effect.renderToScreen = true;
      this.shaderPassSSAO = effect;
      this.composer.addPass(effect);
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

  Renderer.prototype.__render = function (scene, camera, opts) {
    if (this.useAmbientOcclusion) {
      // Render to composer
      // Bad RenderPass API design requires setting scene and camera
      this.renderPass.scene = scene; this.renderPass.camera = camera;
      var oldOverrideMat = scene.overrideMaterial;
      scene.overrideMaterial = this.depthMaterial;
      this.renderer.render(scene, camera, this.depthTarget);
      scene.overrideMaterial = oldOverrideMat;
      this.composer.render();
    } else {
      if (this.domElement) {
        // Render to canvas
        this.renderer.render(scene, camera);
      } else {
        // Render to offscreen texture
        this.renderer.render(scene, camera, this.__rtTexture, true);
      }
    }

    if (this.isOffscreen) {
      var height = opts.height;
      var width = opts.width;
      var offsetX = opts.offsetX || 0;
      var offsetY = opts.offsetY || 0;
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

  Renderer.prototype.render = function (scene, camera, opts) {
    opts = opts || {};
    if (this.__tiles) {
      //console.log('render with tiles');
      var tileBuffer = this.__getTileBuffer();
      //var oldAutoClear = this.renderer.autoClear;
      //this.renderer.autoClear = false;
      var pixels = opts.pixelBuffer || this.__getPixelBuffer();
      for (var i = 0; i < this.__tiles.length; i++) {
        var tile = this.__tiles[i];
        //console.log('render with tile', tile.x, tile.y, tile.width, tile.height);
        camera.setViewOffset(this.width, this.height, tile.x, tile.y, this.__tileWidth, this.__tileHeight);
        var tilePixels = this.__render(scene, camera, _.defaults({pixelBuffer: tileBuffer, width: this.__tileWidth, height: this.__tileHeight}, opts));
        if (this.isOffscreen) {
          // copy from tilePixels into our pixels
          copyPixels(
            { buffer: tilePixels, x: 0, y: 0, width: tile.width, height: tile.height, fullWidth: this.__tileWidth, fullHeight: this.__tileHeight },
            { buffer: pixels, x: tile.x, y: tile.y, width: tile.width, height: tile.height, fullWidth: this.width, fullHeight: this.height },
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
      var pixels = this.__render(scene, camera, _.defaults({pixelBuffer: pixelBuffer, width: this.width, height: this.height}, opts));
      if (this.__needFlipY) {
        this.__flipY(pixels);
      }
      return pixels;
    }
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
    if (this.useAmbientOcclusion && this.composer) {
      this.composer.setSize(width, height);
      this.depthTarget.setSize(width, height);
      this.shaderPassFXAA.uniforms['resolution'].value = new THREE.Vector2(
        width > 0? 1 / width : 0, height > 0? 1 / height : 0);
      this.shaderPassSSAO.uniforms['size'].value.set(width, height);
    }
  };

  Renderer.prototype.getMaxAnisotropy = function() {
    return this.renderer.getMaxAnisotropy();
  };

  // Exports
  return Renderer;
});
