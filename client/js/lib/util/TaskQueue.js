var PubSub = require('PubSub');
var async = require('async');

// Basic task queue (wrapper around async.queue)
// If we need more functionality, consider switching to https://github.com/diamondio/better-queue
// TODO: Improve so we can use to replace usage of d3-queue
function TaskQueue(opts) {
  PubSub.call(this);
  opts = opts || {};
  var concurrency = opts.concurrency || 1;
  var handler = opts.taskHandler || function(task, callback) {
      task(callback);
  };
  var scope = this;
  this.__queue = async.queue(handler, concurrency);
  this.__queue.drain = function() {
    scope.Publish('drain');
  };
}

TaskQueue.prototype = Object.create(PubSub.prototype);
TaskQueue.prototype.constructor = TaskQueue;

TaskQueue.prototype.push = function(task) {
  this.__queue.push(task);
};

TaskQueue.prototype.defer = function(task) {
  this.push(task);
};

TaskQueue.prototype.awaitAll = function(callback) {
  if (this.__queue.idle()) {
    setTimeout(function() { callback(); }, 0);
  } else {
    var scope = this;
    this.SubscribeOnce('drain', this, function() {
      // Keep waiting until it done, really really done!
      setTimeout(function() { scope.awaitAll(callback); }, 0);
    });
  }
};

module.exports = TaskQueue;