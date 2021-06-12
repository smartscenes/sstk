var BaseGroupedViewer = require('../../part-annotator/GroupedAnnotationsViewer');
var _ = require('util/util');

function GroupedAnnotationsViewer(params) {
  BaseGroupedViewer.call(this, params);
  this.onHoverCallback = params.onHoverCallback || this.defaultOnHoverCallback.bind(this);
  this.hoveredImageChoice = $(params.hoverImageChoice);
  this.hoveredImageDiv = $(params.hoverImageDiv);
  this.urlTemplates = params.urlTemplates;
  if (this.urlTemplates) {
    _.templatizeCollection(this.urlTemplates);
  }
}

GroupedAnnotationsViewer.prototype = Object.create(BaseGroupedViewer.prototype);
GroupedAnnotationsViewer.prototype.constructor = GroupedAnnotationsViewer;

function createHoverImageEntry(imgUrl, metadata) {
  var img = $('<span></span>').append($('<img/>').attr('src', imgUrl).attr('height', '100px'));
  if (metadata) {
    if (metadata.id != null) {
      img.append(metadata.id);
    }
  }
  return img;
}

GroupedAnnotationsViewer.prototype.defaultOnHoverCallback = function(assetInfo, hovered, e) {
  if (hovered) {
    this.hoveredImageDiv.empty();
    assetInfo.__isHovered = true;
    if (this.urlTemplates && !assetInfo.articulationsByPart) {
      assetInfo.articulationsByPart = { status: 'pending'};
      var articulationsUrl = this.urlTemplates['articulations']({ id: assetInfo.id });
      _.getJSON(articulationsUrl)
        .done((data) => {
          //console.log('got articulations ' + assetInfo.id, assetInfo.__isHovered);
          assetInfo.articulationsByPart = _.groupBy(data, 'pid');
          if (assetInfo.__isHovered) {
            this.defaultOnHoverCallback(assetInfo, hovered, e);
          }
        })
        .fail((err) => {
          assetInfo.articulationsByPart = { status: 'failed'};
        });
    }

    var imageTemplates = this.imageUrlTemplates;
    var hoverImageType = this.hoveredImageChoice.val();
    var imageDiv = this.hoveredImageDiv;
    if (hoverImageType === 'connectivity') {
      var imgUrl = imageTemplates[hoverImageType]({id: assetInfo.id});
      imageDiv.append(createHoverImageEntry(imgUrl));
    } else if (hoverImageType === 'parts') {
      var nParts = assetInfo.nParts || 0;
      for (var i = 0; i < nParts; i++) {
        var imgUrl = imageTemplates[hoverImageType]({id: assetInfo.id, partIndex: i});
        imageDiv.append(createHoverImageEntry(imgUrl, { id: i }));
      }
    } else if (hoverImageType === 'articulations') {
      if (assetInfo.articulationsByPart && !assetInfo.articulationsByPart.status) {
        _.forEach(assetInfo.articulationsByPart, (v, pid) => {
          for (var i = 0; i < v.length; i++) {
            var imgUrl = imageTemplates[hoverImageType]({id: assetInfo.id, partIndex: pid, artIndex: i});
            imageDiv.append(createHoverImageEntry(imgUrl, { id: pid + '-' +i }));
          }
        });
      } else {
        imageDiv.append('Fetching articulations');
        assetInfo.__isShowFetching = true;
      }
    }
  } else {
    assetInfo.__isHovered = false;
    if (assetInfo.__isShowFetching) {
      this.hoveredImageDiv.empty();
      assetInfo.__isShowFetching = false;
    }
  }
  this.container.height(window.innerHeight - this.hoveredImageDiv.height() - 50);
};

GroupedAnnotationsViewer.prototype.onWindowResize = function () {
  this.container.height(window.innerHeight - this.hoveredImageDiv.height() - 50);
};


// NOTE: this is directly exposes as a bundle by the webapp config
// Exports
module.exports = { GroupedAnnotationsViewer: GroupedAnnotationsViewer };