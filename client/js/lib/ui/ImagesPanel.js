function showLarge(elem, largeImg) {
  const url = elem.attr('src');
  elem.addClass('enlarged');
  let align = elem.attr('enlarge_align');
  if (!align) {
    align = 'center';
  }
  const img = largeImg.find('img');
  img.show();
  img.attr('src', url);
  img.position({
    my: align,
    at: align,
    of: elem
  });
  img.off('hover');
  img.hover(function () {
  }, function () {
    $(this).hide();
    elem.removeClass('enlarged');
  });
}

class ImagesPanel {
  constructor(params) {
    // Number of images to show per row
    this.entriesPerRow = 3;
    // Model/Scene id of current object;
    this.itemId = null;
    // List of image urls for the model/scene
    this.imageUrls = [];
    // Placeholder for large image
    const img = $('<img/>');
    this.largeImg = $('<span></span>').attr('class', 'large');
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

  setImageUrls(itemId, imageUrls) {
    this.itemId = itemId;
    this.imageUrls = imageUrls;
    this.showImages(this.imageUrls);
  }

  __createImageElem(imageUrl, i) {
    //var title = result.name;
    const url = imageUrl;
    const elem = $('<div></div>')
      .attr('class', 'searchResult')
      .attr('id', 'image.' + this.itemId + '.' + i);
    //            .attr('title', title);
    elem.append($('<img/>').attr('src', url).attr('width', '100%').attr('class', 'enlarge'));
    if (this.onClickImageCallback) {
      elem.click(function () {
        this.onClickImageCallback(imageUrl);
      }.bind(this));
    }
    return elem;
  }

  showImages(imageUrls) {
    this.container.empty();
    // If there were no images, notify the user of this
    if (imageUrls.length === 0) {
      this.container.append('<span>No images</span>');
      return;
    }

    const resultsElem = $('<div></div>').attr('class', 'imageResults');
    this.container.append(resultsElem);
    const w = (resultsElem.width() - 40) / this.entriesPerRow;
    const table = $('<table margin=2></table>');
    let row;
    const limit = imageUrls.length;
    const tdCss = {
      'width': w + 'px',
      'height': w + 'px'
    };
    for (let i = 0; i < limit; i++) {
      const elem = this.__createImageElem(imageUrls[i], i);
      const tdElem = $('<td></td>').css(tdCss).append(elem);
      if ((i % this.entriesPerRow) === 0) {
        row = $('<tr></tr>');
        table.append(row);
      }
      row.append(tdElem);
    }
    resultsElem.append(table);
    this.container.append(this.largeImg);
    const largeImg = this.largeImg;
    resultsElem.find('img.enlarge').hover(function () {
      showLarge($(this), largeImg);
    }, function () {
    });
  }

  onResize() {
    const imageElems = this.container.find('td');
    const w = (this.container.width() - 40) / this.entriesPerRow;
    imageElems.each(function (index, elem) {
      $(this).css('width', w).css('height', w);
    });
  }
}

// Exports
module.exports = ImagesPanel;
