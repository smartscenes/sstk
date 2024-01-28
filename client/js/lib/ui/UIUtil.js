// Utility functions for creating some simple UI elements

//var bootbox = require('bootbox');

var _ = require('util/util');

var self = {};

// Hookup bootbox stuff
//if (bootbox != undefined) {
//  self.confirm = bootbox.confirm;
//  self.dialog = bootbox.dialog;
//  self.prompt = bootbox.prompt;
//}

self.MOUSEBUTTONS_LEFT = 0x01;
self.MOUSEBUTTONS_RIGHT = 0x02;

function isMouseButtonPressed(event, button) {
  return !!(event.buttons & button);
}
self.isMouseButtonPressed = isMouseButtonPressed;
self.isRightMouseButtonPressed = function(event) {
  return isMouseButtonPressed(event, self.MOUSEBUTTONS_RIGHT);
};
self.isLeftMouseButtonPressed = function(event) {
  return isMouseButtonPressed(event, self.MOUSEBUTTONS_LEFT);
};

self.addWaitingMessageToForm = function(dialog, message) {
  const footer = dialog.find('.modal-footer');
  if (message == null) {
    message = 'Please wait...';
  }
  footer.prepend($('<p class="text-center mb-0"><i class="fa fa-spin fa-cog"></i>' + message + '</p>'));
};

function createGlyphIconButton(name) {
  return $('<button></button>')
    .attr('class', 'btn btn-default')
    .append($('<i></i>').attr('class', 'glyphicon ' + name));
}

self.createGlyphIconButton = createGlyphIconButton;

function createGlyphIcon(name) {
  return $('<span></span>')
    .append($('<i></i>').attr('class', 'glyphicon ' + name));
}

self.createGlyphIcon = createGlyphIcon;

function createGlyphShowHideButton(field, onChanged=null, isVisible= 'isVisible', initialState=false,
                                   visibleIcon='glyphicon-eye-open', hiddenIcon='glyphicon-eye-close') {
  function updateButtonState(button, visible) {
    if (visible) {
      button.find('.glyphicon').removeClass(hiddenIcon).addClass(visibleIcon);
    } else {
      button.find('.glyphicon').removeClass(visibleIcon).addClass(hiddenIcon);
    }
  }
  var showButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon"></i></button>');
  field[isVisible] = initialState;
  updateButtonState(showButton, field[isVisible]);
  showButton.click(function () {
    field[isVisible] = !field[isVisible];
    updateButtonState(showButton, field[isVisible]);
    if (onChanged) {
      onChanged(field[isVisible]);
    }
  });
  return showButton;
}

self.createGlyphShowHideButton = createGlyphShowHideButton;

function createNumberSpinner(opts) {
  var input = $('<input/>').attr('id', opts.id).attr('name', opts.name || opts.id);
  var label = $('<label></label>').attr('for', opts.id).append(opts.label);
  var span = $('<span></span>');
  span.append(label).append(input);
  var spinnerOpts = _.pick(opts, ['min', 'max', 'step']);
  if (opts.change) {
    spinnerOpts.change = function(event, ui) {
      var v = input.spinner('value');
      opts.change(v);
    };
  }
  input.spinner(spinnerOpts);
  if (opts.value != undefined) {
    input.spinner('value', opts.value);
  }
  return { div: span, label: label, input: input };
}

self.createNumberSpinner = createNumberSpinner;

function __createSelectWithOptions(options, defaultValue) {
  var select = $('<select></select>');
  for (var i = 0; i < options.length; i++) {
    var s = options[i];
    var value;
    var label;
    if (typeof(s) === 'string') {
      label = s;
      value = s;
    } else {
      label = s.text;
      value = (s.value != null)? s.value : s.text;
    }
    select.append('<option value="' + value + '">' + label + '</option>');
  }
  if (defaultValue != null) {
    select.val(defaultValue);
  }
  if (select.selectNext == null) {
    select.selectNext = function() {
      var sel = select[0];
      var i = sel.options.selectedIndex;
      sel.options[++i%sel.options.length].selected = true;
      select.change();
    };
  }
  return select;
}

function __createSelect(options, defaultValue) {
  var id = options.id;
  var select = __createSelectWithOptions(options.options, defaultValue);
  if (options.change) {
    select.change(() => options.change(select.val()));
  }
  if (options.id != null) {
    select.attr('id', id);
  }
  var label = null;
  if (options.text != null) {
    label = $('<label></label>').attr('for', options.id).text(options.text);
  }
  return { label: label, select: select };
}

function createSelect(options, defaultValue) {
 if (_.isArray(options)) {
   return __createSelectWithOptions(options, defaultValue);
 } else {
   return __createSelect(options, defaultValue);
 }
}
self.createSelect = createSelect;


