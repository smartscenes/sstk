'use strict';

define(['Constants', 'jpicker'], function (Constants) {

  function ColorsPanel(params) {
    // Number of colors to show per row
    this.entriesPerRow = 3;
    this.colors = [];

    if (params) {
      // Panel showing color palette
      this.colorsPanel = params.container;
      this.colorsToolbar = params.toolbar;

      // Application callback when color is clicked on
      // Parameters: image url
      this.onClickColorCallback = params.onClickColorCallback;

      // Number of colors to show per row (default is 3 columns)
      if (params.entriesPerRow !== undefined) this.entriesPerRow = params.entriesPerRow;
    }
    this.init();
  }

  ColorsPanel.prototype.init = function () {
    this.colorPicker = $('<div></div>');
    this.colorsToolbar.append(this.colorPicker);
    this.colorPicker.jPicker({
      window: {
        expandable: true,
        position: { y: 'bottom' }
      },
      images: { clientPath: Constants.imagesDir + '/jpicker/' }
    });
    var addElem = $('<img/>')
      .attr('src', Constants.imagesDir + '/16/add.png')
      .attr('title', 'Add').attr('alt', 'Add');
    addElem.click(
      function () {
        //                var color = $.jPicker.List[0].color.active.val('ahex');
        var color = $.jPicker.List[0].color.active.val('hex');
        this.addColor(color);
      }.bind(this)
    );
    this.colorsToolbar.append(addElem);
  };

  ColorsPanel.prototype.createColorElem = function (id, color) {
    var elem = $('<div></div>')
      .attr('class', 'searchResult')
      .attr('id', 'color.' + color.hex)
      .attr('title', color.name)
      .css('background-color', '#' + color.hex)
      .css('width', '100%')
      .css('height', '100%');
    elem.append(
      $('<img/>').attr('src', Constants.imagesDir + '/16/delete.png')
        .attr('title', 'Remove').attr('alt', 'Remove')
        .click(
          function () {
            this.removeColor(id);
          }.bind(this)
        )
    );
    if (this.onClickColorCallback) {
      elem.click(function () {
        this.onClickColorCallback(color);
      }.bind(this));
    }
    return elem;
  };

  ColorsPanel.prototype.clear = function () {
    this.colors.length = 0;
    this.showColors(this.colors);
  };

  ColorsPanel.prototype.addColor = function (hex) {
    var c = { name: hex, hex: hex };
    this.colors.push(c);
    this.showColors(this.colors);
  };

  ColorsPanel.prototype.removeColor = function (index) {
    this.colors.splice(index, 1);
    this.showColors(this.colors);
  };

  ColorsPanel.prototype.showColors = function (resultList) {
    this.colorsPanel.empty();
    // If there were no colors, notify the user of this
    if (resultList.length === 0) {
      this.colorsPanel.append('<span>No colors</span>');
      return;
    }

    var resultsElem = $('<div></div>').attr('class', 'searchResults');
    this.colorsPanel.append(resultsElem);
    var w = (resultsElem.width() - 40) / this.entriesPerRow;
    var table = $('<table margin=2></table>');
    var row;
    var limit = resultList.length;
    var tdCss = {
      'width': w + 'px',
      'height': w + 'px'
    };
    for (var i = 0; i < limit; i++) {
      var elem = this.createColorElem(i, resultList[i]);
      var tdElem = $('<td></td>').css(tdCss).append(elem);
      if ((i % this.entriesPerRow) === 0) {
        row = $('<tr></tr>');
        table.append(row);
      }
      row.append(tdElem);
    }
    resultsElem.append(table);
  };

  ColorsPanel.prototype.onResize = function () {
    var imageElems = this.colorsPanel.find('td');
    var w = (this.colorsPanel.width() - 40) / this.entriesPerRow;
    imageElems.each(function (index, elem) {
      $(this).css('width', w).css('height', w);
    });
  };

  // Exports
  return ColorsPanel;
});
