const STK = require("./stk-ssc");
const cmd = require("./ssc-parseargs");
const _ = STK.util;

const async = require('async');

function exportObject3D(object3D, outdir, basename, callback) {
  if (object3D) {
    const exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
    // Seems the segmentedObject3D is by default not visible
    STK.geo.Object3DUtil.setVisible(object3D, true, true);
    const exportOpts = {
      dir: outdir,
      name: basename,
      binary: true,
      embedImages: true,
      includeCustomExtensions: true,
      //includeNotVisible: true,
      callback: callback
    };
    console.log('export ' + basename);
    exporter.export(object3D, exportOpts);
  } else {
    callback();
  }
}

function exportPartMeshes(partMeshes, pidField, outdir, basename, callback) {
  if (partMeshes) {
    const exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
    async.forEachOfSeries(partMeshes, function (partMesh, index, cb) {
      if (partMesh) {
        const exportOpts = {
          dir: outdir,
          name: basename + '_part_' + partMesh.userData[pidField],
          binary: true,
          embedImages: true,
          includeCustomExtensions: true,
          //includeNotVisible: true,
          callback: cb
        };
        console.log('export ' + basename + '_part_' + partMesh.userData[pidField]);
        exporter.export(partMesh, exportOpts);
      } else {
        cb();
      }
    }, function() {
      callback();
    });
  } else {
    callback();
  }
}

function setView(cameraControls, object3D) {
  const bbox = STK.geo.Object3DUtil.getBoundingBox(object3D, true);
  // console.log('got bbox', bbox);
  cameraControls.viewTarget({
    targetBBox: bbox, distanceScale: 1.5,
    phi: -Math.PI / 4,
    theta: Math.PI / 6,
  });
}

function renderPartMeshes(renderer, lightingOptions, basename, asset, partMeshes) {
  console.log('render partMeshes', partMeshes.length);
  if (partMeshes) {
    const cameraControls = STK.gfx.SceneSetupHelper.createCameraControls(renderer, {
      width: cmd.width,
      height: cmd.height
    });
    const up = asset.model.getUp();
    const front = asset.model.getFront();
    // console.log('got up front', up, front);
    const scene = STK.gfx.SceneSetupHelper.createScene(cameraControls.camera, lightingOptions);
    // console.log('got lighting options', lightingOptions);
    const group = new THREE.Group();
    STK.geo.Object3DUtil.alignToUpFrontAxes(group, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
    scene.add(group);
    scene.environment = lightingOptions.environment;

    for (let partMesh of partMeshes) {
      if (partMesh) {
        const clone = partMesh.clone();
        group.add(clone);
        scene.updateMatrixWorld();
        const name = basename + '_part_' + partMesh.userData.pid;
        setView(cameraControls, scene);
        renderer.renderToPng(scene, cameraControls.camera, name + '.png', {});
        group.remove(clone);
      }
    }
  }
}

module.exports = {
  exportObject3D: exportObject3D,
  exportPartMeshes: exportPartMeshes,
  renderPartMeshes: renderPartMeshes
};