function createCheckbox(options, defaultValue) {
  var id = options.id;
  var checkbox = $('<input/>').attr('type', 'checkbox')
    .attr('id', id)
    .prop('checked', defaultValue);
  if (options.change) {
    checkbox.change(() => options.change(checkbox.prop('checked')));
  }
  var label = null;
  if (options.text != null) {
    label = $('<label></label>').attr('for', id).text(options.text);
  }
  return { label: label, checkbox: checkbox };
}

self.createCheckbox = createCheckbox;

function createTextbox(options, defaultValue) {
  var id = options.id;
  var textbox = $('<input/>').attr('type', 'text')
    .attr('id', id)
    .prop('checked', defaultValue);
  if (options.change) {
    textbox.change(() => options.change(textbox.val()));
  }
  var label = null;
  if (options.text != null) {
    label = $('<label></label>').attr('for', id).text(options.text);
  }
  return { label: label, textbox: textbox };
}

self.createTextbox = createTextbox;

function setupLocalLoading(loadLocalFile, loadLocalFilename, loadFromLocalFn, allowMultipleFn, fileTypes) {
  // console.log('setup local loading');
  // Load from local button
  loadLocalFile.click(function() {
    // Force on change if same file is selected
    this.value = null;
  });
  loadLocalFile.change(function () {
    var input = $(this);
    var numFiles = input.get(0).files ? input.get(0).files.length : 0;
    var label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
    //input.trigger('fileselect', [numFiles, label]);
    if (loadLocalFilename) {
      loadLocalFilename.val(label);
    }
    if (numFiles > 0 && loadFromLocalFn) {
      console.log('Loading ' + label);
      var fileType;
      if (fileTypes) {
        fileType = fileTypes.val();
      }
      var allowMultiple = allowMultipleFn && allowMultipleFn(fileType);
      if (allowMultiple) {
        loadFromLocalFn(input.get(0).files, fileType);  // Multiple files allowed
      } else {
        loadFromLocalFn(input.get(0).files[0], fileType);  // Only one file allowed
      }
    }
  });
}

self.setupLocalLoading = setupLocalLoading;

function getAllowMultipleFn(allowMulti) {
  if (typeof allowMulti === 'function') {
    return allowMulti;
  } else if (typeof allowMulti === 'boolean' || !allowMulti) {
    return function() { return false; };
  } else if (typeof allowMulti === 'object') {
    return function(fileType) { return allowMulti[fileType]; };
  } else {
    throw "Cannot convert to function";
  }
}

function popupFileInput(callback) {
  var x = document.createElement("INPUT");
  x.setAttribute("type", "file");
  x.style.visibility = "hidden";
  document.body.appendChild(x);
  setupLocalLoading($(x), null, callback);
  $(x).click();
}
self.popupFileInput = popupFileInput;

/**
 * Create a file input (with element for file and element for displaying the filename) with labels for local loading
 * @param params
 * @param [params.id] {string} DOM id prefix for the fileinput elements (existing elements are used if found)
 * @param [params.label] {string} Label to show on load button
 * @param [params.loadFn] {function} Callback for loading the selected file
 * @param [params.help] {string} Message to show for the help element
 * @param [params.hideFilename] {boolean} Whether the filename is hidden
 * @param [params.allowMultiple] {boolean} Whether multiple input files are allowed
 * @param [params.inline] {boolean} Whether to use inline span or a separate div
 * @param [params.style] {string} How to style the fileinput ('bootstrap' (default), 'basic', 'existing', 'hidden')
 * @param [params.labelButton] {jQuery} JQuery element for the load button (used for 'existing' style)
 * @param [params.fileTypes] {string[]} Allowed filetypes (a separate select element is created if specified)
 * @returns {{file: jQuery, filename: jQuery, group: jQuery, fileTypes: jQuery}}
 */
