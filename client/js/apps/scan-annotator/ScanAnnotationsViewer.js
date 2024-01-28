const AnnotationsViewer = require('./AnnotationsViewer');

class ScanAnnotationsViewer extends AnnotationsViewer {
  constructor(params) {
    super(params);
    this.defaultViewerUrlTemplate = _.template(this.baseUrl + '/scene-viewer.html?sceneId=db.ann-${ann.id}&scanModelId=${ann.itemId}', { variable: 'ann'});
    this.viewerUrlTemplatesByTaskType = _.defaults(Object.create(null), params.viewerUrlTemplates || {});
    this.annotateUrlsByTaskType =  _.defaults(Object.create(null), params.annotatorUrls || {}, {
      'scan-obb-align': this.baseUrl + '/scans/scan-model-aligner'
    });
  }

  getViewUrl(ann) {
    let template = this.viewerUrlTemplatesByTaskType[ann.type];
    let url;
    if (template) {
      url = template(ann);
    } else {
      url = this.defaultViewerUrlTemplate(ann);
      if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
        url = url + '&segmentType=' + ann.data.metadata.segmentType;
      }
    }
    return url;
  }

  getFixupUrl(ann) {
    const annotateUrl = this.annotateUrlsByTaskType[this.type];
    let url;
    if (annotateUrl) {
      url = annotateUrl + '?startFrom=' + ann.id + '&modelId=' + ann.itemId + '&taskMode=fixup&condition=manual';
      if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
        url = url + '&segmentType=' + ann.data.metadata.segmentType;
      }
    }
    return url;
  }

  renderStatusColumn(data, type, fullInfo, meta) {
    const div = $('<div></div>');
    const fixUrl = this.getFixupUrl(fullInfo);
    if (fixUrl) {
      div.append(createButton('A', fixUrl, 'Continue annotation').addClass('btn-sm noedit').attr('target', '_blank'));
    }
    div.append(createButton('V', this.getViewUrl(fullInfo) + '&mode=verify', 'View').addClass('btn-sm noedit').attr('target', '_blank'));
    return getHtml(div);
  }
}

// Hack (to avoid creating a separate index file, and our simple webpack config exports everything as STK)
ScanAnnotationsViewer.ScanAnnotationsViewer = ScanAnnotationsViewer;

module.exports = ScanAnnotationsViewer;