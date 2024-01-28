// Label Parsers (checks if a label is a specific format and p
const ArchTypes = ['wall', 'floor', 'ceiling'];
const PortalTypes = ['door', 'window'];
const FrameTypes = ['door_frame', 'window_frame'];

class ObjectPartLabelParser {
  constructor() {
    this.__regex = /^([A-Za-z \-_]+)\.([0-9]+)(:([A-Za-z \-_]+)\.([0-9]+))?$/;
    this.labelsObjectPart = true;
  }

  get description() {
    return 'objectName.objectId:partName.partId';
  }

  parseLabel(label, out, populateExtra) {
    out = out || {};
    const matched = this.__regex.exec(label);
    // console.log('got matched', matched);
    delete out.objectLabel;
    delete out.objectLabelInstId;
    delete out.partLabel;
    delete out.partLabelInstId;
    if (matched) {
      out.objectLabel = matched[1];
      out.objectLabelInstId = matched[2];     // object id (unique for the given objectLabel)
      if (matched.length > 3) {
        out.partLabel = matched[4];
        out.partLabelInstId = matched[5];     // part id (unique for the given partLabel for the object)
      }
      if (populateExtra) {
        out.objectInstId = out.objectLabel + '.' + out.objectLabelInstId;
        if (out.partLabel != null) {
          out.partInstId = out.partLabel + '.' + out.partLabelInstId;
          out.isPart = true;
          if (PortalTypes.indexOf(out.partLabel) >= 0) {
            // door or window
          } else if (out.objectInstId === out.partInstId || FrameTypes.indexOf(out.partLabel) >= 0) {
            out.isFixedBasePart = true;
          }
        } else {
          out.isObject = true;
        }
        if (ArchTypes.indexOf(out.objectLabel) >= 0) {
          out.isArch = true;
        }
      }
      return out;
    }
  }

  parse(labelInfo) {
    labelInfo.data = labelInfo.data || {};
    return this.parseLabel(labelInfo.label, labelInfo.data);
  }
}

const labelParsersByName = {
  'ObjectPartLabelParser': ObjectPartLabelParser
};

class LabelParsers {
  static getLabelParser(labelParser) {
    if (typeof(labelParser) === 'string') {
      return new labelParsersByName[labelParser]();
    } else {
      return labelParser;
    }
  }
}

module.exports = LabelParsers;

