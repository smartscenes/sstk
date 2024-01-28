const ArticulationsRenderHelper = require('articulations/ArticulationsRenderHelper');
const Object3DUtil = require('geo/Object3DUtil');
const SceneUtil = require('scene/SceneUtil');
const async = require('async');
const _ = require('util/util');
const path = require('path');  // this is only available in the ssc (should this be here in the lib)?

// Generates images for articulations for training models based on input options
class ArticulationsRenderDataGenerator extends ArticulationsRenderHelper {
  constructor(params) {
    super(params);
    this.__defaultWidth = this.renderer.width;
    this.__defaultHeight = this.renderer.height;
  }

  setArticulationMotionStateValues(mInst, motionStateValues) {
    const articulatedObjects = mInst.getArticulatedObjects();
    if (articulatedObjects.length) {
      for (let i = 0; i < articulatedObjects.length; i++) {
        articulatedObjects[i].setArticulationMotionStateValues(motionStateValues);
      }
    }
  }

  renderArticulatedModelInstance(scene, mInst, options, callback) {
    const articulatedObjects = mInst.getArticulatedObjects();
    if (articulatedObjects.length) {
      async.eachSeries(articulatedObjects, (artObj, cb) => {
        const opts = (articulatedObjects.length === 1) ? options :
          _.defaults({ basename: options.basename + '/1' }, options);
        if (opts.randomizeViews) {
          this.renderArticulatedObjectWithRandomViewpoints(scene, artObj, opts, cb);
        }
        else if (opts.uniformViews){
          this.renderArticulatedObjectWithUniformViewpoints(scene, artObj, opts, cb)
        } else {
          this.renderArticulatedObject(scene, artObj, opts, cb);
        }
      }, callback);
    } else {
      console.log(`No articulated objects for ${mInst.model.getFullID()}`);
      callback();
    }
  }

  // Function used by MotionNet
  renderArticulatedObjectWithRandomViewpoints(scene, articulatedObject, options) {
    const articulationStates = articulatedObject.articulationStates;

    options.viewpoints = this.generateRandomViews(options.num_viewpoints);

    // num_motion_states different degrees of openness
    for (let part_index of options.part_indexes) {
      this.renderOpen(scene, articulatedObject, articulationStates, options, part_index);
    }

    // all parts close
    this.renderClose(scene, articulatedObject, articulationStates, options);
  }

  renderArticulatedObjectWithUniformViewpoints(scene, articulatedObject, options) {
    const articulationStates = articulatedObject.articulationStates;

    options.viewpoints = this.getUniformViewpoints(options.num_viewpoints);

    // num_motion_states different degrees of openness
    for (let part_index of options.part_indexes) {
      this.renderOpen(scene, articulatedObject, articulationStates, options, part_index);
    }

    // all parts close
    this.renderClose(scene, articulatedObject, articulationStates, options);
  }

  generateRandomViews(n) {
    const viewpoints = [];
    for (let i = 0; i < n; ++i) {
      viewpoints[i] = this.getRandomViewpoint();
    }
    return viewpoints;
  }

  getUniformViewpoints(n) {
    const viewpoints = [];
  
    viewpoints.push({ theta: Math.PI / 2, phi: 0, distanceScale: this.randomBates(2) + 1.8 });
    viewpoints.push({ theta: -Math.PI / 2, phi: 0, distanceScale: this.randomBates(2) + 1.8 });
    
    if (n > 2){
      let phi_increment = 2 * Math.PI / (n - 2);
      let theta_min = -Math.PI / 4;
      let theta_max = Math.PI / 4;

      let phi = 0; 

      for (let i = 2; i < n; i++) {
        let theta = 0;
        if (i % 2 == 0){
          theta = theta_min;
        } else{
          theta = theta_max;
        }
        let distanceScale = this.randomBates(2) + 1.8;
        viewpoints.push({ theta: theta, phi: phi, distanceScale: distanceScale });
        phi += phi_increment;
      }
      console.log(viewpoints)
      
    }
    return viewpoints;
  }

