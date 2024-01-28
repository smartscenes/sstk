const ModelInstanceVoxels = require('model/ModelInstanceVoxels');
const SceneRawVoxels = require('scene/SceneRawVoxels');
const UIUtil = require('ui/UIUtil');
const _ = require('util/util');

class CreateVoxelsForm {
  constructor(params)
  {
    this.callbacks = {
      warn: params.warn,
      onVoxelsCreated: params.onVoxelsCreated
    };
    this.__config = _.defaults(params.config || {}, {
      // voxelization parameters
      voxelsField: 'none',
      downsampleBy: 1,
      numSamples: 100000,
      samplesPerVoxel: 0,
      useFixedVoxelSize: false,
      dim: 32,
      voxelSize: 0.10,
      limitToVisible: true,
      useTwoPass: true,
      center: true,
      useMaterialScores: true,
      // other parameters
      exportToFile: false
    });
  }

  show(tgtModelInst) {
    // Requires special bootbox with form support
    const questions = [
      {
        "title": "Voxels to use",
        "name": "voxelsField",
        "inputType": "select",
        "inputOptions": _.map(['none', 'voxels-surface', 'voxels-solid'], function(x) { return { text: x, value: x }; }),
        "value": this.__config.voxelsField
      },
      {
        "title": "Number of samples",
        "name": "numSamples",
        "inputType": "number",
        "value": this.__config.numSamples
      },
      {
        "title": "Number of samples to ensure for each voxel (used when working with existing voxelization)",
        "name": "samplesPerVoxel",
        "inputType": "number",
        "value": this.__config.samplesPerVoxel,
        "activeOnlyIf": function(x) { return x.voxelsField === 'none'; }
      },
      {
        "title": "Use fixed voxel size",
        "name": "useFixedVoxelSize",
        "inputType": "boolean",
        "value": this.__config.useFixedVoxelSize
      },
      {
        "title": "Resolution (if not using fixed voxel size)",
        "name": "dim",
        "inputType": "number",
        "value": this.__config.dim,
        "activeOnlyIf": function(x) { return !x.useFixedVoxelSize; }
      },
      {
        "title": "Voxel size (if using fixed voxel size)",
        "name": "voxelSize",
        "inputType": "number",
        "value": this.__config.voxelSize,
        "activeOnlyIf": function(x) { return x.useFixedVoxelSize; }
      },
      {
        "title": "Downsample by",
        "name": "downsampleBy",
        "inputType": "number",
        "value": this.__config.downsampleBy
      },
      {
        "title": "Limit to visible triangles",
        "name": "limitToVisible",
        "inputType": "boolean",
        "value": this.__config.limitToVisible
      },
      {
        "title": "Use two pass",
        "name": "useTwoPass",
        "inputType": "boolean",
        "value": this.__config.useTwoPass
      },
      {
        "title": "Export NRRD",
        "name": "exportToFile",
        "inputType": "boolean",
        "value": this.__config.exportToFile
      }
    ];
    const dialog = bootbox.form({
      title: 'Create voxels',
      inputs: questions,
      callback: (results) => {
        if (results) {
          _.each(questions, (q,i) => {
            this.__config[q.name] = results[i];
          });
          UIUtil.addWaitingMessageToForm(dialog);
          this.createVoxels(tgtModelInst, this.__config);
        }
      }
    });
  }

  createVoxels(target, opts) {
    console.log('createVoxels', opts);
    if (target.type === 'ModelInstance') {
      target.voxels = new ModelInstanceVoxels({name: 'custom-voxels', voxelsField: opts.voxelsField});
      target.voxels.init(target);
      target.voxels.createColorVoxels(opts, (colorVoxels) => {
        if (opts.exportToFile) {
          const NRRDExporter = require('exporters/NRRDExporter');
          const nrrdexp = new NRRDExporter();
          nrrdexp.export(colorVoxels.getVoxelGrid(), {content: target.model.info.fullId + '_rgb.vox', name: target.model.info.fullId});
        }
        this.callbacks.onVoxelsCreated(colorVoxels);
      });
    } else if (target.type === 'SceneState') {
      target.voxels = new SceneRawVoxels({name: 'custom-voxels', voxelsField: opts.voxelsField});
      target.voxels.init(target, true);
      target.voxels.createColorVoxels(opts, (colorVoxels) => {
        if (opts.exportToFile) {
          const NRRDExporter = require('exporters/NRRDExporter');
          const nrrdexp = new NRRDExporter();
          nrrdexp.export(colorVoxels.getVoxelGrid(), {content: target.info.fullId + '_rgb.vox', name: target.info.fullId});
        }
        this.callbacks.onVoxelsCreated(colorVoxels);
      });
    } else {
      if (this.callbacks.warn) {
        this.callbacks.warn('Cannot voxelize unsupported object type');
      }
      console.warn('Cannot voxelize unsupported object type', target);
      return;
    }
  }

}

module.exports = CreateVoxelsForm;
