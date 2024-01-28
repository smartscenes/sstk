const PubSub = require('PubSub');
const _ = require('util/util');

// Tracks outstanding requests and when they are done
// Don't really bother with whether tasks are submitted or resubmitted
// Just tracks what is outstanding
class WaitPubSub extends PubSub {
  constructor() {
    super();
    this._waiting = {};
  }

  get isWaiting() {
    return !_.isEmpty(this._waiting);
  }

  addWaiting(id, obj) {
    obj = obj || true;
    // console.log('added ', id);
    this._waiting[id] = obj;
  }

  removeWaiting(id) {
    delete this._waiting[id];
    // console.log('removed ', id);
    if (_.isEmpty(this._waiting)) {
      this.Publish('WaitingEmpty');
    }
  }

  waitAll(cb) {
    if (_.isEmpty(this._waiting)) {
      setTimeout(function() { cb(); }, 0);
    } else {
      this.SubscribeOnce('WaitingEmpty', this, function() { cb(); });
    }
  }
}

module.exports = WaitPubSub;