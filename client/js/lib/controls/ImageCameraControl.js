/**
 * Allow for setting camera by clicking viewpoint associated with an Image
 * (currently logic for setting the camera is outside of this class)
 * @memberOf controls
 */
class ImageCameraControl {
  /**
   * Initialize the ImageCameraControl
   * @param params
   * @param params.container {jQuery} container in which the images are placed
   * @param params.onClickCallback {function(viewpoint)} Callback when an image is clicked
   * @param [params.entriesPerRow=1] {number} Number of images to show per row
   * @param [params.debug=false] {debug} Whether to print debug messages
   */
  constructor(params) {
    this.entriesPerRow = 1;
    this.archId = null;
    this.viewpoints = null;
    this.debug = false;

    this.viewpointImageElemMap = new Map(); // A map from the viewpoint to the imageElement. Used to update the image when thumbnail url is set.

    if (params) {
      this.container = params.container;
      this.onClickCallback = params.onClickCallback;
      if (params.entriesPerRow !== undefined) this.entriesPerRow = params.entriesPerRow;
      if (params.debug !== undefined) this.debug = params.debug;
    }
  }

  setImageViewpoints(archId, viewpoints) {
    this.viewpoints = viewpoints;
    this.archId = archId;
    this.viewpointImageElemMap.clear();
    this.showImages();
  }

  __createImageElem(viewpoint, i) {
    const url = viewpoint.rgbUrl;
    const elem = $('<div></div>')
      .attr('class', 'searchResult')
      .attr('id', 'image.' + this.archId + '.' + i);
    const image = $('<img/>');
    elem.append((image)
      .attr('src', url).attr('width', '100%')
      .attr('class', 'enlarge'));
    const info = viewpoint.info;
    if (info) {
      image.attr('title', JSON.stringify(info, null, 1));
    }

    image.click(() => {
      this.onClickCallback(viewpoint);
    });

    this.viewpointImageElemMap.set(this.viewpoints[i], image);

    return elem;
  }

  showImages() {
    this.container.empty();
    if (this.viewpoints.length === 0) {
      this.container.append('<span>No images</span>');
      return;
    }

    const resultsElem = $('<div></div>').attr('class', 'imageResults');
    this.container.append(resultsElem);
    const w = (resultsElem.width() - 40) / this.entriesPerRow;
    const table = $('<table margin=2></table>');
    let row;
    const limit = this.viewpoints.length;
    const tdCss = {
      'width': w + 'px',
      'height': w + 'px'
    };

    for (let i = 0; i < limit; i++) {
      const elem = this.__createImageElem(this.viewpoints[i], i);
      const tdElem = $('<td></td>').css(tdCss).append(elem);
      if ((i % this.entriesPerRow) === 0) {
        row = $('<tr></tr>');
        table.append(row);
      }
      row.append(tdElem);

    }
    resultsElem.append(table);
  }

  updateImage(viewpoint, imageField) {
    const elem = this.viewpointImageElemMap.get(viewpoint);
    const imageUrl = viewpoint[imageField];
    elem.attr('src', imageUrl);
    if (this.debug) {
      console.log({elem: elem, url: imageUrl});
    }
  }

  updateThumbnail(viewpoint) {
    if (viewpoint.thumbnailUrl) {
      this.updateImage(viewpoint, 'thumbnailUrl');
    }
  }

  onResize() {
    const imageElems = this.container.find('td');
    const w = (this.container.width() - 40) / this.entriesPerRow;
    imageElems.each(function (index, elem) {
      $(this).css('width', w).css('height', w);
    });
  }
}

module.exports = ImageCameraControl;
