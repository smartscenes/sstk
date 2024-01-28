class InstanceMasks {
  constructor(instancePixelBuffer) {
    if (instancePixelBuffer.isRGBA) {
      this.instanceIdBuffer = InstanceMasks.__rgbMaskToInstanceID(instancePixelBuffer);
      // this.instancePixelBuffer = instancePixelBuffer;
    } else {
      this.instanceIdBuffer = instancePixelBuffer;
    }
    this.instanceIdToMaskMap = new Map();
    this.instanceIdToMaskInfo = new Map();
  }

  init() {
    this.__createObjectMasks();
  }

  /**
   * Iterates through the instance buffer and creates the various object masks
   * @private
   */
  __createObjectMasks() {
    const inst = this.instanceIdBuffer.data;
    const width = this.instanceIdBuffer.width;
    const height = this.instanceIdBuffer.height;

    const maskMap = this.instanceIdToMaskMap;
    maskMap.clear();
    const maskInfoMap = this.instanceIdToMaskInfo;
    maskInfoMap.clear();

    function createBBox() {
      return { min: { x: +Infinity, y: +Infinity }, max: { x: -Infinity, y: -Infinity } };
    }

    function updateBBox(bbox, x, y) {
      bbox.min.x = Math.min(bbox.min.x, x);
      bbox.min.y = Math.min(bbox.min.y, y);
      bbox.max.x = Math.max(bbox.max.x, x);
      bbox.max.y = Math.max(bbox.max.y, y);
    }

    function finalizeBBox(bbox) {
      bbox.mid = { x: (bbox.min.x + bbox.max.x)/2, y: (bbox.min.y + bbox.max.y)/2 };
      bbox.dims = { x: (bbox.max.x - bbox.min.x), y: (bbox.max.y - bbox.min.y) };
    }

    const backgroundAlpha = 0;
    const foregroundAlpha = 150;
    for (let i = 0; i <= height; i++) {
      for (let j = 0; j <= width; j++) {
        const k = (i * width + j) * 4;
        const k_inst = (i * width + j) * 1;
        const id = inst[k_inst];
        // update instance id to mask
        if (!maskMap.has(id)) {
          // Create highlight mask for instanceId
          const highlightBuffer = new ArrayBuffer(width * height * 4);
          const pixels = new Uint8ClampedArray(highlightBuffer);
          pixels.fill(0);
          maskMap.set(id, pixels);
        }
        const buffer = maskMap.get(id);
        buffer[k] = inst[k_inst];
        buffer[k + 1] = inst[k_inst + 1];
        buffer[k + 2] = inst[k_inst + 2];
        buffer[k + 3] = (id === InstanceMasks.MASK_BACKGROUND_ID)? backgroundAlpha : foregroundAlpha;
        // update information associated with each instance
        if (!maskInfoMap.has(id)) {
          maskInfoMap.set(id, {
            id: id,
            type: 'mask',
            bbox1: createBBox(),
            bbox2: createBBox(),
            npixels: 0,
          });
        }
        const info = maskInfoMap.get(id);
        info.npixels++;
        updateBBox(info.bbox1, j, i);
        updateBBox(info.bbox2,(j + width/2) % width, i);
      }
    }
    // Figure out bbox of mask and single (mid) point for the object
    for (let info of maskInfoMap.values()) {
      finalizeBBox(info.bbox1);
      finalizeBBox(info.bbox2);
      // select the smaller box
      // console.log('select box1',  info.id, (info.bbox1.dims.x <= info.bbox2.dims.x), info.bbox1, info.bbox2);
      if (info.bbox1.dims.x <= info.bbox2.dims.x) {
        info.delta = { x: 0, y: 0 };
        info.bbox = info.bbox1;
      } else {
        info.delta = { x: -width/2, y: 0 };
        info.bbox = info.bbox2;
      }
      delete info.bbox1;
      delete info.bbox2;
      info.point = { x: (info.bbox.mid.x + info.delta.x) % width, y: info.bbox.mid.y };
      const posx = (info.point.x / width);  // go from 0 to 1
      const posy = ((info.point.y) / height);  // go from 0 to 1
      info.pointNormalized = { x: posx, y: posy };

    }
    // console.log("InstancePixelBuffer", this.instancePixelBuffer);
  }

  get width() {
    return this.instanceIdBuffer.width;
  }

  get height() {
    return this.instanceIdBuffer.height;
  }

  get objectIds() {
    return this.instanceIdToMaskMap.keys();
  }

  getIndex(x, y, stride) {
    return (y * this.width + x) * stride;
  }

  getPixelCoordFromNormalized(coordNormalized) {
    const coord = { x: Math.round(coordNormalized.x * this.width), y: Math.round(coordNormalized.y * this.height) };
    return coord;
  }

  getInstanceId(coord, isNormalized) {
    const pixelCoord = isNormalized? this.getPixelCoordFromNormalized(coord) : coord;
    const index = this.getIndex(pixelCoord.x, pixelCoord.y, 1);
    const instanceId = this.instanceIdBuffer.data[index];
    return instanceId;
  }

  getMaskInfo(maskId) {
    const info = this.instanceIdToMaskInfo.get(maskId);
    return info;
  }

  getInstanceHighlightMask(maskId) {
    const pixels = this.instanceIdToMaskMap.get(maskId);
    if (pixels != null) {
      return {data: pixels, width: this.width, height: this.height};
    } else {
      return null;
    }
  }

  /**
   * Returns pixel buffer with highlight mask
   * @param maskId
   * @param mode
   * @returns {{data: *, width: *, height: *}}
   */
  getColoredInstanceHighlightMask(maskId, mode) {
    const pixelBuffer = this.getInstanceHighlightMask(maskId);
    if (pixelBuffer && mode != null) {
      InstanceMasks.changeHighlightColoration(pixelBuffer, mode);
    }
    return pixelBuffer;
  }

  getAllMasksHighlight(viewpointObjectInfoStore, maskAnnotations, selectedMasks = null, out = null) {
    console.time('getAllMasksHighlight');
    const inst = this.instanceIdBuffer.data;
    const pixelBuffer = out? out : this.createPixelBuffer();
    const numPixels = pixelBuffer.width * pixelBuffer.height;
    const pixels = pixelBuffer.data;

    if (viewpointObjectInfoStore.size) {
      for (let i = 0; i < numPixels; i++) {
        const k = i*4;
        const key = inst[i];
        if (viewpointObjectInfoStore.has(key)) {
          const color = (selectedMasks && selectedMasks.has(key)) ? InstanceMasks.HIGHLIGHTS.selected :
            InstanceMasks.HIGHLIGHTS[InstanceMasks.getColorMode(maskAnnotations, key)];
          pixels[k] = color[0];
          pixels[k + 1] = color[1];
          pixels[k + 2] = color[2];
          pixels[k + 3] = color[3];
        }
      }
    }
    console.timeEnd('getAllMasksHighlight');
    return pixelBuffer;
  }

  createPixelBuffer() {
    const width = this.width;
    const height = this.height;
    const arrayBuffer = new ArrayBuffer(width * height * 4);
    const pixels = new Uint8ClampedArray(arrayBuffer);
    pixels.fill(0);
    return { data: pixels, width: width, height: height};
  }

  static getColorMode(maskAnnotations, maskId) {
    const hasAssignedObjects = maskAnnotations.hasAssignedObjects(maskId);
    const hasComments = maskAnnotations.hasComment(maskId);
    const mode = (hasAssignedObjects)? 'annotated' : (hasComments? 'commented':'unannotated');
    return mode;
  }

  /**
   * Changes the highlight coloration based on the state of the object and mouse interaction
   * @param {PixelBuffer} pixelBuffer
   * @param {string} mode `selected|unannotated|commented|annotated`
   */
  static changeHighlightColoration(pixelBuffer, mode) {
    console.time('changeHighlightColoration');
    const width = pixelBuffer.width;
    const height = pixelBuffer.height;
    const buffer = pixelBuffer.data;

    const color = InstanceMasks.HIGHLIGHTS[mode];
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const k = (i * width + j) * 4;
        if (buffer[k+3] != 0) {
          buffer[k] = color[0];
          buffer[k + 1] = color[1];
          buffer[k + 2] = color[2];
          buffer[k + 3] = color[3];
        }
      }
    }
    console.timeEnd('changeHighlightColoration');
    return pixelBuffer;
  }

  get tempHighlightBuffer() {
    if (!this.__highlightBuffer) {
      this.__highlightBuffer = this.createPixelBuffer();
    }
    return this.__highlightBuffer;
  }

  static clearBuffer(pixelBuffer) {
    pixelBuffer.data.fill(0);
  }

  static __rgbMaskToInstanceID(rgbInstancePixelBuffer) {
    const width = rgbInstancePixelBuffer.width;
    const height = rgbInstancePixelBuffer.height;
    const numPixels = width * height;
    const pixels = rgbInstancePixelBuffer.data;
    const arrayBuffer = new ArrayBuffer(width * height * 2);
    const instanceIds = new Uint16Array(arrayBuffer);
    instanceIds.fill(0);
    for (let i = 0; i < numPixels; i++) {
      const pi = i*4;
      instanceIds[i] = InstanceMasks.__rgbToInstanceID(pixels[pi], pixels[pi+1], pixels[pi+2], pixels[pi+3]);
    }
    return { data: instanceIds, width: width, height: height};
  }

  static __rgbToInstanceID(r, g, b, a) {
    if (a == 0) {
      return 0; // Background
    }
    return g * 256 + b;
  }
}

InstanceMasks.GREEN_HIGHLIGHT = [152, 251, 152, 150];
InstanceMasks.BLUE_HIGHLIGHT = [152, 152, 251, 150];
InstanceMasks.RED_HIGHLIGHT = [250, 128, 114, 150];
InstanceMasks.YELLOW_HIGHLIGHT = [251, 251, 114, 150];
InstanceMasks.MASK_BACKGROUND_ID = 0;

InstanceMasks.HIGHLIGHTS = {
  selected: InstanceMasks.YELLOW_HIGHLIGHT,
  annotated: InstanceMasks.GREEN_HIGHLIGHT,
  commented: InstanceMasks.BLUE_HIGHLIGHT,
  unannotated: InstanceMasks.RED_HIGHLIGHT
};


module.exports = InstanceMasks;