function SegmentAnnotationsViewer(params) {
  this.resultTableSelector = params.resultTableSelector || '#resultTable';
  this.loadingMessageSelector = params.loadingMessageSelector || '#loadingMessage';
  this.buttonsPanel = params.buttonsPanel;
  this.urlParams = getUrlParams();
  console.log(this.urlParams);

  this.baseUrl = params.baseUrl || '';
  this.listUrl = this.baseUrl + '/scans/segment-annotations/list';
  this.viewUrl = this.baseUrl + '/scans/segment-annotations/view';
  this.annotateUrl = this.baseUrl + '/scans/segment-annotator-single';
  this.alignUrl = this.baseUrl + '/scans/scan-model-aligner';
  this.editUrl = this.baseUrl + '/scans/annotations/edit';
  this.jsonUrl = this.baseUrl + '/scans/segment-annotations/aggregated';
  this.previewUrl = this.baseUrl + '/annotations/preview';
}

SegmentAnnotationsViewer.prototype.__onLoadIds = function(file) {
  var scope = this;
  var url = this.listUrl;
  var filename = file.name;
  var fileReader = new FileReader();
  fileReader.onload = function (fileLoadedEvent) {
    var loaded = fileLoadedEvent.target.result;
    var ids = loaded.split('\n').filter(function(id) { return id.trim().length > 0; });
    ids = _.uniq(_.filter(_.map(ids, function(id) { return parseInt(id); }), function(id) { return isFinite(id); }));
    if (ids.length > 0) {
      //console.log('creating segment annotations table again...');
      var resultTable = $(scope.resultTableSelector);
      resultTable.DataTable().destroy();
      resultTable.empty();
      scope.createAnnotationsTable({
        ajaxOptions:  {
          url: url + '?format=json',
          data: {
            id: ids
          },
          dataSrc: ''
        }
      });
    } else {
      console.warn('No ids');
    }
  };
  fileReader.readAsText(file, 'UTF-8');
};

SegmentAnnotationsViewer.prototype.init = function(params) {
  this.createCommon();
  if (params.groupBy) {
    this.createGroupedAnnotationsTable(params);
  } else if (params.showAnnParts) {
    this.createSegmentsTable(params);
  } else {
    this.createAnnotationsTable(params);
  }
};

SegmentAnnotationsViewer.prototype.createCommon = function() {
  var buttonsPanel = $(this.buttonsPanel);
  var paramsNoStatus = _.pick(this.urlParams, ['itemId']);
  var annotationsDropDown = createDropDown('Annotations',
    [
      createLink('All', getFilterLink(this.listUrl, {}, paramsNoStatus))
        .attr('title', 'Show all annotations'),
      createLink('Unprocessed', getFilterLink(this.listUrl, {status: {'$isnull': ''}}, paramsNoStatus))
        .attr('title', 'Show unprocessed annotations'),
      createLink('Cleaned', getFilterLink(this.listUrl, {status: 'cleaned', '$clean': true}, paramsNoStatus))
        .attr('title', 'Show cleaned annotations'),
      createLink('Rejected', getFilterLink(this.listUrl, {status: 'rejected'}, paramsNoStatus))
        .attr('title', 'Show rejected annotations')
    ]
  );
  buttonsPanel.append(annotationsDropDown);

  var paramsNoItemId = _.pick(this.urlParams, ['status', '$clean', 'clean']);
  var datasetsDropDown = createDropDown('Datasets',
    [
      createLink('All', getFilterLink(this.listUrl, {}, paramsNoItemId))
        .attr('title', 'All'),
      createLink('ScanNet', getFilterLink(this.listUrl, {itemId: {'$regex': 'scan-checked.*'}}, paramsNoItemId))
        .attr('title', 'ScanNet'),
      createLink('NYU', getFilterLink(this.listUrl, {itemId: {'$regex': 'nyu.*'}}, paramsNoItemId))
        .attr('title', 'NYU'),
      createLink('MPR', getFilterLink(this.listUrl, {itemId: {'$regex': 'mpr[.].*'}}, paramsNoItemId))
        .attr('title', 'MPR'),
      createLink('MPRM', getFilterLink(this.listUrl, {itemId: {'$regex': 'mprm[.].*'}}, paramsNoItemId))
        .attr('title', 'MPRM')
    ]
  );
  buttonsPanel.append(datasetsDropDown);

  var fields = [ { name: 'itemId', text: 'Scan' },
    { name: 'status', text: 'Status' },
    { name: 'workerId', text: 'Worker' },
    { name: 'condition', text: 'Condition' },
    { name: 'taskMode', text: 'Task Mode' },
    { name: 'label', text: 'Label' } ];
  var scope = this;
  var groupsDropDown = createDropDown('Grouped',
    _.map(fields, function(field) {
      return createLink(field.text, getFilterLink(scope.listUrl, {'$groupBy': field.name}, scope.urlParams));
    })
  );
  buttonsPanel.append(groupsDropDown);

  var loadIds = createFileInput(
    { id: 'loadIds', label: 'Load Ids', loadFn: this.__onLoadIds.bind(this),
      hideFilename: true, inline: true,
      help: 'Upload list of annotation ids for inspection'});
  loadIds.group.addClass('btn-group');
  buttonsPanel.append(loadIds.group);
};

