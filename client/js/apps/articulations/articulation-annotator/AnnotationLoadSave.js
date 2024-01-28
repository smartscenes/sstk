const PartAnnotationMatcher = require('part-annotator/PartAnnotationMatcher');
const FileUtil = require('io/FileUtil');
const UIUtil = require('ui/UIUtil');
const _ = require('util/util');

// Helper class for managing loading and saving of annotations
class AnnotationLoadSave {
  constructor(params) {
    this.appId = params.appId;
    this.modelId = params.modelId;
    this.startFrom = params.startFrom;
    this.domHelper = params.domHelper;
    this.loadAnnotationsUrl = params.loadAnnotationsUrl;
    this.submitAnnotationsUrl = params.submitAnnotationsUrl;
    this.timings = params.timings;
    this.message = params.message;
    this.alert = params.alert;
    this.confirm = params.confirm;
    this.enforceArticulations = params.enforceArticulations;
    this.record = null;  // Last loaded annotation
    this.annotations = [];
    this.timingHistory = [];
  }

  // functions for loading and setting annotations
  setAnnotations(record) {
    console.log(record);
    if (record.notes != null && this.domHelper) {
      this.domHelper.setNotes(record.notes);
    }
    this.record = record;
    this.annotations = [];
    const data = record.data;
    const articulations = data.articulations || [];
    const groupedArticulations = _.groupBy(articulations || [], 'pid');
    _.each(groupedArticulations, (partArticulations, pid) => {
      this.annotations[pid] = partArticulations;
    });
    this.timingHistory = data.timingHistory || [];
    if (data.timings) {
      this.timingHistory.push(data.timings);
    }
  }

  clearAnnotations() {
    this.record = null;
    this.annotations = [];
    this.timingHistory = [];
  }

  __updateStateParts(loaded, state) {
    const fieldsToUpdate = ['group', 'geoms'];
    // check state.parts and loaded parts
    if (!loaded.parts) {
      return; // part information from loaded
    }
    if (loaded.partsAnnId == null) {
      console.warn('Unknown loaded part annotation id', loaded.partsAnnId);
    }
    if (state.partsAnnId == null) {
      console.warn('Unknown current part annotation id', state.partsAnnId);
    }
    if (loaded.partsAnnId === state.partsAnnId) {
      // part annotations match (can just transfer part info)
      console.assert(loaded.parts.length === state.parts.length);
      for (let i = 0; i < loaded.parts.length; i++) {
        if (loaded.parts[i]) {
          // TODO: do we check the name or the label?  we saved the label...
          console.assert(loaded.parts[i].label === state.parts[i].label);
          for (let field of fieldsToUpdate) {
            if (loaded.parts[i][field] !== undefined) {
              state.parts[i][field] = loaded.parts[i][field];
            }
          }
        }
      }
    } else {
      // try to match parts to part names
      this.message('Part annotations does not match annotated articulation parts.  Please check carefully.', 'alert-danger');
      console.warn('Loaded annotation is for part annotations ' + loaded.partsAnnId
        + ', currently using part annotations ' + state.partsAnnId);
      const partAnnotationMatcher = new PartAnnotationMatcher();
      const matchedInfo = partAnnotationMatcher.checkMatchByLabel(loaded.parts, state.parts, 'pid', fieldsToUpdate);
      return matchedInfo;
    }
  }

  __updateStateConnectivity(loaded, state) {
    // set state connectivity from loaded connectivity
    if (loaded.connectivity) {
      state.currentConnectivityGraph.setConnectivityFromArray(loaded.connectivity);
    }
  }

  getCheckedAnnotations(parts, remapPartsInfo, anns) {
    if (!anns) {
      anns = this.annotations;
    }
    if (anns) {
      const filteredAnnotations = [];
      // TODO: use remapPartsInfo
      for (let i = 0; i < parts.length; i++) {
        filteredAnnotations[i] = anns[i];
      }
      if (anns.length > parts.length) {
        console.warn('Ignoring annotation for parts ' + parts.length + ' to ' + (anns.length - 1));
      }
      return filteredAnnotations;
    }
  }

  updateState(state) {
    // update state with annotations
    if (this.record) {
      const remapInfo = this.__updateStateParts(this.record.data, state);
      state.annotations = this.getCheckedAnnotations(state.parts, remapInfo);
      this.__updateStateConnectivity(this.record.data, state);
    }
  }

  __loadAnnotationsFromFile(data, options) {
    console.log('loaded from file', data, options);
    if (data.modelId !== this.modelId) {
      this.message('Model id does not match!', 'alert-danger');
      if (options.callback) { options.callback('Model id does not match!'); }
      return;
    }
    if (!data.data && data.annotation) {
      data.data = data.annotation;
      delete data.annotation;
    }
    this.setAnnotations(data);
    if (options.callback) {
      options.callback(null, {
        data: data,
        annotations: this.annotations,
        timingHistory: this.timingHistory
      });
    }
  }

