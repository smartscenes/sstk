#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.1';
const STK = require('../stk-ssc');
const async = require('async');
const shell = require('shelljs');
const _ = STK.util;
const cmd = require('../ssc-parseargs');
cmd
    .version(VERSION)
    .description('Render parts for articulations')
    .option('--id <id>', 'Model id [default: rpmnet.Balance_01', 'rpmnet.Balance_01')
    .option('--output <filename>', 'Output filename')
    .option('--show_obb [flag]', 'Whether to render the OBB of the part',  STK.util.cmd.parseBoolean,false)
    .option('--show_connected [flag]', 'Whether to highlight connected parts',  STK.util.cmd.parseBoolean, false)
    .option('--neutral_color <color>', 'Color to use for the other parts', '#a3a3a3')
    .option('--part_color <color>', 'Color to use for the part of interest',  '#42bc67' /* #dc3912 */)
    .option('--connected_color <color>', 'Color to use for connected parts', '#9999ee')
    .option('--obb_color <color>', 'Color to use for visualizing the obb', '#000000')
    .option('--static_opacity <amount>', 'Amount of opacity to have for the non-moving parts (from 0 to 1)')
    .optionGroups(['config_file', 'render_options'])
    .parse(process.argv);

const PartsLoader = STK.articulations.PartsLoader;

function createRenderer() {
    const use_ambient_occlusion = (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type !== 'edl');
    const renderer = new STK.PNGRenderer({
        width: cmd.width,
        height: cmd.height,
        useAmbientOcclusion: cmd.encode_index? false : use_ambient_occlusion,
        useEDLShader: (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type === 'edl'),
        useOutlineShader: cmd.encode_index? false : cmd.use_outline_shader,
        ambientOcclusionOptions: {
            type: use_ambient_occlusion? cmd.ambient_occlusion_type : undefined
        },
        outlineColor: cmd.encode_index? false : cmd.outline_color,
        usePhysicalLights: cmd.encode_index ? false : cmd.use_physical_lights,
        useShadows: cmd.encode_index? false : cmd.use_shadows,
        compress: cmd.compress_png,
        skip_existing: cmd.skip_existing,
        reuseBuffers: true
    });
    return renderer;
}

function createCameraControls(renderer) {
    const cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
        type: 'perspective',
        fov: 50,
        near: 0.1*STK.Constants.metersToVirtualUnit,
        far: 400*STK.Constants.metersToVirtualUnit
    });
    const camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
    const cameraControls = new STK.controls.CameraControls({
        camera: camera,
        container: renderer.canvas,
        controlType: 'none',
        cameraPositionStrategy: 'positionByCentroid' //'positionByCentroid'
    });
    return cameraControls;
}

function createScene(camera) {
    const scene = new THREE.Scene();
    scene.add(camera);
    if (cmd.use_directional_lights) {
        STK.gfx.Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
    } else {
        const light = STK.gfx.Lights.getDefaultHemisphereLight(cmd.use_physical_lights, cmd.use_lights);
        scene.add(light);
    }
    return scene;
}