SegmentAnnotationsViewer.prototype.createAnnotationsTable = function(params) {
  var scope = this;
  var resultTableSelector = params.resultTableSelector || this.resultTableSelector;
  var loadingMessageSelector = params.loadingMessageSelector || this.loadingMessageSelector;
  var annotations = params.annotations || [];
  var ajaxOptions = params.ajaxOptions;
  if (typeof annotations === 'string') {
    ajaxOptions = {
      "url": annotations,
      "dataSrc": ""
    };
    annotations = null;
  }

  if (ajaxOptions.dataSrc === '') {
    ajaxOptions.dataSrc = function(anns) {
      for (var i = 0; i < anns.length; i++) {
        var ann = anns[i];
        if (ann.data && ann.data.stats && ann.data.stats.totalVertices) {
          ann.data.stats = { total: ann.data.stats, delta: ann.data.stats };
        }
      }
      return anns;
    }
  }

  $(loadingMessageSelector).css('visibility', 'visible');
  var resultTable = $(resultTableSelector);
  var lazyImgLoadCallback = $.fn.dataTable.getLazyImgLoadCallback();
// Setup our editor
  var notes = getValues(annotations, 'notes', ['dup', 'replaced', 'bad', 'old'])
    .filter(function (x) {
      return x && x.length <= 20;
    });
  var editor = new $.fn.dataTable.Editor( {
    ajax: {
      url: this.editUrl,
      data: function(d) { return JSON.stringify(d); },
      contentType: "application/json; charset=utf-8"
    },
    table: resultTableSelector,
    idSrc:  'id',
    fields:
      [ {
          label: "Status",
          name: "status",
          type: "selectize",
          options: [{label: 'rejected', value: 'rejected'},
            {label: 'flagged', value: 'flagged'},
            {label: 'ignore', value: 'ignore'},
            {label: 'none', value: ''}]
        },
        {
          label: "Verified",
          name: "verified",
          type: "checkbox",
          separator: "|",
          options:   [
            { label: '', value: 1 }
          ]
        },
        {
          label: "Condition",
          name: "condition"
        },
        {
          label: "Notes",
          name: "notes",
          type: "autoComplete",
          opts: {
            'minLength': 0,
            'source': notes
          }
        }
      ]
  });

// Activate an inline edit on click of a table cell
  resultTable.on( 'click', 'tbody td.bubble', function (e) {
    editor.bubble( this );
  } );
  resultTable.on( 'click', 'tbody td.inline', function (e) {
    editor.inline( this );
  } );
  resultTable.on( 'click', 'tbody td.inline-selectize', function (e) {
    editor.inline( this, {
      onReturn: 'none',
      buttons: { label: '&gt;', fn: function () { this.submit(); } }
    });
  });
  resultTable.on( 'change', 'input.editor-verified', function () {
    editor
      .edit( $(this).closest('tr'), false )
      .set( 'verified', $(this).prop( 'checked' ) ? 1 : 0 )
      .submit();
  } );

  function getViewUrl(ann) {
    var url = scope.viewUrl + '?annotationId=' + ann.id + '&modelId=' + ann.itemId;
    if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
      url = url + '&segmentType=' + ann.data.metadata.segmentType;
    }
    return url;
  }

  function getAlignUrl(ann) {
    var url = scope.alignUrl + '?segmentAnnotationId=' + ann.id + '&modelId=' + ann.itemId;
    if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
      url = url + '&segmentType=' + ann.data.metadata.segmentType;
    }
    return url;
  }

  function getFixupUrl(ann) {
    var url = scope.annotateUrl + '?startFrom=' + ann.id + '&modelId=' + ann.itemId + '&taskMode=fixup&condition=manual';
    if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
      url = url + '&segmentType=' + ann.data.metadata.segmentType;
    }
    return url;
  }

  function getFixupLatestUrl(ann) {
    return scope.annotateUrl + '?startFrom=latest' + '&modelId=' + ann.itemId + '&taskMode=fixup&condition=manual';
  }

  function getFixupAggrUrl(ann) {
    return scope.annotateUrl + '?startFrom=aggr' + '&modelId=' + ann.itemId + '&taskMode=fixup&condition=manual';
  }

  function createViewLink(ann, label, extraParams) {
    var url = getViewUrl(ann);
    if (extraParams) {
      url += ('&' + $.param(extraParams));
    }
    return createLink(label, url, '_blank');
  }

  function createJsonLink(ann, label, extraParams) {
    var url = scope.jsonUrl + '?annId=' + ann.id;
    if (extraParams) {
      url += ('&' + $.param(extraParams));
    }
    return createLink(label, url, '_blank');
  }

  function createFilterLink(ann, field) {
    return createFilterLinks(scope.listUrl, ann, field);
  }

  function createPreviewImage(ann, imgurl) {
    var url = getViewUrl(ann);
    if (typeof ann.data === 'string') {
      ann.data = JSON.parse(ann.data);
    }
    var title = ann.data? JSON.stringify(ann.data, undefined, 2) : '';
    var elem = $('<a></a>').attr('href', url).attr('target', '_blank')
      .append($('<img/>').attr('class', 'lazy').attr('data-src', imgurl)
        .attr('title', title).attr('alt', ann.id).css('max-width', '128px'));
    return elem;
  }

  // Setup our columns
  var columns = [
    {
      "data": "id",
      "title": "Id",
      render: function (data, type, full, meta) {
        return getHtml(createGroup([createViewLink(full, full.id), createJsonLink(full, 'json')], 'div'));
      }
    },
    {
      "data": "status",
      "title": "Status",
      "className": "inline-selectize",
      defaultContent: "",
      render: function (data, type, full, meta) {
        if (full.status === 'cleaned') {
          var div = $('<div></div>');
          div.append(createViewLink(full, full.status, {clean: true}).addClass('noedit'));
          div.append('<br/>');
          div.append(createButton('F', getFixupUrl(full) + '&clean=true', 'Fixup').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('FL', getFixupLatestUrl(full) + '&clean=true', 'Fixup from latest').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('FA', getFixupAggrUrl(full) + '&clean=true', 'Fixup from aggr').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('V', getViewUrl(full) + '&clean=true&mode=verify', 'Verify segments').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('A', getAlignUrl(full) + '&clean=true', 'Align CAD models').addClass('btn-sm noedit').attr('target', '_blank'));
          return getHtml(div);
        } else if (!full.status) {
          var div = $('<div></div>');
          div.append(createButton('F', getFixupUrl(full), 'Fixup').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('FL', getFixupLatestUrl(full), 'Fixup from latest').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('FA', getFixupAggrUrl(full), 'Fixup from aggr').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('V', getViewUrl(full) + '&mode=verify', 'Verify segments').addClass('btn-sm noedit').attr('target', '_blank'));
          div.append(createButton('A', getAlignUrl(full), 'Align CAD models').addClass('btn-sm noedit').attr('target', '_blank'));
          return getHtml(div);
        } else {
          return data;
        }
      }
    },
    {
      "data": "notes",
      "title": "Notes",
      "className": "inline",
      defaultContent: ""
    },
    {
      "data": "verified",
      "title": "Verified",
      defaultContent: "",
      render: function ( data, type, row ) {
        if ( type === 'display' ) {
          return '<input type="checkbox" class="editor-verified">';
        } else {
          return data;
        }
      },
      className: "dt-body-center"
    },
    { // Preview image
      "title": "Preview",
      "data": null,
      "orderable": false,
      "searchable": false,
      "defaultContent": "",
      "render": function (data, type, full, meta) {
        var previewUrl = scope.previewUrl + '/' + full.id;
        return getHtml(createPreviewImage(full, previewUrl));
      }
    },
    {
      "data": "label",
      "title": "Labels",
      defaultContent: "",
      "render": function (data, type, full, meta) {
        if (data) {
          var labels = data.split(',');
          var labelCounts = _.countBy(labels);
          return getHtml($('<span></span>').text(JSON.stringify(labelCounts, undefined, 2)));
        } else {
          return data;
        }
      }
    },
    {
      "data": "nlabels",
      "title": "# Labels",
      defaultContent: ""
    },
    {
      "data": "ninstances",
      "title": "# Objects",
      defaultContent: ""
    },
    {
      "data": "data.stats.total.percentComplete",
      "title": "% Complete",
      defaultContent: ""
    },
    {
      "data": "data.stats.total.totalVertices",
      "title": "# Vertices",
      defaultContent: ""
    },
    {
      "data": "data.timings.durations.annotationSubmit",
      "title": "Duration",
      defaultContent: "",
      render: function (data, type, full, meta) {
        if (data) { return data/1000; }
        else return data;
      }
    },
    {
      "data": "itemId",
      "title": "Model",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "itemId"));
      }
    },
    {
      "data": "condition",
      "title": "Condition",
      className: "inline",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "condition"));
      }
    },
    {
      "data": "taskMode",
      "title": "TaskMode",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "taskMode"));
      }
    },
    {
      "data": "workerId",
      "title": "Worker",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "workerId"));
      }
    },
    {
      "data": "created_at",
      "title": "Time"
    },
    {
      "data": "sessionId",
      "title": "Session",
      "visible": false, defaultContent: ""
    }
  ];

