var UIUtil = require('ui/UIUtil');
var WordNet = require('nlp/WordNet');
var _ = require('util');

/**
 * Handles linking to wordnet
 * @param params
 * @constructor
 * @memberof nlp
 */
function WordNetLinker(params) {
  this.app = params.app;
  this.wordnet = new WordNet(params);
  if (params.contextMenuItems) {
    params.contextMenuItems['wordnet'] = {
      name: 'Link wordnet',
      callback: function() {
        this.linkWordNet();
      }.bind(this)
    };
  }
}

/**
 * User wants to start linking to wordnet
 * Do something intelligent here!
 */
WordNetLinker.prototype.linkWordNet = function () {
  // provide UI for linking to wordnet for selected labels
  var selected = this.app.labelsPanel.getAllSelected();
  // Check if there is only one selected label
  if (selected && selected.length === 1) {
    // get label text
    var labelInfo = selected[0];
    var label = labelInfo.label;

    // get and show wordnet synset options
    this.wordnet.synsets(label + '.n', function(err, synsets) {
      var currentSynset;
      var currentIndex;
      if (_.has(labelInfo.data, "wn30synsetkey")) {
        synsets.some(function(synset, index) {
         currentSynset = synset;
         currentIndex = index;
         return _.isEqual(synset.wn30synsetkey[0], labelInfo.data.wn30synsetkey[0]);
       });
      }

      //TODO: improve current synset display (put in the selector prompt?)
      if (currentSynset !== undefined) {
        console.log("The currently selected synset is: " + currentSynset.gloss);
      }

      if (err) {
        console.error(err); // TODO: handles error for now but might want to improve.
      } else {
        var options = [{text: 'Choose a synset...', value: ''}];

        synsets.forEach(function(synset, index) {
          options.push({text: synset.gloss, value: synset.wn30synsetkey}); //adds gloss of each synset as drop-down option
        });

        bootbox.prompt({
          title: "Select a synset to link to the label: " + label,
          inputType: 'select',
          inputOptions: options,
          value: currentSynset? currentSynset.wn30synsetkey : '',

          callback: function (result) {
            if (result !== '' && result !== null && (currentSynset === undefined || !_.isEqual(currentSynset.wn30synsetkey[0], result))) {
              for (var i = 0; i < synsets.length; i++) {
                if (_.isEqual(synsets[i].wn30synsetkey[0], result)) {
                  currentSynset = synsets[i];
                  console.log("currentSynset has been set");
                  break;
                }
              }

              labelInfo.data = {wn30synsetid: currentSynset.wn30synsetid, wn30synsetkey: currentSynset.wn30synsetkey};
              console.log("synset is now: " + currentSynset.gloss);
              $(labelInfo.element).attr("title", currentSynset.gloss);
            }
          }
        });
      }
    });

  } else {
    // If multiple labels, show alert about invalid link
    UIUtil.showAlert(null, 'Please select one label for linking to WordNet', 'alert-info', 2000, '10pt').css('bottom', '5px');
  }
};

module.exports = WordNetLinker;

