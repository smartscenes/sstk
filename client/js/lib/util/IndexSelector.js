'use strict';

define([], function () {
  //constructor
  function IndexSelector(params) {
    this.set(params.current, params.min, params.max);
    this.wrap = params.wrap;
  }

  // increment current
  IndexSelector.prototype.inc = function () {
    this.current++;
    if (this.current > this.max) {
      this.current = (this.wrap) ? this.min : this.max;
    }
  };

  // decrement current
  IndexSelector.prototype.dec = function () {
    this.current--;
    if (this.current < this.min) {
      this.current = (this.wrap) ? this.max : this.min;
    }
  };

  IndexSelector.prototype.value = function () {
    return this.current;
  };

  // set values

  IndexSelector.prototype.set = function (v, min, max) {
    // Update thumbnail indices for new taxonomy
    this.current = (v !== undefined) ? v : -1;
    this.setBounds(min, max);
  };

  IndexSelector.prototype.setBounds = function (min, max) {
    this.min = (min !== undefined) ? min : this.current;
    this.max = (max !== undefined) ? max : min;
    if (this.current < this.min) {
      this.current = this.min;
    } else if (this.current > this.max) {
      this.current = this.max;
    }
  };

  //exports
  return IndexSelector;
});
