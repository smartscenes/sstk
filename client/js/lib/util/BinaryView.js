'use strict';

var BinaryView = function () {
};

// dataview is a jDataView object
BinaryView.getLine = function (dataview, offset) {
  var byteLength = dataview.buffer.byteLength;
  if (offset >= byteLength) return null;
  var i = offset;
  while (i < byteLength) {
    var c = dataview.getChar(i);
    if (c === '\n') {
      break;
    }
    i++;
  }
  var str = dataview.getString(i - offset, offset);
  return {
    offset: offset,
    next: i + 1,
    string: str
  };
};

module.exports = BinaryView;

