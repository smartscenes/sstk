var self = {};

var getJSON = function (url, callback) {
  var FileLoader = require('io/FileLoader');
  var loader = new FileLoader();
  loader.loadErrorFirst(url, 'json', callback);

  //var xobj = new XMLHttpRequest();
  ////xobj.overrideMimeType('application/json');
  //xobj.open('GET', url, !isSync);
  //xobj.onreadystatechange = function () {
  //  if (xobj.readyState == 4) {
  //    if (xobj.status == '200' || xobj.status == '304') {
  //      // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
  //      callback(null, xobj.responseText);
  //    } else {  // assume error
  //      callback(xobj.status, null);
  //    }
  //  }
  //};
  //xobj.send(null);
};

self.getJSON = function (url, callback) {
  var __done = function (data) {
    if (callback) {
      callback(null, data);
    } else {
      console.log('getJSON received from ' + url);
      console.log(data);
    }
  };
  var __fail = function (err) {
    if (callback) {
      callback(err, null);
    } else {
      console.error('getJSON error from ' + url);
      console.error(err);
    }
  };
  var f = function () {

  };

  f.done = function (cb) {
    __done = cb;
    return f;
  };

  f.fail = function (cb) {
    __fail = cb;
    return f;
  };

  getJSON(url, function (err, res) {
    if (err) {
      __fail({ err: err, url: url, res: res });
    } else {
      __done(res);
    }
  });

  return f;
};

module.exports = self;