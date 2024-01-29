#!/usr/bin/env node

const fs = require('fs');
const async = require('async');
const shell = require('shelljs');
const STK = require('./stk-ssc');
const _ = STK.util;

const cmd = require('./ssc-parseargs');
cmd
  .version('0.0.1')
  .description('Export part annotations')
  .option('--id <id>', 'Model id', STK.util.cmd.parseList, [])
  .option('--source <source>', 'Model source')
  .option('--format <format>', 'Format to use for loading model')
//  .option('--ann_type <type>', 'Annotation type', /^(raw|clean|aggr)$/)
  .option('-n, --ann_limit <num>', 'Limit on number of annotations to export', STK.util.cmd.parseInt, 1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--include_annId [flag]', 'Whether to include ann id in output filename', STK.util.cmd.parseBoolean, false)
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--remove_existing [flag]', 'Whether to remove existing directory', STK.util.cmd.parseBoolean, false)
  .option('--check_duplicate [flag]', 'Whether to check for duplicate parts', STK.util.cmd.parseBoolean, false)
  .option('--center_parts [position]', 'Whether to center parts', STK.util.cmd.parseVector(), false)
  .option('--export_meshes [flag]', 'Whether to export meshes', STK.util.cmd.parseBoolean, false)
  .option('--render_parts [flag]', 'Whether to render parts', STK.util.cmd.parseBoolean, false)
  .option('--render_dir <dir>', 'Directory to place renderings of what the extracted parts look like (no renderings if not specified)')
  .optionGroups(['config_file', 'render_options'])
  .parse(process.argv);
const argv = cmd;

// Parse arguments and initialize globals
const skip_existing = argv.skip_existing;
const remove_existing = argv.remove_existing;
const useSearchController = argv.render_parts;
const assetManager = new STK.assets.AssetManager(
  { autoAlignModels: false,
            autoScaleModels: false,
            searchController: useSearchController? new STK.search.BasicSearchController() : null
  });
let ids = argv.id;
STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source] });

const assetGroup = STK.assets.AssetGroups.getAssetGroup(argv.source);
const assetsDb = assetGroup? assetGroup.assetDb : null;
if (!assetsDb) {
  console.log('Unrecognized asset source ' + argv.source);
  return;
}

if (ids.indexOf('all') >= 0) {
  ids = assetsDb.getAssetIds().map(function (x) {
    return x.split('.', 2)[1];
  });
} else if (ids.indexOf('annotated') >= 0) {
  const annotationsUrl = STK.Constants.baseUrl + '/part-annotations/list?format=json&$columns=itemId';
  const data = STK.util.readSync(annotationsUrl);
  const itemIds = _.uniq(JSON.parse(data).map(function(x) { return x.itemId; })).filter(function(x) { return x; });
  ids = itemIds.map(function (x) {
    return x.split('.', 2)[1];
  });
} else {
  if (ids.length === 1 && ids[0].endsWith('.txt')) {
    // Read files form input file
    ids = STK.fs.readLines(ids[0]);
  }
}

//var source = argv.source;

const rendererOptions = cmd.getRendererOptions(cmd);
const lightingOptions = cmd.getLightingOptions(cmd);
const renderer = cmd.render_parts? new STK.PNGRenderer(rendererOptions) : null;

const segmentsType = 'part-annotations';
// if (argv.ann_type === 'raw') {
//   segmentsType = 'segment-annotations-raw';
// } else if (argv.ann_type === 'clean') {
//   segmentsType = 'segment-annotations-clean';
// }
const annNum = argv.ann_limit;
console.log('segmentsType is ' + segmentsType);

const segments = new STK.geo.Segments({ showNodeCallback: function (segmentedObject3D) { } },  segmentsType);

