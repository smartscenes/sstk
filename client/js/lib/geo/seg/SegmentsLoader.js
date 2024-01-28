var _ = require('util/util');

// Loader for loading a variety of segmentation formats
function SegmentsLoader() {
}

SegmentsLoader.prototype.getSegmentInfo = function(modelInstance, segmentType) {
  // Segments info not specified, get segment info associated with model
  if (modelInstance && modelInstance.model.info) {
    var info = modelInstance.model.info;
    var segmentsInfo = _.cloneDeepWithReplaceVars(info[segmentType], info, {optionalPrefix: 'vars'});
    if (!segmentsInfo) {
      return { error: 'No segments for model ' + info.fullId + ' ' + segmentType };
    } else {
      return segmentsInfo;
    }
  } else {
    return { error: 'No model or model info when attempting to load segments' };
  }
};

SegmentsLoader.prototype.__loadJsonSegmentation = function(file, segmentsDataField, segmentsInfo, callback) {
  _.getJSON(file)
    .done((data) => callback(null,
      { field: segmentsDataField, format: segmentsInfo['format'],  data: data, segmentsInfo: segmentsInfo}))
    .fail(callback);
};

SegmentsLoader.prototype.__loadSegmentGroups = function(files, segmentsDataField, segmentsInfo, callback) {
  // surfaces are put in separate files - labeled is separate from the unlabeled
  if (files['segments']) {
    //console.log('segments: ' + files['segments']);
    _.getJSON(files['segments'])
      .done(function (segments) {
        //console.log('segmentGroups: ' + files['segmentGroups']);
        var res = { field: segmentsDataField, format: segmentsInfo['format'], data: segments, segmentsInfo: segmentsInfo };
        if (files['segmentGroups']) {
          _.getJSON(files['segmentGroups'])
            .done(
              function (segmentGroups) {
                // merge segments with segmentGroups
                var data = _.defaults(new Object(null), segmentGroups, segments);
                //console.log(data);
                res.data = data;
                res.segmentGroupsData = segmentGroups;
                callback(null, res);
              })
            .fail(function () {
              callback(null, res);
            });
        } else {
          callback(null, res);
        }
      })
      .fail(callback);
  } else {
    callback('Error loading segments: expected segments files');
  }
};

SegmentsLoader.prototype.__loadSegmentationWithAnnotation = function(files, segmentsDataField, segmentsInfo, callback) {
  if (files['segmentation']) {
    _.getJSON(files['segmentation'])
      .done(function (data) {
        var res = { field: segmentsDataField, format: segmentsInfo['format'], data: data, segmentsInfo: segmentsInfo };
        if (files['annotation']) {
          _.getJSON(files['annotation'])
            .done(function (annotation) {
              res.annotation = annotation;
              callback(null, res);
            })
            .fail(callback);
        } else {
          callback(null, res);
        }
      })
      .fail(callback);
  } else {
    callback('Error loading segmentation: expected segmentation file');
  }
};

/**
 * Load segments
 * @param segmentsInfo segment information
 * @param opts Additional options
 * @param [opts.segmentsDataField] {string} (default='surface')
 * @param callback
 * @private
 */
SegmentsLoader.prototype.loadSegments = function (segmentsInfo, opts, callback) {
  if (segmentsInfo) {
    var segmentsDataField = segmentsInfo['field'] || opts.segmentsDataField || 'surface';
    if (typeof segmentsInfo === 'string') {
      this.__loadJsonSegmentation(segmentsInfo, segmentsDataField, {file: segmentsInfo, format: 'trimesh'}, callback);
    } else if (segmentsInfo['files']) {
      var files = segmentsInfo['files'];
      if (segmentsInfo['format'] === 'segmentGroups') {
        this.__loadSegmentGroups(files, segmentsDataField, segmentsInfo, callback);
      } else if (files['segmentation']) {
        this.__loadSegmentationWithAnnotation(files, segmentsDataField, segmentsInfo, callback);
      } else if (segmentsInfo.partType != null) {
        var partsFile = segmentsInfo['files']['parts'];
        this.__loadJsonSegmentation(partsFile, segmentsDataField, segmentsInfo, callback);
      } else {
        throw Error('Error loading segment - unsupported format ' + segmentsInfo['format']);
      }
    } else if (segmentsInfo['file']) {
      var file = segmentsInfo['file'];
      if (segmentsInfo['format'] === 'indexedSegmentation') {
        this.__loadJsonSegmentation(file, segmentsDataField, segmentsInfo, callback);
      } else {
        if (segmentsInfo['format'] == null && segmentsInfo.partType == null) {
          segmentsInfo = _.defaults({'format': 'trimesh'}, segmentsInfo);  // have trimesh be the default format
        }
        this.__loadJsonSegmentation(file, segmentsDataField, segmentsInfo, callback);
      }
    }
  } else {
    callback('Error loading segments');
  }
};

module.exports = SegmentsLoader;

