'use strict';

define([], function () {

  function ImagesPanel(params) {
    // Number of images to show per row
    this.entriesPerRow = 3;
    // Model/Scene id of current object;
    this.itemId = null;
    // List of image urls for the model/scene
    this.imageUrls = [];
    // Placeholder for large image
    var img = $('<img/>');
    this.largeImg = $('<span></span>').attr('class','large');
    this.largeImg.append(img);
    if (params) {
      // Panel showing images for this model/scene
      this.container = params.container;

      // Application callback when image is clicked on
      // Parameters: image url
      this.onClickImageCallback = params.onClickImageCallback;

      // Number of textures to show per row (default is 3 columns)
      if (params.entriesPerRow !== undefined) this.entriesPerRow = params.entriesPerRow;
    }
  }

  ImagesPanel.prototype.setImageUrls = function (itemId, imageUrls) {
    this.itemId = itemId;
    this.imageUrls = imageUrls;
    this.showImages(this.imageUrls);
  };

  ImagesPanel.prototype.createImageElem = function (imageUrl, i) {
    //var title = result.name;
    var url = imageUrl;
    var elem = $('<div></div>')
        .attr('class', 'searchResult')
        .attr('id', 'image.' + this.itemId + '.' + i);
    //            .attr('title', title);
    elem.append($('<img/>').attr('src',url).attr('width', '100%').attr('class', 'enlarge'));
    if (this.onClickImageCallback) {
      elem.click(function () { this.onClickImageCallback(imageUrl);}.bind(this));
    }
    return elem;
  };

  function showLarge(elem, largeImg) {
      var url = elem.attr('src');
      elem.addClass('enlarged');
      var align = elem.attr('enlarge_align');
      if (!align) {
        align = 'center';
      }
      var img = largeImg.find('img');
      img.show();
      img.attr('src', url);
      img.position({
        my: align,
        at: align,
        of: elem
      });
      img.off('hover');
      img.hover(function () {
      },function () {
        $(this).hide();
        elem.removeClass('enlarged');
      });
    }

  ImagesPanel.prototype.showImages = function (imageUrls) {
    this.container.empty();
    // If there were no images, notify the user of this
    if (imageUrls.length === 0) {
      this.container.append('<span>No images</span>');
      return;
    }

    var resultsElem = $('<div></div>').attr('class', 'imageResults');
    this.container.append(resultsElem);
    var w = (resultsElem.width() - 40) / this.entriesPerRow;
    var table = $('<table margin=2></table>');
    var row;
    var limit = imageUrls.length;
    var tdCss = {
      'width': w + 'px',
      'height': w + 'px'
    };
    for (var i = 0; i < limit; i++) {
      var elem = this.createImageElem(imageUrls[i], i);
      var tdElem = $('<td></td>').css(tdCss).append(elem);
      if ((i % this.entriesPerRow) === 0) {
        row = $('<tr></tr>');
        table.append(row);
      }
      row.append(tdElem);
    }
    resultsElem.append(table);
    this.container.append(this.largeImg);
    var largeImg = this.largeImg;
    resultsElem.find('img.enlarge').hover(function () {
          showLarge($(this), largeImg);
        },function () {
        });
  };

  ImagesPanel.prototype.onResize = function () {
    var imageElems = this.container.find('td');
    var w = (this.container.width() - 40) / this.entriesPerRow;
    imageElems.each(function (index, elem) { $(this).css('width', w).css('height', w); });
  };

  // Exports
  return ImagesPanel;

});