function setupScene(scene, modelId, parts, cameraControls) {
    const object3D = new THREE.Group();
    for (let part of parts) {
        if (part) {
            object3D.add(part.object3D);
        }
    }

    const group = new THREE.Group();
    const debugNode = new THREE.Group();
    debugNode.name = 'DebugNode';
    group.add(debugNode);
    group.add(object3D);

    const assetInfo = assetManager.getLoadModelInfo(null, modelId);
    if (assetInfo != null) {
        const front = STK.assets.AssetGroups.getDefaultFront(assetInfo);
        const up = STK.assets.AssetGroups.getDefaultUp(assetInfo);
        STK.geo.Object3DUtil.alignToUpFrontAxes(group, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
    }

    scene.add(group);
    scene.updateMatrixWorld();
    const sceneBBox = STK.geo.Object3DUtil.getBoundingBox(object3D);
    cameraControls.viewTarget({
        targetBBox: sceneBBox, distanceScale: 1.5,
        phi: -Math.PI / 4,
        theta: Math.PI / 6,
    });
    return {
        scene: scene,
        assetInfo: assetInfo,
        debugNode: debugNode,
        object3D: object3D
    }
}

const highlightMaterial = STK.geo.Object3DUtil.getSimpleFalseColorMaterial(1, cmd.part_color);
const connectedMaterial = STK.geo.Object3DUtil.getSimpleFalseColorMaterial(2, cmd.connected_color);
const obbMaterial = STK.geo.Object3DUtil.getSimpleFalseColorMaterial(3, cmd.obb_color);

const neutralMaterial = STK.geo.Object3DUtil.getSimpleFalseColorMaterial(0, cmd.neutral_color);
if (cmd.static_opacity != null && cmd.static_opacity < 1) {
    STK.materials.Materials.setMaterialOpacity(neutralMaterial,  cmd.static_opacity);
}


const renderer = createRenderer();
const cameraControls = createCameraControls(renderer);
const scene = createScene(cameraControls.camera);
const useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
const assetManager = new STK.assets.AssetManager({
    autoScaleModels: false,
    autoAlignModels: false,
    supportArticulated: true,
    useSearchController: useSearchController? new STK.search.BasicSearchController() : null });

function renderPart(sceneInfo, part, pngfile, renderOpts, cb) {
    const scene = sceneInfo.scene;
    const debugNode = sceneInfo.debugNode;
    STK.geo.Object3DUtil.removeAllChildren(debugNode);
    STK.geo.Object3DUtil.setMaterial(sceneInfo.object3D, neutralMaterial);
    if (renderOpts.showConnected) {
        const connectedParts = sceneInfo.connectivityGraph.getConnectedParts(part);
        //console.log('got num parts', connectedParts.length);
        connectedParts.forEach(p => STK.geo.Object3DUtil.setMaterial(p.object3D, connectedMaterial));
    }
    STK.geo.Object3DUtil.setMaterial(part.object3D, highlightMaterial);
    if (renderOpts.showObb && part.obb) {
        const obbNode = new STK.geo.MeshHelpers.OBB(part.obb, obbMaterial).toWireFrame(0.01);
        debugNode.add(obbNode);
    }
    renderer.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);
    cb();
}

function renderParts(modelId, partData, output_dir, options) {
    shell.mkdir('-p', output_dir);
    console.log(`Rendering ${partData.parts.length} parts`);
    const sceneInfo = setupScene(scene, modelId, partData.parts, cameraControls);
    sceneInfo.parts = partData.parts;
    sceneInfo.connectivityGraph = partData.connectivityGraph;
    const renderOpts = { showObb: options.show_obb, showConnected: options.show_connected };
    async.mapSeries(partData.parts, (part, cb) => {
        if (part) {
            renderPart(sceneInfo, part, output_dir + '/' + part.pid + '.png', renderOpts, cb);
        } else {
            cb();
        }
    }, (err, res) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Finished rendering parts');
        }
    });
}

function renderWithFullId(modelId, output_filename, options) {
    const source = modelId.split('.')[0];
    STK.assets.registerAssetGroupsSync({ assetSources: [source] });
    const partsLoader = new PartsLoader({assetManager: assetManager });
    partsLoader.lookupPartsInfo(modelId, 'articulation-parts', (err, partsInfo) => {
        if (err) {
            console.error('Error locating articulation-parts for ' + modelId, err);
        } else {
            partsLoader.loadPartsWithConnectivityGraph(modelId, partsInfo, { discardHierarchy: true },function(err, partData) {
                if (err) {
                    console.error(`Error loading parts fullId=${modelId}`, err);
                } else {
                    STK.util.waitImagesLoaded(() =>
                        renderParts(modelId, partData, output_filename, options));
                }
            });
        }
    });
}

if (cmd.output != null) {
    renderWithFullId(cmd.id, cmd.output, cmd);
} else {
    console.error("Please specify --output");
}
