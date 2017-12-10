'use strict';

var self = this;

// DOM.

function gotoURL(url) {
  window.location.replace(url);
}

self.gotoURL = gotoURL;

function showAlert(message, style, timeout) {
  window.setTimeout(function() { hideAlert(); }, timeout || 5000);
  $('#alertMessage').html(message);
  var alert = $('#alert');
  alert.attr('class', 'alert');
  alert.addClass(style);
  alert.css('font-size', '18pt');
  alert.show();
}

self.showAlert = showAlert;

function hideAlert() {
  $('#alert').hide();
}

self.hideAlert = hideAlert;
