'use strict';

var Constants = require('Constants');
var ImageUtil = require('util/ImageUtil');
var Object3DUtil = require('geo/Object3DUtil');
var CubemapToEquirectangular = require('gfx/CubemapToEquirectangular');
var Materials = require('materials/Materials');
var _ = require('util/util');
require('three-shaders');
require('gfx/EDLPass');

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
  this.useOutlineShader = (opt.useOutlineShader !== undefined) ? opt.useOutlineShader : false;  // Good for highlighting
  this.useEDLShader = (opt.useEDLShader !== undefined) ? opt.useEDLShader : false;
  this.useAntialiasPass = (opt.useAntialiasPass !== undefined) ? opt.useAntialiasPass : false;
  this.pickOutlineColor = (opt.pickOutlineColor !== undefined) ? opt.pickOutlineColor : 0xffff00;
  this.activeSupportOutlineColor = (opt.activeSupportOutlineColor !== undefined) ? opt.activeSupportOutlineColor : 0x00ff00;
  this.archOutlineColor = (opt.archOutlineColor !== undefined) ? opt.archOutlineColor : 0xffa500;
  this.selectedOutlines = opt.selectedOutlines;
  this.outlineHighlightedOnly = opt.outlineHighlightedOnly;
  this.outlineColor = (opt.outlineColor !== undefined) ? opt.outlineColor : 0x000000;
  this.useEffect = opt.useEffect || null;
  this.ambientOcclusionOptions = _.merge({
    type: opt.ambientOcclusionType || 'ssao-old'
  }, opt.ambientOcclusionOptions);
  this.antialiasOptions = _.merge({
    type: opt.antialiasType || 'ssaa'
  }, opt.antialiasOptions);
  this.useShadows = (opt.useShadows !== undefined) ? opt.useShadows : false;
  this.usePhysicalLights = (opt.usePhysicalLights !== undefined) ? opt.usePhysicalLights : false; // Default to false
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
    canvas: opt.canvas,
    width: this.width,
    height: this.height,
    context: opt.context || null,
    antialias: (opt.antialias != null)? opt.antialias : true,
    alpha: true,
    logarithmicDepthBuffer: opt.logarithmicDepthBuffer
  });
  if (this.usePhysicalLights) {
    this.renderer.physicallyCorrectLights = true;
  }
  this.renderer.outputEncoding = THREE.sRGBEncoding;

  this.isEncodedMode = opt.isEncodedMode;
  if (this.isEncodedMode) {
    this.defaultMinFilter = THREE.NearestFilter;
    this.defaultMaxFilter = THREE.NearestFilter;
  } else {
    this.defaultMinFilter = THREE.LinearFilter;
    this.defaultMaxFilter = THREE.LinearFilter;
  }
  if (this.isOffscreen) {
    this.__rtTexture = new THREE.WebGLRenderTarget(this.width, this.height, {
      stencilBuffer: true,
      minFilter: this.defaultMinFilter,
      magFilter: this.defaultMaxFilter,
      format: THREE.RGBAFormat
    });
  }

  //this.renderer.setPixelRatio(window.devicePixelRatio || 1);
  this.renderer.setSize(this.width, this.height);

  if (this.useShadows) {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  if (this.useAmbientOcclusion || this.useOutlineShader || this.useEDLShader || this.useAntialiasPass) {
    if (this.isEncodedMode) {
      console.warn('Setting up renderer for special effects while in encoded mode');
    }
    //var pixelRatio = this.renderer.getPixelRatio();
    //var width  = Math.floor(this.width  / pixelRatio) || 1;
    //var height = Math.floor(this.height / pixelRatio) || 1;
    var rt = new THREE.WebGLRenderTarget(this.width, this.height,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: true });
    this.composer = new THREE.EffectComposer(this.renderer, rt);
    this.composer.renderToScreen = false;
    this.composer.renderTarget1.stencilBuffer = true;
    this.composer.renderTarget2.stencilBuffer = true;

    if (this.useAntialiasPass && this.antialiasOptions.type === 'ssaa') {
      this.renderPass = new THREE.SSAARenderPass();
      this.renderPass.unbiased = true;
    } else {
      this.renderPass = new THREE.RenderPass();
      this.renderPass.clearColor = new THREE.Color(0, 0, 0);
      this.renderPass.clearAlpha = 0;
    }
    this.composer.addPass(this.renderPass);

    var scene = {};
    var camera = new THREE.PerspectiveCamera( 65, this.width / this.height, 1, 4000 );

    if (this.useAmbientOcclusion) {
      var ssao = null;
      if (this.ambientOcclusionOptions.type === 'ssao') {
        ssao = new THREE.SSAOPass(scene, camera /*, this.width, this.height*/);
        console.log('set ssao.kernelRadius to', ssao.kernelRadius, ', ssao.minDistance to ', ssao.minDistance,
          ', ssao.maxDistance', ssao.maxDistance);
      } else if (this.ambientOcclusionOptions.type === 'ssao-old') {
        // Old SSAO
        ssao = new THREE.SSAOPassOld(scene, camera /*, this.width, this.height */);
        ssao.radius = this.ambientOcclusionOptions.radius || (0.1*Constants.virtualUnitToMeters);
        ssao.lumInfluence = (this.ambientOcclusionOptions.lumInfluence != undefined)? this.ambientOcclusionOptions.lumInfluence : 0.5;
        console.log('set ssao.radius to', ssao.radius, 'ssao.lumInfluence to', ssao.lumInfluence);
      } else if (this.ambientOcclusionOptions.type === 'sao') {
        ssao = new THREE.SAOPass(scene, camera, false, true);
        ssao.params.saoScale = this.ambientOcclusionOptions.scale || 20000;  // TODO(MS): set this parameter more intelligently
        // ssao.params.saoScaleFixed = 0.03;
        // ssao.params.saoScale = ssao.params.saoScaleFixed*camera.far;  // TODO(MS): set this parameter more intelligently
        console.log('set sao.params.soaScale to', ssao.params.saoScale, 'with camera far', camera.far);
      } else {
        console.warn('Unsupported ambientOcclusion configuration', this.ambientOcclusionOptions);
      }
      if (ssao) {
        this.composer.addPass(ssao);
      }
      this.ssaoPass = ssao;
    }

    if (this.useOutlineShader) {
      var outlinePassesOpts = [
        { name: 'visibleObjects', color: this.pickOutlineColor },
        { name: 'pick', color: this.pickOutlineColor },
        { name: 'arch', color: this.archOutlineColor },
        { name: 'activeSupport', color: this.activeSupportOutlineColor },
      ];
      // TODO: rework outline parameters
      if (this.outlineHighlightedOnly) {
        outlinePassesOpts = outlinePassesOpts.filter(x => x.name === 'pick' || x.name === 'activeSupport');
      } else if (this.selectedOutlines) {
        outlinePassesOpts = outlinePassesOpts.filter(x => this.selectedOutlines.indexOf(x.name) >= 0);
      } else {
        outlinePassesOpts = outlinePassesOpts.filter(x => x.name === 'visibleObjects');
      }
      this.outlinePasses = outlinePassesOpts.map(opt => {
        var outline = new THREE.OutlinePass(new THREE.Vector2(this.width, this.height), scene, camera);
        outline.name = opt.name;
        outline.edgeStrength = 100.0;
        outline.edgeThickness = 1.0;
        outline.visibleEdgeColor.set(opt.color);
        outline.hiddenEdgeColor.set(opt.color);
        // outline.clear = false;
        this.composer.addPass(outline);
        return outline;
      });
    }

    if (this.useEDLShader) {
      var edlPass = new THREE.EDLPass(scene, camera, this.width, this.height);
      this.edlPass = edlPass;
      this.composer.addPass(edlPass);
    }

    if (this.useAntialiasPass) {
      if (this.antialiasOptions.type === 'fxaa') {
        var fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        this.fxaaPass = fxaaPass;
        this.composer.addPass(fxaaPass);
        this.__updateSizeForAntiAliasingPasses(this.width, this.height);
      // } else if (this.useAntialiasPass && this.antialiasOptions.type === 'smaa') {
      //   // Not sure if this works....
      //   var pixelRatio = this.renderer.getPixelRatio();
      //   console.log('pixelRatio', pixelRatio);
      //   var smaaPass = new THREE.SMAAPass(this.width*pixelRatio, this.height*pixelRatio);
      //   this.smaaPass = smaaPass;
      //   this.composer.addPass(smaaPass);
      } else if (this.antialiasOptions.type != 'ssaa') {
        console.warn('Unsupported antialias configuration', this.antialiasOptions);
      }
    }
  }

  this.__effects = {};
  this.setEffect(this.useEffect);

  if (this.renderer.domElement && Constants.isBrowser) {
    if (this.composer) {
      this.composer.renderToScreen = true;
    }
    this.domElement = this.renderer.domElement;
    this.domElement.setAttribute('tabindex','1');
    if (this.container && !opt.canvas) { this.container.appendChild(this.domElement); }
    // Grabs focus when mouse is over this element
    this.domElement.addEventListener('pointerover', function () { this.domElement.focus(); }.bind(this),false);
    this.domElement.addEventListener('pointerout', function () { this.domElement.blur(); }.bind(this),false);
  }
};

