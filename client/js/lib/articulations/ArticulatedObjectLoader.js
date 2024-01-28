const ArticulatedObject = require('articulations/ArticulatedObject');
const Object3DLoader = require('loaders/Object3DLoader');
const Object3DUtil = require('geo/Object3DUtil');
const IndexedSegmentation = require('geo/seg/IndexedSegmentation');
const Part = require('parts/Part');
const PartConnectivityGraph = require('parts/PartConnectivityGraph');
const async = require('async');
const _ = require('util/util');

// Handles loading of everything that is needed for an articulated object
class ArticulatedObjectLoader {
    constructor(params) {
        this.assetManager = params.assetManager; // Used to load other stuff
        this.mergeFixedParts = params.mergeFixedParts;
        this.articulationsInfoField = (params.articulationsInfoField != null)? params.articulationsInfoField  : 'articulations';
    }

    checkModelHasArticulatedMesh(modelinfo) {
        return _.get(modelinfo, [this.articulationsInfoField, 'files', 'mesh']);
    }

    load(modelinfo, callback) {
        // TOOO: Have ArticulatedObjectLoader be more robust, explicit specify the format of the articulated mesh
        const hasMeshFile = this.checkModelHasArticulatedMesh(modelinfo);
        if (hasMeshFile) {
            if (modelinfo.source === 'rpmnet') {
                return this.__loadRpmNetPresegmented(modelinfo, callback);
            } else {
                return this.__loadWithSegmentation(modelinfo, callback);
            }
        } else {
            callback('No mesh file for ' + this.articulationsInfoField);
        }
    }

    // Load presegmented articulated model from RPMNet with one part per mesh
    __loadRpmNetPresegmented(modelinfo, callback) {
        const artInfo = modelinfo[this.articulationsInfoField];
        const meshFilename = artInfo['files']['mesh'];
        const articulationsFilename = artInfo['files']['articulations'];
        const connectivityFilename = artInfo['files']['connectivity_graph'];
        modelinfo.file = meshFilename;
        modelinfo.format = undefined;
        async.parallel([
            (cb) => {
                // Load mesh
                const obj3dLoader = new Object3DLoader(this.assetManager);
                obj3dLoader.loadErrorFirst(modelinfo, cb);
            },
            (cb) => {
                // Load articulations
                _.getJSON(articulationsFilename, cb);
            },
            (cb) => {
                if (connectivityFilename) {
                    _.getJSON(connectivityFilename, cb);
                } else {
                    cb();
                }
            }
        ], (err, res) => {
            if (err) {
                callback(err, null);
            } else {
                try {
                    const object3D = res[0];
                    const meshes = Object3DUtil.getMeshList(object3D);
                    const connectivityGraph = res[2]?  PartConnectivityGraph.fromJson(res[2]) : null;
                    if (connectivityGraph) {
                        const parts = connectivityGraph.parts;
                        for (let i = 0; i < parts.length; i++) {
                            const pid = parts[i].pid;
                            const mesh = meshes[i];
                            mesh.userData.pid = pid;
                            mesh.userData.type = 'Part';
                            mesh.userData.partId = pid;
                            parts[i].object3D = mesh;
                        }
                        const articulationsJson = res[1];
                        let articulatedObject = new ArticulatedObject(articulationsJson, connectivityGraph, null, null);
                        articulatedObject.name = modelinfo.fullId + '-articulated';
                        callback(null, articulatedObject);
                    } else {
                        const parts = [];
                        for (let mesh of meshes) {
                            const pid = mesh.userData.index;
                            mesh.userData.pid = pid;
                            mesh.userData.type = 'Part';
                            mesh.userData.partId = pid;
                            const obb = null;  // TODO: compute OBB
                            parts[pid] = new Part(pid, undefined, mesh.name, obb, mesh);
                        }
                        const articulationsJson = res[1];
                        let articulatedObject = new ArticulatedObject(articulationsJson, null, null, parts);
                        articulatedObject.name = modelinfo.fullId + '-articulated';
                        callback(null, articulatedObject);
                    }
                } catch (err) {
                    callback(err);
                }
            }
        });
    }

    // Load articulated model with separate parts file
    __loadWithSegmentation(modelinfo, callback) {
        const artInfo = modelinfo[this.articulationsInfoField];
        const meshFilename = artInfo['files']['mesh'];
        const articulationsFilename = artInfo['files']['articulations'];
        const precomputedFilename = artInfo['files']['connectivity_graph'];
        const partsFilename = artInfo['files']['parts'];
        const segmentType = 'parts';
        const segmentation = new IndexedSegmentation({
            filename: partsFilename,
            segmentType: segmentType
        });
        modelinfo.file = meshFilename;
        modelinfo.format = undefined;
        async.parallel([
            (cb) => {
                // Load mesh
                const obj3dLoader = new Object3DLoader(this.assetManager);
                obj3dLoader.loadErrorFirst(modelinfo, cb);
            },
            (cb) =>{
                // Load segmentation
                segmentation.load({ callback: cb });
            },
            (cb) => {
                // Load articulations
                _.getJSON(articulationsFilename, cb);
            },
            (cb) => {
                // Load connectivity graph
                _.getJSON(precomputedFilename, cb);
            }
        ], (err, res) => {
            if (err) {
                callback(err, null);
            } else {
                try {
                    const object3D = res[0];
                    const articulationsJson = res[2];
                    const precomputedJson = res[3];
                    const segmented = segmentation.getSegmentedMeshes({
                        object3D: object3D,
                        segmentType: segmentType,
                        segmentName: 'parts'
                    });
                    if (precomputedJson.reducedConnectivityGraph) {
                        precomputedJson.fullConnectivityGraph = precomputedJson.connectivityGraph;
                        precomputedJson.connectivityGraph = precomputedJson.reducedConnectivityGraph;
                    }
                    const connectivityGraph = PartConnectivityGraph.fromJson(precomputedJson);
                    const parts = connectivityGraph.parts;
                    for (let i = 0; i < segmented.children.length; i++) {
                        const object3D = segmented.children[i];
                        const pid = object3D.userData.id;
                        let part = parts[pid];
                        if (part) {
                            part.object3D = object3D;
                            part.object3D.name = 'part' + pid + ':' + part.name;
                            part.object3D.userData.type = 'Part';
                            part.object3D.userData.partId = pid;
                            //part.object3D.material = Object3DUtil.getSimpleFalseColorMaterial(i);
                            delete object3D.userData.id;
                        } else if (pid === 0) {
                            // Unlabeled part (okay)
                            part = new Part(0, 'unknown', 'unknown', null, object3D);
                            part.object3D.name = 'part' + pid + ':' + part.name;
                            part.object3D.userData.type = 'PartUnlabeled';
                            part.object3D.userData.partId = pid;
                            delete object3D.userData.id;
                            parts[pid] = part;
                        } else {
                            console.warn('Cannot find part for ' + pid);
                        }
                    }
                    let articulatedObject = new ArticulatedObject(articulationsJson, connectivityGraph);
                    //console.log('Loaded articulated object', articulatedObject);
                    if (this.mergeFixedParts) {
                        articulatedObject = articulatedObject.toCondensed();
                        //console.log('Condensed articulated object', articulatedObject);
                    }
                    articulatedObject.name = modelinfo.fullId + '-articulated';
                    callback(null, articulatedObject);
                } catch (err) {
                    callback(err);
                }
            }
        });
    }
}

module.exports = ArticulatedObjectLoader;