  // TODO: parameterize and make into a generator in ViewGenerator
  // Randomly set distanceScale, theta and phi
  getRandomViewpoint() {
    let viewpoint_cat = Math.random();
    let theta, phi, distanceScale;
    // phi is about 0 (-60 - 60), theta is about 50, distance scale is about 1.8 (1.3 - 2.3)
    if (viewpoint_cat <= 0.6) {
      phi = this.randomBates(2) * 120 - 60;
      theta = this.randomBates(2) * 40 + 30;
      distanceScale = this.randomBates(2) + 1.8;
    }
    // theta is about 0
    else if (viewpoint_cat > 0.6 && viewpoint_cat <= 0.8) {
      phi = this.randomBates(2) * 120 - 60;
      theta = this.randomBates(3) * 70 - 35;
      distanceScale = this.randomBates(2) + 1.8;
    }
    // Distance Scale 1.3 ~ 3.3
    else if (viewpoint_cat > 0.8) {
      phi = this.randomBates(3) * 180 - 90;
      theta = this.randomBates(3) * 70 - 35;
      distanceScale = this.randomBates(3) * 1.5 + 1.6;
    }

    return { theta: theta / 180 * Math.PI, phi: phi / 180 * Math.PI, distanceScale: distanceScale };
  }

  // Return a random number between 0-1 exclusive as the average of n iid uniforms from 0 to 1
  // As n goes to infinity, this distribution approaches a Gaussian (see https://en.wikipedia.org/wiki/Bates_distribution)
  randomBates(n) {
    let r = 0;
    for (let i = n; i > 0; i--) {
      r += Math.random();
    }
    return r / n;
  }

  // Set different degrees of openness for the part, then render the images and masks
  renderOpen(scene, articulatedObject, articulationStates, options, part_index) {
    const articulationStatesByPart = _.groupBy(articulationStates, 'pid');
    // Set all parts to rangeMin
    this.resetClose(articulationStates);

    for (let i = 1; i <= options.num_motion_states; ++i) {
      const articulationState = articulationStatesByPart[part_index][0];
      // One articulationState is fully open, randomly pick other states
      if (i === 1) {
        articulationState.setToMax();
      }
      else {
        articulationState.setToMin();
        const rangeAmount = _.isFinite(articulationState.rangeAmount) ? articulationState.rangeAmount : articulationState.defaultRangeAmount;
        const delta = rangeAmount * this.randomBates(2);
        articulationState.apply(delta);
      }

      // Set the base name
      const opts = _.defaults({ basename: options.basename + '-' + part_index + '-' + i }, options);
      this.__renderModalities(scene, articulatedObject, articulationStates, articulationStatesByPart, opts);
    }
  }

  // Set the model as close state, then render the images and masks
  renderClose(scene, articulatedObject, articulationStates, options) {
    const articulationStatesByPart = _.groupBy(articulationStates, 'pid');
    // Set all parts to rangeMin
    this.resetClose(articulationStates);

    // Set the base name
    let opts = _.defaults({ basename: options.basename + '-0' }, options);
    this.__renderModalities(scene, articulatedObject, articulationStates, articulationStatesByPart, opts);
  }

  __renderModalities(scene, articulatedObject, articulationStates, articulationStatesByPart, options) {
    // Render the object with original materials in this state
    this.renderOriginalColor(scene, articulatedObject, articulationStates, options, options.upsampleOriginal);
    // Render the depth image in this state
    this.renderDepth(scene, articulatedObject, options);
    // Render the triangle information
    this.renderTriInfo(scene, articulatedObject, options);
    // Render masks for different parts
    for (let pid of options.part_indexes) {
      this.renderPartMask(scene, articulatedObject, articulationStatesByPart[pid], options, pid);
    }
    this.renderAllPartMasks(scene, articulatedObject, options);
    // if (options.includeAllPartMasksSeparately) {
    //   // virtual base link not calculated in this part -> actually +1 is the label in articulated pose
    //   for (let pid = 0; pid < articulatedObject.parts.length; ++pid) {
    //     this.renderPartMask(scene, articulatedObject, null, options, pid, 256);
    //   }
    // }
  }

