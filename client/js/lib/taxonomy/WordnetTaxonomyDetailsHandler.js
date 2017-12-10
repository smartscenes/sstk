define(['taxonomy/TaxonomyViewer', 'assets/AssetGroups', '../Constants'],
  function (TaxonomyViewer, AssetGroups, Constants) {
    function WordnetTaxonomyDetailsHandler() {
      this.filterSynsetsWithNoModels = true;
      this.includeHypernyms = true;
      this.shapenetAssetGroup = AssetGroups.getAssetGroup('3dw');
    }

    WordnetTaxonomyDetailsHandler.prototype.getShapenetOBJzipPath = function (synsetId) {
      // TODO: Where is the v2 zip?
      return this.shapenetAssetGroup.shapenetCoreV1Dir + '/' + synsetId + '.zip';
    };

    WordnetTaxonomyDetailsHandler.prototype.init = function (taxonomyViewer) {
      this.taxonomyViewer = taxonomyViewer;
      this.searchUrl = taxonomyViewer.searchUrl;
      this.taxonomyInfoPanel = taxonomyViewer.taxonomyInfoPanel;
      this.taxonomySearchResultsPanel = taxonomyViewer.taxonomySearchResultsPanel;
      this.taxonomySearchResultsModal = taxonomyViewer.taxonomySearchResultsModal;
      this.taxonomyDetailsPanel = taxonomyViewer.taxonomyDetailsPanel;
      this.searchModelsFilter = taxonomyViewer.searchModelsFilter;

      // Placeholder for large image
      var img = $('<img/>');
      this.largeImg = $('<span></span>').attr('class', 'large');
      this.largeImg.append(img);

      this.includeHypernymsCheckbox = $('<input/>')
        .attr('type', 'checkbox')
        .attr('id', 'includeHypernymsCheckbox')
        .prop('checked', this.includeHypernyms)
        .change(function () {
          this.includeHypernyms = this.includeHypernymsCheckbox.prop('checked');
        }.bind(this));
      var includeHypernymsLabel = $('<label></label>').attr('for', 'includeHypernymsCheckbox').text('Include hyponyms');
      taxonomyViewer.taxonomyOptionsPanel.append(
        $('<li/>').append(this.includeHypernymsCheckbox).append(includeHypernymsLabel));
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
      }, function () {
        $(this).hide();
        elem.removeClass('enlarged');
      });
    }

    WordnetTaxonomyDetailsHandler.prototype.getSearchModelSynsetField = function () {
      return this.taxonomyViewer.getSearchModelSynsetField(this.includeHypernyms);
    };

    WordnetTaxonomyDetailsHandler.prototype.getSearchModelQuery = function (searchEntity) {
      var searchModelsQuery = this.getSearchModelSynsetField() + ':' + searchEntity;
      if (this.searchModelsFilter) {
        searchModelsQuery = searchModelsQuery + ' AND ' + this.searchModelsFilter;
      }
      return searchModelsQuery;
    };

    WordnetTaxonomyDetailsHandler.prototype.clearEntityDetails = function (entity) {
      this.currentEntity = null;
      this.taxonomyViewer.clearEntityDetails();
    };

    WordnetTaxonomyDetailsHandler.prototype.showEntityDetails = function (entity, force) {
      if (force || entity !== this.currentEntity) {
        this.currentEntity = entity;
        this.searchEntityDetails(entity);
      }
    };

    WordnetTaxonomyDetailsHandler.prototype.searchEntityDetails = function (entity) {
      this.searchEntity = entity;

      //        this.taxonomyViewer.resetEntityDetails(this.searchEntity);
      var searchModelsQuery = this.getSearchModelQuery(this.searchEntity);
      this.taxonomyViewer.searchModels(searchModelsQuery);

      if (!this.taxonomyViewer.currentTaxonomy.debug) {
        this.taxonomyViewer.getTaxonomyNode(this.searchEntity,
          this.searchEntitySucceeded.bind(this),
          this.searchEntityFailed.bind(this));
      } else {
        // Deprecated: Old way where we get details from solr
        var query = 'synsetid:' + entity;
        this.taxonomyViewer.searchSolr(this.searchUrl, query, 0, 200,
          this.searchEntitySolrSucceeded.bind(this),
          this.searchEntityFailed.bind(this));
      }
    };

    WordnetTaxonomyDetailsHandler.prototype.searchEntitySucceeded = function (data, textStatus, jqXHR) {
      var result = data;
      if (result['metadata']) {
        var metadata = result['metadata'];
        var gloss = result['li_attr'] ? (result['li_attr']['title'] || '') : '';
        this.taxonomyViewer.resetEntityDetails(this.searchEntity);

        var relDiv = $('<div></div>');
        relDiv.append('<b>' + metadata['label'] + '</b>');
        relDiv.append('<br/>' + gloss);
        this.taxonomyInfoPanel.append(relDiv);
        if (metadata['imagenet']) {
          this.showImagenetDetails(metadata['imagenet'], this.taxonomyInfoPanel);
        }
        this.taxonomyInfoPanel.append($('<span>&nbsp;&nbsp;</span>'));

        // Add link to get list of models and metadata
        var metadataQuery = this.getSearchModelQuery(metadata['name']);
        var metadataQueryUrl = this.taxonomyViewer.getModelMetaDataURL(metadataQuery);
        this.taxonomyInfoPanel.append($('<a></a>')
          .attr('href', metadataQueryUrl)
          .attr('target', '_blank')  // open in new tab every time
          .text('MetaData'));
        if (this.taxonomyViewer.showSynsetOBJzipLinks && this.taxonomyViewer.currentTaxonomy
          && this.taxonomyViewer.currentTaxonomy.name === 'ShapeNetCore') {
          this.taxonomyInfoPanel.append($('<span>&nbsp;&nbsp;</span>'));
          var objZipLink = this.getShapenetOBJzipPath(metadata['name']);
          this.taxonomyInfoPanel.append($('<a></a>')
            .attr('href', objZipLink)
            .text('OBJs.zip'));
        }

        var measures = metadata['measures'];
        this.taxonomyViewer.showMeasures(measures);
      } else {
        console.log('No details found for ' + this.searchEntity);
      }
    };

    WordnetTaxonomyDetailsHandler.prototype.searchEntitySolrSucceeded = function (data, textStatus, jqXHR) {
      var resultList = data.response.docs;
      console.log('Got details ' + resultList.length + '/' + data.response.numFound + ' for ' + this.searchEntity);
      this.taxonomyViewer.resetEntityDetails(this.searchEntity);

      for (var i = 0; i < resultList.length; i++) {
        var doc = resultList[i];
        var relDiv = $('<div></div>');
        relDiv.append('<b>' + doc['words'] + '</b>');
        relDiv.append('<br/>' + doc['gloss']);
        this.taxonomyInfoPanel.append(relDiv);
        if (doc['imagenetsynsetid'] && resultList.length === 1) {
          this.showImagenetDetails(doc['imagenetsynsetid'], this.taxonomyInfoPanel);
        }
        this.taxonomyInfoPanel.append($('<span>&nbsp;&nbsp;</span>'));

        // Add link to get list of models and metadata
        var metadataQuery = this.getSearchModelQuery(doc['synsetid']);
        var metadataQueryUrl = this.taxonomyViewer.getModelMetaDataURL(metadataQuery);
        this.taxonomyInfoPanel.append($('<a></a>')
          .attr('href', metadataQueryUrl)
          .attr('target', '_blank')  // open in new tab every time
          .text('MetaData'));
        if (this.taxonomyViewer.showSynsetOBJzipLinks && this.taxonomyViewer.currentTaxonomy
          && this.taxonomyViewer.currentTaxonomy.name === 'ShapeNetCore') {
          this.taxonomyInfoPanel.append($('<span>&nbsp;&nbsp;</span>'));
          var objZipLink = this.getShapenetOBJzipPath(doc['synsetid']);
          this.taxonomyInfoPanel.append($('<a></a>')
            .attr('href', objZipLink)
            .text('OBJs.zip'));
        }
      }
    };

    WordnetTaxonomyDetailsHandler.prototype.showImagenetDetails = function (imagenetSynsetId, container) {
      var imageSynsetUrl = 'http://www.image-net.org/synset?wnid=' + imagenetSynsetId;
      //var imageDownloadUrl = Constants.imagenetUrl + "/api/text/imagenet.synset.geturls?wnid=" + imagenetSynsetId;

      // Link to ImageNet synset
      container.append($('<a></a>')
        .attr('href', imageSynsetUrl)
        .attr('target', 'imagenet')  // open in tab
        .text('ImageNet'));
      //this.fetchImages(imageDownloadUrl, this.showImages.bind(this));
    };

    WordnetTaxonomyDetailsHandler.prototype.showImages = function (data) {
      var resultsElem = this.taxonomyDetailsPanel.find('#webimages');
      var results = data.split(/\n/);
      var n = Math.min(10, results.length);
      this.taxonomyDetailsPanel.append(this.largeImg);
      for (var i = 0; i < n; i++) {
        var result = results[i];
        resultsElem.append($('<img/>').attr('src', result).attr('class', 'enlarge'));
        var largeImg = this.largeImg;
      }
      resultsElem.find('img.enlarge').hover(function () {
        showLarge($(this), largeImg);
      }, function () {
      });
      resultsElem.find('img').error(function () {
        $(this).hide();
        //$(this).css({visibility:"hidden"});
      });
    };

    WordnetTaxonomyDetailsHandler.prototype.fetchImages = function (url, successCallback, errorCallback) {
      $.ajax
      ({
        type: 'GET',
        url: url,
        success: successCallback,
        error: errorCallback
      });
    };

    WordnetTaxonomyDetailsHandler.prototype.searchEntityFailed = function (jqXHR, textStatus, errorThrown) {
      console.error('Error getting entity details: ' + textStatus);
    };

    // TODO: Move into server side...
    WordnetTaxonomyDetailsHandler.prototype.searchModelsPreview = function (synsetid, results, checkDone, maxModels) {
      var searchController = this.taxonomyViewer.searchController;
      var query = this.getSearchModelSynsetField() + ':' + synsetid;
      if (this.searchModelsFilter) {
        query = query + ' AND ' + this.searchModelsFilter;
      }
      var sortOrder = searchController.getQuerySortOrder();
      results.length = 0;
      searchController.query({
          source: searchController.source,
          query: query, sort: sortOrder, start: 0, limit: maxModels
        },
        function (err, data) {
          if (err) {
            results[synsetid] = {
              numFound: 0
            };
            results.length++;
            if (checkDone) checkDone(results);
          } else {
            results[synsetid] = {
              numFound: data.response.numFound,
              docs: data.response.docs
            };
            results.length++;
            if (checkDone) checkDone(results);
          }
        }
      );
    };

    WordnetTaxonomyDetailsHandler.prototype.searchTaxonomy = function (searchTerm, relaxed) {
      this.searchTerm = searchTerm;
      var escapeSearchTerm = function (x) {
        return '"' + x.replace(/"/g, '\\"') + '"';
      };
      var searchTermSplit = '(' + searchTerm.split(',').map(escapeSearchTerm).join(' AND ') + ')';
      var query = (relaxed ? 'wordtext:' : 'words:') + searchTermSplit + ' AND pos:noun';
      this.taxonomyViewer.searchSolr(this.searchUrl, query, 0, 200,
        this.searchTaxonomySucceeded.bind(this),
        this.searchTaxonomyFailed.bind(this));
    };

    //TODO: Clean up this code to make less hacky
    WordnetTaxonomyDetailsHandler.prototype.searchTaxonomySucceeded = function (data, textStatus, jqXHR) {
      var resultList = data.response.docs;
      console.log('Got synsets ' + resultList.length + '/' + data.response.numFound + ' for ' + this.searchTerm);
      if (resultList.length === 0) {
        this.showMessageInTaxonomySearchResultsPanel('No synsets found for ' + this.searchTerm);
        return;
      }

      this.taxonomySearchResultsPanel.empty();
      var maxModels = 3;

      function checkDone(modelResults) {
        if (resultList.length !== modelResults.length) {
          return false;
        }
        //        for (var i = 0; i < resultList.length; i++) {
        //          var doc = resultList[i];
        //          console.log(modelResults[doc["synsetid"]]);
        //          if (!modelResults[doc["synsetid"]]) {
        //            return false;
        //          }
        //        }
        for (var i = 0; i < resultList.length; i++) {
          var doc = resultList[i];
          resultList[i].nmodels = modelResults[doc['synsetid']].numFound;
          resultList[i].models = modelResults[doc['synsetid']].docs;
        }
        resultList.sort(function (a, b) {
          return b.nmodels - a.nmodels;
        });
        var filtered = resultList;
        if (this.filterSynsetsWithNoModels) {
          filtered = resultList.filter(function (x, index) {
            return x.nmodels > 0;
          });
          if (filtered.length === 0) {
            this.showMessageInTaxonomySearchResultsPanel('No models found for ' + this.searchTerm);
            return;
          }
        }
        var tableDiv = $('<table></table>');
        for (var i = 0; i < filtered.length; i++) {
          var doc = filtered[i];
          //            var isa = doc["isa"];
          var synsetDiv = $('<tr></tr>');
          var synsetInfoDiv = $('<td></td>');
          /*jshint -W083 */
          var linkDiv = $('<span></span>').attr('class', 'taxonomyLink').click(
            function (synsetId) {
              this.hideTaxonomySearchResults();
              this.taxonomyViewer.showEntityDetails(synsetId);
              if (doc.nmodels > 0) {
                this.taxonomyViewer.showTaxonomyTreeNode(synsetId);
              }
            }.bind(this, doc['synsetid'])
          );
          linkDiv.append('<b>' + doc['words'] + '</b>');
          synsetInfoDiv.append(linkDiv);
          synsetInfoDiv.append('<br/><i>' + doc.nmodels + ' instances</i>');
          synsetInfoDiv.append('<br/>' + doc['gloss']);
          if (doc.nmodels === 0) {
            synsetInfoDiv.attr('class', 'graytext');
          }
          //relDiv.append('<br/><br/>');
          for (var j = 0; j < maxModels; j++) {
            if (j < doc.models.length) {
              var m = doc.models[j];
              var ind = i * maxModels + j;
              var elem = this.taxonomyViewer.searchController.searchPanel.createSearchResult(m, ind, ' width=100px ', false);
              synsetDiv.append($('<td></td>').append(elem));
            } else {
              synsetDiv.append($('<td></td>'));
            }
          }
          synsetDiv.append(synsetInfoDiv);
          tableDiv.append(synsetDiv);
        }
        this.taxonomySearchResultsPanel.append(tableDiv);
        this.showTaxonomySearchResults();
      }

      var res = {};
      for (var i = 0; i < resultList.length; i++) {
        var doc = resultList[i];
        this.searchModelsPreview(doc['synsetid'], res, checkDone.bind(this), maxModels);
      }

    };

    WordnetTaxonomyDetailsHandler.prototype.searchTaxonomyFailed = function () {
      this.showMessageInTaxonomySearchResultsPanel('Error searching taxonomy');
    };

    WordnetTaxonomyDetailsHandler.prototype.showMessageInTaxonomySearchResultsPanel = function (text) {
      this.taxonomySearchResultsPanel.empty();
      var message = $('<span></span>').text(text);
      this.taxonomySearchResultsPanel.append(message);
      this.showTaxonomySearchResults();
    };

    WordnetTaxonomyDetailsHandler.prototype.showTaxonomySearchResults = function () {
      if (this.taxonomySearchResultsModal && this.taxonomySearchResultsModal.length > 0) {
        this.taxonomySearchResultsModal.modal('show');
      } else {
        this.taxonomySearchResultsPanel.show();
        this.taxonomySearchResultsPanel.position({
          my: 'center',
          at: 'center',
          of: $(document)
        });
      }
    };

    WordnetTaxonomyDetailsHandler.prototype.hideTaxonomySearchResults = function () {
      if (this.taxonomySearchResultsModal && this.taxonomySearchResultsModal.length > 0) {
        this.taxonomySearchResultsModal.modal('hide');
      } else {
        this.taxonomySearchResultsPanel.hide();
      }
    };

    // Exports
    return WordnetTaxonomyDetailsHandler;

  });