// Add footer to our table (header is taken care of by data tables)
  $.fn.dataTable.addFooters({ table: resultTable, columns: columns });

// Initialize data table!!!
  resultTable.dataTable({
    "lengthMenu": [[25, 50, 100, -1], [25, 50, 100, "All"]],
    "fixedHeader": true,
    "order": [[ 0, "desc" ]],
    "deferRender": true,
    "stateSave": true,
    "data": annotations,
    "ajax": ajaxOptions,
    "dom": 'BlfripFtip',
    "buttons": [
      'csv', 'colvis', 'orderNeutral', 'selectAll', 'selectNone',
      { extend: "edit",   editor: editor }
    ],
    "select": true,
    "columns": columns,
    "rowCallback": function( row, aData, iDisplayIndex ) {
      // Set the checked state of the checkbox in the table
      $('input.editor-verified', row).prop( 'checked', aData.verified == 1 );
      $('.noedit', row).on('mousedown mouseup click', function(e) { e.stopPropagation(); });
      lazyImgLoadCallback(row, aData, iDisplayIndex);
      return row;
    },
    "initComplete": function() {
      $.fn.dataTable.addColumnFilters({ table: resultTable });
      resultTable.css('visibility', 'visible');
      resultTable.show();
      $(loadingMessageSelector).hide();
    }
  });
};

