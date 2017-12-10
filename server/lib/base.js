"use strict";

Object.filter = function( obj, predicate) {
    var result = {}, key;

    for (key in obj) {
        if (obj.hasOwnProperty(key) && !predicate(obj[key])) {
            result[key] = obj[key];
        }
    }
    return result;
};

exports.getReqParam = function(req, param, def) {
    if (req.param[param]) return req.param;
    else return def;
};

exports.concatAllArrays = function(obj) {
    var flat = [];
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            flat = flat.concat(obj[prop]);
        }
    }
    return flat;
};

exports.getUserId = function (req) {
  var userId;
  if (req.query["userId"]) {
    userId = req.query["userId"];
  } else if (req.body["userId"]) {
    userId = req.body["userId"];
  } else {
    var ip_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    userId = "USER@" + ip_address;
  }
  return userId;
};

exports.getSessionId = function (req) {
  var sessionId;
  if(req.query["sessionId"]) {
    sessionId = req.query["sessionId"];
  } else if (req.body["sessionId"]) {
    sessionId = req.body["sessionId"];
  } else {
    sessionId = "local-session";
  }
  return sessionId;
};

// Copy properties from src to dest
exports.copyProperties = function(src, dest, props) {
  if (props) {
    // Predefined set of properties
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      if (src.hasOwnProperty(prop) && src[prop] != null) {
        dest[prop] = src[prop];
      }
    }
  } else {
    // All properties
    for (var prop in src) {
      if (src.hasOwnProperty(prop) && src[prop] != null) {
        dest[prop] = src[prop];
      }
    }
  }
};

if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str){
        return this.slice(0, str.length) == str;
    };
}

if (typeof String.prototype.endsWith != 'function') {
    String.prototype.endsWith = function (str){
        return this.slice(-str.length) == str;
    };
}

// [B](f: (A) ? [B]): [B]  ; Although the types in the arrays aren't strict (:
if (typeof Array.prototype.flatMap != 'function') {
    Array.prototype.flatMap = function(lambda) {
        return Array.prototype.concat.apply([], this.map(lambda));
    };
}
