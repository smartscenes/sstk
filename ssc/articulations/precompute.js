#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.2';
const STK = require('../stk-ssc');
const _ = STK.util;
const cmd = require('commander');
cmd
  .version(VERSION)
  .description('Precompute necessary data for articulations project')
  .option('--id <id>', 'Full model id')
  .option('--model_filename <filename>', 'Model filename')
  .option('--parts_filename <filename>', 'Parts filename')
  .option('--output <filename>', 'Output filename')
  .option('--minDist <number>', 'Minimum distance to consider', 0.001)
  .option('--maxDist <number>', 'Maximum distance to consider', 0.05)
  .option('--minConnDist <number>', 'Minimum distance to consider for connectivity', 0.001)
  .option('--maxConnDist <number>', 'Maximum distance to consider for connectivity', 0.05)
  .option('--checkIntervening [flag]', 'Whether to check for intervening parts', STK.util.cmd.parseBoolean, false)
  .option('--useRelativeDist [flag]', 'Whether to use relative distances (as percentage of diagonal of bounding box)', STK.util.cmd.parseBoolean, false)
  .option('--force [flag]', 'Whether to force computation of distances and connectivity graph)', STK.util.cmd.parseBoolean, false)
  .option('--obbConstrainVertical [flag]', 'Whether to constrain obb to vertical', STK.util.cmd.parseBoolean, false)
  .option('--checkAABB [flag]', 'Whether to checkAABB', STK.util.cmd.parseBoolean, false)
  .option('--includeIntersectObbs [flag]', 'Whether to include intersection obb', STK.util.cmd.parseBoolean, false)
  .option('--upAxis <xyz>', 'What direction to use for up')
  .option('--loadPrecomputed [flag]', 'Load old precomputed information', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

const PartsLoader = STK.articulations.PartsLoader;
const ConnectivityGraphHelper = STK.articulations.ConnectivityGraphHelper;

function computeIntersectOBBs(parts, connectivityGraph, distanceMatrix, metadata, options) {
  // Need to convert to geometry...
  _.each(parts, p => {
    STK.geo.Object3DUtil.traverseMeshes(p, false, function (m) {
      m.geometry = STK.geo.GeometryUtil.toGeometry(m.geometry);
    });
  });
  const nsamples = 500;
  const intersectObbs = ConnectivityGraphHelper.computeIntersectObbs(
    parts,
    connectivityGraph,
    distanceMatrix,
    metadata.minConnDist,
    nsamples,
    (points) => {
      return STK.geo.OBBFitter.fitPointsOBB(points, {
        constrainVertical: options.obbConstrainVertical,
        checkAABB: options.checkAABB,
        upAxis: options.upAxis
      });
    });
  return _.mapValues(intersectObbs, (v) => v.toJSON());
}

function precompute(parts, output_filename, options) {
  console.log(`processing ${parts.parts.length} parts`);
  const dists = ['minDist', 'maxDist', 'minConnDist', 'maxConnDist'];
  const metadata = _.pick(options, _.concat(dists, ['useRelativeDist', 'obbConstrainVertical', 'checkAABB']));
  if (options.useRelativeDist) {
    const aabb = STK.geo.Object3DUtil.getBoundingBox(parts.parts.filter(x => x));
    const diag = aabb.dimensions().length();
    const relDists = _.pick(metadata, dists);
    _.each(dists, (d) => {
      metadata[d] = metadata[d] * diag;
    });
    metadata['relDists'] = relDists;
  }
  const exportedParts = parts.parts.map((p) => {
    var x = _.omit(p.userData, ['type', 'articulatablePartId', 'isArticulatedNode', 'partId']);
    var obb = STK.geo.OBBFitter.fitOBB(p, {
      constrainVertical: options.obbConstrainVertical,
      checkAABB: options.checkAABB,
      upAxis: options.upAxis,
      debug: true
    });
    if (obb) {
      x.obb = obb.toJSON();
    }
    return x;
  });
  if (options.precomputed) {
    console.log('Using precomputed')
    const intersectObbs = (options.includeIntersectObbs && !options.precomputed.intersectObbs)?
      computeIntersectOBBs(parts.parts, options.precomputed.connectivityGraph,
        options.precomputed.distanceMatrix, metadata, options) : options.precomputed.intersectObbs;
    const data = { version: VERSION, id: parts.id, annId: parts.annId,
      metadata: _.defaults(_.pick(options, ['obbConstrainVertical', 'checkAABB']), options.precomputed.metadata),
      parts: exportedParts,
      distanceMatrix: options.precomputed.distanceMatrix,
      connectivityGraph: options.precomputed.connectivityGraph,
      intersectObbs: intersectObbs
    };
    STK.fs.writeToFile(output_filename, JSON.stringify(data));
  } else if (parts.connectivityGraph && !options.force) {
    console.log('Using existing connectivityGraph')
    const data = { version: VERSION, id: parts.id, annId: parts.annId,
      metadata: metadata,
      parts: exportedParts,
      connectivityGraph: parts.connectivityGraph.toJson().connectivityGraph };
    STK.fs.writeToFile(output_filename, JSON.stringify(data));
  } else {
    console.log('Computing new connectivityGraph')
    const distances = ConnectivityGraphHelper.computeDistancesMatrixWithInfo(parts.parts, metadata.minDist, metadata.maxDist);
    const distanceMatrix = distances.distances;
    const closestPoints = distances.closestPoints;
    const checkInterveningFn = options.checkIntervening? ConnectivityGraphHelper.getCheckInterveningPartsFn(parts.parts, distanceMatrix, closestPoints): null;
    const connectivityGraph = ConnectivityGraphHelper.computeConnectedParts(parts.parts, distanceMatrix, metadata.minConnDist, metadata.maxConnDist, checkInterveningFn);
    const connectivityGraph2 = _.map(connectivityGraph, (x,i) => Array.from(x));
    const intersectObbs = (options.includeIntersectObbs)?
      computeIntersectObbs(parts.parts, connectivityGraph2, distanceMatrix, metadata, options) : null;
    const data = { version: VERSION, id: parts.id, annId: parts.annId,
      metadata: metadata,
      parts: exportedParts,
      distanceMatrix: distanceMatrix, connectivityGraph: connectivityGraph2, intersectObbs: intersectObbs };
    STK.fs.writeToFile(output_filename, JSON.stringify(data));
  }
}

function precomputeWithFiles(model_filename, parts_filename, output_filename, options) {
  PartsLoader.loadIndexedPartMeshes(model_filename, parts_filename, (err, parts) => {
    if (err) {
      console.error(`Error loading parts model=${model_filename} parts=${parts_filename}`, err);
    } else {
      precompute(parts, output_filename, options);
    }
  });
}

function precomputeWithFullId(modelId, output_filename, options) {
  const source = modelId.split('.')[0];
  STK.assets.registerAssetGroupsSync({ assetSources: [source]});
  const assetManager = new STK.assets.AssetManager({
    autoScaleModels: false, autoAlignModels: false, supportArticulated: true
  });
  const partsLoader = new PartsLoader({assetManager: assetManager});
  const loadOptions = { partsField: 'articulation-parts', discardHierarchy: true };
  partsLoader.loadPartMeshesById(modelId, loadOptions,(err, parts) => {
    if (err) {
      console.error(`Error loading parts fullId=${modelId}`, err);
    } else {
      if (options.upAxis == null) {
        const assetInfo = assetManager.getLoadModelInfo(null, modelId);
        if (assetInfo != null) {
          const up = STK.assets.AssetGroups.getDefaultUp(assetInfo);
          const upAxis = _.maxBy(['x', 'y', 'z'], i => up[i]);
          console.log('upAxis', upAxis);
          options.upAxis = upAxis;
        }
      }

      if (options.loadPrecomputed) {
        partsLoader.loadPartConnectivityGraphJson(modelId, loadOptions, (err, json) => {
          options.precomputed = json;
          precompute(parts, output_filename, options);
        });
      } else {
        precompute(parts, output_filename, options);
      }
    }
  });
}

if (cmd.parts_filename != null && cmd.model_filename != null) {
  if (cmd.output == null) {
    cmd.output = cmd.model_filename.replace('.obj', '.artpre.json');
  }
  precomputeWithFiles(cmd.model_filename, cmd.parts_filename, cmd.output, cmd)
} else {
  if (cmd.id.indexOf('.') >= 0) {
    if (cmd.output != null) {
      precomputeWithFullId(cmd.id, cmd.output, cmd);
    } else {
      console.error("Please specify --output");
    }
  } else {
      console.error("Please specify a full id of the form <source.id>");
  }
}