SegmentAnnotationsViewer.prototype.createSegmentsTable = function(params) {
  var scope = this;
  var resultTableSelector = params.resultTableSelector || this.resultTableSelector;
  var loadingMessageSelector = params.loadingMessageSelector || this.loadingMessageSelector;
  var annotations = params.annotations || [];
  var ajaxOptions = params.ajaxOptions;
  if (typeof annotations === 'string') {
    ajaxOptions = {
      "url": annotations,
      "dataSrc": ""
    };
    annotations = null;
  }

  $(loadingMessageSelector).css('visibility', 'visible');
  var resultTable = $(resultTableSelector);
  var lazyImgLoadCallback = $.fn.dataTable.getLazyImgLoadCallback();
// Setup our editor
  var notes = getValues(annotations, 'notes', ['dup', 'replaced', 'bad', 'old'])
    .filter(function (x) {
      return x && x.length <= 20;
    });
  var editor = new $.fn.dataTable.Editor( {
    ajax: {
      url: this.editUrl,
      data: function(d) { return JSON.stringify(d); },
      contentType: "application/json; charset=utf-8"
    },
    table: resultTableSelector,
    idSrc:  'id',
    fields:
      [ {
        label: "Status",
        name: "status",
        type: "selectize",
        options: [{label: 'rejected', value: 'rejected'},
          {label: 'flagged', value: 'flagged'},
          {label: 'ignore', value: 'ignore'},
          {label: 'none', value: ''}]
      },
        // {
        //   label: "Condition",
        //   name: "condition"
        // },
        {
          label: "Notes",
          name: "notes",
          type: "autoComplete",
          opts: {
            'minLength': 0,
            'source': notes
          }
        }
      ]
  });

// Activate an inline edit on click of a table cell
  resultTable.on( 'click', 'tbody td.bubble', function (e) {
    editor.bubble( this );
  } );
  resultTable.on( 'click', 'tbody td.inline', function (e) {
    editor.inline( this );
  } );
  resultTable.on( 'click', 'tbody td.inline-selectize', function (e) {
    editor.inline( this, {
      onReturn: 'none',
      buttons: { label: '&gt;', fn: function () { this.submit(); } }
    });
  });

  function getViewUrl(ann) {
    var url = scope.viewUrl + '?annotationId=' + ann.id + '&modelId=' + ann.itemId;
    if (ann.data && ann.data.metadata && ann.data.metadata.segmentType) {
      url = url + '&segmentType=' + ann.data.metadata.segmentType;
    }
    return url;
  }

  function createViewLink(ann, label, extraParams) {
    var url = getViewUrl(ann);
    if (extraParams) {
      url += ('&' + $.param(extraParams));
    }
    return createLink(label, url, '_blank');
  }
  function createFilterLink(ann, field) {
    return createFilterLinks(scope.listUrl + '?$showAnnParts=true', ann, field);
  }

  function createPreviewImage(ann, imgurl) {
    var url = getViewUrl(ann);
    if (typeof ann.data === 'string') {
      ann.data = JSON.parse(ann.data);
    }
    var title = ann.data? JSON.stringify(ann.data, undefined, 2) : '';
    var elem = $('<a></a>').attr('href', url).attr('target', '_blank')
      .append($('<img/>').attr('class', 'lazy').attr('data-src', imgurl)
        .attr('title', title).attr('alt', ann.id).css('max-width', '128px'));
    return elem;
  }

  // Setup our columns
  var columns = [
    {
      "data": "id",
      "title": "Id",
      render: function (data, type, full, meta) {
        return getHtml(createViewLink(full, full.annId));
      }
    },
    {
      "data": "annId",
      "title": "annId",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "annId"));
      }
    },
    {
      "data": "status",
      "title": "Status",
      "className": "inline-selectize", defaultContent: "",
      render: function (data, type, full, meta) {
        if (full.status === 'cleaned' || full.status === 'verified') {
          return getHtml(createViewLink(full, full.status, {clean: true}));
        } else {
          return data;
        }
      }
    },
    {
      "data": "notes",
      "title": "Notes",
      "className": "inline", defaultContent: ""
    },
    {
      "data": "created_at",
      "title": "Time"
    },
    {
      "data": "sessionId",
      "title": "Session",
      "visible": false,
      defaultContent: ""
    },
    {
      "data": "workerId",
      "title": "Worker",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "workerId"));
      }
    },
    {
      "data": "modelId",
      "title": "Model",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "modelId"));
      }
    },
    {
      "data": "condition",
      "title": "Condition",
//      className: "inline",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "condition"));
      }
    },
    // {
    //   "data": "taskMode",
    //   "title": "TaskMode",
    //   defaultContent: "",
    //   render: function (data, type, full, meta) {
    //     return getHtml(createFilterLink(full, "taskMode"));
    //   }
    // },
    // { // Preview image
    //   "title": "Preview",
    //   "data": null,
    //   "orderable": false,
    //   "searchable": false,
    //   "defaultContent": "",
    //   "render": function (data, type, full, meta) {
    //     var previewUrl = scope.previewUrl + '/' + full.id;
    //     return getHtml(createPreviewImage(full, previewUrl));
    //   }
    // },
    {
      "data": "label",
      "title": "Label",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "label"));
      }
    },
    {
      "data": "labelType",
      "title": "Label type",
      "visible": false,
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "labelType"));
      }
    }
  ];