function loadModelInstance(loadInfo, cb) {
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    if (renderer && !lightingOptions.environment) {
      STK.gfx.SceneSetupHelper.getEnvMap(renderer, cmd.envmap).then(( { envMap } ) => {
        lightingOptions.environment = envMap;
        STK.util.waitImagesLoaded(() => cb(mInst));
      });
    } else {
      STK.util.waitImagesLoaded(() => cb(mInst));
    }
  });
}

function exportAnnotation(loadInfo, outdir, renderdir, callback) {
  console.log('export annotation for ' + loadInfo.annId);
  shell.mkdir('-p', outdir);
  loadModelInstance(loadInfo, function (mInst) {
    segments.init(mInst);
    mInst.model.info.annId = loadInfo.annId;
    segments.loadSegments(function (err, res) {
      // console.log('load segments', err, res);
      if (!err) {
        const id = loadInfo.id;
        const annId = loadInfo.annId;
        const annIndex = loadInfo.annIndex;
        let basename = id;
        if (argv.include_annId) {
          basename = (annId != undefined)? id + '_' + annIndex : id;
        } else {
          basename = (annIndex != undefined) ? id + '_' + annIndex : id;
        }
        const fullBasename = outdir + '/' + basename;

        if (segments.indexedSegmentation) {
          segments.indexedSegmentation.annId = loadInfo.annId;
          fs.writeFileSync(fullBasename + '.parts.json', JSON.stringify(segments.indexedSegmentation));
        } else if (segments.partsData) {
          const labeledParts = new STK.parts.LabeledParts(segments.segmentedObject3D, segments.partsData, segments.origObject3D);
          segments.partsData.stats = labeledParts.annotationStats.get('initial');
          fs.writeFileSync(fullBasename + '.parts.json', JSON.stringify(segments.partsData));
        } else {
          console.warn('no indexedSegmentation or partMeshes', segments);
        }
        // let's try to clean the userData
        cleanUserData(mInst, segments);
        const async_calls = [];
        const relPoint = (argv.center_parts === false)? null :
          ((argv.center_parts === true)? new THREE.Vector3(0.5, 0.5, 0.5) :
            STK.geo.Object3DUtil.toVector3(cmd.center_parts));
        if (argv.check_duplicate) {
          const dedupInfo = checkDuplicateAndAlign(segments);
          for (let label in dedupInfo) {
            const entries = dedupInfo[label];
            for (let entry of entries) {
              const refId = entry.reference.userData.pid;
              const nDup = entry.duplicates.length;
              console.log(`label ${label} with id ${refId} has ${nDup} duplicates`);
            }
          }
          if (argv.export_meshes) {
            const dedupObject3D = new THREE.Group();
            const partMeshes = [];
            const partsMetadata = [];
            for (let label in dedupInfo) {
              const entries = dedupInfo[label];
              for (let entry of entries) {
                const refPartMesh = entry.reference.clone();
                let innerTransform = null;
                if (argv.center_parts) {
                  innerTransform = centerMesh(refPartMesh, relPoint);
                }
                const refTransform = {
                  matrix: refPartMesh.matrix.toArray(),
                  position: refPartMesh.position.toArray(),
                  quaternion: refPartMesh.quaternion.toArray(),
                  scale: refPartMesh.scale.toArray()
                };
                const meshInfo = STK.geo.Object3DUtil.getObjectStats(refPartMesh);
                const refMetadata = {
                  "partId": refPartMesh.userData.pid,
                  "label": label,
                  'nmeshes': meshInfo.nmeshes,
                  "nvertices": meshInfo.nverts,
                  "nfaces": meshInfo.nfaces,
                  "transform": refTransform
                };
                partsMetadata.push(refMetadata);

                const dupPartIds = entry.duplicates.map(dup => dup.mesh.userData.pid);
                if (entry.duplicates.length) {
                  refMetadata.isRef = true;
                  refMetadata.refPartId = refPartMesh.userData.pid;
                  refMetadata.dupPartIds = dupPartIds;
                }

                // create object with transforms
                // const ref = entry.reference.clone();
                const ref = refPartMesh.clone();
                dedupObject3D.add(ref);
                for (let dup of entry.duplicates) {
                  // AM * DM (p2) = RM (p1)
                  const dupToRef = dup.alignmentMatrix;
                  const refToDup = dupToRef.clone().invert();
                  const dupMesh = ref.clone();
                  dupMesh.userData = dup.mesh.userData;
                  dupMesh.matrix.premultiply(refToDup);
                  dupMesh.matrix.decompose(dupMesh.position, dupMesh.quaternion, dupMesh.scale);
                  dupMesh.matrixWorldNeedsUpdate = true;
                  dedupObject3D.add(dupMesh);

                  const dupTransform = {
                    matrix: dupMesh.matrix.toArray(),
                    position: dupMesh.position.toArray(),
                    quaternion: dupMesh.quaternion.toArray(),
                    scale: dupMesh.scale.toArray()
                  };

                  partsMetadata.push({
                    "partId": dupMesh.userData.pid,
                    "label": label,
                    "nvertices": meshInfo.nverts,
                    "nfaces": meshInfo.nfaces,
                    "isRef": false,
                    "refPartId": ref.userData.pid,
                    "dupPartIds": dupPartIds,
                    "isMirrored": dup.isMirrored,
                    "alignedUsing": dup.alignedUsing,
                    "transform": dupTransform
                  });

                }
                // clear transform on refPartMesh that we will export
                STK.geo.Object3DUtil.clearTransform(refPartMesh);
                partMeshes.push(refPartMesh);
              }
            }
            dedupObject3D.updateMatrixWorld(true);
            fs.writeFileSync(fullBasename + '.parts.metadata.json', JSON.stringify({
              id: id,
              annId: annId,
              parts: partsMetadata
            }));
            async_calls.push(function(cb) {
              exportObject3D(dedupObject3D, outdir, basename + '_dedup', cb);
            });
            async_calls.push(
              function (cb) {
                exportPartMeshes(partMeshes, outdir, basename, cb);
              }
            );
          }
        } else {
          if (argv.center_parts) {
            centerMeshes(segments.partMeshes, relPoint);
          }
          if (argv.export_meshes) {
            async_calls.push(
              function (cb) {
                exportObject3D(segments.segmentedObject3D, outdir, basename, cb);
              }
            );
            async_calls.push(
              function (cb) {
                exportPartMeshes(segments.partMeshes, outdir, basename, cb);
              }
            );
          }
        }

        if (renderer) {
          shell.mkdir('-p', renderdir);
          const renderOutput = renderdir + '/' + basename;
          renderPartMeshes(renderer, renderOutput, mInst, segments.partMeshes);
        }

        if (async_calls.length) {
          async.series(async_calls, function(err, results) {
            callback(null, res);
          });
        } else {
          callback(null, res);
        }
      } else {
        console.error(err, res);
        callback(err, res);
      }
    });
  });
}