function createFileInput(params) {
  console.log('createFileInput', params);
  var id = params.id;
  var label = params.label;
  var loadFn = params.loadFn;
  var help = params.help;
  var hideFilename = params.hideFilename;
  var allowMultipleFn = getAllowMultipleFn(params.allowMultiple);
  var inline = params.inline;
  var style = params.style || 'bootstrap';
  var fileTypes = params.fileTypes;

  var file = $('#' + id + 'File');
  var filename = $('#' + id + 'Filename');
  var div;
  if (file.length === 0 || filename.length === 0) {
    div = inline? $('<span/>') : $('<div/>');
    file = $('<input/>').attr('id', id + 'File').attr('type', 'file');
    filename = $('<input/>').attr('id', id + 'Filename').attr('type', 'text').prop('readonly', true);
    if (style === 'basic') {
      var labelButton = $('<input/>').attr('id', id + 'Button').attr('type', 'button').attr('value', label);
      labelButton.click(function() { file.click(); });
      file.hide();
      div.append(labelButton).append(file).append(filename);
    } else if (style === 'existing') {
        var labelButton = params.labelButton;
        labelButton.click(function() { file.click(); });
        file.hide();
        div.append(file).append(filename);
    } else if (style !== 'hidden') {
      // bootstrap style (default)
      filename.addClass('form-control');
      div.append(
        $('<span/>').addClass('input-group-btn')
          .append($('<span/>').addClass('btn').addClass('btn-default').addClass('btn-file').text(label)
            .append(file))
          .append(filename));
    }
    if (hideFilename) {
      filename.hide();
    }
    if (help) {
      var helpIcon = createGlyphIcon('glyphicon-question-sign');
      helpIcon.attr('title', help).addClass('helpicon');
      div.prepend(helpIcon);
    }
  }
  function updateFileMultiple(allowMulti) {
    if (allowMulti) {
      file.attr('multiple', 'multiple');
    } else {
      file.removeAttr('multiple');
    }
  }
  var inputElements = {
    group: div,
    file: file,
    filename: filename
  };
  updateFileMultiple(allowMultipleFn());
  if (fileTypes) {
    var fileTypesSelect = $('<select></select>');
    for (var i = 0; i < fileTypes.length; i++) {
      var f = fileTypes[i];
      if (typeof(f) !== 'object') {
        f = { value: f, label: f };
      }
      fileTypesSelect.append($('<option>').attr('value', f.value).text(f.label));
    }
    if (style === 'bootstrap') {
      fileTypesSelect.addClass('btn').addClass('btnDefault');
    }
    file.parent().after(fileTypesSelect);
    inputElements.fileTypes = fileTypesSelect;
    fileTypesSelect.change(function(event) {
      var allowMulti = allowMultipleFn(fileTypesSelect.val());
      updateFileMultiple(allowMulti);
    });
  }
  if (loadFn) {
    setupLocalLoading(inputElements.file, inputElements.filename, loadFn, allowMultipleFn, inputElements.fileTypes);
  }
  return inputElements;
}

self.createFileInput = createFileInput;

function hookupLeftSplitBar(element, left, right, parent) {
  parent = parent || $(window);
  function resizeElements(offsetX) {
    var x = offsetX - left.element.offset().left;
    if (x > left.min && x < left.max && offsetX < (parent.width() - right.min)) {
      left.element.css("width", x);
      //right.element.css("margin-left", x);
      right.element.css("width", parent.width() - x);
    }
  }

  element.mousedown(function (e) {
    e.preventDefault();
    $(document).mousemove(function (e) {
      e.preventDefault();
      resizeElements(e.pageX);
    });
  });
  $(document).mouseup(function (e) {
    $(document).unbind('mousemove');
  });
  window.addEventListener("resize", function () {
    resizeElements(left.element.offset().left + left.element.width());
  });
}

self.hookupLeftSplitBar = hookupLeftSplitBar;

function destroyAlert(alertBox) {
  alertBox.hide();
  alertBox.remove();
}

function createAlert(message, style, timeout, fontSize) {
  style = style || 'alert-danger';
  fontSize = fontSize || '18pt';
  timeout = (timeout == undefined)? 5000 : timeout;
  var alertMessage = $('<span class="center"/>');
  var alertBox = $('<div class="alert"/>');
  alertBox.append($('<button class="close" type="button"/>').html('&times').click(
    function() { destroyAlert(alertBox); }));
  alertBox.append(alertMessage);

  if (timeout > 0) {
    var timeoutId = setTimeout(function () { destroyAlert(alertBox); }, timeout);
    alertBox.data('timeoutId', timeoutId);
  }
  alertMessage.html(message);
  alertBox.addClass(style);
  alertBox.css('font-size', fontSize);
  return alertBox;
}

function __showAlert(parent, message, style, timeout, fontSize) {
  parent = parent || 'body';
  var alertBox = createAlert(message, style, timeout, fontSize);
  alertBox.show();
  $(parent).append(alertBox);
  return alertBox;
}

function showAlertWithPanel(parent, message, style, timeout, fontSize) {
  return __showAlert(parent, message, style, timeout, fontSize);
}

self.showAlertWithPanel = showAlertWithPanel;

function showOverlayAlert(parent, message, style, timeout, fontSize) {
  parent = parent || 'body';
  var alertBox = createAlert(message, style, timeout, fontSize);
  alertBox.css('z-index', '10').css('position', 'absolute').css('margin-left', 'auto').css('margin-right', 'auto');
  alertBox.show();
  $(parent).prepend(alertBox);
  return alertBox;
}