// Add footer to our table (header is taken care of by data tables)
  $.fn.dataTable.addFooters({ table: resultTable, columns: columns });

// Initialize data table!!!
  resultTable.dataTable({
    "lengthMenu": [[25, 50, 100, -1], [25, 50, 100, "All"]],
    "fixedHeader": true,
    "order": [[ 0, "desc" ]],
    "deferRender": true,
    "stateSave": true,
    "data": annotations,
    "ajax": ajaxOptions,
    "dom": 'BlfripFtip',
    "buttons": [
      'csv', 'colvis', 'orderNeutral', 'selectAll', 'selectNone',
      { extend: "edit",   editor: editor }
    ],
    "select": true,
    "columns": columns,
    "rowCallback": function( row, aData, iDisplayIndex ) {
      lazyImgLoadCallback(row, aData, iDisplayIndex);
      return row;
    },
    "initComplete": function() {
      $.fn.dataTable.addColumnFilters({ table: resultTable });
      resultTable.css('visibility', 'visible');
      resultTable.show();
      $(loadingMessageSelector).hide();
    }
  });
};

SegmentAnnotationsViewer.prototype.createGroupedAnnotationsTable = function (params) {
  var scope = this;
  var resultTableSelector = params.resultTableSelector || this.resultTableSelector;
  var loadingMessageSelector = params.loadingMessageSelector || this.loadingMessageSelector;
  var annotations = params.annotations || [];
  var groupBy = params.groupBy;
  var ajaxOptions = params.ajaxOptions;
  if (typeof annotations === 'string') {
    ajaxOptions = {
      "url": annotations,
      "dataSrc": ""
    };
    annotations = null;
  }

  $(loadingMessageSelector).css('visibility', 'visible');
  var resultTable = $(resultTableSelector);
  var lazyImgLoadCallback = $.fn.dataTable.getLazyImgLoadCallback();

  function createFilterLink(ann, field) {
    if (field === groupBy) {
      return createFilterLinks(scope.listUrl, ann, field, { indicateSpecialValues: true });
    } else {
      return $('<span></span>').append(ann[field] || "");
    }
  }

  // Setup our columns
  var columns = [
    {
      "data": "id",
      "title": "Annotations",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "id"));
      }
    },
    {
      "data": "status",
      "title": "Status",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "status"));
      }
    },
    {
      "data": "notes",
      "title": "Notes",
      defaultContent: ""
    },
    {
      "data": "workerId",
      "title": "Worker",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "workerId"));
      }
    },
    {
      "data": "itemId",
      "title": "Model",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "itemId"));
      }
    },
    {
      "data": "condition",
      "title": "Condition",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "condition"));
      }
    },
    {
      "data": "taskMode",
      "title": "TaskMode",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "taskMode"));
      }
    },
    {
      "data": "label",
      "title": "Label",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "label"));
      }
    },
    {
      "data": "created_at_min",
      "title": "Start",
      defaultContent: ""
    },
    {
      "data": "created_at_max",
      "title": "End",
      defaultContent: ""
    }
  ];

  // Initialize data table!!!
  resultTable.dataTable({
    "lengthMenu": [[25, 50, 100, -1], [25, 50, 100, "All"]],
    "fixedHeader": true,
    "order": [[ 0, "desc" ]],
    "deferRender": true,
    "stateSave": true,
    "data": annotations,
    "ajax": ajaxOptions,
    "dom": 'BlfripFtip',
    "buttons": [
      'csv', 'colvis', 'orderNeutral'
    ],
    "columns": columns,
    "rowCallback": function( row, aData, iDisplayIndex ) {
      lazyImgLoadCallback(row, aData, iDisplayIndex);
      return row;
    },
    "initComplete": function() {
      $.fn.dataTable.addColumnAggregations({ table: resultTable });
      resultTable.css('visibility', 'visible');
      resultTable.show();
      $(loadingMessageSelector).hide();
    }
  });
};
