const PubSub = require('PubSub');
const Object3DUtil = require('geo/Object3DUtil');
const InstancePoints = require('rlsd/InstancePoints');
require('jquery-ui');
require('three-controls');

class PanoramaViewer extends PubSub {
  constructor(params) {
    super();

    // private variables
    this.panoViewerCamera = null;
    this.panoViewerOrbitControls = null;
    this.panoScene = null;
    this.overlayGroup = null;
    this.backgroundGroup = null;
    this.rgbSphere = null;
    this.selectedSphere = null;
    this.hoverSpheres = null;
    // Additional geometry for point based instances
    this.pointInstances = null;
    this.__raycaster = new THREE.Raycaster();

    this.isPanoOrbiting = false; // Is the panorama viewer currently orbiting?
    this.panoOrbitted = false; // Did the last mouse interaction with panorama viewer result in orbiting? (Used to filter out non orbiting clicks.)
    this.cameraOrbitCallback = params.cameraOrbitCallback;
    this.cameraOrbitStartCallback = params.cameraOrbitStartCallback;
    this.cameraOrbitEndCallback = params.cameraOrbitEndCallback;
    this.panoHoverCallback = params.onPanoHover;
    this.panoClickCallback = params.onPanoClick;
    this.activeViewpoint = null;
    this.blockCameraOrbitCallback = false;
    this.callBackActive = true;
    this.enabled = params.enabled;

    this.sizeRatio = params.sizeRatio;
    this.overlayCanvasElem = $(params.overlayCanvas);          // Canvas element on which to show the mask overlays
    this.backgroundCanvasElem = $(params.backgroundCanvas);    // Canvas element to render rgb background
    this.showBackground = params.showBackground;
    this.showOverlays = params.showOverlays;

    if (params.overlayCanvas !== params.backgroundCanvas) {
      this.overlayCanvasElem.css('pointer-events', 'none');
    }
    this.__interactionCanvasElem = this.backgroundCanvasElem;  // Canvas element on which interactions will happen
    this.__interactionCanvasElem.click((e) => {
      return this.onMouseDown(e);
    });

    this.__interactionCanvasElem.mousemove((e) => this.onMouseMove(e));
    this.cameraOrbitInteraction = null;
    this.renderersByName = {};
    this.renderers = [];
    this.__setupPanoramicScene();
  }

  get width() {
    return this.__interactionCanvasElem.clientWidth;
  }

  setZIndex(overlayzindex, backgroundzindex) {
    this.overlayCanvasElem.css('z-index', overlayzindex);
    this.backgroundCanvasElem.css('z-index', backgroundzindex);
  }

  setVisible(flag) {
    if (flag) {
      this.overlayCanvasElem.css('visibility', 'visible');
      this.backgroundCanvasElem.css('visibility', 'visible');
    } else {
      this.overlayCanvasElem.css('visibility', 'hidden');
      this.backgroundCanvasElem.css('visibility', 'hidden');
    }
  }

  __delegateMouseCallback(event, cb) {
    const mesh = this.showBackground? this.rgbSphere : this.selectedSphere;
    const intersected = this.__getIntersected(event, this.__interactionCanvasElem, mesh);
    const panoCoords = { x: intersected.uv.x, y: 1.0 - intersected.uv.y}; // panoCoords in normalized uv coordinates
    const screenCoords = this.__getNormalizedScreenCoordinate(event, this.__interactionCanvasElem);   // coordinates in screen coordinates
    const intersectedPointInstance = this.__getIntersected(event, this.__interactionCanvasElem, this.pointInstances.pointInstancesGroup);
    return cb(event, {
      panoCoordsNormalized: panoCoords,
      screenCoordsNormalized: screenCoords,
      point3d: intersected.point,
      pointInstanceId: intersectedPointInstance? intersectedPointInstance.object.userData.id : null
    });
  }

