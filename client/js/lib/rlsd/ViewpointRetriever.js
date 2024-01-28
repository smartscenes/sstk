const Viewpoint = require('rlsd/Viewpoint');
const async = require('async');

class ViewpointRetriever {
  constructor(params) {
    if (params) {
      this.assetManager = params.assetManager;
      this.query = params.query;
      this.source = params.source;
      this.debug = true;
      this.sort = params.sort;
    }
  }

  retrieveViewpoints(task, callback) {
    const scope = this;
    this.assetManager.queryAssetGroup({
      source: scope.source,
      query: scope.query,
      start: 0,
      limit: 10000
    }, function (err, res) {
      if (err) {
        callback(err);
      } else {
        const items = res.response.docs;
        // convert view point
        const allViewpoints = items.map((item) => {
          const viewPointData = scope.assetManager.getAssetInfo(item.fullId);
          const viewpoint = new Viewpoint(viewPointData.id);
          viewpoint.instanceUrl = viewPointData.instanceImage.path;
          viewpoint.rgbUrl = viewPointData.rgbImage.path;
          // viewpoint.semanticUrl = viewPointData.semanticImage.path;
          viewpoint.cameraInfoUrl = viewPointData.cameraInfo.path;
          viewpoint.roomId = viewPointData.roomId;
          return viewpoint;
        });

        console.log({"AllViewpoints": allViewpoints});
        let viewpoints = allViewpoints;
        if (task && task.assignedViewpoints) {
          // Filter viewpoints assigned to the task
          const availableViewpointMap = new Map();
          allViewpoints.forEach((viewpoint) => {
            availableViewpointMap.set(viewpoint.id, viewpoint);
          });
          viewpoints = [];
          task.assignedViewpoints.forEach(viewpointAssignment => {
            const candidateViewpoint = availableViewpointMap.get(viewpointAssignment.viewpointId).clone();
            candidateViewpoint.taskViewpointAssignment = viewpointAssignment;
            viewpoints.push(candidateViewpoint);
          });
          // TODO: Implement filtering of assigned masks. We might have to do this at a latter stage.
          console.log({filter: task.assignedViewpoints, viewpoints: viewpoints});
        }
        if (scope.sort) {
          viewpoints = scope.sort(viewpoints);
        }
        async.forEach(viewpoints,
          (viewpoint, cb) => {
            viewpoint.loadCameraInfo(cb);
          },
          function(err, results) {
            callback(err, viewpoints);
          }
        );
      }
    });
  }

}

module.exports = ViewpointRetriever;