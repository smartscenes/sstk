const Constants = require('Constants');

/**
 * Information about what kinds of attachment an object is likely to have
 * @typedef AttachmentInfo
 * @type {object}
 * @property {string} childAttachmentSide
 * @property {int} childBBFaceIndex
 * @property {Array<string>} parentObjectTypes   ['arch'] or ['object'] for placing only on arch/object
 * @property {string} parentAttachmentSurface
 */
class AttachmentInfo {
  constructor(childAttachmentSide, parentAttachmentSurface, parentObjectTypes) {
    this.parentAttachmentSurface = parentAttachmentSurface;
    if (parentAttachmentSurface === 'vertical' && childAttachmentSide == null) {
      childAttachmentSide = 'back';
    }
    this.childAttachmentSide = childAttachmentSide;
    this.childBBFaceIndex = AttachmentInfo.AttachmentSideToBBFaceIndex[childAttachmentSide];
    this.parentObjectTypes = parentObjectTypes;
  }

  get restrictToArch() {
    return this.parentObjectTypes.length === 1 && this.parentObjectTypes[0] === 'arch';
  }
}

AttachmentInfo.AttachmentSideToBBFaceIndex = {
  'bottom': Constants.BBoxFaceCenters.BOTTOM,
  'top': Constants.BBoxFaceCenters.TOP,
  'back': Constants.BBoxFaceCenters.BACK
};

module.exports = AttachmentInfo;


