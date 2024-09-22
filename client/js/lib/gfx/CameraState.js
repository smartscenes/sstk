// State of a camera
const Transform = require('geo/Transform');

class CameraState {
  static transformCameraState(camState, matrix, scale) {
    // Takes camera state using matrix
    const directionFields = ['up', 'direction'];
    const positionFields = ['position', 'target'];
    const fields = directionFields.concat(positionFields);
    const transform = new Transform(matrix);
    const transformedCamState = {};
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const fieldValue = camState[field];
      if (fieldValue) {
        transformedCamState[field] = new THREE.Vector3();
        if (fieldValue instanceof Array) {
          transformedCamState[field].set(fieldValue[0], fieldValue[1], fieldValue[2]);
        } else {
          transformedCamState[field].copy(fieldValue);
        }
        if (i < directionFields.length) {
          transform.convertDir(transformedCamState[field]);
        } else {
          transform.convertPoint(transformedCamState[field]);
          // also apply scale
          transformedCamState[field].multiplyScalar(scale);
        }
      }
    }
    // Fields that need to be scaled
    const scaleFields = ['left','right','bottom','top','near','far'];
    for (let i = 0; i < scaleFields.length; i++) {
      const field = scaleFields[i];
      const fieldValue = camState[field];
      if (fieldValue) {
        transformedCamState[field] = fieldValue*scale;
      }
    }
    // Copy other fields
    for (let prop in camState) {
      if (camState.hasOwnProperty(prop) && !transformedCamState[prop]) {
        transformedCamState[prop] = camState[prop];
      }
    }
    return transformedCamState;
  }
}

module.exports = CameraState;
