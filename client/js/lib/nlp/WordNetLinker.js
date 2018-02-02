var Form = require('ui/Form');
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
  this.allowLinking = params.allowLinking;
  if (params.contextMenuItems && this.allowLinking) {
    params.contextMenuItems['wordnet'] = {
      name: 'Link wordnet',
      callback: function() {
        this.linkWordNet();
      }.bind(this),
      accesskey: "W"
    };
  }
}

/**
 * User wants to start linking to wordnet
 * Do something intelligent here!
 */
WordNetLinker.prototype.linkWordNet = function (labelInfos, label, pattern) {
  // provide UI for linking to wordnet for selected labels
  var scope = this;
  if (!labelInfos) {
    // See which ones are selected
    labelInfos = this.app.labelsPanel.getAllSelected();
  }
  // Check if there is only one selected label
  if (labelInfos && labelInfos.length >= 1) {
    // get label text
    var labelInfo = labelInfos[0];
    label = label || labelInfo.label;

    // get and show wordnet synset options
    this.wordnet.synsets(label + '.n', function(err, synsets) {
      // TODO: Improved ranking
      // Let's sort the synsets based on wn30synsetkey
      synsets = _.sortBy(synsets, function(s) {
        var synsetkey = s.wn30synsetkey[0];
        var word = synsetkey.split('.')[0];
        var labelMatched = word === label;
        var p = labelMatched? '0-' : '1-';
        return p + synsetkey;
      });

      var currentSynset;
      var currentIndex = -1;
      if (_.has(labelInfo.data, "wn30synsetkey")) {
        currentIndex = _.findIndex(synsets, function(synset) {
          return (synset.wn30synsetkey[0] === labelInfo.data.wn30synsetkey);
        });
        if (currentIndex >= 0) {
          currentSynset = synsets[currentIndex];
        }
      }

      //TODO: improve current synset display (put in the selector prompt?)
      if (currentSynset !== undefined) {
        console.log("The currently selected synset is: " + currentSynset.gloss);
      }

      if (err) {
        UIUtil.showAlert(null, 'Error looking up WordNet synsets', 'alert-danger', 2000, '10pt').css('bottom', '5px');
        console.error(err); // TODO: handles error for now but might want to improve.
      } else {
        var form_prefix = 'form_' + _.generateRandomId(5);
        var formInputs = [];
        var messageBefore = '';
        if (currentIndex < 0 && labelInfo.synset) {
          var div = $('<div></div>');
          div.append($('<b></b>').append(labelInfo.synset.words.join(',')));
          div.append($('<br/>'));
          div.append($('<span></span>').text(labelInfo.synset.gloss));
          div.append($('<br/>'));
          messageBefore = div.get(0).outerHTML;
        }
        var wordparts;
        if (synsets.length) {
          var options = _.map(synsets, function (synset, index) {
            var opt_html = $('<span></span>').text(synset.gloss).attr('title', synset.wn30synsetkey[0]).get(0).outerHTML;
            return {text: opt_html, value: index};
          });
          formInputs.push({
            title: 'Link synset to label: ' + label,
            name: 'link',
            inputType: 'radio',
            inputOptions: options,
            value: currentIndex >= 0 ? currentIndex : '',
            useNumberShortcuts: true,
            messageBefore: messageBefore
          });
          formInputs.push({
            title: 'No appropriate synset?  Search for different label',
            name: 'search',
            inputType: 'text'
          });
        } else {
          wordparts = label.split(' ');
          wordparts = _.uniq(wordparts);
          var wordButtonsHTML;
          if (wordparts.length > 1) {
            var wordButtonsDiv = $('<div></div>');
            var wordButtons = _.each(wordparts, function(w, i) {
              var button = $('<button type="button" class="btn btn-success btn-xs"></button>').text(w).attr('id', form_prefix + '_word_' + i);
              wordButtonsDiv.append(button);
            });
            wordButtonsHTML = wordButtonsDiv.get(0).outerHTML;
          }
          formInputs.push({
            title: 'Cannot find any synsets for ' + label + '. Search for different label',
            name: 'search',
            inputType: 'text',
            messageBefore: messageBefore,
            messageAfter: wordButtonsHTML
          });
        }
        formInputs.push({
          title: 'Link all labels matching pattern',
          name: 'pattern',
          inputType: 'text',
          value: pattern,
          hasValidation: true,
          eventHandlers: {
            'keyup':
              function (event, element, value, validation_element) {
                var matched = [];
                if (value) {
                  try {
                    matched = scope.getMatchingLabelInfos(value);
                    validation_element.hide();
                  } catch (err) {
                    //console.error('Got err', err);
                    validation_element.text('Invalid pattern');
                    validation_element.show();
                  }
                }
                scope.setHighlightedLabelInfos(matched);
              }
          }
        });
        formInputs.push({
          title: 'Unlink',
          name: 'unlink',
          inputType: 'boolean'
        });

        var form = new Form("Select a synset to link to the label", formInputs);
        var dialog = form.form(
          function (results) {
            scope.setHighlightedLabelInfos([]);
            if (results) {
              var selectedLink = results['link'];
              var search = results['search'];
              pattern = results['pattern'];
              if (search) {
                scope.linkWordNet(labelInfos, search, pattern);
              } else if (results['unlink']) {
                if (pattern) {
                  labelInfos = scope.getMatchingLabelInfos(pattern);
                }
                scope.linkAll(labelInfos);
              } else if (selectedLink != '' && selectedLink != null) {
                if (pattern) {
                  labelInfos = scope.getMatchingLabelInfos(pattern);
                }
                currentIndex = parseInt(selectedLink);
                currentSynset = synsets[currentIndex];
                scope.linkAll(labelInfos, currentSynset);
              }
            }
          }
        );
        if (wordparts) {
          _.each(wordparts, function(w, i) {
            var b = dialog.find('#' + form_prefix + '_word_' + i);
            b.click(function() {
              scope.linkWordNet(labelInfos, w);
              dialog.trigger("escape.close.bb");
            });
          });
        }
      }
    });

  } else {
    // If multiple labels, show alert about invalid link
    UIUtil.showAlert(null, 'Please select one label for linking to WordNet', 'alert-info', 2000, '10pt').css('bottom', '5px');
  }
};

