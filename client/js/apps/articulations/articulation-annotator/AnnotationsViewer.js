function AnnotationsViewer(params) {
  this.resultTableSelector = params.resultTableSelector || '#resultTable';
  this.loadingMessageSelector = params.loadingMessageSelector || '#loadingMessage';
  this.buttonsPanel = params.buttonsPanel;
  this.urlParams = getUrlParams();
  console.log(this.urlParams);

  this.baseUrl = params.baseUrl || '';
  this.listUrl = this.baseUrl + '/articulation-annotations/list';
  this.viewerUrlTemplate = _.template(this.baseUrl + '/motion-viewer?modelId=${ann.modelId}&task=motion-annotate&taskMode=fixup&startFrom=latest', { variable: 'ann'});
  this.annotateUrl = params.annotateUrl;
//  this.editUrl = this.baseUrl + '/annotations/edit';
  this.editUrl = this.baseUrl + '/articulation-annotations/edit';
//  this.jsonUrl = this.baseUrl + '/annotations/get';
  this.jsonUrl = this.baseUrl + '/articulation-annotations/load-annotations';
//  this.previewUrl = this.baseUrl + '/annotations/preview';
}

AnnotationsViewer.prototype.init = function(params) {
  this.createCommon();
  if (params.groupBy) {
    this.createGroupedAnnotationsTable(params);
  } else {
    this.createAnnotationsTable(params);
  }
};

AnnotationsViewer.prototype.createCommon = function() {
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

  var fields = [
    { name: 'status', text: 'Status' },
    { name: 'workerId', text: 'Worker' },
//    { name: 'condition', text: 'Condition' },
//    { name: 'taskMode', text: 'Task Mode' },
//    { name: 'label', text: 'Label' }
  ];
  var scope = this;
  var groupsDropDown = createDropDown('Grouped',
    _.map(fields, function(field) {
      return createLink(field.text, getFilterLink(scope.listUrl, {'$groupBy': field.name}, scope.urlParams));
    })
  );
  buttonsPanel.append(groupsDropDown);
};

AnnotationsViewer.prototype.createAnnotationsTable = function(params) {
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
    };
  }

  $(loadingMessageSelector).css('visibility', 'visible');
  var resultTable = $(resultTableSelector);
  var lazyImgLoadCallback = $.fn.dataTable.getLazyImgLoadCallback();
  var buttons = ['csv', 'colvis', 'orderNeutral', 'selectAll', 'selectNone'];
// Setup our editor
  if ($.fn.dataTable.Editor) {
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
    resultTable.on( 'change', 'input.editor-verified', function () {
      editor
        .edit( $(this).closest('tr'), false )
        .set( 'verified', $(this).prop( 'checked' ) ? 1 : 0 )
        .submit();
    } );

    buttons.push({ extend: "edit",   editor: editor });
  }

  function getViewUrl(ann) {
    //var url = scope.viewUrl + '?annotationId=' + ann.id + '&modelId=' + ann.itemId;
    var url = scope.viewerUrlTemplate(ann);
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

  function createViewLink(ann, label, extraParams) {
    var url = getViewUrl(ann);
    if (extraParams) {
      url += ('&' + $.param(extraParams));
    }
    return createLink(label, url, '_blank');
  }

  function createJsonLink(ann, label, extraParams) {
//    var url = scope.jsonUrl + '/' + ann.id;
    var url = scope.jsonUrl + '?modelId=' + ann.modelId;
    if (extraParams) {
      url += ('?' + $.param(extraParams));
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
      // render: function (data, type, full, meta) {
      //   var div = $('<div></div>');
      //   div.append(createButton('A', getFixupUrl(full), 'Continue annotation').addClass('btn-sm noedit').attr('target', '_blank'));
      //   div.append(createButton('V', getViewUrl(full) + '&mode=verify', 'View').addClass('btn-sm noedit').attr('target', '_blank'));
      //   return getHtml(div);
      // }
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
      "data": "data.timings.durations.annotationSubmit",
      "title": "Duration",
      defaultContent: "",
      render: function (data, type, full, meta) {
        if (data) { return data/1000; }
        else return data;
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
    // {
    //   "data": "condition",
    //   "title": "Condition",
    //   className: "inline",
    //   defaultContent: "",
    //   render: function (data, type, full, meta) {
    //     return getHtml(createFilterLink(full, "condition"));
    //   }
    // },
    // {
    //   "data": "taskMode",
    //   "title": "TaskMode",
    //   defaultContent: "",
    //   render: function (data, type, full, meta) {
    //     return getHtml(createFilterLink(full, "taskMode"));
    //   }
    // },
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
    "buttons": buttons,
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

AnnotationsViewer.prototype.createGroupedAnnotationsTable = function (params) {
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
      "data": "modelId",
      "title": "Model",
      defaultContent: "",
      render: function (data, type, full, meta) {
        return getHtml(createFilterLink(full, "modelId"));
      }
    },
    // {
    //   "data": "condition",
    //   "title": "Condition",
    //   defaultContent: "",
    //   render: function (data, type, full, meta) {
    //     return getHtml(createFilterLink(full, "condition"));
    //   }
    // },
    // {
    //   "data": "taskMode",
    //   "title": "TaskMode",
    //   defaultContent: "",
    //   render: function (data, type, full, meta) {
    //     return getHtml(createFilterLink(full, "taskMode"));
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