  importAnnotations(cb) {
    UIUtil.popupFileInput(file => {
      this.loadAnnotationsFromFile({ file: file, callback: cb });
    });
  }

  loadAnnotationsFromFile(options) {
    FileUtil.readAsync(options.file || options.path, 'json', (err, data) => {
      if (err) {
        this.message('Error loading annotations');
        console.error('Error loading annotations', err);
        if (options.callback) { options.callback(err); }
      } else {
        this.__loadAnnotationsFromFile(data, options);
      }
    });
  }

  /**
   * Loads any existing annotations from database
   */
  loadAnnotationsFromDb(cb) {
    $.ajax({
      url: this.loadAnnotationsUrl,
      method: 'GET',
      data: {
        modelId: this.modelId,
      },
      success: ((record) => {
        if (record) {
          this.setAnnotations(record);
        }
        cb(null, record);
      }),
      error: ((err) => {
        console.warn("Error fetching annotations", err);
        cb(err);
      }),
    });
  }

  loadStartingAnnotations(cb) {
    if (this.startFrom === 'none') {
      this.clearAnnotations();
      cb(null, null);
    } else {
      // use default of startFrom latest
      this.loadAnnotationsFromDb(cb);
    }
  }

  // Functions for exporting and submitting annotation
  exportAnnotations(state) {
    this.timings.mark('annotationSave');
    const filename = this.modelId + '.articulations.json';
    this.authenticate(() => {
      const data = this.getAnnotationsJson(state);
      FileUtil.saveJson(data, filename);
    });
  }

  getAnnotationsJson(state) {
    // TODO: Account for alignment
    const articulations = state.getArticulations();
    const parts = state.parts.map((p) => {
      return {
        pid: p.pid,
        label: p.label,
        group: p.group,
        geoms: (p.geoms && p.geoms.length)? p.geoms.map(x => {
          return {
            spec: x.spec,
            shape: x.object3D ? { shape: x.object3D.userData.shape, parameters: x.object3D.userData.shapeParameters } : undefined
          };
        }) : undefined
      };
    });
    const notes = this.domHelper.getNotes();
    const initialConnectivity = state.initialConnectivityGraph.connectivityAsArray();
    const connectivity = state.currentConnectivityGraph.connectivityAsArray();

    const data = {
      appId: this.appId,
      workerId: this.userId,
      modelId: this.modelId,
      annotation: {
        partsAnnId: state.partsAnnId,
        parts: parts,
        connectivity: connectivity,
        articulations: articulations,
        notes: notes,
        initConnectivity: initialConnectivity,
        timings: this.timings.toJson(),
        timingHistory: this.timingHistory
      }
    };
    return data;
  }

  __checkAndProceed(state, next) {
    const msg = this.checkArticulationAnnotations(state.annotations);
    if (msg !=  null) {
      if (this.enforceArticulations) {
        this.alert(msg);
      } else {
        this.confirm(msg, (result) => {
          if (result) {
            next();
          }
        });
      }
    } else {
      next();
    }
  }

  checkArticulationAnnotations(annotations) {
    if (annotations.length === 0) {
      return 'Please provide some articulation annotations before submitting';
    }
    for (let i = 0; i < annotations.length; i++) {
      let isReady = true;
      if (annotations[i] && annotations[i].length) {
        annotations[i].forEach((ann) => isReady &= !ann.needsReview);
      }
      if (!isReady) {
        return 'Please review all annotations before submitting.';
      }
    }
    return;
  }

  submitAnnotations(state) {
    this.authenticate(() => {
      this.__checkAndProceed(state,() => {
        this.__submitAnnotations(state);
      });
    });
  }

  __submitAnnotations(state) {
    this.timings.mark('annotationSubmit');
    const data = this.getAnnotationsJson(state);

    $.ajax({
      url: this.submitAnnotationsUrl,
      method: 'POST',
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(data),
      success: ((msg) => {
        console.log('Annotations saved.');
        this.message('Annotations saved', 'alert-success');
      }),
      error: ((err) => {
        console.error('There was an error saving annotations.', err);
        this.message('Error saving annotations', 'alert-danger');
      })
    });
  }

  // Dummy authenticate
  authenticate(cb) {
    // Most basic auth ever
    if (this.userId && !this.userId.startsWith('USER@')) {
      cb({ username: this.userId });
      return;
    }
    if (!this.auth) {
      const Auth = require('util/Auth');
      this.auth = new Auth();
    }
    this.auth.authenticate(function(user) {
      this.userId = user.username;
      cb(user);
    }.bind(this));
  }
}

module.exports = AnnotationLoadSave;