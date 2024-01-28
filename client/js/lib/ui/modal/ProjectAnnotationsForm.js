const FileUtil = require('io/FileUtil');
const PairAlignmentJsonLoader = require('loaders/PairAlignmentJsonLoader');
const ProjectAnnotations = require('geo/ProjectAnnotations');
const SegmentedPartsLoader = require('articulations/SegmentedPartsLoader');
const UIUtil = require('ui/UIUtil');
const async = require('async');
const _ = require('util/util');

class ProjectAnnotationsForm {
  constructor(params)
  {
    this.assetManager = params.assetManager;
    this.callbacks = {
      warn: params.warn,
      onProjected: params.onProjected
    };
    this.allowExtraOptions = params.allowExtraOptions;
    this.useAlignments = params.useAlignments;
    this.__config = _.defaults(params.config || {}, {
      // What to propagate from
      sourceModelId: null,  // required
      sourceMeshName: 'textured',
      sourceAnnotationPath: 'articulation-parts',
      sourceAlignmentPath: this.useAlignments? 'alignment-to-ref' : null,
      targetAlignmentPath: this.useAlignments? 'alignment-to-ref' : null,
      sourceAnnotationData: null,
      // propagation parameters
      maxDist: Infinity,
      // what to do after the propagation
      createSegmented: this.allowExtraOptions,
      exportProjected: this.allowExtraOptions
    });
  }

  show(tgtModelInst, callback) {
    const questions = [
      {
        'title': 'Source Model',
        'name': 'sourceModelId',
        'inputType': 'text',
        'value': this.__config.sourceModelId
      },
      {
        'title': 'Source Mesh Name',
        'name': 'sourceMeshName',
        'inputType': 'text',
        'value': this.__config.sourceMeshName
      }];
    if (!this.__config.sourceAnnotationData) {
      questions.push({
        'title': 'Source Annotation',
        'name': 'sourceAnnotationPath',
        'inputType': 'text',
        'value': this.__config.sourceAnnotationPath
      });
    }
    if (this.useAlignments) {
      questions.push({
        'title': 'Source Alignment',
        'name': 'sourceAlignmentPath',
        'inputType': 'text',
        'value': this.__config.sourceAlignmentPath
      });
      questions.push({
        'title': 'Target Alignment',
        'name': 'targetAlignmentPath',
        'inputType': 'text',
        'value': this.__config.targetAlignmentPath
      });
    }
    questions.push({
        'title': 'Max Distance',
        'name': 'maxDist',
        'inputType': 'number',
        'value': this.__config.maxDist
    });
    if (this.allowExtraOptions) {
      questions.push({
        'title': 'Create segmented',
        'name': 'createSegmented',
        'inputType': 'boolean',
        'value': this.__config.createSegmented
      });
      questions.push({
        'title': 'Export Projected Annotation',
        'name': 'exportProjected',
        'inputType': 'boolean',
        'value': this.__config.exportProjected
      });
    }
    const dialog = bootbox.form({
      title: 'Project Annotation',
      inputs: questions,
      callback: (results) => {
        if (results) {
          _.each(questions, (q,i) => {
            this.__config[q.name] = results[i];
          });
          UIUtil.addWaitingMessageToForm(dialog);
          this.project(tgtModelInst, this.__config, (err, res) => {
            dialog.modal('hide');
            if (callback) {
              callback(err, res);
            }
          });
          return false;
        }
      }
    });
  }

  project(tgtModelInst, opts, callback) {
    callback = callback || function() {};
    this.assetManager.lookupModelInfo(null, opts.sourceModelId, (modelInfo) => {
      this.__projectWithModelInfo(tgtModelInst, modelInfo, opts, callback);
    });
  }

  __loadAnnotationData(modelInfo, annotationPath, cb) {
    // load sourceAnnotation from path
    let path = annotationPath;
    if (modelInfo && modelInfo[path]) {
      // Treat this as part field
      const path2 = _.get(modelInfo, [path, 'files', 'parts']);
      if (path2 != null) {
        path = path2;
      }
    }
    _.getJSON(path, cb);
  }

  __loadAlignments(modelInfo, alignmentPath, cb) {
    let path = alignmentPath;
    if (modelInfo && modelInfo[path]) {
      // Treat this as part field
      const path2 = _.get(modelInfo, [path, 'file']);
      if (path2 != null) {
        path = path2;
      }
    }
    const loader = new PairAlignmentJsonLoader({ fs: FileUtil });
    loader.load(path, (err, res) => {
      if (res) {
        res.sourceId = modelInfo.id;
        res.alignments.forEach(a => {
          a.sourceId = modelInfo.id;
        });
      }
      cb(err, res);
    });
  }

