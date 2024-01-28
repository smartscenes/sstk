// const FileUtil = require('io/FileUtil');
const ObjectSegmentator = require('geo/ObjectSegmentator');
const UIUtil = require('ui/UIUtil');
const _ = require('util/util');

class SegmentObjectForm {
  constructor(params)
  {
    this.segmentationMethods = params.segmentationMethods || ['clustering', 'connectivity', 'fwab-vert', 'fwab-tri'];
    this.callbacks = {
      onSegmented: params.onSegmented
    };
    this.__config = _.defaults(params.config || {}, {
      // segmentation parameters
      method: 'clustering',
      adjFaceNormSimThreshold: 0.9,
      segMinVerts: 10,   // for fwab segmentation
      colorWeight: 0.5,  // for fwab segmentation
      restrictToPlanarSurfaces: false,  // for clustering
      format: 'trimesh', // format to use for returning the segmentation
      // other parameters
      verbose: false,
      createSegmented: false,
      // exportSegmentation: this.allowExtraOptions
    });
  }

  show(tgtModelInst, cb) {
    const segmentationMethods = this.segmentationMethods;

    // Requires special bootbox with form support
    const questions = [
      {
        "title": "Method to use",
        "name": "method",
        "inputType": "select",
        "inputOptions": _.map(segmentationMethods, function(x) { return { text: x, value: x }; }),
        "value": this.__config.method
      },
      {
        "title": "Similarity",
        "name": "adjFaceNormSimThreshold",
        "inputType": "number",
        "value": this.__config.adjFaceNormSimThreshold
      },
      {
        "title": "Min vertices (used for fwab segmentation)",
        "name": "segMinVerts",
        "inputType": "number",
        "value": this.__config.segMinVerts
      },
      {
        "title": "Color weight (used for fwab segmentation)",
        "name": "colorWeight",
        "inputType": "number",
        "value": this.__config.colorWeight
      },
      {
        "title": "Planar surfaces (used for clustering segmentation)",
        "name": "restrictToPlanarSurfaces",
        "inputType": "boolean",
        "value": this.__config.restrictToPlanarSurfaces
      }
    ];
    const dialog = bootbox.form({
      title: 'Segment object',
      inputs: questions,
      callback: (results) => {
        if (results) {
          _.each(questions, (q,i) => {
            this.__config[q.name] = results[i];
          });
          UIUtil.addWaitingMessageToForm(dialog);
          this.segment(tgtModelInst, this.__config, cb);
        }
      }
    });
  }

  segment(tgtModelInst, opts, cb) {
    const segmentator = new ObjectSegmentator();
    opts.kthr = opts.adjFaceNormSimThreshold;  // TODO(MS): Unhack
    console.log('segmentModel with opts:', opts);
    if (opts.createSegmented) {
      let cloned = tgtModelInst.object3D.clone();
      cloned = segmentator.segmentObject(cloned, opts);
      this.callbacks.onSegmented(cloned);
    } else {
      let segmentation = segmentator.getSegmentation(tgtModelInst.object3D, opts);
      this.callbacks.onSegmented(segmentation);
    }
  }

}

module.exports = SegmentObjectForm;
