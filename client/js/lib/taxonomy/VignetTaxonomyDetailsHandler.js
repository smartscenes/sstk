define(['taxonomy/TaxonomyViewer', 'datatables'],
    function (TaxonomyViewer) {
      function VignetTaxonomyDetailsHandler() {
    }

      VignetTaxonomyDetailsHandler.prototype.init = function (taxonomyViewer) {
        this.taxonomyViewer = taxonomyViewer;
        this.searchUrl = taxonomyViewer.searchUrl;
        this.taxonomyDetailsPanel = taxonomyViewer.taxonomyDetailsPanel;
      };

      VignetTaxonomyDetailsHandler.prototype.showEntityDetails = function (entity) {
        this.searchEntityDetails(entity);
      };

      VignetTaxonomyDetailsHandler.prototype.appendEntityDetailsTable = function (tableName, info, initialColumns, rowsData) {
        var columns = [];
        for (var i = 0; i < initialColumns.length; i++) {
          columns.push({ 'sTitle': initialColumns[i] });
        }
        columns.push(
            { 'sTitle': 'certainty' },
            { 'sTitle': 'sample-size' },
            { 'sTitle': 'computed' }
        );
        var table = $('<table></table>');
        var tabs = this.taxonomyDetailsPanel.find('#detailsTabs');
        if (tabs.size() === 0) {
          tabs = $('<div id="detailsTabs"></div>').append('<ul id="detailsTabsList"></ul>');
          tabs.tabs();
          this.taxonomyDetailsPanel.append(tabs);
        }
        var tabsList = tabs.find('#detailsTabsList');
        var tabsListElems = tabsList.find('li');
        var count = tabsListElems.size() + 1;
        tabs.append($('<div></div>')
            .attr('id', 'details-' + count)
            .append(table)
            .append($('<div></div>').text(' ' + info)));

        table.dataTable(
            { 'iDisplayLength': 50,
                'aaData': rowsData,
                'aoColumns': columns
            }
        );
        var viewer = this;
        table.find('tbody tr td:first-child').addClass('link')
            .click(
            function () {
              viewer.searchEntityDetails($(this).text());
            }
        );
        tabs.tabs('add', '#details-' + count, tableName);
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntityDetails = function (entity) {
        var query = 'entity:' + entity;
        this.searchEntity = entity;
        this.taxonomyViewer.searchSolr(this.searchUrl, query, 0, 200,
            this.searchEntitySucceeded.bind(this),
            this.searchEntityFailed.bind(this));
      };

      VignetTaxonomyDetailsHandler.prototype.solrResultToRow = function (doc, mainField) {
        var computed = doc['computed'];
        var certainty = (computed) ? doc['induced-certainty'] : doc['certainty'];
        if (certainty === undefined || certainty === null) certainty = '';
        var sampleSize = doc['sample-size'];
        if (sampleSize === undefined || sampleSize === null) sampleSize = '';
        return [doc[mainField], certainty, sampleSize, computed];
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntitySucceeded = function (data, textStatus, jqXHR) {
        var relationTables = {
          'we.shape-of.r': { field: 'value', column: 'shape', heading: 'Shape', rows: [] },
          'we.affordance-of.r': { field: 'affordance', column: 'affordance', heading: 'Use', rows: [] },
          'we.substance-of.r': { field: 'value', column: 'substance', heading: 'Made of', rows: [] },
          'we.3d-size-of.r': { field: 'real-world-size-range', column: 'size', heading: 'Size', rows: [] },
          'we.color-of.r': { field: 'rgb-value-range', column: 'color', heading: 'Color', rows: [] }
        };
        var skipProps = {
          'id': 1,
          'type': 1,
          'relation': 1,
          'entity': 1,
          '_version_': 1
        };
        var resultList = data.response.docs;
        console.log('Got details ' + resultList.length + '/' + data.response.numFound + ' for ' + this.searchEntity);
        this.taxonomyViewer.resetEntityDetails(this.searchEntity);
        for (var i = 0; i < resultList.length; i++) {
          var doc = resultList[i];
          if ('lexicon.index' === doc['relation']) {
            var names = doc['names'];
            var isa = doc['isa'];
            this.taxonomyViewer.appendEntityNamesToDetails(names, isa, true);
          } else if (relationTables.hasOwnProperty(doc['relation'])) {
            var table = relationTables[doc['relation']];
            table.rows.push(this.solrResultToRow(doc, table.field));
          } else {
            var relDiv = $('<div></div>');
            relDiv.append('<b>' + doc['relation'] + '</b>');
            for (var prop in doc) {
              if (doc.hasOwnProperty(prop) && !skipProps.hasOwnProperty(prop)) {
                relDiv.append($('<span></span>').text(' ' + prop + '=' + doc[prop]));
              }
            }
            this.taxonomyDetailsPanel.append(relDiv);
          }
        }
        for (var relation in relationTables) {
          if (relationTables.hasOwnProperty(relation)) {
            var table = relationTables[relation];
            if (table.rows.length > 0) {
              this.appendEntityDetailsTable(table.heading, relation, [table.column], table.rows);
            }
          }
        }
        this.searchEntityParts(this.searchEntity);
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntityFailed = function (jqXHR, textStatus, errorThrown) {
        console.error('Error getting entity details: ' + textStatus);
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntityPartsSucceeded = function (data, textStatus, jqXHR) {
        var entity = this.searchEntity;
        var resultList = data.response.docs;
        var hasPartsRows = [];
        var partOfRows = [];
        for (var i = 0; i < resultList.length; i++) {
          var doc = resultList[i];
          if (entity === doc['whole']) {
            hasPartsRows.push(this.solrResultToRow(doc, 'part'));
          } else if (entity === doc['part']) {
            partOfRows.push(this.solrResultToRow(doc, 'whole'));
          }
        }
        if (hasPartsRows.length > 0) {
          this.appendEntityDetailsTable('Has Parts', 'we.part-of.r', ['part'], hasPartsRows);
        }
        if (partOfRows.length > 0) {
          this.appendEntityDetailsTable('Part of', 'we.part-of.r', ['whole'], partOfRows);
        }
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntityPartsFailed = function (jqXHR, textStatus, errorThrown) {
        console.error('Error getting entity parts: ' + textStatus);
      };

      VignetTaxonomyDetailsHandler.prototype.searchEntityParts = function (entity) {
        //        var query = "(whole:" + entity + " OR part:" + entity + " ) AND computed:false";
        var query = 'whole:' + entity + ' OR part:' + entity;
        this.searchEntity = entity;
        this.taxonomyViewer.searchSolr(this.searchUrl, query, 0, 100,
            this.searchEntityPartsSucceeded.bind(this),
            this.searchEntityPartsFailed.bind(this));
      };

      // Exports
      return VignetTaxonomyDetailsHandler;

    });