  // Reset all to rangeMin
  resetClose(articulationStates) {
    for (let articulationState of articulationStates) {
      articulationState.setToState('closed', 'min');
    }
  }


  __getOptions(baseOptions, subdir, metadataDir) {
    const opts = _.clone(baseOptions);
    opts.pathname = path.dirname(opts.basename) + '/' + subdir;
    if (metadataDir) {
      opts.metadataPathname = path.dirname(opts.basename) + '/' + metadataDir;
    }
    return opts;
  }

  __updateImageSize(options, scaleFactor) {
    if (!options.width) {
      options.width = this.__defaultWidth;
    }
    if (!options.height) {
      options.height = this.__defaultHeight;
    }
    if (scaleFactor) {
      options.width = Math.round(options.width * scaleFactor);
      options.height = Math.round(options.height * scaleFactor);
    }
  }

  // Render the origin image
  renderOriginalColor(scene, articulatedObject, articulationStates, options, imageScaleFactor) {
    // Reset the material
    this.resetObject3DColor(articulatedObject);
    const opts = this.__getOptions(options,  'original', 'annotations');
    this.__updateImageSize(opts, imageScaleFactor);
    const articulationStatesByPart = _.groupBy(articulationStates, 'pid');
    this.renderSceneFromViewpoints(scene, opts, '', articulationStatesByPart);
  }

  // Function used by MotionNet
  // Render the depth image
  renderDepth(scene, articulatedObject, options, imageScaleFactor) {
    if (!this.depthMaterial) {
      // Materials used for depth image
      this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    }

    // Reset the material
    this.resetObject3DColor(articulatedObject);
    // Assign the depth materials
    this.setMaterial(articulatedObject, this.depthMaterial);

    const opts = this.__getOptions(options, 'depth');
    this.__updateImageSize(opts, imageScaleFactor);
    opts.postprocess = { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 };
    this.renderSceneFromViewpoints(scene, opts, '_d');
  }

  // Render the corresponding masks for the origin image
  renderAllPartMasks(scene, articulatedObject, options, imageScaleFactor) {
    // encoding with all part masks
    // Reset the material
    this.resetObject3DColor(articulatedObject);
    // Assign the partIndex
    this.setMaterial(articulatedObject, this.staticPartMaterial, this.staticPartOpacity);
    for (let pid = 0; pid < articulatedObject.parts.length; ++pid) {
      const partMaterial = new THREE.MeshBasicMaterial({ color: pid + 1 });
      this.colorObject3D(articulatedObject.parts[pid].object3D, 'part', partMaterial);
    }

    let opts = this.__getOptions(options, 'partindex');
    this.__updateImageSize(opts, imageScaleFactor);
    if (articulatedObject.parts.length < 256) {
      opts.postprocess = {operation: 'convert', dataType: 'uint8'};
    } else {
      opts.postprocess = {operation: 'convert', dataType: 'uint16'};
    }
    this.renderSceneFromViewpoints(scene, opts, '_part');
  }

  renderPartMask(scene, articulatedObject, articulationStates, options, pid, imageScaleFactor) {
    // Apply color schema for the mask
    if (articulationStates) {
      // Color articulated part with standard colors for moving parts and static part
      this.applyPartColorings(articulatedObject, articulationStates[0], true);
    } else {
      // Only color specified part (attached parts will not be colored)
      this.resetObject3DColor(articulatedObject);
      this.setMaterial(articulatedObject, this.staticPartMaterial, this.staticPartOpacity);
      this.colorObject3D(articulatedObject.parts[pid].object3D, this.movingPartColor, this.movingPartMaterial);
    }

    const opts = this.__getOptions(options, 'mask');
    this.__updateImageSize(opts, imageScaleFactor);
    this.renderSceneFromViewpoints(scene, opts, '_' + pid);
  }