  getPanoCoordsToTarget(targetWorld, sceneToWorld) {
    const mesh = this.showBackground? this.rgbSphere : this.selectedSphere;
    const position = new THREE.Vector3(...this.activeViewpoint.cameraState.position);
    position.applyMatrix4(sceneToWorld);
    const direction = new THREE.Vector3();
    direction.subVectors(targetWorld, position);
    direction.normalize();
    // not sure why this is needed...
    direction.applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0,0,0), direction);
    const intersects = raycaster.intersectObject(mesh, true);
    const intersected = intersects[0];
    const panoCoords = { x: intersected.uv.x, y: 1.0 - intersected.uv.y}; // panoCoords in normalized uv coordinates
    return { point3d: intersected.point, panoCoordsNormalized: panoCoords };
  }

  onMouseDown(event) {
    if (!this.enabled || !this.callBackActive) {
      return;
    }

    if (this.panoViewerOrbitControls.enabled) { // Filter orbiting events only if orbiting enabled
      // Currently orbiting or
      // Just finished a click event that resulted in orbiting
      if (this.isPanoOrbiting || this.isPanoOrbitted) {
        return false;
      }
    }

    return this.__delegateMouseCallback(event, this.panoClickCallback);
  }

  onMouseMove(event) {
    if (!this.enabled || !this.callBackActive) return;

    return this.__delegateMouseCallback(event, this.panoHoverCallback);
  }

  __createRenderer(name, canvas) {
    console.log('create renderer');
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      preserveDrawingBuffer: true,
      alpha: true
    });
    renderer.setClearColor( 0xffffff, 0);
    renderer.autoClear = false;
    renderer.name = name;
    this.renderers.push(renderer);
    return renderer;
  }

  /**
   * Create the panoramicViewer for the first time.
   */
  __setupPanoramicScene() {
    this.panoScene = new THREE.Scene();

    const overlayCanvas = this.overlayCanvasElem.get(0);
    const backgroundCanvas = this.backgroundCanvasElem.get(0);
    this.renderersByName['overlay'] = this.__createRenderer('overlay', overlayCanvas);
    this.renderersByName['background'] = (backgroundCanvas === overlayCanvas)? this.renderersByName['overlay'] :
      this.__createRenderer('background', backgroundCanvas);

    // Setting of the panoramic viewer
    this.panoViewerCamera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 1000 );
    this.panoViewerCamera.position.z = .000000001;
    this.panoViewerOrbitControls = new THREE.OrbitControls(this.panoViewerCamera, this.__interactionCanvasElem.get(0));
    this.panoViewerOrbitControls.mouseMappings = [
      { action: this.panoViewerOrbitControls.actions.ORBIT,  button: THREE.MOUSE.LEFT }
    ];
    this.panoViewerOrbitControls.update();

    const scope = this;
    this.panoViewerOrbitControls.addEventListener('start', function() {
      scope.isPanoOrbiting = true;
      scope.isPanoOrbitted = false;
      scope.cameraOrbitInteraction = {startTime: new Date().getTime()};
      scope.cameraOrbitStartCallback(scope.cameraOrbitInteraction);
    });
    this.panoViewerOrbitControls.addEventListener('change', function() {
      scope.isPanoOrbitted = true;
      if (!scope.blockCameraOrbitCallback) {
        scope.cameraOrbitCallback(scope.panoViewerCamera.getWorldDirection(new THREE.Vector3()));
      }
    });
    this.panoViewerOrbitControls.addEventListener('end', function() {
      scope.isPanoOrbiting = false;
      scope.cameraOrbitEndCallback(scope.cameraOrbitInteraction);
      // console.log("Finished orbiting");
    });

    const renderers = this.renderers;
    const animate = function () {
      window.requestAnimationFrame( animate );
      // scope.panoViewerOrbitControls.update();
      renderers.forEach((renderer) => {
        renderer.clear();
        if (renderers.length > 1) {
          scope.setGroupVisible(renderer.name);
        }
        renderer.render(scope.panoScene, scope.panoViewerCamera);
      });
    };

    animate();
  }

  setGroupVisible(groupName, otherVisibility=false) {
    for (let i = 0; i < this.panoScene.children.length; i++) {
      const child = this.panoScene.children[i];
      if (child.name === groupName) {
        child.visible = true;
      } else {
        child.visible = otherVisibility;
      }
    }
  }

  showPanorama() {
    this.callBackActive = true;
    this.panoScene.visible = true;
  }

  hidePanorama() {
    this.callBackActive = false;
    this.panoScene.visible = false;
  }

  getRGBDataURL() {
    const renderer = this.renderersByName['background'];
    renderer.clear();
    const tempScene = new THREE.Scene();
    tempScene.add(this.rgbSphere.clone());
    renderer.render(tempScene, this.panoViewerCamera);
    const rgbUrl = renderer.domElement.toDataURL();
    return rgbUrl;
  }

  getMaskedDataURL() {
    const renderer = this.renderersByName['overlay'];
    renderer.clear();
    const tempScene = new THREE.Scene();
    tempScene.add(this.selectedSphere.clone());
    renderer.render(tempScene, this.panoViewerCamera);
    const maskUrl = renderer.domElement.toDataURL();
    return maskUrl;
    // this.renderer.setRenderTarget(null);
  }

  getMaskedView() {
    return {
      rgbUrl: this.getRGBDataURL(),
      maskUrl: this.getMaskedDataURL()
    };
  }

  isOrbitAllowed() {
    return this.panoViewerOrbitControls.enabled;
  }

  setOrbitAllowed(enabled) {
    this.panoViewerOrbitControls.enabled = enabled;
  }

  /**
   * Returns intersected
   * @param {event} e
   * @param {img} image
   * @param {THREE.Object3D} object3d
   */
  __getIntersected(e, panoViewerCanvas, object3d) {
    const mouse = new THREE.Vector2();
    mouse.x = ( e.offsetX / panoViewerCanvas.innerWidth() ) * 2 - 1;
    mouse.y = - ( e.offsetY / panoViewerCanvas.innerHeight() ) * 2 + 1;

    const raycaster = this.__raycaster;
    raycaster.setFromCamera( mouse, this.panoViewerCamera );

    const intersects = raycaster.intersectObjects( [object3d], true );
    return intersects[0];
  }

  __getNormalizedScreenCoordinate(e, panoViewerCanvas) {
    return { x: e.offsetX / panoViewerCanvas.innerWidth(), y: e.offsetY / panoViewerCanvas.innerHeight() };
  }

  __getClearMaterial() {
    return new THREE.MeshBasicMaterial( { color: new THREE.Color(), opacity: 0.0, transparent: true,
      side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth  } );
  }

  __createSphere(material) {
    const sphereGeometry = new THREE.SphereGeometry(1.5, 100, 80, 0, - 2 * Math.PI);
    const sphereMesh = new THREE.Mesh(sphereGeometry, material);
    sphereMesh.rotation.y = -Math.PI/2; // ensures center of panorama is looked at by default camera
                                        // (can also create sphereGeometry starting at this rotation)
    return sphereMesh;
  }

  /**
   * Update the panorama viewer to use the new viewpoint
   * @param {string} panoramicRGBUrl
   */
  resetPanoramicView(newViewpoint, panoramicRGBUrl, hoverSphereCount) {
    this.activeViewpoint = newViewpoint;

    // dispose of geometry and materials
    if (this.panoScene) {
      // assumes that everything we need to dispose is attached to the scene
      // also assumes there is no sharing so recursive disposal won't result in duplicate disposal
      Object3DUtil.dispose(this.panoScene);
    }

    this.panoScene = new THREE.Scene();

    this.backgroundGroup = new THREE.Group();
    this.backgroundGroup.name = 'background';
    if (this.showBackground) {
      const texture = new THREE.TextureLoader().load(panoramicRGBUrl);
      const material = new THREE.MeshBasicMaterial( { map: texture, side: THREE.FrontSide } );
      this.rgbSphere = this.__createSphere(material);
      this.backgroundGroup.add( this.rgbSphere );
      this.panoScene.add(this.backgroundGroup);
    }

    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = 'overlay';
    if (this.showOverlays) {
      this.selectedSphere = this.__createSphere(this.__getClearMaterial());
      this.overlayGroup.add( this.selectedSphere );

      this.hoverSpheres = [];
      for (let i = 0; i < hoverSphereCount; i++) {
        this.hoverSpheres[i] = this.__createSphere(this.__getClearMaterial());
        this.overlayGroup.add( this.hoverSpheres[i] );
      }

      const pointInstancesGroup = new THREE.Group();
      pointInstancesGroup.name = 'pointInstances';
      this.overlayGroup.add(pointInstancesGroup);
      this.pointInstances = new InstancePoints(0.025, pointInstancesGroup);

      this.panoScene.add(this.overlayGroup);
    }

    // Make panorama camera look at the same initial direction as the viewpoint
    this.setPanoramaLookDirection(this.activeViewpoint.cameraState.direction);

    console.log({"target": this.activeViewpoint.cameraState.direction,
      "current": this.panoViewerCamera.getWorldDirection(new THREE.Vector3())});
  }

  setPanoramaLookDirection(lookDir) {
    // TODO: this implementation of the panoviewer camera + orbit controls is very confusing
    // The camera is positioned a bit offset from the center (based on the lookDir) and then the orbit controls
    // rotate around it.  It would be better if the camera was always positioned in the center and different
    // set of controls then control the movement of the camera
    // TODO: why divide by 10000.0?
    this.blockCameraOrbitCallback = true;
    // Make panorama camera look at the given lookDir
    // TODO: check this logic to change lookDir from world coordinate
    this.panoViewerCamera.position.set(lookDir[0]/10000.0, -lookDir[2]/10000.0, -lookDir[1]/10000.0); // transform the lookDir from the world coord to the sphere local coord
    this.panoViewerOrbitControls.update();
    this.blockCameraOrbitCallback = false;
  }

  highlightHover(buffer, width, height, index) {
    const hoverTexture = new THREE.DataTexture(buffer, width, height, THREE.RGBAFormat);
    hoverTexture.flipY = true;
    const hoverMaterial = new THREE.MeshBasicMaterial( { map: hoverTexture, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth } );
    this.hoverSpheres[index].material = hoverMaterial;
  }

  clearHoverHighlight() {
    if (this.hoverSpheres) {
      this.hoverSpheres.forEach((hoverSphere) => {
        const hoverMaterial = this.__getClearMaterial();
        hoverSphere.material = hoverMaterial;
      });
    }
  }

  clearSelectedHighlight() {
    const selectedMaterial = this.__getClearMaterial();
    this.selectedSphere.material = selectedMaterial;
  }

  highlightSelected(selectedMaskBuffer, width, height) {
    const selectedTexture = new THREE.DataTexture(selectedMaskBuffer, width, height, THREE.RGBAFormat);
    selectedTexture.flipY = true;
    const selectedMaterial = new THREE.MeshBasicMaterial( { map: selectedTexture, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth } );
    this.selectedSphere.material = selectedMaterial;
  }

  setFOV(fov) {
    // console.log("Set FOV");
    this.panoViewerCamera.fov = fov;
    this.panoViewerCamera.updateProjectionMatrix();
  }

  setAspectRatio(width, height) {
    const ratio = this.sizeRatio;
    this.panoViewerCamera.aspect = width/height;
    this.panoViewerCamera.updateProjectionMatrix();

    const renderers = this.renderers;
    for (let i = 0; i < renderers.length; i++) {
      const renderer = renderers[i];
      renderer.domElement.width = width*ratio;
      renderer.domElement.height = height*ratio;
      renderer.setSize(renderer.domElement.width, renderer.domElement.height);
    }
  }

  highlightPointInstances(pointInstanceIds, maskAnnotations) {
    if (this.pointInstances) {
      return this.pointInstances.highlight(pointInstanceIds, maskAnnotations);
    }
  }

  selectPointInstances(pointInstanceIds) {
    if (this.pointInstances) {
      return this.pointInstances.select(pointInstanceIds);
    }
  }

  updatePointInstances(pointInstancesArray) {
    if (this.pointInstances) {
      return this.pointInstances.update(pointInstancesArray);
    }
  }
}

module.exports = PanoramaViewer;