const Camera = require('gfx/Camera');
const InteractionViewer = require('interaction-viewer/InteractionViewer');
const Object3DUtil = require('geo/Object3DUtil');
const Renderer = require('gfx/Renderer');
const async = require('async');
const _ = require('util/util');

class DataParser {
  static parseJointAngles(data) {
    return data.split('\n').map(line => line.trim()).filter(line => line.length).map(line => parseInt(line));
  }

  static parse3DInfoData(data, modelSource) {
    const converted = {};
    data.split('\n').forEach(line => {
      line = line.trim();
      const parts = line.split(':',2).map(p => p.trim());
      if (parts.length === 2) {
        const k = parts[0];
        let v = parts[1];
        if (k === 'obj_size') {
          v = v.split(',').map(x => parseFloat(x));
        } else if (k !== 'cad') {
          if (v.indexOf('.') >= 0) {
            v = parseFloat(v);
          } else {
            v = parseInt(v);
          }
        }
        converted[k] = v;
      }
    });
    const res = {
      modelId: converted['cad'],
      fullId: modelSource + '.' + converted['cad'],
      movingPartId: converted['part_id'],
      focal: [converted['focal_x'], converted['focal_y']],
      rotationABG: {
        alpha: converted['rot_alpha'],
        beta: converted['rot_beta'],
        gamma: converted['rot_gamma'],
      },
      rotationPYR: {
        pitch: converted['pitch'],
        yaw: converted['yaw'],
        roll: converted['roll'],
      },
      objSize: converted['obj_size'],
      objOffset: [converted['x_offset'], converted['y_offset'], converted['z_offset']]
    }
    return res;
  }
}

class FixedViewCanvasWithImageOverlay {
  constructor(params) {
    this.container = params.container;
    this.camera = new Camera();
    this.renderer = new Renderer({
      container: this.container,
      canvas: params.canvas,
      camera: this.camera,
      useAmbientOcclusion: params.useAmbientOcclusion,
      useEDLShader: params.useEDLShader,
      useShadows: params.useShadows,
      usePhysicalLights: params.usePhysicalLights
    });
    this.scene = null;
    this.recordingMetadata = null;
  }

  init() {
    this.__initImageContainer();
  }

  __initImageContainer() {
    this.imageContainer = $('<img class="hoi-image"/>');
    this.imageContainer.css('max-width', this.container.clientWidth);
    this.imageContainer.css('max-height', this.container.clientHeight);
    $(this.container).append(this.imageContainer);
    this.imageContainer.on('load', () => {
      const imageSize = {
        width: this.imageContainer.get(0).naturalWidth,
        height: this.imageContainer.get(0).naturalHeight,
      }
      const ratio = imageSize.width / imageSize.height;
      console.log('got image size', imageSize.width, imageSize.height, ratio);
      this.imageSize = imageSize;
      this.updateCameraFov();
      if (this.fixedWidthToHeightAspectRatio != ratio) {
        this.fixedWidthToHeightAspectRatio = ratio;
        this.onWindowResize();
      }
    });
  }

  setImagePath(path) {
    this.imageContainer.attr('src', path);
  }

  render() {
    if (this.scene && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  updateCameraFov() {
    if (this.imageSize && this.recordingMetadata) {
      const vertFov = 2 * Math.atan(this.imageSize.height / (2 * this.recordingMetadata.focal[1])) * (180 / Math.PI);
      this.camera.fov = vertFov;
      console.log('set camera fov to ' + vertFov, this.imageSize.height, this.recordingMetadata);
    }
  }

  setCameraState(state) {
    this.camera.setView(state);
  }

  updateMetadata(metadata) {
    this.recordingMetadata = metadata;
    this.updateCameraFov();
  }

  onWindowResize() {
    if (this.renderer && this.camera) {

      let width = this.container.clientWidth;
      let height = this.container.clientHeight;
      this.camera.aspect = this.fixedWidthToHeightAspectRatio;
      const height2 = width / this.fixedWidthToHeightAspectRatio;
      if (height2 > height) {
        width = height * this.fixedWidthToHeightAspectRatio;
      } else {
        height = height2;
      }
      console.log('got width x height', width, height);
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);

      this.render();
    }
  }

}

class SmplHoiViewer extends InteractionViewer {
  constructor(params) {
    const defaults = {
      autoAlignModels: true,
      autoScaleModels: true
    };
    super(_.defaults(Object.create(null), params, defaults));
    this.urlParams = _.getUrlParams();
    this.timeSlider = $(this.__options.timeSlider);
    this.videoContainer = $(this.__options.videoContainer);
    this.recordingId = this.urlParams.fullId;
    this.fixedViewCanvas = new FixedViewCanvasWithImageOverlay(this.__options.fixedViewCanvas);
  }

  init() {
    this.fixedViewCanvas.init();
    super.init();
  }

  showRecording(recordingId, startFrame, endFrame) {
    this.recording = null;
    const assetInfo = this.assetManager.getAssetInfo(recordingId);
    if (assetInfo) {
      this.videoContainer.append($('<video controls width="128px"></video>').append($(`<source src="${assetInfo.colorVideo}" type="video/mp4"/>`)));
      this.__loadRecording(assetInfo);
    } else {
      console.log('Unknown recordingId: ' + recordingId);
    }
  };

