'use strict';

const Constants = require('Constants');
const Camera = require('gfx/Camera');
const SceneSetupHelper = require('gfx/SceneSetupHelper');
const DisplayAxis = require('articulations/DisplayAxis');
const DisplayRadar = require('articulations/DisplayRadar');
const MatrixUtil = require('math/MatrixUtil');
const Object3DUtil = require('geo/Object3DUtil');

class ViewTile {
    // viewTileOpts should include modelInstance, fullId, jointInfo, element, autoRotates
    constructor(viewTileOpts) {
        const modelInstance = viewTileOpts.modelInstance;
        const fullId = viewTileOpts.fullId;
        const jointInfo = viewTileOpts.jointInfo;
        const element = viewTileOpts.element;
        const autoRotate = viewTileOpts.autoRotate || false;
        const articulations = viewTileOpts.articulations;

        this.__points = {};
        this.__arrows = {};
        this.__planes = {};

        // this.scene = new THREE.Scene();
        this.fullId = fullId;
        this.jointInfo = jointInfo;
        this.element = element;

        this.staticMode = false;

        // Create the  camera
        this.camera = this.__createCamera();

        // Create a new scene
        this.scene = SceneSetupHelper.createScene(this.camera, {
            // backgroundColor: 'lightgrey',
            useLights: true,
            useDirectionalLights: false
        });

        // Add the light
        this.__addLight();

        // Create the control
        this.controls = this.__createControls(autoRotate);

        this.articulatedObject = null;

        if (modelInstance !== null) {
            this.setModelInst(modelInstance, articulations);
        }
    }

    setModelInst(modelInstance, articulations) {
        this.modelInstance = modelInstance;
        articulations = articulations || this.modelInstance.getObject3D('Model').userData.articulations;

        if (articulations && articulations.length) {
            this.articulatedObject = this.modelInstance.clone().toArticulatedObject(articulations);
        } else {
            const articulatedObjects = this.modelInstance.clone().getArticulatedObjects();
            if (articulatedObjects.length) {
                this.articulatedObject = articulatedObjects[0];
                if (articulatedObjects.length > 1) {
                    console.warn('Taking first articulated objects, ignoring others', articulatedObjects);
                }
            }
        }

        // align and rescale
        this.group = new THREE.Group();
        this.modelInstance.alignAndScaleObject3D(this.group, Constants.worldUp, Constants.worldFront);
        this.group.add(this.articulatedObject);

        this.scene.add(this.group);

        this.axisRadarGroup = new THREE.Group();
        this.scene.add(this.axisRadarGroup);
        this.modelInstance.alignAndScaleObject3D(this.axisRadarGroup, Constants.worldUp, Constants.worldFront);

        if (this.xyzGroup == null) {
            this.xyzGroup = new THREE.Group();
            this.scene.add(this.xyzGroup);
            this.modelInstance.alignAndScaleObject3D(this.xyzGroup, Constants.worldUp, Constants.worldFront);
        }

        if (this.pointGroup == null) {
            this.pointGroup = new THREE.Group();
            this.scene.add(this.pointGroup);
            this.modelInstance.alignAndScaleObject3D(this.pointGroup, Constants.worldUp, Constants.worldFront);
        }

        if (this.arrowGroup == null) {
            this.arrowGroup = new THREE.Group();
            this.scene.add(this.arrowGroup);
            this.modelInstance.alignAndScaleObject3D(this.arrowGroup, Constants.worldUp, Constants.worldFront);
        }

        if (this.planeGroup == null) {
            this.planeGroup = new THREE.Group();
            this.scene.add(this.planeGroup);
            this.modelInstance.alignAndScaleObject3D(this.planeGroup, Constants.worldUp, Constants.worldFront);
        }
    }

    setArticulations(articulations) {
        this.scene.remove(this.group);
        this.scene.remove(this.axisRadarGroup);
        this.setModelInst(this.modelInstance, articulations);
    }

    getScene() {
        return this.scene;
    }

    getModelInstance() {
        return this.modelInstance;
    }

    getFullId() {
        return this.fullId;
    }

