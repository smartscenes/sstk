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

  Renderer.prototype.render = function (scene, camera, opts) {
    opts = opts || {};
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
      if (this.domElement) {
        // We also want to return the pixels
        // Let's try to read it from the domElement
        var pixels = opts.pixelBuffer || this.__getPixelBuffer();
        this.renderer.context.readPixels(0, 0, this.width, this.height, this.renderer.context.RGBA, this.renderer.context.UNSIGNED_BYTE, pixels);
        return pixels;
      } else {
        var renderTarget = this.useAmbientOcclusion ? this.composer.writeBuffer : this.__rtTexture;
        var pixels = opts.pixelBuffer || this.__getPixelBuffer();
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0,
          this.width, this.height, pixels);
        return pixels;
      }
    }
  };

  Renderer.prototype.setSize = function (width, height) {
    this.width = width;
    this.height = height;
    if (this.renderer) {
      this.renderer.setSize(width, height);
    }
    if (this.__rtTexture) {
      this.__rtTexture.setSize(width, height);
    }
    // Update ambient occlusion sizes
    if (this.useAmbientOcclusion && this.composer) {
      this.composer.setSize(this.width, this.height);
      this.depthTarget.setSize(this.width, this.height);
      this.shaderPassFXAA.uniforms['resolution'].value = new THREE.Vector2(
        this.width > 0? 1 / this.width : 0, this.height > 0? 1 / this.height : 0);
      this.shaderPassSSAO.uniforms['size'].value.set(this.width, this.height);
    }
  };

  Renderer.prototype.getMaxAnisotropy = function() {
    return this.renderer.getMaxAnisotropy();
  };

  // Exports
  return Renderer;
});
