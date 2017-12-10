'use strict';

define(['lib/Constants','assets/AssetManager','mds', 'tsne'],
    function (Constants, AssetManager, mds, tsnejs) {
      function SimViewer(params) {
        this.init(params);
      }

      SimViewer.prototype.init = function (params) {
        this.container = params.container;
        this.plot = params.plot;
        this.timeout = 30000;
        this.assetManager = params.assetManager;
        if (!this.assetManager) {
          this.assetManager = new AssetManager();
        }
        window.addEventListener('resize', this.onResize.bind(this), false);

        this.datasets = {
          'models3d': {
            sims: ['gshist', 'lfd', 'sdd', 'shd', 'sis', 'zernike', 'combined']
          }
        };
        this.controls = params.controls;
        if (this.controls) {
          // Add some controls
          this.simElem = $('<select></select>');
          this.datasetElem = this.makeSelect(Object.keys(this.datasets));
          this.simVisElem = this.makeSelect(['tsne', 'mds','lmds','pivotmds']);

          var that = this;
          this.datasetElem.change(function () {
            that.setDataset(that.datasetElem.val());
          });
          this.datasetElem.val('models3d');
          this.setDataset(this.datasetElem.val());
          this.displayButton = $('<button></button>').text('Display');
          this.displayButton.click(function () {
            that.container.empty();
            var d = that.datasets[that.dataset];
            if (d.file) {
              that.loadDistCsv(d.file);
            } else {
              if (that.simVisElem.val() === 'tsne') {
                that.getSimilarities(that.dataset, that.simElem.val(), that.simVisElem.val(), that.limitElem.val());
              } else {
                that.getSimLayout(that.dataset, that.simElem.val(), that.simVisElem.val(), that.limitElem.val());
              }
            }
            this.itemDataset = that.dataset;
          });
          this.limitElem = $('<input></input>').attr('type', 'text').attr('id','limit');
          this.keepItemsElem = $('<input></input>').attr('type', 'checkbox').attr('id','keepItems');
          this.keepItems = this.keepItemsElem.prop('checked');
          this.keepItemsElem.click(
                    function () {
                      that.keepItems = that.keepItemsElem.prop('checked');
                      //                        if (that.keepItems) {
                      //                            this.limitElem.prop('disabled', true);
                      //                        } else {
                      //                            this.limitElem.prop("disabled", false);
                      //                        }
                    }
                );
          this.controls.append(this.datasetElem);
          this.controls.append(this.simElem);
          this.controls.append(this.simVisElem);
          this.controls.append(
              $('<div></div>').append($('<label></label>').attr('for', 'limit').text('Limit')).append(this.limitElem));
          this.controls.append(
              $('<div></div>').append($('<label></label>').attr('for', 'keepItems').text('Keep Items')).append(this.keepItemsElem));
          this.controls.append(this.displayButton);
        }
      };

      SimViewer.prototype.makeSelect = function (options, elem) {
        if (!elem) elem = $('<select></select>');
        for (var i = 0; i < options.length; i++) {
          var s = options[i];
          elem.append('<option value="' + s + '">' + s + '</option>');
        }
        return elem;
      };

      SimViewer.prototype.setDataset = function (dataset) {
        this.dataset = dataset;
        var sims = this.datasets[this.dataset].sims;
        if (sims) {
          this.simElem.empty();
          this.makeSelect(sims, this.simElem);
          this.simElem.show();
        } else {
          this.simElem.hide();
        }
      };

      SimViewer.prototype.onResize = function () {
        this.container.empty();
        this.display();
      };

      SimViewer.prototype.display = function () {
        if (this.items) {
          var params = {
            w: this.container.width(),
            h: this.container.height(),
            showImage: this.showImage
          };
          console.log('mds', mds);
          mds.drawD3ScatterPlot(this.plot, this.itemPositions.x, this.itemPositions.y, this.items, params);
        }
      };

      SimViewer.prototype.loadDistCsv = function (url) {
        // Read csv of distances
        jQuery.get(url, function (csvFileData) {
          var res = this.parseCsvFile(url, csvFileData);
          if (res.error) {
            console.log(res.error);
          } else {
            console.log('Loaded dist matrix from csv ' + url + ' with ' + res.items.length + ' items');
            this.itemids = res.items;
            this.items = res.items;
            var pos = mds.classic(res.dists);
            this.itemPositions = {
              x: pos.map(function (p) { return p[0]; }),
              y: pos.map(function (p) { return p[1]; })
            };
            this.showImage = false;
            this.display();
          }
        }.bind(this));
      };

      SimViewer.prototype.parseCsvFile = function (filename, data) {
        // TODO: have options: delimiter, first column is itemid
        var lines = data.split('\n');
        // First line should be the items
        var items = lines.shift().split(',');
        // First column is item again
        items.shift();
        var dists = [];
        var result = {
          items: items,
          dists: dists,
          error: ''
        };
        lines = lines.map(function (line) { return line.trim(); })
            .filter(function (line) { return line.length > 0; });
        if (lines.length !== items.length) {
          result.error = 'Unexpected number of rows (' + filename
              + '): expected ' + items.length + ' got ' + lines.length;
          return result;
        }
        for (var i = 0; i < lines.length; i++) {
          // Assumes the rows are in the same order
          var fields = lines[i].split(',');
          var itemid = fields.shift();
          // Check itemid and number of fields
          if (fields.length !== items.length) {
            result.error = 'Unexpected number of fields (' + filename + ':' + i
                + '): expected ' + items.length + ' got ' + fields.length;
            return result;
          }
          //                if (items[i] !== itemid) {
          //                    result.error = "Unexpected item (" + filename + ":" + i
          //                        + "): expected " + items[i] + " got " + itemid;
          //                    return result;
          //                }
          // TODO: Check dists
          dists[i] = fields;
        }
        return result;
      };

      SimViewer.prototype.getSimLayout = function (dataset, sim, mds, limit) {
        var targets = [];
        if (this.keepItems && this.dataset === this.itemDataset && this.itemids) {
          targets = this.itemids;
        }
        var url = Constants.simLayoutUrl;
        var queryData = {
          'dataset': dataset,
          'sim': sim,
          'mds': mds,
          'targets': targets,
          'totalLimit': limit
        };
        var method = 'POST';
        $.ajax
            ({
              type: method,
              url: url,
              contentType: 'application/json;charset=utf-8',
              data: JSON.stringify(queryData),
              dataType: 'json',
              success: this.getSimLayoutSucceeded.bind(this),
              error: this.getSimLayoutFailed.bind(this),
              timeout: this.timeout		// in milliseconds. With JSONP, this is the only way to get the error handler to fire.
            });
      };

      SimViewer.prototype.getSimLayoutSucceeded = function (data, textStatus, jqXHR) {
        // Search solr for these models and display them!
        var res = data.results;
        if (!res.message) {
          console.log('Got sim layout for ' + res.items.length + ' items');
          this.itemids = res.items;
          this.items = res.items.map(function (item) {
            return {
              label: item,
              image: this.assetManager.getImagePreviewUrl('', item),
              onclick: function () { window.open('model-viewer?modelId=' + item, 'Model Viewer'); }
            };
          }.bind(this));
          this.itemDataset = data.request.dataset;
          this.itemPositions = {
            x: res.layout[0],
            y: res.layout[1]
          };
          this.showImage = true;
          this.display();
        } else {
          console.log('Error getting sim layout: ' + res.message);
        }
      };

      SimViewer.prototype.getSimLayoutFailed = function (jqXHR, textStatus, errorThrown) {
        console.log(textStatus + ' ' + errorThrown);
      };

      SimViewer.prototype.getSimilarities = function (dataset, sim, vis, limit) {
        var targets = [];
        if (this.keepItems && this.dataset === this.itemDataset && this.itemids) {
          targets = this.itemids;
        }
        var url = Constants.similaritiesUrl;
        var queryData = {
          'dataset': dataset,
          'sim': sim,
          'targets': targets,
          'totalLimit': limit
        };
        var method = 'POST';
        $.ajax
            ({
              type: method,
              url: url,
              contentType: 'application/json;charset=utf-8',
              data: JSON.stringify(queryData),
              dataType: 'json',
              success: this.getSimilaritiesSucceeded.bind(this, vis),
              error: this.getSimilaritiesFailed.bind(this),
              timeout: this.timeout		// in milliseconds. With JSONP, this is the only way to get the error handler to fire.
            });
      };

      SimViewer.prototype.getLayoutFromSimilarities = function (vis, sims) {
        var dists = sims.map(function (x) { return x.map(function (y) { return 1.0 - y; }); });
        return this.getLayoutFromDissimilarities(vis, dists);
      };

      SimViewer.prototype.getLayoutFromDissimilarities = function (vis, dists) {
        if (vis === 'tsne') {
          var opt = { epsilon: 10 }; // epsilon is learning rate (10 = default)
          var tsne = new tsnejs.tSNE(opt); // create a tSNE instance
          tsne.initDataDist(dists);
          for (var k = 0; k < 1000; k++) {
            tsne.step(); // every time you call this, solution gets better
          }
          var pos = tsne.getSolution();
          return pos;
        } else if (vis === 'mds') {
          var pos = mds.classic(dists);
          return pos;
        } else {
          // TODO: do different visualizations...
          return;
        }
      };

      SimViewer.prototype.getSimilaritiesSucceeded = function (vis, data, textStatus, jqXHR) {
        // Search solr for these models and display them!
        var res = data.results;
        if (!res.message) {
          console.log('Got similarities for ' + res.items.length + ' items');
          this.itemids = res.items;
          this.items = res.items.map(function (item) {
            return {
              label: item,
              image: this.assetManager.getImagePreviewUrl('', item),
              onclick: function () { window.open('model-viewer?modelId=' + item, 'Model Viewer'); }
            };
          }.bind(this));
          this.itemDataset = data.request.dataset;
          var sims = res['similarities'];
          var pos = this.getLayoutFromSimilarities(vis, sims);
          this.itemPositions = {
            x: pos.map(function (p) { return p[0]; }),
            y: pos.map(function (p) { return p[1]; })
          };
          this.showImage = true;
          this.display();
        } else {
          console.log('Error getting similarities: ' + res.message);
        }
      };

      SimViewer.prototype.getSimilaritiesFailed = function (jqXHR, textStatus, errorThrown) {
        console.log(textStatus + ' ' + errorThrown);
      };

      // Exports
      return SimViewer;

    });
