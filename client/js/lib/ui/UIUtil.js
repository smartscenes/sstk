// Utility functions for creating some simple UI elements

//var bootbox = require('bootbox');

var self = {};

// Hookup bootbox stuff
//if (bootbox != undefined) {
//  self.confirm = bootbox.confirm;
//  self.dialog = bootbox.dialog;
//  self.prompt = bootbox.prompt;
//}

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

function setupLocalLoading(loadLocalFile, loadLocalFilename, loadFromLocalFn, allowMultiple, fileTypes) {
  // console.log('setup local loading');
  // Load from local button
  loadLocalFile.change(function () {
    var input = $(this);
    var numFiles = input.get(0).files ? input.get(0).files.length : 0;
    var label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
    //input.trigger('fileselect', [numFiles, label]);
    loadLocalFilename.val(label);
    if (numFiles > 0 && loadFromLocalFn) {
      console.log('Loading ' + label);
      var fileType;
      if (fileTypes) {
        fileType = fileTypes.val();
      }
      if (allowMultiple) {
        loadFromLocalFn(input.get(0).files, fileType);  // Multiple files allowed
      } else {
        loadFromLocalFn(input.get(0).files[0], fileType);  // Only one file allowed
      }
    }
  });
}

self.setupLocalLoading = setupLocalLoading;

function createFileInput(params) {
  console.log('createFileInput', params);
  var id = params.id;
  var label = params.label;
  var loadFn = params.loadFn;
  var help = params.help;
  var hideFilename = params.hideFilename;
  var allowMultiple = params.allowMultiple;
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
  if (allowMultiple) {
    file.attr('multiple', 'multiple');
  } else {
    file.removeAttr('multiple');
  }
  var inputElements = {
    group: div,
    file: file,
    filename: filename
  };
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
  }
  if (loadFn) {
    setupLocalLoading(inputElements.file, inputElements.filename, loadFn, allowMultiple, inputElements.fileTypes);
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

function showAlert(parent, message, style, timeout, fontSize) {
  parent = parent || 'body';
  style = style || 'alert-danger';
  fontSize = fontSize || '18pt';
  var alertMessage = $('<span class="center"/>');
  var alertBox = $('<div class="alert"/>');
  alertBox.append($('<button class="close" type="button"/>').html('&times').click(
    function() { destroyAlert(alertBox); }));
  alertBox.append(alertMessage);

  setTimeout(function() { destroyAlert(alertBox); }, timeout || 5000);
  alertMessage.html(message);
  alertBox.addClass(style);
  alertBox.css('font-size', fontSize);
  //alertBox.css('z-index', '10').css('position', 'absolute').css('margin-left', 'auto').css('margin-right', 'auto');
  alertBox.show();
  $(parent).append(alertBox);
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

module.exports = self;

