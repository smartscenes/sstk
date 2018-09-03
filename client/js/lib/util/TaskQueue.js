var PubSub = require('PubSub');
var async = require('async');

/**
 * Basic task queue (wrapper around async.queue)
 * If we need more functionality, consider switching to https://github.com/diamondio/better-queue
 * @param opts Options to the task queue
 * @param [opts.concurrency=1] {int} Max number of concurrent tasks
 * @param [opts.taskHandler] {function(task,callback)} What to do for each task.  By default, the task will be called with the callback function.
 * @constructor
 */
function TaskQueue(opts) {
  // TODO: Improve so we can use to replace usage of d3-queue
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

/**
 * Queue another task onto the task queue
 * @param task
 */
TaskQueue.prototype.push = function(task) {
  this.__queue.push(task);
};

/**
 * Queue another task onto the task queue (alias for queue)
 * @param task
 */
TaskQueue.prototype.defer = function(task) {
  this.push(task);
};

/**
 * Wait for all tasks to finish
 * @param callback
 */
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