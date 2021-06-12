// Panel for working with a custom list of assets/models
const LabelsPreviewPanel = require('ui/LabelsPreviewPanel');
const UIUtil = require('ui/UIUtil');
const FileUtil = require('io/FileUtil');
const AssetLabelMods = require('annotate/AssetLabelMods');
const _ = require('util/util');

class CustomListLabelsPreviewPanel extends LabelsPreviewPanel {
  constructor(params) {
    params = _.defaults(Object.create(null), params, {
      groupByLabels: true,
      showAll: true,
      removeAssetId: (fullId) => {
        this.updateId(fullId, false);
      }
    });
    super(params);
    this.getChecked = params.getChecked;  // function() - get map of fullId to LabelMod
    this.onLoaded = params.onLoaded;      // function(assetIdToLabels)
    this.assetIdToLabelMods = {};

    // Hook up selected panel elements
    const addButton = $('#selectedAdd');
    addButton.click(() => this.addChecked());

    const clearButton = $('#selectedClear');
    clearButton.click(() => this.clearList());

    const saveButton = $('#selectedSave');
    saveButton.click(() => this.saveLabelToIds());

    const saveIdsButton = $('#selectedSaveIds');
    saveIdsButton.click(() => this.saveIds());

    const selectedLoad = UIUtil.createFileInput({
      id: 'selectLoad',
      label: 'Load',
      style: 'existing',
      hideFilename: true,
      labelButton: $('#selectedLoad'),
      loadFn: (file) => {
          this.loadLabelToIds(file);
      }
    });
    $('#selectedControls').append(selectedLoad.group);
  }

  // Add checked assets to selected list
  addChecked() {
    var checked = this.getChecked();
    Object.keys(checked).forEach(fullId => this.__updateId(fullId, checked[fullId] || true));
    this.update(this.assetIdToLabelMods);
  }

  // Removing checked models from selected list
  removeChecked() {
    var checked = this.getChecked();
    Object.keys(checked).forEach(fullId => this.__updateId(fullId, false));
    this.update(this.assetIdToLabelMods);
  }

  updateLabels(idToLabelsMod) {
    for (let fullId in this.assetIdToLabelMods) {
      if (idToLabelsMod[fullId]) {
        this.assetIdToLabelMods[fullId] = idToLabelsMod[fullId];
      }
    }
  }

  __updateId(fullId, add) {
    if (fullId) {
      if (add) {
        this.assetIdToLabelMods[fullId] = (typeof add === 'boolean')? {} : add;
      } else {
        delete this.assetIdToLabelMods[fullId];
      }
    }
  }

  updateId(fullId, add) {
    this.__updateId(fullId, add);
    this.update(this.assetIdToLabelMods);
  }

  clearList() {
    this.assetIdToLabelMods = {};
    this.update(this.assetIdToLabelMods);
  }

  getIdToLabels() {
    return AssetLabelMods.getIdToLabels(this.assetIdToLabelMods);
  }

  saveLabeled(filename='labeled.tsv') {
    const idToLabels = AssetLabelMods.getIdToLabels(this.assetIdToLabelMods);
    const ids = Object.keys(idToLabels);
    const rows = ids.map(function(id) {
      return id + '\t' + idToLabels[id].join(',');
    });
    FileUtil.saveText(rows.join('\n'), filename);
  }

  saveLabelToIds(filename='labelToIds.json') {
    const labelToIds = AssetLabelMods.getLabelToIds(this.assetIdToLabelMods);
    FileUtil.saveText(JSON.stringify(labelToIds, null, ' '), filename);
  }

  saveIds(filename='selected-ids.txt') {
    const ids = Object.keys(this.assetIdToLabelMods);
    FileUtil.saveText(ids.join('\n'), filename);
  }

  loadLabelToIds(jsonFile) {
    console.log('loading labeled from ' + jsonFile);
    FileUtil.readAsync(jsonFile, 'json',
      function (error, data) {
        if (error) {
          UIUtil.showAlert('Error loading file');
        } else {
          console.log(data);
          var assetIdToLabels = {};
          for (let cat in data) {
            // console.log(cat);
            if (data.hasOwnProperty(cat)) {
              const catIds = data[cat];
              for (let i = 0; i < catIds.length; i++) {
                const id = catIds[i];
                if (cat === AssetLabelMods.NOLABEL) {
                  assetIdToLabels[id] = [];
                } else if (!assetIdToLabels[id]) {
                  assetIdToLabels[id] = [cat];
                } else {
                  assetIdToLabels[id].push(cat);
                }
              }
            }
          }
          this.assetIdToLabelMods = _.mapValues(assetIdToLabels, labels => {
            const res = {};
            for (let label of labels) {
              res[label] = {};
            }
            return res;
          });
          this.onLoaded(assetIdToLabels);
        }
      }.bind(this)
    );
  }
}

module.exports = CustomListLabelsPreviewPanel;