class ElemToLabelIndexBuffer {
  constructor(size, defaultValue=0) {
    this.__buffer = new Uint32Array(size);
    this.__buffer.fill(0);
  }

  get buffer() {
    return this.__buffer;
  }

  /**
   * Populate this buffer from src buffer using mapping
   * @param srcBuffer {ElemToLabelIndexBuffer}
   * @param mapping {int[]} Array of this index to source index
   */
  populateWithMapping(srcBuffer, mapping, defaultValue=0) {
    for (let i = 0; i < this.__buffer.length; i++) {
      const si = mapping[i];
      this.__buffer[i] = (si != null && si >= 0)? srcBuffer.__buffer[si] : defaultValue;
    }
  }

  fromGroupedElemIndices(labeled, getLabelField, getElemField) {
    if (typeof(getLabelField) === 'string') {
      const labelFieldName = getLabelField;
      getLabelField = (g,i) => { return g[labelFieldName]; };
    }
    if (typeof(getElemField) === 'string') {
      const elemFieldName = getElemField;
      getElemField = (g,i) => { return g[elemFieldName]; };
    }
    for (let i = 0; i < labeled.length; i++) {
      const group = labeled[i];
      if (group) {
        const elemIndices = getElemField(group, i);
        if (elemIndices) {
          for (let j = 0; j < elemIndices.length; j++) {
            const ti = elemIndices[j];
            this.__buffer[ti] = getLabelField(group, i);
          }
        }
      }
    }
  }

  getElementIndices(labelIndex) {
    const elemIndices = [];
    for (let i = 0; i < this.__buffer.length; i++) {
      if (this.__buffer[i] === labelIndex) {
        elemIndices.push(i);
      }
    }
  }

  getGrouped() {
    const grouped = {};
    for (let i = 0; i < this.__buffer.length; i++) {
      const labelIndex = this.__buffer[i];
      grouped[labelIndex] = grouped[labelIndex] || [];
      grouped[labelIndex].push(i);
    }
    return grouped;
  }

  hasLabelIndex(targetLabelIndex) {
    for (let i = 0; i < this.__buffer.length; i++) {
      if (this.__buffer[i] === targetLabelIndex) {
        return true;
      }
    }
    return false;
  }
}

module.exports = ElemToLabelIndexBuffer;