  renderTriInfo(scene, articulatedObject, options, imageScaleFactor) {
    // Reset the material
    this.resetObject3DColor(articulatedObject);
    // Assign the triindex
    SceneUtil.colorObject3D(articulatedObject, { encodeIndex: true, ensureVertexColors: true, colorBy: 'faceIndex'} );

    let opts = this.__getOptions(options, 'triindex' );
    // opts.postprocess = { operation: 'convert', dataType: 'uint16' };
    this.__updateImageSize(opts, imageScaleFactor);
    this.renderSceneFromViewpoints(scene, opts, '_triindex');

    // Assign the triuv
    SceneUtil.colorObject3D(articulatedObject, { ensureVertexColors: true, colorBy: 'triuv'} );
    opts = this.__getOptions(options,  'triuv');
    this.__updateImageSize(opts, imageScaleFactor);
    this.renderSceneFromViewpoints(scene, opts, '_triuv');
  }

  writeMetadataFile(filename, opts, viewpoint, cameraControls, articulationStatesByPart) {
    const motion_parameters = [];
    for (let j in opts.part_indexes) {
      const part_index = opts.part_indexes[j];
      // Assume only one motion for each pid
      const articulationState = articulationStatesByPart[part_index][0];
      motion_parameters[j] = {};
      motion_parameters[j]['partId'] = part_index;
      motion_parameters[j]['label'] = opts.part_labels[j];
      // Store the motion transformation
      articulationState.articulatedNode.updateWorldMatrix(true, true);
      motion_parameters[j]['world'] = articulationState.articulatedNode.matrixWorld.elements;
      // Store the motion parameters
      motion_parameters[j]['type'] = articulationState.type;
      motion_parameters[j]['origin'] = articulationState.origin;
      motion_parameters[j]['axis'] = articulationState.axis;
      motion_parameters[j]['rangeMin'] = articulationState.rangeMin;
      motion_parameters[j]['rangeMax'] = articulationState.rangeMax;
      // Store the 3D bounding box
      motion_parameters[j]['3dbbx'] = {};
      const bbx = Object3DUtil.getBoundingBox(articulationState.part.object3D);
      motion_parameters[j]['3dbbx']['min'] = bbx['min'];
      motion_parameters[j]['3dbbx']['max'] = bbx['max'];
      motion_parameters[j]['value'] = articulationState.value;
    }
    const camera_intrinsic = cameraControls.toJSON()['object'];
    const intrinsic = { fov: camera_intrinsic['fov'], aspect: camera_intrinsic['aspect'] };
    const extrinsic = cameraControls.getCurrentCameraState();
    delete extrinsic.target;
    delete extrinsic.up;
    extrinsic['matrix'] = cameraControls.toJSON()['object']['matrix'];
    const summary = { source: opts.source, label: opts.model_label, width: opts.width, height: opts.height,
      viewpoint: viewpoint,
      camera: { intrinsic: intrinsic, extrinsic: extrinsic }, motions: motion_parameters };
    this.__fs.fsWriteToFileEnsureDir(filename, JSON.stringify(summary));
  }

  renderSceneFromViewpoints(scene, opts,  suffix, articulationStatesByPart) {
    if (suffix == null) {
      suffix = '';
    }
    const pathname = opts.pathname || path.dirname(opts.basename);
    const basename = path.basename(opts.basename);
    const cameraControls = opts.cameraControls;
    const targetBBox = opts.targetBBox;

    const renderOpts = _.clone(opts);
    renderOpts.logdata = _.defaults({ cameraConfig: cameraControls.lastViewConfig }, opts.logdata || {});

    for (let i in opts.viewpoints) {
      const viewpoint = opts.viewpoints[i];
      cameraControls.viewTarget({
        targetBBox: targetBBox,
        distanceScale: viewpoint['distanceScale'],
        theta: viewpoint['theta'],
        phi: viewpoint['phi']
      });

      if (opts.metadataPathname) {
        const metadataFilename = opts.metadataPathname + '/' + basename + '-' + i + '.json';
        this.writeMetadataFile(metadataFilename, opts, viewpoint, cameraControls, articulationStatesByPart);
      }

      this.__fs.ensureDirExists(pathname);
      const pngfile = pathname + '/' + basename + '-' + i + suffix + '.png';
      this.renderer.setSize(opts.width, opts.height);
      this.renderer.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);
    }
  }
}

module.exports = ArticulationsRenderDataGenerator;