  __loadRecording(recordingInfo) {
    const scope = this;
    this.recordingInfo = recordingInfo;
    scope.timeSlider.slider('option', 'max', recordingInfo.numframes);
    async.waterfall([
        (cb) => {
          scope.assetManager.assetLoader.loadErrorFirst(recordingInfo['3dinfo'], 'utf-8', (err, res) => {
            if (res) {
              res = DataParser.parse3DInfoData(res, 'hoi-objects');
              //res = DataParser.parse3DInfoData(res, 'partnetsim');
            }
            cb(err, res);
          });
        },
        (info, cb) => {
          scope.assetManager.assetLoader.loadErrorFirst(recordingInfo['jointstate'], 'utf-8', (err, res) => {
            if (res) {
              info.jointAngles = DataParser.parseJointAngles(res);
            }
            cb(err, info);
          });
        },
        (info, cb) => {
          scope.assetManager.loadModel({ fullId: info.fullId }, (err, modelInstance) => {
            const res = {
              metadata: info,
              modelInstance: modelInstance
            }
            cb(err, res);
          });
        }
      ],
      (err, res) => {
        if (res && res.modelInstance) {
          scope.__onModelDataLoaded(res.metadata, res.modelInstance);
          console.log('got', res);
        } else {
          if (err) {
            console.error('Error loading model', err);
          } else {
            console.error('Error loading model');
          }
        }
      });

    this.__showInteractionAtIndex(1);
    console.log('loadrecording', recordingInfo);
  }

  __onModelDataLoaded(metadata, modelInstance) {
    const positionCamera = false;
    const articulateObject = true;


    const modelFrameInfo = modelInstance.model.getFrameInfo();
    console.log('model frame info', modelFrameInfo);
    //scope.setupBasicScene(modelFrameInfo);
    this.setupBasicScene({});

    this.sceneState.addObject(modelInstance);
    console.log('object size', Object3DUtil.getBoundingBox(modelInstance.object3D).getSize());

    // Position object
    // Scale object
    const objectSize = new THREE.Vector3(...metadata.objSize);
    const initialObjectBB = Object3DUtil.computeBoundingBoxLocal(modelInstance.object3D);
    const scale = objectSize.clone();
    scale.divide(initialObjectBB.dimensions());
    scale.multiplyScalar(0.01/**modelFrameInfo.unit*/);
    modelInstance.object3D.scale.copy(scale);

    // position object/camera
    const camPosition = new THREE.Vector3(0,0,0);
    const camDirection = new THREE.Vector3(0,0,1);
    if (positionCamera) {
      // position camera based on object info
      const offset = metadata.objOffset;
      camPosition.set(offset[0], offset[1], -offset[2]);
    } else {
      // position object
      const r = metadata.rotationPYR;
      const euler = new THREE.Euler(-r.pitch, -r.yaw, r.roll, 'XYZ');
      modelInstance.object3D.quaternion.setFromEuler(euler);
      const offset = metadata.objOffset;
      modelInstance.object3D.position.set(-offset[0], -offset[1], offset[2]);
    }
    // update object3D matrix
    modelInstance.object3D.updateMatrix();
    Object3DUtil.clearCache(modelInstance.object3D);
    const finalObjectBB = Object3DUtil.getBoundingBox(modelInstance.object3D);
    console.log('bbs', initialObjectBB.dimensions(), finalObjectBB.dimensions(), scale,
      modelInstance.object3D.scale, this.sceneState.fullScene.scale);

    // Setup fixed view canvas
    this.recordingMetadata = metadata;
    this.fixedViewCanvas.updateMetadata(metadata);
    this.fixedViewCanvas.scene = this.getRenderScene();

    // update camera state for fixed view
    this.fixedViewCanvas.setCameraState({
      position: camPosition,
      direction: camDirection
    })

    // Have main view look at object
    this.cameraControls.viewTarget({
      targetBBox: Object3DUtil.getBoundingBox(modelInstance.object3D),
      theta: Math.PI / 6,
      phi: -Math.PI / 4,
      distanceScale: 2.0
    });

    if (articulateObject) {
      const capabilities = modelInstance.queryCapabilities(this.assetManager);
      if (capabilities.articulation) {
        const cap = capabilities.articulation;
        cap.selectPart(metadata.movingPartId);
        this.articulationCapability = cap;
        //cap.play();
      } else {
        console.log('Model is not articulated');
      }
    }
  }

  // not sure why this is called init search (maybe search our assets for this recordingId)
  // but load recording and show this interactions
  __initSearch(options, assetGroups) {
    InteractionViewer.prototype.__initSearch.call(this, options, assetGroups);
    this.showRecording(this.recordingId, this.urlParams['startFrame'], this.urlParams['endFrame']);
  };

  __getImageFramePath(recordingInfo, index) {
    const imageNum = index.toString(10).padStart(4, '0');
    return recordingInfo.videoFramesPath + '/images-' + imageNum + '.jpg';
  }

  __showInteractionAtIndex(index) {
    console.log('interaction at index', index);
    this.fixedViewCanvas.setImagePath(this.__getImageFramePath(this.recordingInfo, index));
    if (this.articulationCapability) {
      const jointAngle = this.recordingMetadata.jointAngles[index];
      console.log('jointAngle', jointAngle);
      if (jointAngle != null) {
        this.articulationCapability.value = jointAngle * Math.PI / 180;
      }
    }
  }

  setTime(time) {
    if (this.recordingInfo) {
      this.__showInteractionAtIndex(time);
    }
  }

  setupUI() {
    super.setupUI();
    const scope = this;
    this.timeSlider.slider({
      min: 1,
      slide: function( event, ui ) {
        scope.setTime(ui.value);
      }
    });
  }

  onWindowResize(options) {
    super.onWindowResize(options);
    this.fixedViewCanvas.onWindowResize();
  }

  render() {
    super.render();
    this.fixedViewCanvas.render();
  }
}

module.exports = SmplHoiViewer;