// Some utility functions for interpreting asset label modifications
// LabelMod is a map with a label as a key and the modification as the value ('add', 'del', or nothing)
class AssetLabelMods {

  static getOrigChanged(labelMods) {
    const orig = [];
    const changed = [];
    for (let label in labelMods) {
      if (labelMods.hasOwnProperty(label)) {
        if (labelMods[label]) {
          changed.push(label);
        } else {
          orig.push(label);
        }
      }
    }
    return { changed: changed, orig: orig };
  }

  static getChanged(labels) {
    return AssetLabelMods.getOrigChanged(labels).changed;
  }

  static filterToChanged(idToLabelModsMap) {
    const filtered = {};
    for (let fullId in idToLabelModsMap) {
      if (idToLabelModsMap.hasOwnProperty(fullId)) {
        const labelMods = idToLabelModsMap[fullId];
        const changed = AssetLabelMods.getChanged(labelMods);
        if (changed.length > 0) {
          filtered[fullId] = labelMods;
        }
      }
    }
    return filtered;
  }

  static getCurrentLabels(fullId, idToLabelModsMap) {
    const filteredLabels = [];
    if (idToLabelModsMap) {
      const labelMods = idToLabelModsMap[fullId];
      for (let label in labelMods) {
        if (labelMods.hasOwnProperty(label) && (labelMods[label] !== 'del')) {
          filteredLabels.push(label);
        }
      }
    }
    return filteredLabels;
  }

  static getIdToLabels(idToLabelModsMap, fullIds) {
    if (!idToLabelModsMap) return;
    const idToLabels = {};
    if (fullIds == null) {
      fullIds = Object.keys(idToLabelModsMap);
    }
    for (let fullId of fullIds) {
      idToLabels[fullId] = AssetLabelMods.getCurrentLabels(fullId, idToLabelModsMap);
    }
    return idToLabels;
  }

  static getLabelToIds(idToLabelModsMap, fullIds, noneLabel= AssetLabelMods.NOLABEL) {
    if (!idToLabelModsMap) return;
    const labelToIds = {};
    if (fullIds == null) {
      fullIds = Object.keys(idToLabelModsMap);
    }
    for (let fullId of fullIds) {
      const labels = AssetLabelMods.getCurrentLabels(fullId, idToLabelModsMap);
      if (labels.length === 0) {
        labels.push(noneLabel);
      }
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!labelToIds[label]) labelToIds[label] = [];
        labelToIds[label].push(fullId);
      }
    }
    return labelToIds;
  }
}

AssetLabelMods.NOLABEL = '__NONE__';

module.exports = AssetLabelMods;