var Constants = require('Constants');
var Form = require('ui/Form');
var UIUtil = require('ui/UIUtil');
var WordNet = require('nlp/WordNet');
var PubSub = require('PubSub');
var _ = require('util');

/**
 * Handles linking to wordnet
 * @param params
 * @param params.app {{labelsPanel: ui.LabelsPanel}} Main application wanting to do linking
 * @param params.allowLinking {boolean} Whether linking should be allow (if false, link information is shown, but linking options are not)
 * @param params.contextMenuItems {Map<string,Object>} Context menu options for hooking up option to `Link wordnet`
 * @see {@link nlp.WordNet} for parameters for connecting to WordNet
 * @constructor
 * @memberof nlp
 */
function WordNetLinker(params) {
  PubSub.call(this);
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

WordNetLinker.prototype = Object.create(PubSub.prototype);
WordNetLinker.prototype.constructor = WordNetLinker;

/**
 * Show form for selecting synsets
 * @param label {string} Search term for synset
 * @param callback {nlp.synsetsFormCallback} Error first callback with results from synset selection form
 * @param options Additional options for synset selection form
 * @param [options.currentSynset] {nlp.WordNet.Synset} Currently selected synset
 * @param [options.currentSynsetKey] {string} Currently selected synset key
 * @param [options.includeUnlink] {boolean} Whether to add option to form to unlink
 * @param [options.includePattern] {boolean} Whether to add option to form to specify pattern (for matching other labels)
 * @param [options.pattern] {string} Regular expression string pattern to use for matching other labels (used if `options.includePattern` is true)
 */
WordNetLinker.prototype.showSynsets = function(label, callback, options) {
  options = options || {};
  var scope = this;
  function __showSynsetsForm(err, synsets, prevSynsets) {
    prevSynsets = prevSynsets || [];
    var currentSynset = options.currentSynset;
    var currentSynsetKey = options.currentSynsetKey || (currentSynset? currentSynset.wn30synsetkey : null);

    // TODO: Improved ranking
    // Let's sort the synsets based on wn30synsetkey
    synsets = _.sortBy(synsets, function(s) {
      var synsetkey = s.wn30synsetkey || '';
      var word = synsetkey.split('.')[0];
      var labelMatched = word === label;
      var p = labelMatched? '0-' : '1-';
      return p + synsetkey;
    });

    var currentIndex = -1;
    if (currentSynsetKey) {
      currentIndex = _.findIndex(synsets, function(synset) {
        return (synset.wn30synsetkey === currentSynsetKey);
      });
      if (currentIndex >= 0) {
        currentSynset = synsets[currentIndex];
      }
    }

    if (err) {
      UIUtil.showAlert(null, 'Error looking up WordNet synsets', 'alert-danger', 2000, '10pt').css('bottom', '5px');
      console.error(err); // TODO: handles error for now but might want to improve.
      if (callback) { callback(err); }
    } else {
      var form_prefix = 'form_' + _.generateRandomId(5);
      var formInputs = [];
      var messageBefore = '';
      if (currentIndex < 0 && currentSynset) {
        var div = $('<div></div>');
        div.append($('<b></b>').append(currentSynset.words.join(',')));
        div.append($('<br/>'));
        div.append($('<span></span>').text(currentSynset.gloss));
        div.append($('<br/>'));
        messageBefore = div.get(0).outerHTML;
      }
      var wordparts;
      if (synsets.length) {
        var inputOptions = _.map(synsets, function (synset, index) {
          var opt_html = $('<span></span>').text(synset.gloss).attr('title', synset.wn30synsetkey).get(0).outerHTML;
          if (options.includeHyponyms) {
            var expandHyponymsDiv = $('<span></span>');
            var button = $('<button type="button" class="btn btn-success btn-xs"></button>').text('+').attr('id', form_prefix + '_synset_' + synset.synsetid);
            expandHyponymsDiv.append(button);
            opt_html = expandHyponymsDiv.get(0).outerHTML + opt_html;
          }
          return {text: opt_html, value: index};
        });
        formInputs.push({
          title: 'Link synset to label: ' + label,
          name: 'link',
          inputType: 'radio',
          inputOptions: inputOptions,
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
      if (options.includePattern) {
        formInputs.push({
          title: 'Link all labels matching pattern',
          name: 'pattern',
          inputType: 'text',
          value: options.pattern,
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
      }
      if (options.includeUnlink) {
        formInputs.push({
          title: 'Unlink',
          name: 'unlink',
          inputType: 'boolean'
        });
      }

      var form = new Form("Select a synset to link to the label", formInputs);
      var dialog = form.form(
        function (results) {
          if (results) {
            var selectedLink = results['link'];
            if (selectedLink != '' && selectedLink != null) {
              results.selectedLinkIndex = parseInt(selectedLink);
            }
            results.synsets = synsets;
          }
          if (callback) { callback(null, results) };
        }
      );
      if (wordparts) {
        _.each(wordparts, function(w, i) {
          var b = dialog.find('#' + form_prefix + '_word_' + i);
          b.click(function() {
            scope.showSynsets(w, callback, options);
            dialog.trigger("escape.close.bb");
          });
        });
      }
      if (prevSynsets.length) {
        var last = prevSynsets[prevSynsets.length-1];
        var footer = dialog.find('.modal-footer');
        var backButton = $('<button></button>')
          .attr('data-bb-handler', 'back')
          .attr('class', 'btn btn-primary pull-left')
          .attr('type', 'button')
          .text('Back')
          .click(function() {
            __showSynsetsForm(null, last, prevSynsets.slice(0, prevSynsets.length-1));
            dialog.trigger("escape.close.bb");
          });
        footer.prepend(backButton);
      }
      if (options.includeHyponyms) {
        _.each(synsets, function (synset, index) {
          var b = dialog.find('#' + form_prefix + '_synset_' + synset.synsetid);
          b.click(function() {
            scope.wordnet.getTaxonomyNodes(synset, function(err, taxNodes) {
              if (err) {
                if (_.isString(err) && err.startsWith('Unknown nodes')) {
                  // Some relations maybe trimmed....
                  b.hide();
                } else {
                  UIUtil.showAlert(null, 'Error looking up hyponyms for ' + synset.wn30synsetkey, 'alert-danger', 2000, '10pt').css('bottom', '5px');
                }
              } else {
                //console.log(taxNodes);
                if (taxNodes && taxNodes.length && taxNodes[0].children && taxNodes[0].children.length) {
                  prevSynsets.push(synsets);
                  __showSynsetsForm(null, taxNodes[0].children, prevSynsets);
                  dialog.trigger("escape.close.bb");
                } else {
                  b.hide();
                }
              }
            });
          });
        });
      }
    }
  }

  this.wordnet.synsets(label + '.n', __showSynsetsForm);
}
;

/**
 * User wants to start linking to wordnet
 * @param labelInfos {LabelInfo[]} Full set of labelInfos that we are interested in
 * @param label {string} Label to link
 * @param pattern {string} Regular expression pattern for matching other labels that the linkage should also apply to
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
    var currentSynset = labelInfo.synset;
    var currentSynsetKey = _.get(labelInfo.data, "wn30synsetkey");
    this.showSynsets(label, function(err, results) {
      scope.setHighlightedLabelInfos([]);
      if (results) {
        var search = results['search'];
        pattern = results['pattern'];
        if (search) {
          scope.linkWordNet(labelInfos, search, pattern);
        } else if (results['unlink']) {
          if (pattern) {
            labelInfos = scope.getMatchingLabelInfos(pattern);
          }
          scope.linkAll(labelInfos);
        } else if (results.selectedLinkIndex >= 0) {
          if (pattern) {
            labelInfos = scope.getMatchingLabelInfos(pattern);
          }
          var selectedSynset = results.synsets[results.selectedLinkIndex];
          scope.linkAll(labelInfos, selectedSynset);
        }
      }
    }, {
      currentSynset: currentSynset,
      currentSynsetKey: currentSynsetKey,
      pattern: pattern,
      includePattern: true,
      includeUnlink: true
    });
  } else {
    // If multiple labels, show alert about invalid link
    UIUtil.showAlert(null, 'Please select one label for linking to WordNet', 'alert-info', 2000, '10pt').css('bottom', '5px');
  }
};

/**
 * Indicate the labelInfos are special by highlighting them
 * @param labelInfos {LabelInfo[]}
 */
WordNetLinker.prototype.setHighlightedLabelInfos = function(labelInfos) {
  return this.app.labelsPanel.setHighlighted(labelInfos);
};

/**
 * Returns label infos that matches the specified regular expression
 * @param pattern {string} Regular expression to match
 * @returns {LabelInfo[]}
 */
WordNetLinker.prototype.getMatchingLabelInfos = function(pattern) {
  return this.app.labelsPanel.getMatching(pattern, true);
};

/**
 * Links all labels with synset
 * @param labelInfos {LabelInfo[]}
 * @param synset {nlp.WordNet.Synset}
 */
WordNetLinker.prototype.linkAll = function(labelInfos, synset) {
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'linkAll', { labelInfo: labelInfos, synset: synset });
  for (var i = 0; i < labelInfos.length; i++) {
    this.__link(labelInfos[i], synset);
  }
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'linkAll', { labelInfo: labelInfos, synset: synset } );
};

/**
 * Links label with synset
 * @param labelInfo {LabelInfo}
 * @param synset {nlp.WordNet.Synset}
 */
WordNetLinker.prototype.link = function(labelInfo, synset) {
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'link', { labelInfo: labelInfo, synset: synset });
  this.__link(labelInfo, synset);
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'link', { labelInfo: labelInfo, synset: synset });
};

WordNetLinker.prototype.__link = function(labelInfo, synset) {
  var oldSynset = labelInfo.synset;
  if (synset) {
    // Add synset info to data (keeping other important fields intact)
    labelInfo.data = _.merge(labelInfo.data || {}, {
      wn30synsetid: synset.wn30synsetid,
      wn30synsetkey: synset.wn30synsetkey
    });
    labelInfo.synset = synset;
    //console.log("synset is now: " + currentSynset.gloss);
    this.__indicateLinked(labelInfo, synset);
  } else {
    if (labelInfo.data) {
      // Strip synset info from data (keeping other important fields intact)
      labelInfo.data = _.omit(labelInfo.data, ['wn30synsetid', 'wn30synsetkey']);
      if (_.isEmpty(labelInfo.data)) {
        labelInfo.data = null;
      }
    }
    labelInfo.synset = null;
    this.__indicateLinked(labelInfo);
  }
  this.Publish('linkUpdated', { labelInfo: labelInfo, linked: synset, unlinked: oldSynset });
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
    $(labelInfo.element).attr("title", synset.wn30synsetkey + '\n' + synset.gloss);
    linkButton.css("color", "green");
  } else {
    $(labelInfo.element).removeAttr("title");
    linkButton.css("color", "gray");
  }
};

/**
 * Indicate that a label is linked by adding a little green glyphicon-link to the label
 * If not linked, the glyphicon-link is grayed out.
 * If we support linking the glyphicon-link is clickable and will open up the link form
 * @param labelInfo {LabelInfo} Label to be linked
 */
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

/**
 * Callback for WordNetLinker.showSynsets
 * @callback synsetsFormCallback
 * @memberof nlp
 * @param {err} Error
 * @param {nlp.WordNet.SynsetsFormResult} Synsets form selection results
 */

/**
 * Information returned from a synset selection form
 * @typedef SynsetsFormResult
 * @type {object}
 * @property {nlp.WordNet.Synset[]} List of synsets that were matched
 * @property {int} selectedLinkIndex Which synset was selected
 * @property {string} search Term used for synset search
 * @property {string} pattern Regular expression pattern for matching additional labels
 * @property {boolean} unlink Whether the link should be removed or not
 * @memberOf nlp
 */

module.exports = WordNetLinker;