Renderer.prototype.getEffect = function(name) {
  var effect = this.__effects[name];
  if (effect === undefined) {
    effect = null;
    if (name === 'outline') {
      //console.log('use outline');
      effect = new THREE.OutlineEffect(this.renderer, {defaultColor: this.outlineColor});
    } else if (this.useEffect != null) {
      console.warn('Ignoring unsupported effect', this.useEffect);
      this.__effects[name] = effect;
    } else {
      //console.log('no effect');
    }
  }
  return effect;
};

Renderer.prototype.setEffect = function(name) {
  this.useEffect = name;
  this.effect = this.getEffect(name);
};

Renderer.prototype.setMaxViewportDims = function(w,h) {
  this.__maxViewportDims = [w,h];
  this.setSize(this.width, this.height);
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

function copyPixels(source, target, flipY, bytesPerPixel) {
  bytesPerPixel = bytesPerPixel || 4;
  // TODO: make more efficient
  //console.log('copyPixels', _.omit(source, ['buffer']), _.omit(target, ['buffer']), flipY);
  var sourceNumElementPerRow = bytesPerPixel * source.fullWidth;
  var targetNumElementPerRow = bytesPerPixel * target.fullWidth;
  var sourceColOffset = bytesPerPixel * source.x;
  var targetColOffset = bytesPerPixel * target.x;
  var bytesToCopyPerRow = bytesPerPixel * source.width;
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
  sao.saoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy(camera.projectionMatrix).invert();
  sao.saoMaterial.uniforms[ 'cameraProjectionMatrix' ].value = camera.projectionMatrix;
  sao.saoMaterial.defines[ 'PERSPECTIVE_CAMERA' ] = (camera.isPerspectiveCamera || camera.inPerspectiveMode) ? 1 : 0;
}

function updateSSAO(ssao, scene, camera) {
  ssao.scene = scene;
  ssao.camera = camera;
  //sao.params.saoScale = sao.params.saoScaleFixed*camera.far;  // TODO(MS): set this parameter more intelligently
  //console.log('set sao.params.soaScale to ', sao.params.saoScale, camera.far );
  ssao.ssaoMaterial.uniforms[ 'cameraNear' ].value = camera.near;
  ssao.ssaoMaterial.uniforms[ 'cameraFar' ].value = camera.far;
  ssao.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy(camera.projectionMatrix).invert();
  ssao.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value = camera.projectionMatrix;
  ssao.ssaoMaterial.defines[ 'PERSPECTIVE_CAMERA' ] = (camera.isPerspectiveCamera || camera.inPerspectiveMode) ? 1 : 0;
  //ssao.ssaoMaterial.uniforms[ 'minDistance' ].value = this.minDistance;
  //ssao.ssaoMaterial.uniforms[ 'maxDistance' ].value = this.maxDistance;
}

function updateAmbientOcclusion(ssaoPass, scene, camera) {
  if (ssaoPass instanceof THREE.SSAOPass) {
    updateSSAO(ssaoPass, scene, camera);
  } else if (ssaoPass instanceof THREE.SAOPass) {
    updateSAO(ssaoPass, scene, camera);
  } else if (ssaoPass instanceof THREE.SSAOPassOld) {
    ssaoPass.setScene(scene);
    ssaoPass.setCamera(camera);
  }
}

Renderer.prototype.setupDatGui = function(gui) {
  if (this.ssaoPass) {
    if (this.ssaoPass instanceof THREE.SSAOPass) {
      var ssaoPass = this.ssaoPass;
      gui.add(ssaoPass, 'output', {
        'Default': THREE.SSAOPass.OUTPUT.Default,
        'SSAO Only': THREE.SSAOPass.OUTPUT.SSAO,
        'SSAO Only + Blur': THREE.SSAOPass.OUTPUT.Blur,
        'Beauty': THREE.SSAOPass.OUTPUT.Beauty,
        'Depth': THREE.SSAOPass.OUTPUT.Depth,
        'Normal': THREE.SSAOPass.OUTPUT.Normal
      }).name('ssao output').onChange( function ( value ) {
        ssaoPass.output = parseInt( value );
      });
      gui.add(ssaoPass, 'kernelRadius').min(0).max(64);
      gui.add(ssaoPass, 'minDistance').min(0.0001).max(0.02);
      gui.add(ssaoPass, 'maxDistance').min(0.01).max(3);
    } else if (this.ssaoPass instanceof THREE.SAOPass) {
      var saoPass = this.ssaoPass;
      gui.add(saoPass.params, 'output', {
        'Beauty': THREE.SAOPass.OUTPUT.Beauty,
        'Beauty+SAO': THREE.SAOPass.OUTPUT.Default,
        'SAO': THREE.SAOPass.OUTPUT.SAO,
        'Depth': THREE.SAOPass.OUTPUT.Depth,
        'Normal': THREE.SAOPass.OUTPUT.Normal
      }).name('sao output').onChange( function ( value ) {
        saoPass.params.output = parseInt( value );
      });
      gui.add(saoPass.params, 'saoBias', -1, 1);
      gui.add(saoPass.params, 'saoIntensity', 0, 1);
      gui.add(saoPass.params, 'saoScale', 0, 10);
      gui.add(saoPass.params, 'saoKernelRadius', 1, 100);
      gui.add(saoPass.params, 'saoMinResolution', 0, 1);
      gui.add(saoPass.params, 'saoBlur');
      gui.add(saoPass.params, 'saoBlurRadius', 0, 200);
      gui.add(saoPass.params, 'saoBlurStdDev', 0.5, 150);
      gui.add(saoPass.params, 'saoBlurDepthCutoff', 0.0, 0.1);
    } else if (this.ssaoPass instanceof THREE.SSAOPassOld) {
      var ssaoPass = this.ssaoPass;
      gui.add(ssaoPass, 'onlyAO');
      gui.add(ssaoPass, 'radius').min(0).max(32);
      gui.add(ssaoPass, 'lumInfluence').min(0.01).max(1);
      gui.add(ssaoPass, 'aoClamp').min(0.01).max(1);
    }
  }
  if (this.edlPass) {
    gui.add(this.edlPass, 'onlyAO');
    gui.add(this.edlPass, 'radius', 0, 5).step(0.05);
    gui.add(this.edlPass, 'strength', 0, 5).step(0.05);
  }
  if (this.fxaaPass) {
    gui.add(this.fxaaPass, 'enabled').name('antialiasPass');
  }
};


Renderer.prototype.__getCubemapToEquirectangularConverter = function() {
  if (!this.__cubemapToEquirectangular) {
    this.__cubemapToEquirectangular = new CubemapToEquirectangular(this.renderer, this.width, this.height, {
      minFilter: this.defaultMinFilter,
      maxFilter: this.defaultMaxFilter
    });
  } else {
    if (this.width !== this.__cubemapToEquirectangular.width || this.height !== this.__cubemapToEquirectangular.height) {
      this.__cubemapToEquirectangular.setSize(this.width, this.height);
    }
  }
  return this.__cubemapToEquirectangular;
};

Renderer.prototype.__renderToTarget = function(scene, camera, renderTarget, forceClear) {
  if (renderTarget) {
    this.renderer.setRenderTarget(renderTarget);
  } else {
    this.renderer.setRenderTarget(null);
  }
  if (forceClear) {
    this.renderer.clear();
  }
  if (this.effect) {
    this.effect.render(scene, camera);
  } else {
    this.renderer.render(scene, camera);
  }
};

Renderer.prototype.__render = function(scene, camera, fullWidth, fullHeight, renderTarget, forceClear) {
  if (camera.isArrayCamera) {
    // TODO: CHECK setViewport takes lower left corner of rectangular region
    var oldAutoClear = this.renderer.autoClear;
    for (var i = 0; i < camera.cameras.length; i++) {
      var cam = camera.cameras[i];
      var bounds = cam.bounds;

      var x = bounds.x * fullWidth;
      var y = bounds.y * fullHeight;
      var width = bounds.z * fullWidth;
      var height = bounds.w * fullHeight;

      this.renderer.autoClear = (i === 0) ? oldAutoClear : false;
      this.renderer.setViewport(x, y, width, height);
      this.__renderToTarget(scene, cam, renderTarget, forceClear);
    }
    this.renderer.autoClear = oldAutoClear;
    this.renderer.setViewport(0, 0, fullWidth, fullHeight);
  } else if (camera.isEquirectangular) {
    var converter = this.__getCubemapToEquirectangularConverter();
    // TODO: Figure out why we need to do this twice (otherwise, goal frame in simulator same as initial frame)
    converter.render(scene, camera, renderTarget);
    converter.render(scene, camera, renderTarget);
  } else {
    this.__renderToTarget(scene, camera, renderTarget, forceClear);
  }
};

Renderer.prototype.__updateSizeForAntiAliasingPasses = function(width, height) {
  var pixelRatio = this.renderer.getPixelRatio();
  if (this.fxaaPass) {
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    //console.log('set fxaaPass uniforms', this.fxaaPass.material.uniforms['resolution'].value);
  // } else if (this.smaaPass) {
  //   this.smaaPass.setSize(width*pixelRatio, height*pixelRatio);
  }
};

Renderer.prototype.__renderScene = function (scene, camera, opts) {
  opts = opts || {};
  var height = opts.height;
  var width = opts.width;
  var offsetX = opts.offsetX || 0;
  var offsetY = opts.offsetY || 0;
  var useComposer = false;
  if ((this.useAmbientOcclusion && this.ssaoPass && this.ssaoPass.enabled) ||
      (this.useOutlineShader && this.outlinePasses.length) ||
      (this.useEDLShader && this.edlPass.enabled) ||
      (this.useAntialiasPass  && ((!this.fxaaPass) ||
        (this.fxaaPass && this.fxaaPass.enabled)))) {
      // (this.useAntialiasPass  && ((!this.fxaaPass && !this.smaaPass) ||
      //   (this.fxaaPass && this.fxaaPass.enabled) || (this.smaaPass && this.smaaPass.enabled)))) {
    // Render to composer
    // Bad RenderPass API design requires setting scene and camera
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    if (this.useAmbientOcclusion) {
      updateAmbientOcclusion(this.ssaoPass, scene, camera);
    }
    if (this.useOutlineShader) {
      for (var i = 0; i < this.outlinePasses.length; i++) {
        var outlinePass = this.outlinePasses[i];
        if (outlinePass.enabled) {
          outlinePass.renderScene = scene;
          outlinePass.renderCamera = camera;
          // Set meshes to be outlined
          if (outlinePass.name === 'pick') {
            // Get the set of objects that should be selected or highlighted (check for isHighlighted option on object)
            var highlightedObjects = Object3DUtil.findTopMostNodes(scene, function (n) {
              return n.isHighlighted;
            }, true);
            outlinePass.selectedObjects = highlightedObjects;
          } else if (outlinePass.name === 'activeSupport') {
            var highlightedObjects = Object3DUtil.findTopMostNodes(scene, function (n) {
              return n.isActiveSupport;
            }, true);
            // make sure nested model instances are not selected
            var selected = [];
            _.forEach(highlightedObjects, object => {
              Object3DUtil.getVisibleMeshList(object, false, selected);
            });
            outlinePass.selectedObjects = selected;
          } else if (outlinePass.name === 'arch') {
            var meshes = Object3DUtil.getVisibleMeshList(scene, true, null,
              function (m) {
//                return m.name.startsWith('Wall');
                return m.userData.isArch || m.name.startsWith('Wall') || m.name.startsWith('Floor') || m.name.startsWith('Ceiling');
              });
            outlinePass.selectedObjects = meshes;
          } else if (outlinePass.name === 'visibleObjects') {
            var meshes = Object3DUtil.getVisibleMeshList(scene, true);
            meshes = meshes.filter(function (m) {
              return !m.userData.isArch && !m.name.startsWith('Wall') && !m.name.startsWith('Floor') && !m.name.startsWith('Ceiling');
            });
            outlinePass.selectedObjects = meshes;
          }
        }
      }
      // console.log(this.outlinePass.selectedObjects);
    }
    if (this.useEDLShader) {
      this.edlPass.setScene(scene);
      this.edlPass.setCamera(camera);
    }
    this.composer.render();
    useComposer = true;
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
      var context = this.renderer.getContext();
      context.readPixels(offsetX, offsetY, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      return pixels;
    } else {
      var renderTarget = useComposer ? this.composer.readBuffer : this.__rtTexture;
      var pixels = opts.pixelBuffer;
      this.renderer.readRenderTargetPixels(renderTarget, offsetX, offsetY, width, height, pixels);
      return pixels;
    }
  }
};

Renderer.prototype.getPmremGenerator = function() {
  if (!this.__pmremGenerator) {
    this.__pmremGenerator = new THREE.PMREMGenerator(this.renderer);
  }
  return this.__pmremGenerator;
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
    return pixels;
  }
};

Renderer.prototype.render = function (scene, camera, opts) {
  opts = opts || {};
  var pixels = this.__renderTiles(scene, camera, opts);
  if (opts.postprocess) {
    pixels = this.postprocessPixels(pixels, opts.postprocess, camera);
  }
  return pixels;
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
  this.__updateSizeForAntiAliasingPasses(width, height);
};

Renderer.prototype.getMaxAnisotropy = function() {
  return this.renderer.capabilities.getMaxAnisotropy();
};

Renderer.prototype.postprocessPixels = function(pixels, options, camera) {
  if (_.isString(options)) {
    options = { operation: options };
  }
  if (options.operation === 'unpackRGBAdepth') {
    pixels = ImageUtil.unpackRGBAdepth(pixels, camera, options.dataType, options.metersToUnit);
  } else if (options.operation === 'convert' && options.dataType == 'uint16') {
    var newPixels = new Uint16Array(pixels.length / 2);
    ImageUtil.encodePixelsDirect16(pixels, new Uint8Array(newPixels.buffer));
    pixels = newPixels;
  } else if (options.operation === 'convert' && options.dataType == 'uint8') {
    pixels = ImageUtil.encodePixelsDirect8(pixels);
  }
  return pixels;
};

module.exports = Renderer;