    getJointInfo() {
        return this.jointInfo;
    }

    getElement() {
        return this.element;
    }

    getCamera() {
        return this.camera;
    }

    getControls() {
        return this.controls;
    }

    updateViewport(renderer) {
        // get the element that is a place holder for where we want to
        // draw the viewTile
        const element = this.element;

        // get its position relative to the page's viewport
        const rect = element.getBoundingClientRect();

        // set the viewport
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const left = rect.left - renderer.domElement.getBoundingClientRect().left;
        const bottom = renderer.domElement.clientHeight - rect.bottom + renderer.domElement.getBoundingClientRect().top;

        if (bottom > renderer.domElement.clientHeight || bottom + height < 0 || left > renderer.domElement.clientWidth || left + width < 0) {
            return;
        }

        renderer.setViewport(left, bottom, width, height);
        renderer.setScissor(left, bottom, width, height);

        this.controls.update();

        renderer.render(this.scene, this.camera);
    }

    setStaticMode(staticMode) {
        this.staticMode = staticMode;
    }

    updateTileState(renderHelper) {

        if (this.articulatedObject) {
            // const articulationStates = this.articulatedObject.articulationStates;
            // const articulationStatesByPart = _.groupBy(articulationStates, 'pid');

            const movingPartId = this.jointInfo['movingPartId'];
            const basePartId = this.jointInfo['basePartId'];

            const articulationStates = _.filter(this.articulatedObject.articulationStates, (articulationState) => {
                const pid = articulationState.part.pid;
                if (!(movingPartId == null) && pid != movingPartId) {
                    return false;
                }

                const parentId = articulationState.part.baseIds? articulationState.part.baseIds[0] : null;
                if (!(basePartId == null) && parentId != basePartId) {
                    return false;
                }

                return true;
            });

            let resetFlag = true;
            for (let articulationState of articulationStates) {
                renderHelper.applyPartColorings(this.articulatedObject, articulationState, resetFlag);

                if (articulationState.type.toLowerCase() === 'fixed') {
                    // Deal with the default highlight
                    continue;
                }
                if (resetFlag) {
                    resetFlag = false;
                }

                if (articulationState.refNow == null && articulationState.articulation.rangeMin != null && articulationState.articulation.rangeMax != null) {
                    articulationState.apply(articulationState.articulation.rangeMin - articulationState.articulation.defaultValue);
                    if (articulationState.articulation.defaultValue < articulationState.articulation.rangeMin || articulationState.articulation.defaultValue > articulationState.articulation.rangeMax) {
                        console.log("Warning: Current Pose is not in the Range!", this.fullId);
                    }
                    articulationState.refNow = true;
                }

                let delta = articulationState.articulation.isTranslation? 0.01 : 0.04;
                // const maxIterations = 100;
                // const rangeAmount = _.isFinite(articulationState.rangeAmount) ? articulationState.rangeAmount : articulationState.defaultRangeAmount;
                // const delta = 2 * rangeAmount / (maxIterations - 1);

                // Deal with the case that display the rule
                if (articulationState.articulation.rangeMin == null || articulationState.articulation.rangeMax == null) {
                    if (articulationState.fakeValue == null) {
                        articulationState.fakeValue = 0;
                    }
                    // Deal with axis/rader
                    this.__showAxisRadar(articulationState, articulationState.direction * delta);
                    if (this.staticMode) continue;
                    articulationState.fakeValue += articulationState.direction * delta;
                    if (articulationState.fakeValue > 0.5) {
                        articulationState.direction = -articulationState.direction;
                    }
                    if (articulationState.fakeValue < -0.5) {
                        articulationState.direction = -articulationState.direction;
                    }
                    continue;
                }

                // Deal with axis/rader
                this.__showAxisRadar(articulationState);
                if (this.staticMode) continue;

                // console.log(delta)

                articulationState.apply(articulationState.direction * delta);

                // Check if we need to reverse
                if (articulationState.atMax) {
                    articulationState.direction = -articulationState.direction;
                }
                if (articulationState.atMin) {
                    articulationState.direction = -articulationState.direction;
                }
            }
        }
        else {
            console.log(`No articulated object for ${this.modelInstance.model.getFullID()}`);
            return;
        }
    }

