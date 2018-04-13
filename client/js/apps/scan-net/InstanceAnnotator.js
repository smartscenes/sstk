var SegmentAnnotator = require('./SegmentAnnotator');
var _ = require('util');

/**
 * Annotator for quickly marking object instances
 * @param params Configuration (see {@link SegmentAnnotator} for details)
 * @constructor
 * @extends SegmentAnnotator
 * @memberOf scannet
 */
function InstanceAnnotator(params) {
  var defaults = {
    uihookups: _.keyBy([
      {
        name: 'copyAndLabel',
        click: function () {
          var part = this.labeler.findLabelablePart(this.painter.getLastMousePosition());
          if (part) {
            var labelInfo = this.labelsPanel.copySelected(this.labelsPanel.defaultLabel);
            this.labeler.labelPart(part, labelInfo);
          }
        }.bind(this),
        shortcut: 'space'
      }
    ]),
    // Use label pointer (point at something and press buttons)
    useLabelPointer: true,
    // Whether to enforce checking of distance constraint for whether a segment is labelable or not
    checkLabelable: false,
    // Messages for instance level labeling
    messages: {
      // Don't prompt to label largest unlabeled segment
      labelLargest: false,
      // Final check before session ends
      checkOkFinal: 'Please check you have identified all object instances. Click "Cancel" to fix problems, or "Ok" to submit.'
    }
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  SegmentAnnotator.call(this, params);
}

InstanceAnnotator.prototype = Object.create(SegmentAnnotator.prototype);
InstanceAnnotator.prototype.constructor = InstanceAnnotator;

module.exports = InstanceAnnotator;