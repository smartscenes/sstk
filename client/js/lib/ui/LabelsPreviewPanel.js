const AssetLabelMods = require('annotate/AssetLabelMods');

class LabelsPreviewPanel {
  constructor(params) {
    this.container = $(params.container);
    this.gridWidth = params.gridWidth || 100;
    this.componentId = params.componentId || 'preview';
    this.groupByLabels = params.groupByLabels; // Whether to group by labels
    this.showAll = params.showAll; // Whether to show all or just changed assets
    this.createLabelTag = params.createLabelTag;  // function(fullId, label, update) - create label tag to press
    this.createAssetElement = params.createAssetElement; // function('preview', fullId) - create preview image of asset
    this.removeAssetIdCallback = params.removeAssetId; // function(fullId) - callback for removing asset from a list of assets
  }

  resize() {
    const previewPane = this.container;
    const previewNumElem = previewPane.find('.previewNum');
    const viewport = previewPane.find('.scrollableDiv');
    viewport.css('width', previewPane.width() + 'px');
    viewport.css('height', (previewPane.height() - 1 * previewNumElem.height()) + 'px');
  }

  update(idToLabelsMap) {
    if (this.groupByLabels) {
      this.__createPanelGroupedByLabel(idToLabelsMap, this.showAll);
    } else {
      this.__createPanelChanged(idToLabelsMap, this.showAll);
    }
  }

  __ensurePreviewNumElem() {
    const previewPane = this.container;
    let previewNumElem = previewPane.find('.previewNum');
    if (previewNumElem.length === 0) {
      previewNumElem = $('<div class="previewNum"></div>');
      previewPane.append(previewNumElem);
    }
    return previewNumElem;
  }

  __ensurePreviewTable() {
    const previewPane = this.container;
    let previewTable = previewPane.find('table');
    if (previewTable.length === 0) {
      previewTable = $('<table></table>');
      previewTable.addClass('dragger');
      const viewport = $('<div></div>').addClass('scrollableDiv');
      previewPane.append(viewport.append(previewTable));
      viewport.dragscrollable({dragSelector: '.dragger:first', acceptPropagatedEvent: true});
    }
    return previewTable;
  }

  __getTdCss() {
    const width = this.gridWidth;
    const minWidth = 50;
    const height = width;
    const tdCss = {
      'width': width + 'px',
      'min-width': minWidth + 'px',
      'max-width': width + 'px',
      'max-height': height + 'px'
    };
    return tdCss;
  }

  // Show preview of assets with changed labels
  __createPanelChanged(idToLabelModsMap, showAll) {
    const previewNumElem = this.__ensurePreviewNumElem();
    const previewTable = this.__ensurePreviewTable();
    previewTable.empty();

    const tdCss = this.__getTdCss();

    // Show changed
    let nChangedAssets = 0;
    let nDisplayedAssets = 0;
    for (let fullId in idToLabelModsMap) {
      if (idToLabelModsMap.hasOwnProperty(fullId)) {
        const labelMods = idToLabelModsMap[fullId];
        const changed = AssetLabelMods.getChanged(labelMods);
        if (changed.length > 0) {
          nChangedAssets++;
        }
        if (showAll || changed.length > 0) {
          var origElem = $('<div></div>');
          var addElem = $('<div></div>');
          var delElem = $('<div></div>');
          for (let label in labelMods) {
            if (labelMods.hasOwnProperty(label)) {
              const update = labelMods[label];
              const labelTag = this.createLabelTag(fullId, label, update);
              if (update === 'add') {
                addElem.append(labelTag);
              } else if (update === 'del') {
                delElem.append(labelTag);
              } else {
                origElem.append(labelTag);
              }
            }
          }
          nDisplayedAssets++;
          const assetElem = this.createAssetElement(this.componentId, fullId);
          const row = $('<tr></tr>')
            .append($('<td></td>').text(nDisplayedAssets))
            .append($('<td></td>').css(tdCss).append(assetElem))
            .append($('<td></td>').append(origElem))
            .append($('<td></td>').append(addElem))
            .append($('<td></td>').append(delElem));
          if (this.removeAssetIdCallback) {
            const delId = fullId;
            const delAssetIdElem = this.__createDeleteElement((elem) => this.removeAssetIdCallback(delId));
            row.append($('<td></td>').css('text-align', 'right').append(delAssetIdElem));
          }
          previewTable.append(row);
        }
      }
    }
    if (showAll) {
      previewNumElem.text(nChangedAssets + '/' + nDisplayedAssets + ' changed');
    } else {
      previewNumElem.text(nChangedAssets + ' changed');
    }
  }

  createLabelTagsForFullId(fullId, idToLabelModsMap) {
    const div = $('<div></div>');
    // The current category info...
    const labelMods = idToLabelModsMap[fullId];
    if (labelMods) {
      for (let label in labelMods) {
        if (labelMods.hasOwnProperty(label)) {
          const update = labelMods[label];
          const labelTag = this.createLabelTag(fullId, label, update);
          div.append(labelTag);
        }
      }
    }
    return div;
  }

  __createDeleteElement(deleteCallback) {
    const delElem = $('<img/>')
      .addClass('imageButton')
      .attr('src', 'resources/images/16/delete.png')
      .attr('title', 'Remove').attr('alt', 'Remove')
      .click(deleteCallback);
    return delElem;
  }

  // Create panel of assets by label (there may be duplicated elements)
  __createPanelGroupedByLabel(idToLabelModsMap, showAll) {
    const previewNumElem = this.__ensurePreviewNumElem();
    const previewTable = this.__ensurePreviewTable();
    previewTable.empty();

    const changedIdToLabelMods = AssetLabelMods.filterToChanged(idToLabelModsMap);
    const filteredIdToLabelMods = showAll? idToLabelModsMap : changedIdToLabelMods;

    const tdCss = this.__getTdCss();
    const labelToIds = AssetLabelMods.getLabelToIds(filteredIdToLabelMods);
    for (let label in labelToIds) {
      // TODO: change the class name from selected to preview...
      if (labelToIds.hasOwnProperty(label)) {
        const fullIds = labelToIds[label];
        const labelRow = $('<tr></tr>').addClass('selectedCategory')
          .append($('<td colspan="3"></td>')
            .text(label))
          .append($('<td class="selectedCatNum"></td>').text(fullIds.length));
        previewTable.append(labelRow);
        for (let i = 0; i < fullIds.length; i++) {
          const fullId = fullIds[i];
          const labelTags = this.createLabelTagsForFullId(fullId, idToLabelModsMap);
          const assetElem = this.createAssetElement(this.componentId, fullId);
          const row = $('<tr></tr>')
            .append($('<td></td>').text(i + 1))
            .append($('<td></td>').css(tdCss).append(assetElem))
            .append($('<td></td>').append(labelTags));
          if (this.removeAssetIdCallback) {
            const delAssetIdElem = this.__createDeleteElement((elem) => this.removeAssetIdCallback(fullId));
            row.append($('<td></td>').css('text-align', 'right').append(delAssetIdElem));
          }
          previewTable.append(row);
        }
      }
    }

    const nAssets = Object.keys(idToLabelModsMap).length;
    const nChanged = Object.keys(changedIdToLabelMods).length;
    const nLabels = Object.keys(labelToIds).length;
    previewNumElem.text(nChanged + '/' + nAssets + ' changed over ' + nLabels + ' labels');
  }
}

module.exports = LabelsPreviewPanel;
