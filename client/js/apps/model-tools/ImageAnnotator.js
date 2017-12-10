'use strict';

define(['../../lib/ui/CanvasUtil', 'Constants','base'],
    function (CanvasUtil, Constants) {
      function ImageAnnotator(container) {
        this.container = null;
        this.img = null;
        this.init(container);
      }

      ImageAnnotator.prototype.init = function (container) {
        this.container = container;
        var width = this.container.clientWidth;
        var height = this.container.clientHeight;

        var mId = (window.globals) ? window.globals.modelId : 'wss.f0b4f696e91f59af18b14db3b83de9ff'; // Default Cat
        var baseId = (mId.indexOf('.') !== -1) ? mId.split('.')[1] : mId;
        var userId = (window.globals) ? window.globals.userId : 'USER';
        $('#modelId').val(mId);
        $('#userId').val(userId);

        var imageSrc = Constants.baseUrl + '/data/models3d/wss/image/' + baseId + '.jpg';
        var maxSize = Math.min(500, width, height);
        CanvasUtil.setImageAsBackground(imageSrc, container, maxSize);
      };

      // Exports
      return ImageAnnotator;
    });