function centerMesh(mesh, relPoint) {
  const obb = STK.geo.Object3DUtil.getOrientedBoundingBox(mesh);
  const c = obb.getWorldPosition(relPoint);
  const centerTransform = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  mesh.geometry.applyMatrix4(centerTransform);
  mesh.matrix.multiply(centerTransform.invert());
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.updateMatrixWorld();
  STK.geo.Object3DUtil.clearCache(mesh);
  return centerTransform;
}

function centerMeshes(partMeshes, relPoint) {
  console.log('Center parts with relative point:', relPoint);
  for (let partMesh of partMeshes) {
    if (partMesh) {
      centerMesh(partMesh, relPoint);
    }
  }
}

function checkDuplicateAndAlign(segments) {
  const partsByLabel = _.groupBy(segments.partMeshes.filter(m => m), (partMesh) => {
    return partMesh.userData.semantics.label;
  });
  const dedupInfoByLabel = {};
  for (let label in partsByLabel) {
    // console.log('check label ', label);
    const partMeshes = partsByLabel[label];
    const deduplicated = STK.geo.MeshAligner.deduplicateAndAlign(partMeshes);
    dedupInfoByLabel[label] = deduplicated;
  }
  return dedupInfoByLabel;
}

function cleanUserData(mInst, segments) {
  segments.segmentedObject3D.userData.modelId = mInst.object3D.userData.modelId;
  if (segments.partMeshes) {
    // Seems the segmentedObject3D is by default not visible
    // STK.geo.Object3DUtil.setVisible(segments.segmentedObject3D, true, true);
    for (let partMesh of segments.partMeshes) {
      if (partMesh) {
        const u = partMesh.userData;
        partMesh.userData = {
          id: mInst.object3D.userData.modelId + '_' + u.pid,
          pid: u.pid,
          obb: u.obb,
          name: u.name,
          semantics: {
            label: u.label,
            type: u.type
          }
        };
        partMesh.geometry.userData = {};
      }
    }
  }
}

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