    showPoint(display, id, parameter) {
        if (display == false) {
            if (this.__points[id] != null) {
                this.pointGroup.remove(this.__points[id]);
                delete this.__points[id];
            }
            return;
        }
        if (this.__points[id] == null) {
            const location = parameter['location'];
            const size = parameter['size'] || 1;
            const color = parameter['color'] || 0x000000;
            const opacity = parameter['opacity'] || 1;

            let widgetsNode = new THREE.Group();

            const geometry = new THREE.SphereBufferGeometry(size);
            const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false });
            const sphere = new THREE.Mesh(geometry, material);
            widgetsNode.add(sphere);

            const new_location = { x: location[0], y: location[1], z: location[2] };

            widgetsNode.position.copy(new_location);

            this.pointGroup.add(widgetsNode);
            this.__points[id] = widgetsNode;

        }

    }

    showArrow(display, id, parameter) {
        if (display == false) {
            if (this.__arrows[id] != null) {
                this.arrowGroup.remove(this.__arrows[id]);
                delete this.__arrows[id];
            }
            return;
        }
        if (this.__arrows[id] == null) {
            const location = parameter['location'];
            const direction = parameter['direction'];
            const arrowSize = parameter['arrowSize'] || 0.3;
            const length = parameter['length'] || 1;
            const color = parameter['color'] || 0x000000;
            const opacity = parameter['opacity'] || 1;

            let widgetsNode = new THREE.Group();

            const dir = new THREE.Vector3(direction[0], direction[1], direction[2]);
            dir.normalize();

            const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, arrowSize);
            const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false });
            arrow.line.material = material;
            Object3DUtil.setMaterial(arrow, material, Object3DUtil.MaterialsAll, true);

            widgetsNode.add(arrow);

            const new_location = { x: location[0], y: location[1], z: location[2] };

            widgetsNode.position.copy(new_location);

            this.arrowGroup.add(widgetsNode);
            this.__arrows[id] = widgetsNode;

        }

    }

    showPlane(display, id, parameter) {
        if (display == false) {
            if (this.__planes[id] != null) {
                this.planeGroup.remove(this.__planes[id]);
                delete this.__planes[id];
            }
            return;
        }
        if (this.__planes[id] == null) {
            const normal = parameter['normal'];
            const location = parameter['location'];
            const size = parameter['size'] || 1;
            const color = parameter['color'] || 0x000000;
            const opacity = parameter['opacity'] || 1;

            let widgetsNode = new THREE.Group();

            const norm_pos = new THREE.Vector3(normal[0], normal[1], normal[2]);
            norm_pos.normalize();

            const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false, side: THREE.DoubleSide });
            const geometryPlane = new THREE.PlaneBufferGeometry(size, size, 1, 1);
            const meshPlane = new THREE.Mesh(geometryPlane, material);
            widgetsNode.add(meshPlane);

            // const m = MatrixUtil.getAlignmentMatrix(new THREE.Vector3(0,0,1), new THREE.Vector3(1,0,0),
            //   norm_pos, MatrixUtil.getOrthogonal(norm_pos));
            const m = MatrixUtil.getAlignmentMatrix(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
                norm_pos, new THREE.Vector3(1, 0, 0));
            widgetsNode.setRotationFromMatrix(m);

            widgetsNode.position.set(location[0], location[1], location[2]);
            //widgetsNode.position.set(...location);  // Less readable but equivalent to above

            this.planeGroup.add(widgetsNode);
            this.__planes[id] = widgetsNode;

        }
    }


    showXYZ(display) {
        if (display == false) {
            if (this.xyzGroup.children[0] != null) {
                this.xyzGroup.remove(this.xyzGroup.children[0]);
            }
            return;
        }

        if (this.xyzGroup.children[0] == null) {

            let widgetsNode = new THREE.Group();

            const xDir = new THREE.Vector3(1, 0, 0),
                yDir = new THREE.Vector3(0, 1, 0),
                zDir = new THREE.Vector3(0, 0, 1);

            const xColor = 0xFF0000,
                yColor = 0x2ca02c,
                zColor = 0x0000FF;

            const length = 1.5;

            const arrowX = new THREE.ArrowHelper(xDir, new THREE.Vector3(0, 0, 0), length, 0x000000, 0.3);
            const arrowY = new THREE.ArrowHelper(yDir, new THREE.Vector3(0, 0, 0), length, 0x000000, 0.3);
            const arrowZ = new THREE.ArrowHelper(zDir, new THREE.Vector3(0, 0, 0), length, 0x000000, 0.3);

            const materialX = new THREE.MeshBasicMaterial({ color: xColor, depthTest: false }),
                materialY = new THREE.MeshBasicMaterial({ color: yColor, depthTest: false }),
                materialZ = new THREE.MeshBasicMaterial({ color: zColor, depthTest: false });

            arrowX.line.material = materialX;
            arrowY.line.material = materialY;
            arrowZ.line.material = materialZ;
            Object3DUtil.setMaterial(arrowX, materialX, Object3DUtil.MaterialsAll, true);
            Object3DUtil.setMaterial(arrowY, materialY, Object3DUtil.MaterialsAll, true);
            Object3DUtil.setMaterial(arrowZ, materialZ, Object3DUtil.MaterialsAll, true);

            widgetsNode.add(arrowX);
            widgetsNode.add(arrowY);
            widgetsNode.add(arrowZ);

            this.xyzGroup.add(widgetsNode);
        }
    }

    __showAxisRadar(articulationState, delta) {
        if (articulationState.displayAxis == null) {
            articulationState.articulation.value = articulationState.articulation.value || articulationState.articulation.defaultValue;

            let widgetsNode = new THREE.Group();

            const displayAxis = new DisplayAxis({ articulation: articulationState });
            if (!articulationState.articulation.isTranslation) {
                const displayRadar = new DisplayRadar({ articulation: articulationState });
                displayRadar.update();
                displayRadar.attach(widgetsNode);
                articulationState.displayRadar = displayRadar;
                displayAxis.update();
            } else {
                displayAxis.update(true);
            }
            displayAxis.attach(widgetsNode);
            this.axisRadarGroup.add(widgetsNode);

            articulationState.displayAxis = displayAxis;
        }

        if (this.staticMode) return;

        if (delta == null) {
            if (articulationState.articulation.isTranslation) {
                articulationState.displayAxis.updateValue();
            } else {
                articulationState.displayRadar.updateValue();
            }
        }
        else {
            if (articulationState.articulation.isTranslation) {
                articulationState.displayAxis.updateAxisPoint(delta);
            } else {
                articulationState.displayRadar.rotate(delta);
            }
        }
    }

    __createCamera() {
        const cameraConfig = _.defaults(Object.create(null), {}, {
            type: 'perspective',
            fov: 50,
            near: 0.1 * Constants.metersToVirtualUnit,
            far: 400 * Constants.metersToVirtualUnit
        });
        const camera = Camera.fromJson(cameraConfig, 1024, 1024);

        camera.position.z = -150;
        camera.position.x = -150;
        camera.position.y = 100;

        return camera;
    }

    __createControls(autoRotate) {
        const controls = new THREE.OrbitControls(this.camera, this.element);
        controls.minDistance = 0.1 * Constants.metersToVirtualUnit;
        controls.maxDistance = 400 * Constants.metersToVirtualUnit;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.autoRotate = autoRotate;
        controls.autoFocus = false;
        return controls;
    }

    setAutoRotate(autoRotate) {
        this.controls.autoRotate = autoRotate;
    }

    addListenElement(element) {
        this.controls.addEventListeners(element);
        this.controls.update();
    }

    removeListenElement(element) {
        this.controls.removeEventListeners(element);
        this.controls.update();
    }

    __addLight() {
        this.scene.add(new THREE.HemisphereLight(0xaaaaaa, 0x444444));
        const light = new THREE.DirectionalLight(0xffffff, 0.5);
        light.position.set(1, 1, 1);
        this.scene.add(light);
    }
}

module.exports = ViewTile;