WordNetLinker.prototype.setHighlightedLabelInfos = function(labelInfos) {
  return this.app.labelsPanel.setHighlighted(labelInfos);
};

WordNetLinker.prototype.getMatchingLabelInfos = function(pattern) {
  return this.app.labelsPanel.getMatching(pattern, true);
};

WordNetLinker.prototype.linkAll = function(labelInfos, synset) {
  for (var i = 0; i < labelInfos.length; i++) {
    this.link(labelInfos[i], synset);
  }
};

WordNetLinker.prototype.link = function(labelInfo, synset) {
  if (synset) {
    labelInfo.data = {
      wn30synsetid: synset.wn30synsetid,
      wn30synsetkey: synset.wn30synsetkey[0]
    };
    labelInfo.synset = synset;
    //console.log("synset is now: " + currentSynset.gloss);
    this.__indicateLinked(labelInfo, synset);
  } else {
    labelInfo.data = null;
    labelInfo.synset = null;
    this.__indicateLinked(labelInfo);
  }
}

WordNetLinker.prototype.__indicateLinked = function(labelInfo, synset) {
  var linkButton = $(labelInfo.element).find('.wordnet-link');
  if (linkButton.length === 0) {
    linkButton = $('<i class="glyphicon glyphicon-link wordnet-link pull-left"></i>');
    if (this.allowLinking) {
      var scope = this;
      linkButton.click(function() { scope.linkWordNet([labelInfo]); });
    }
    //linkButton = $('<button class=""wordnet-link"></button>').attr('class', 'pull-right').append(linkIcon);
    $(labelInfo.element).append(linkButton);
  }
  if (synset) {
    $(labelInfo.element).attr("title", synset.wn30synsetkey[0] + '\n' + synset.gloss);
    linkButton.css("color", "green");
  } else {
    $(labelInfo.element).removeAttr("title");
    linkButton.css("color", "gray");
  }
};

WordNetLinker.prototype.indicateLinked = function(labelInfo) {
  var scope = this;
  if (labelInfo && labelInfo.data && labelInfo.data.wn30synsetkey) {
    if (_.isArray(labelInfo.data.wn30synsetkey)) {
      labelInfo.data.wn30synsetkey = labelInfo.data.wn30synsetkey[0];
    }
    var wn30synsetkey = labelInfo.data.wn30synsetkey;
    this.wordnet.synsets(wn30synsetkey, function(err, synsets) {
      if (synsets && synsets.length > 0) {
        labelInfo.synset = synsets[0];
        scope.__indicateLinked(labelInfo, synsets[0]);
      }
    });
  } else {
    scope.__indicateLinked(labelInfo);
  }
};

module.exports = WordNetLinker;

