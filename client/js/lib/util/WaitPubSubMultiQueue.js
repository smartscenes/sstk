const PubSub = require('PubSub');
const _ = require('util/util');

// WaitPubSub with multiple queues (or really just groups)
// queueName is at optional argument at the end for compatibility with WaitPubSub
class WaitPubSubMultiQueue extends PubSub {
  constructor() {
    super();
    this._waiting = {};
  }

  get isWaiting() {
    // Return true if there is any queue has outstanding requests
    return !this.isAllEmpty;
  }

  get isAllEmpty() {
    for (let key in this._waiting) {
      if (this.hasWaiting(key)) {
        return false;
      }
    }
    return true;
  }

  isQueueEmpty(queueName) {
    queueName = queueName || 'default';
    return (this._waiting[queueName] || _.isEmpty(this._waiting[queueName]));
  }

  hasWaiting(queueName) {
    return !this.isQueueEmpty(queueName);
  }

  addWaiting(id, obj, queueName) {
    obj = obj || true;
    // console.log('added ', id);
    queueName = queueName || 'default';
    if (!this._waiting[queueName]) {
      this._waiting[queueName] = {};
    }
    this._waiting[queueName][id] = obj;
  }

  removeWaiting(id, queueName) {
    queueName = queueName || 'default';
    if (this._waiting[queueName]) {
      delete this._waiting[queueName][id];
      // console.log('removed ', id);
      if (this.isQueueEmpty(queueName)) {
        if (this.isAllEmpty) {
          this.Publish('WaitingEmpty', null);
        } else {
          this.Publish('WaitingEmpty', queueName);
        }
      }
    }
  }

  waitQueueEmpty(queueName, cb) {
    // Waits until this queue is empty
    if (this.isQueueEmpty(queueName)) {
      setTimeout(function() { cb(); }, 0);
    } else {
      this.SubscribeOnce('WaitingEmpty', this, (qName) => {
        if (qName === queueName || qName == null) {
          cb();
        } else {
          // continue to wait
          this.waitQueueEmpty(queueName, cb);
        }
      });
    }
  }

  waitAll(cb) {
    // Wait for all queues to be empty
    if (this.isAllEmpty) {
      setTimeout(function() { cb(); }, 0);
    } else {
      this.SubscribeOnce('WaitingEmpty', this, (qName) => {
        if (qName == null) {
          cb();
        } else {
          // continue to wait
          this.waitAll(cb);
        }
      });
    }
  }
}

module.exports = WaitPubSubMultiQueue;