function exportPartMeshes(partMeshes, outdir, basename, callback) {
  if (partMeshes) {
    const exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
    async.forEachOfSeries(partMeshes, function (partMesh, index, cb) {
      if (partMesh) {
        const exportOpts = {
          dir: outdir,
          name: basename + '_part_' + partMesh.userData.pid,
          binary: true,
          embedImages: true,
          includeCustomExtensions: true,
          //includeNotVisible: true,
          callback: cb
        };
        console.log('export ' + basename + '_part_' + partMesh.userData.pid);
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

function renderPartMeshes(renderer, basename, asset, partMeshes) {
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

function processIds(ids, outdir, renderdir, format, doneCallback) {
  async.forEachSeries(ids, function (id, callback) {
    const mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    if (format != null) {
      mInfo.format = format;
    }
    const loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    const segmentsInfo = loadInfo[segmentsType];
    STK.util.clearCache();
    const basename = outdir + '/' + id;
    const local_renderdir = (renderdir != null)? renderdir + '/' + id : basename;
    console.log('skip_existing is ' + skip_existing);
    if (skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing output at: ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else if (segmentsInfo) {
      if (segmentsInfo.files && segmentsInfo.files.annIds) {
        console.log('fetching from ' + segmentsInfo.files.annIds);
        STK.util.getJSON(segmentsInfo.files.annIds)
          .done(function (data) {
            if (remove_existing) {
              if (fs.existsSync(basename)) {
                console.log('Remove existing directory', basename);
                fs.rmSync(basename, {recursive: true, force: true});
              }
            }
            shell.mkdir('-p', basename);
            data.forEach(function(x) {
              if (typeof x.data === 'string') {
                x.data = JSON.parse(x.data);
              }
            });
            fs.writeFileSync(basename + '/' + id + '.parts.anns.json', JSON.stringify(data));
            let annIds = data.map(function (rec) {
              return rec.id;
            });
            if (annNum > 0) {
              annIds = _.sortBy(annIds, function(id) { return -id; });
              annIds = _.take(annIds, annNum);
            } else {
              console.warn('No annotations for ' + id);
            }
            async.forEachOfSeries(annIds, function (annId, index, cb) {
              const loadInfoCopy = _.clone(loadInfo);
              loadInfoCopy.annId = annId;
              loadInfoCopy.annIndex = (annNum !== 1)? index : undefined;
              exportAnnotation(loadInfoCopy, basename, local_renderdir, cb);
            }, function (err, results) {
              callback(err, results);
            });
          })
          .fail(function (err) {
            callback(err, null);
          });
      } else {
        exportAnnotation(loadInfo, basename, local_renderdir, callback);
      }
    } else {
      setTimeout(function () { callback('No annotations for ' + id + ', segmentsType ' + segmentsType, null); }, 0);
    }
  }, function (err, results) {
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
  });
}

processIds(ids, argv.output_dir, argv.render_dir, argv.format);