  __populateTransforms(srcModelId, tgtModelId, srcAlignments, tgtAlignments, opts) {
    opts.srcTransform = null;
    opts.tgtTransform = null;
    const srcAlignmentsByTgtId = srcAlignments? _.keyBy(srcAlignments.alignments, a => a.targetId) : {};
    const tgtAlignmentsByTgtId = tgtAlignments? _.keyBy(tgtAlignments.alignments, a => a.targetId) : {};
    if (srcAlignmentsByTgtId[tgtModelId]) {
      const alignment = srcAlignmentsByTgtId[tgtModelId];
      console.assert(alignment.sourceId === srcModelId);
      console.log('use source alignment', alignment);
      opts.srcTransform = alignment.s2tMatrix;
    } else if (tgtAlignmentsByTgtId[srcModelId]) {
      const alignment = tgtAlignmentsByTgtId[srcModelId];
      console.assert(alignment.sourceId === tgtModelId);
      console.log('use target alignment', alignment);
      opts.tgtTransform = alignment.s2tMatrix;
    } else {
      const keys1 = Object.keys(srcAlignmentsByTgtId);
      for (let refId of keys1) {
        if (tgtAlignmentsByTgtId[refId]) {
          // overlap
          const srcAlignment = srcAlignmentsByTgtId[refId];
          console.assert(srcAlignment.sourceId === srcModelId);
          console.log('use source alignment', srcAlignment);
          opts.srcTransform = srcAlignment.s2tMatrix;
          const tgtAlignment = tgtAlignmentsByTgtId[refId];
          console.assert(tgtAlignment.sourceId === tgtModelId);
          console.log('use target alignment', tgtAlignment);
          opts.tgtTransform = tgtAlignment.s2tMatrix;
          break;
        }
      }
    }
    return (opts.srcTransform || opts.tgtTransform);
  }

  __projectWithModelInfo(tgtModelInst, srcModelInfo, opts, callback) {
    console.log('project annotations', opts);
    console.time('projectAnnotationLoadSource');
    const tgtModelInfo = tgtModelInst.model.info;
    // console.log(srcModelInfo, tgtModelInfo);
    let warned = false;
    async.parallel([
      (cb) => {
        // Load model
        this.assetManager.loadModel({ fullId: opts.sourceModelId, format: opts.sourceMeshName }, (err, res) => {
          if (err) {
            this.callbacks.warn('Error loading source model for projection');
            warned = true;
          }
          cb(err, res);
        });
      },
      (cb) => {
        // Get source annotation
        if (opts.sourceAnnotationData) {
          cb(null, opts.sourceAnnotationData);
        } else {
          // load sourceAnnotation from path
          this.__loadAnnotationData(srcModelInfo, opts.sourceAnnotationPath,(err, res) => {
            if (err) {
              this.callbacks.warn('Error loading part annotations for projection');
              warned = true;
            }
            cb(err, res);
          });
        }
      },
      (cb) => {
        // Get source alignment
        if (opts.sourceAlignmentPath) {
          this.__loadAlignments(srcModelInfo, opts.sourceAlignmentPath, (err, res) => {
            if (err) {
              this.callbacks.warn('Error loading source alignment for projection');
              console.warn('Error loading source alignment for projection', err);
            }
            // Don't pass on err
            cb(null, res);
          });
        } else {
          cb();
        }
      },
      (cb) => {
        // Get target alignment
        if (opts.targetAlignmentPath) {
          this.__loadAlignments(tgtModelInfo, opts.targetAlignmentPath, (err, res) => {
            if (err) {
              this.callbacks.warn('Error loading target alignment for projection');
              console.warn('Error loading target alignment for projection', err);
            }
            // Don't pass on err
            cb(null, res);
          });
        } else {
          cb();
        }
      }], (err, res) => {
        console.timeEnd('projectAnnotationLoadSource');
        if (err) {
          console.error('Error projecting annotations', err);
          if (!warned) {
            this.callbacks.warn('Error projecting annotations');
          }
          callback(err);
        } else {
          console.log('Project annotations', opts.sourceModelId);
          const srcModelInst = res[0];
          const srcAnns = res[1];
          const srcAlignments = res[2];
          const tgtAlignments = res[3];
          if (srcAlignments || tgtAlignments) {
            // populate alignments
            const populated = this.__populateTransforms(srcModelInfo.id, tgtModelInfo.id, srcAlignments, tgtAlignments, opts);
            if (!populated) {
              this.callbacks.warn('Cannot find common alignment');
              console.warn('Cannot find common alignment for ' + srcModelInfo.id + ' and ' + tgtModelInfo.id, srcAlignments, tgtAlignments);
            }
          }
          const projecter = new ProjectAnnotations();
          console.time('projectAnnotations');
          const projected = projecter.project(srcModelInst, tgtModelInst, srcAnns, opts);
          console.timeEnd('projectAnnotations');
          let segmented;
          if (opts.createSegmented) {
            const parts = SegmentedPartsLoader.segmentObject(tgtModelInst.object3D, projected.data.annotations);
            segmented = new THREE.Object3D();
            for (let part of parts) {
              segmented.add(part);
            }
          }
          if (opts.exportProjected) {
            FileUtil.saveJson(projected, projected.modelId + '.projected.parts.json');
          }
          this.callbacks.onProjected({
            segmented: segmented,
            annotations: projected
          });
          callback(err, {
            segmented: segmented,
            annotations: projected
          });
        }
    });
  }
}

module.exports = ProjectAnnotationsForm;
