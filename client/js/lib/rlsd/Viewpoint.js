class Viewpoint {
  constructor(id) {
    /**
     * A viewpoint contains the photoId, camera info and urls (rgb, semantic, instance) associated with a photo.
     */
    this.id = id;                       // Id of panorama
    this.roomId = null;
    this.instanceUrl = null;
    this.rgbUrl = null;
    this.semanticUrl = null;
    this.cameraInfoUrl = null;
    // Initial camera information associated with the viewpoint
    this.initialCameraInfo = null;  // { projection: { vertical_fog_deg: 60 }, view: { position: [], look_direction: [], up_direction: [] }}
    // Current camera state with { fov, position, direction, up }
    this.cameraState = null;
    this.taskViewpointAssignment = null; //Task Viewpoint assignment coupled with this viewpoint
    this.thumbnailUrl = null;
    this.lastStartTime = null; // Timestamp at most recent activate of viewpoint
  }

  clone() {
    const cloned = new Viewpoint(this.id);
    cloned.instanceUrl = this.instanceUrl;
    cloned.rgbUrl = this.rgbUrl;
    cloned.semanticUrl = this.semanticUrl;
    cloned.cameraInfoUrl = this.cameraInfoUrl;

    console.assert(this.lastStartTime == null);
    console.assert(this.taskViewpointAssignment == null); // Task specific modifications are added after cloning
    console.assert(this.cameraInfo == null); // Camera info must be loaded only after finishing the clone
    return cloned;
  }

  get info() {
    return {
      id: this.id,
      roomId: this.roomId
    }
  }

  get assignedMasks() {
    return (this.taskViewpointAssignment)? this.taskViewpointAssignment.assignedMasks : null;
  }

  getRegionId() {
    // TODO(AXC): check if we want to use regionIndex in taskViewpointAssignment
    //  (also why difference in names: regionIndex vs roomId)?
    if (this.taskViewpointAssignment && this.taskViewpointAssignment.regionIndex) {
      return this.taskViewpointAssignment.regionIndex;
    }
    return this.roomId;
  }

  __getMaskedView(lookDir, callBack) {
    // TODO: check when we would want this
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById("thumbnailCanvas"),
        preserveDrawingBuffer: true
    });
    renderer.autoClear = false;
    renderer.setClearColor(new THREE.Color('skyblue'));
    const tempScene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(1.5, 100, 80, 0, -2 * Math.PI);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    // TODO: check this logic to change lookDir from world coordinate
    camera.position.set(lookDir[0] / 10000.0, -lookDir[2] / 10000.0, -lookDir[1] / 10000.0); // transform the lookDir from the world coord to the sphere local coord
    camera.lookAt(0, 0, 0);
    const scope = this;
    new THREE.TextureLoader().load(this.rgbUrl, function (texture) {
        const material = new THREE.MeshBasicMaterial({map: texture, side: THREE.DoubleSide});
        const rgbSphere = new THREE.Mesh(geometry, material);
        rgbSphere.rotation.y = -Math.PI / 2; // ensures center of panorama is looked at by default camera
        tempScene.add(rgbSphere);
        renderer.clear(true, true, true);
        renderer.render(tempScene, camera);
        const url = renderer.domElement.toDataURL();
        callBack(null, url);
    }, undefined, function (err) {
        console.log('Error getting masked view', err);
        callBack(err, scope.rgbUrl);
    });
  }

  getUILogInfo() {
    return {
        "startTime": this.lastStartTime,
        "id": this.id,
        "taskViewpointAssignments": this.taskViewpointAssignment
    };
  }

  getLookDirForNormalizedPanoCoords(pos) {
    // TODO: has this logic be converted by the specific viewpoint
    // Assume center is 0,1,0  (angle 0)
    // 0/1 are 0,1,0
    // horizontal angle -pi/+pi for x=0/1
    const angleH = (pos.x-0.5)*2*Math.PI;
    // vertical angle   -pi/+pi fi y=0/1
    const angleV = (0.5-pos.y)*2*Math.PI;
    // console.log('got angleH, angleV', pos.x, pos.y, angleH, angleV);
    const lookDir = new THREE.Vector3(Math.sin(angleH), Math.cos(angleH), Math.sin(angleV));
    lookDir.normalize();
    return lookDir;
  }

  __cameraInfoToCameraState(camInfo) {
    const camState = { ...camInfo['view'] };
    // TODO: why the vertical fov deg in the projection field ?  Also why the min?
    camState.fov = camInfo['projection']['vertical_fov_deg'];
    const convertFieldNames = {
      'look_direction': 'direction',
      'up_direction': 'up'
    };
    const fieldNames = Object.keys(convertFieldNames);
    fieldNames.forEach((infoName) => {
      const stateName = convertFieldNames[infoName];
      if (camState[infoName] != null) {
        camState[stateName] = camState[infoName];
        delete camState[infoName];
      }
    });
    return camState;
  }

  updateLookDirection(dir) {
    //console.log('update look direction', this.cameraState.direction, dir);
    this.cameraState.direction = (Array.isArray(dir))? dir : dir.toArray();
  }

  loadCameraInfo(cameraInfoLoadedCallback) {
    const loader = new THREE.FileLoader();
    const scope = this;
    loader.load(this.cameraInfoUrl, function (camInfoString) {
        const camInfoJson = JSON.parse(camInfoString);
        scope.initialCameraInfo = camInfoJson;
        scope.cameraState = scope.__cameraInfoToCameraState(camInfoJson);

        if (scope.taskViewpointAssignment) {
            // Apply task specific transformations to lookDirection
            const lookDirectionVector = new THREE.Vector3();
            lookDirectionVector.fromArray(scope.cameraState.direction);
            if (scope.taskViewpointAssignment.reorientPitch != null) {
              const pitchAxis = new THREE.Vector3();
              pitchAxis.crossVectors(new THREE.Vector3(0, 1, 0), lookDirectionVector);
              const pitchAngle = Math.PI / 180 * scope.taskViewpointAssignment.reorientPitch;
              lookDirectionVector.applyAxisAngle(pitchAxis, pitchAngle);
            }

            if (scope.taskViewpointAssignment.reorientYaw != null) {
              const yawAxis = new THREE.Vector3(0, 1, 0);
              const yawAngle = Math.PI / 180 * scope.taskViewpointAssignment.reorientYaw;
              lookDirectionVector.applyAxisAngle(yawAxis, yawAngle);
            }

            scope.cameraState.direction = lookDirectionVector.toArray();
        }
        scope.__getMaskedView(scope.cameraState.direction, function (err, viewUrl) {
            scope.viewUrl = viewUrl;
            // TODO: figure out when we want to use the masked/rendered view (TODO: rename to be more informative)
            // and when we just want to use the original rgbUrl
            if (scope.taskViewpointAssignment) {
              scope.thumbnailUrl = scope.viewUrl;
            } else {
              scope.thumbnailUrl = scope.rgbUrl;
            }
            cameraInfoLoadedCallback(err, scope);
        });
    });
  }
}

module.exports = Viewpoint;