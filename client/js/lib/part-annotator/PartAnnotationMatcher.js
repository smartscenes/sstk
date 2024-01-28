const _ = require('util/util');

class PartAnnotationMatcher {
  constructor() {
  }

  /**
   * Checks whether two set of part annotations match or not (using the label)
   * Returns mapping of loadedToCurrent and currentToLoaded pids (assumed to be integer)
   * @param loadedParts {Object[]} Parts that are loaded (should have the field 'label' and partIdField)
   * @param currentParts {Object[]} Current set of parts (should have the field 'label' and partIdField)
   * @param partIdField {string} id to use to get partId
   * @param fieldsToUpdate {string[]} List of fieldnames to copy over from loaded into current
   * @returns {{loadedToCurrent: int[], currentToLoaded: int[]}}
   */
  checkMatchByLabel(loadedParts, currentParts, partIdField='pid', fieldsToUpdate = []) {
    // try to match parts to part names
    const loadedByLabel = _.groupBy(loadedParts, 'label');
    const currentToLoaded = [];
    const loadedToCurrent = [];
    const unmatchedCurrentParts = [];
    // Match by label for labels that have a '.'
    for (let i = 0; i < currentParts.length; i++) {
      const sp = currentParts[i];
      if (sp) {
        const matchedByLabel = loadedByLabel[sp.label];
        const loadedPart = (matchedByLabel && matchedByLabel.length === 1)? matchedByLabel[0] : null;
        if (loadedPart && sp.label.indexOf('.') >= 0) {
          // list of fields to copy over
          for (let field of fieldsToUpdate) {
            sp[field] = loadedPart[field];
          }
          loadedToCurrent[loadedPart[partIdField]] = sp[partIdField];
          currentToLoaded[sp[partIdField]] = loadedPart[partIdField];
          if (sp[partIdField] !== loadedPart[partIdField]) {
            console.log(partIdField + ' mismatch for label', loadedPart, sp);
          }
        } else {
          unmatchedCurrentParts.push(sp);
        }
      }
    }
    for (let i = 0; i < loadedParts.length; i++) {
      const matchedByIndex = loadedParts[i];
      if (matchedByIndex && loadedToCurrent[i] == null) {
        const loadedPart = matchedByIndex;
        const sp = currentParts[i];
        const spi = unmatchedCurrentParts.indexOf(sp);
        if (spi >= 0) {
          if (sp.label !== loadedPart.label) {
            console.log('Match by index (label do not match) ', loadedPart, sp);
          }
          // list of fields to copy over
          for (let field of fieldsToUpdate) {
            sp[field] = loadedPart[field];
          }
          loadedToCurrent[loadedPart[partIdField]] = sp[partIdField];
          currentToLoaded[sp[partIdField]] = loadedPart[partIdField];
          unmatchedCurrentParts.splice(spi, 1);
        }
      }
    }
    for (let i = 0; i < loadedParts.length; i++) {
      if (loadedToCurrent[i] == null) {
        console.warn('Did not match loaded against current part', loadedParts[i]);
      }
    }
    for (let i = 0; i < unmatchedCurrentParts; i++) {
      console.warn('Did not match current part against loaded', unmatchedCurrentParts[i]);
    }
    return { currentToLoaded: currentToLoaded, loadedToCurrent: loadedToCurrent };
  }
}

module.exports = PartAnnotationMatcher;