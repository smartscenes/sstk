var PubSub = require('PubSub');
var _ = require('util/util');

var WaitPubSub = function () {
  PubSub.call(this);
  this._waiting = {};
};

WaitPubSub.prototype = Object.create(PubSub.prototype);
WaitPubSub.prototype.constructor = WaitPubSub;

Object.defineProperty(WaitPubSub.prototype, 'isWaiting', {
  get: function () {return !_.isEmpty(this._waiting); },
});

WaitPubSub.prototype.addWaiting = function(id, obj) {
  obj = obj || true;
  // console.log('added ', id);
  this._waiting[id] = obj;
};

WaitPubSub.prototype.removeWaiting = function(id) {
  delete this._waiting[id];
  // console.log('removed ', id);
  if (_.isEmpty(this._waiting)) {
    this.Publish('WaitingEmpty');
  }
};

WaitPubSub.prototype.waitAll = function(cb) {
  if (_.isEmpty(this._waiting)) {
    setTimeout(function() { cb(); }, 0);
  } else {
    this.SubscribeOnce('WaitingEmpty', this, function() { cb(); });
  }
};

module.exports = WaitPubSub;