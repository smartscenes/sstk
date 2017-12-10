'use strict';

/**
 * PubSub defines a publisher/subscriber model. An object that extends PubSub can
 * register subscribers (functions) that will be called whenever the object 'publishes'
 * an event with a particular name. Published events can also come with an arbitrary
 * list of arguments which are passed to the subscriber functions.
 * @constructor
 **/
function PubSub() {
  this.subscribers = {};
}

PubSub.ALL = '*'; // All events

/**
 * Subscribes to all events
 * @param contextObj {Object} Context object (used for this when callback is called)
 * @param callback {function(string, args)} Callback when event is published
 * @param [opts.limit] {int} Limit on number of times to subscribe to these events
 * @constructor
 */
PubSub.prototype.SubscribeAll = function(contextObj, callback, opts) {
  this.Subscribe(PubSub.ALL, contextObj, callback, opts);
};

/**
 * Subscribes to event just once
 * @param eventname {string} Name of event to subscribe to
 * @param contextObj {Object} Context object (used for this when callback is called)
 * @param callback
 * @constructor
 */
PubSub.prototype.SubscribeOnce = function(eventname, contextObj, callback) {
  // Wait for event just once
  this.Subscribe(eventname, contextObj, callback, { limit: 1 });
};

/**
 * Subscribes to event
 * @param eventname {string} Name of event to subscribe to
 * @param contextObj {Object} Context object (used for this when callback is called)
 * @param callback {function(args)} Callback when event is published
 * @param [opts.limit] {int} Limit on number of times to subscribe to these events
 * @constructor
 */
PubSub.prototype.Subscribe = function (eventname, contextObj, callback, opts) {
  opts = opts || {};
  var subs = this.subscribers;
  if (!subs[eventname]) {
    subs[eventname] = [];
  }
  var esubs = subs[eventname];

  // Only add the callback if it hasn't already been added
  var found = false;
  for (var i = 0; i < esubs.length; i++) {
    var entry = esubs[i];
    if (entry.ctx === contextObj && entry.func === callback) {
      found = true;
      break;
    }
  }
  if (!found) {
    esubs.push({ ctx: contextObj, func: callback, count: 0, limit: opts.limit || 0 });
  }
};

/**
 * Unsubscribe from events
 * @param eventname {string} Name of event to unsubscribe from
 * @param contextObj {Object} Context object to match
 * @param [optCallback] {function} Optional callback (if specified, unsubscribe specific callback.  Otherwise, unsubscribes all callbacks associated with contextObj)
 * @constructor
 */
PubSub.prototype.Unsubscribe = function (eventname, contextObj, optCallback) {
  var subs = this.subscribers;
  var esubs = subs[eventname];
  if (!esubs) {
    return;
  }

  // Make list of subscribers we are keeping
  var newsubs = [];
  for (var i = 0; i < esubs.length; i++) {
    var entry = esubs[i];
    // This is the negation of (entry.ctx === contextObject) && (!optCallback || entry.func === optCallback)
    if (entry.ctx !== contextObj || (optCallback && (entry.func !== optCallback))) {
      newsubs.push(entry);
    }
  }
  subs[eventname] = newsubs;
};

/**
 * Publishes event
 * @param eventname {string} Name of event
 * @constructor
 */
PubSub.prototype.Publish = function (eventname) {
  var esubs = this.subscribers[eventname];
  var optargs = Array.prototype.slice.call(arguments, 1);
  if (esubs) {
    // Notify all subscribers - remove limited subscribers if they are done
    var removeIndices = [];
    esubs.forEach(function (entry,i) {
      entry.count++;
      entry.func.apply(entry.ctx, optargs);
      // Check if subscriber are done!
      if (entry.limit && entry.count >= entry.limit) {
        removeIndices.push(i);
      }
    });
    // Remove subscribers whose limit are reached
    if (removeIndices.length > 0) {
      console.log('Removing subscribers for event ' + eventname, removeIndices);
      // Remove these!
      var newsubs = [];
      for (var i = 0; i < esubs.length; i++) {
        if (removeIndices.indexOf(i) < 0) {
          newsubs.push(esubs[i]);
        }
      }
      this.subscribers[eventname] = newsubs;
    }
  }
  if (eventname !== PubSub.ALL && this.subscribers[PubSub.ALL]) {
    //console.log('publish to all');
    this.Publish.apply(this, [PubSub.ALL,eventname].concat(optargs));
  }
};

module.exports = PubSub;