self.showOverlayAlert = showOverlayAlert;

function showAlert(message, style, timeout, fontSize) {
  var args = _.processArguments(arguments, ['message', 'style', 'timeout', 'fontSize']);
  var alertBox = (args.id != null)? $('#alert-' + args.id) : null;
  if (alertBox && alertBox.length) {
    // alertBox is already there...
    // clear old timeout, flash message
    var oldTimeoutId = alertBox.data('timeoutId');
    if (oldTimeoutId != null) {
      clearTimeout(oldTimeoutId);
    }
    if (timeout > 0) {
      setTimeout(function () { destroyAlert(alertBox); }, timeout);
    }
  } else {
    if (args.overlay) {
      alertBox = showOverlayAlert(args.parent, args.message, args.style, args.timeout, args.fontSize);
    } else {
      alertBox = __showAlert(args.parent, args.message, args.style, args.timeout, args.fontSize);
    }
    if (args.id) {
      alertBox.attr('id', 'alert-' + args.id);
    }
  }
  return alertBox;
}

self.showAlert = showAlert;

function makeToggleable(controlElement, toggleable) {
  controlElement.click(function () {
    toggleable.toggle();
  });
}

self.makeToggleable = makeToggleable;

function createVideoElement(videoUrl) {
  var video = $('<video autoplay controls></video>').attr('src', videoUrl);
  return video;
}

function bindVideoPreview(element) {
  var imgs = element.find('img.videoPreview');
  imgs.each(function (index) {
    var img = $(this);
    if (!img.attr('data-video-bound')) {
      img.click(function (event) {
        var videoUrl = img.attr('data-video');
        var video = createVideoElement(videoUrl);
        video.click(function (event) {
          video.hide();
          img.show();
        });
        img.parent().append(video);
        img.hide();
      });
      img.attr('data-video-bound', true);
    }
  });
}

self.bindVideoPreview = bindVideoPreview;

function setupUIHookups(uihookups, keymap) {
  if (uihookups) {
    for (var k in uihookups) {
      if (uihookups.hasOwnProperty(k)) {
        var h = uihookups[k];
        if (h) {
          if (h.element) {
            var element = $(h.element);
            element.click(h.click);
            if (h.shortcut) {
              keymap(_.defaults({on: h.shortcut, do: h.name}, h.keyopts || {}), h.click);
            }
          } else if (h.shortcut) {
            keymap(_.defaults({on: h.shortcut, do: h.name}, h.keyopts || {}), h.click);
          }
        }
      }
    }
  }
}

self.setupUIHookups = setupUIHookups;

function createButton(opts, keymap) {
  var button = $('<input/>')
    .attr('type', 'button')
//    .attr('class', 'btn btn-default')
//    .attr('role', 'button')
    .attr('value', opts.name);
  if (opts.class != null) {
    button.addClass(opts.class);
  }

  var callback = (opts.callback != null)? opts.callback : opts.click;
  button.click(callback);
  if (opts.shortcut != null || opts.accessKey != null) {
    var shortcut = (opts.shortcut != null)? opts.shortcut : opts.accessKey;
    keymap(_.defaults({on: shortcut, do: opts.name}, opts.keyopts || {}), callback);
  }
  return button;
}

self.createButton = createButton;

function addItems(panel, items, keymap) {
  _.forEach(items, (v,k) => {
    if (v.type === 'select') {
      var select = createSelect(v);
      if (select.label) {
        panel.append(select.label);
      }
      if (select.label) {
        panel.append(select.label);
      }
      panel.append(select.select);
      v.element = select.select;
    } else if (v.type === 'button') {
      var button = createButton(v, keymap);
      panel.append(button);
      v.element = button;
    } else if (v.type === 'checkbox') {
      var checkbox = createCheckbox(v, v.defaultValue);
      if (checkbox.label) {
        panel.append(checkbox.label);
      }
      panel.append(checkbox.checkbox);
      v.element = checkbox.checkbox;
    } else {
      if (v.items) {
        var div = createPanel(v, keymap);
        panel.append(div);
        v.element = div;
      } else {
        var button = createButton(v, keymap);
        panel.append(button);
        v.element = button;
      }
    }
  });
}

function createPanel(options, keymap) {
  var panel = $('<div></div>');
  if (options.name != null) {
    panel.append($('<label></label>').append(options.name)).append('&nbsp;');
  }
  if (options.items) {
    addItems(panel, options.items, keymap);
  }
  return panel;
}
self.createPanel = createPanel;

function copy(selector) {
  var copyText = document.querySelector(selector);
  copyText.select();
  document.execCommand("copy");
}

module.exports = self;

