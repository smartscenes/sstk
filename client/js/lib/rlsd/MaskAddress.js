class MaskAddress {
  constructor(photoId, maskId, clickPoint) {
    // TODO: photoId is not used...
    this.photoId = photoId;
    this.maskId = maskId;
    this.clickPoint = clickPoint;
  }

  equals(other) {
    // return this.photoId == other.photoId && this.maskId == other.maskId && this.clickPoint == other.clickPoint;
    return this.maskId == other.maskId && this.clickPoint == other.clickPoint;
  }

  toString() {
    // return this.photoId + '-' + this.maskId;
    return this.maskId.toString();
  }

  // NOT USED
  // static parse(str) {
  //   // var parts = str.split('-');
  //   // return new MaskAddress(parts[0], parseInt(parts[1]), null);
  //   return new MaskAddress(parseInt(str));
  // }
}

module.exports = MaskAddress;