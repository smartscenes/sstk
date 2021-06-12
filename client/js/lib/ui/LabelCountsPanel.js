const PubSub = require('PubSub');
const UIUtil = require('ui/UIUtil');
const AssetCache = require('assets/AssetCache');
const SearchModule = require('search/SearchModule');
const _ = require('util/util');

class LabelCountsPanel extends PubSub {
  constructor(params) {
    super();
    this.container = $(params.container);
    this.searchController = params.searchController;
    this.labelName = params.labelName;
    this.excludeZeroCountLabels = params.excludeZeroCountLabels;
    this.excludeSpecialLabels = params.excludeSpecialLabels;
    this.__filterBy = params.filterBy || 'source';
    this.__sortBy = params.sortBy || 'count';
    this.__sortByOptions = [
      { 'text': 'count' },
      { 'text': 'label' }
    ];
    this.__filterByOptions = [
      { 'text': 'all', 'help': 'Show labels for all assets'},
      { 'text': 'query', 'help': 'Show labels for query'},
      { 'text': 'source', 'help': 'Show labels for source'}
    ];
    this.__cachedLabelCounts = new AssetCache(20);
    this.__initPanel();
  }

  get filterBy() {
    return this.__filterBy;
  }

  get sortBy() {
    return this.__sortBy;
  }

  __initPanel() {
    const controlsDiv = $('<span></span>');
    const queryBox = UIUtil.createTextbox({ text: 'Query' });
    this.__queryBox = queryBox;
    const queryDiv = $('<span></span>').append(queryBox.label).append(queryBox.textbox).append('<br/>');
    const filterBySel = UIUtil.createSelect(this.__filterByOptions, this.filterBy);
    filterBySel.change(() => {
      this.__filterBy = filterBySel.val();
      if (this.__filterBy === 'query') {
        queryDiv.show();
      } else {
        queryDiv.hide();
      }
      this.update(true);
    });
    if (this.__filterBy !== 'query') {
      queryDiv.hide();
    }
    const sortBySel = UIUtil.createSelect(this.__sortByOptions, this.sortBy);
    sortBySel.change(() => {
      this.__sortBy = sortBySel.val();
      this.update(true);
    });
    const excludeZeroCountCheckbox = UIUtil.createCheckbox({
      text: 'Exclude zero count', id: 'excludeZeroCountLabel',
      change: (v) => { this.excludeZeroCountLabels = v; this.update(true); }},
      this.excludeZeroCountLabels);
    const excludeSpecialLabelsCheckbox = UIUtil.createCheckbox({
        text: 'Exclude special', id: 'excludeSpecialLabels',
        change: (v) => { this.excludeSpecialLabels = v; this.update(true); }},
      this.excludeSpecialLabels);
    const updateButton = UIUtil.createButton({ name: 'update', click: () => this.update(true, true) });
    controlsDiv.append(queryDiv);
    controlsDiv.append(filterBySel);
    controlsDiv.append(sortBySel);
    controlsDiv.append(updateButton);
    controlsDiv.append('<br/>');
    controlsDiv.append(excludeZeroCountCheckbox.checkbox).append(excludeZeroCountCheckbox.label);
    controlsDiv.append('&nbsp;');
    controlsDiv.append(excludeSpecialLabelsCheckbox.checkbox).append(excludeSpecialLabelsCheckbox.label);
    this.container.append(controlsDiv);
    this.__categoriesPanel = $('<div></div>');
    this.container.append(this.__categoriesPanel);
  }

  update(updateListeners, forceUpdate) {
    // console.log('update', this);
    let labelCounts = null;
    let source = null;
    let query = null;
    let key = null;
    if (this.filterBy === 'source') {
      source = this.searchController.source;
      key = source;
    } else if (this.filterBy === 'query') {
      source = this.searchController.source;
      query = this.__queryBox.textbox.val();
      key = source + ';' + query;
    } else if (this.filterBy === 'all') {
      source = '*';
      key = source;
    }
    labelCounts = this.__cachedLabelCounts.get(key);
    if (labelCounts && !forceUpdate) {
      const labels = this.__updatePanel(this.__categoriesPanel, labelCounts);
      if (updateListeners) {
        this.Publish('LabelsUpdated', _.sortedUniq(_.sortBy(labels)));
      }
    } else {
      if (key && !this.__cachedLabelCounts.hasKey(key)) {
        this.__refreshSolrLabels(key, source, query);
      }
    }
  }

  __resultsToLabelCounts(results) {
    const labelToCount = {};
    for (let i = 0; i < results.length; i += 2) {
      const label = results[i];
      const count = results[i + 1];
      labelToCount[label] = count;
    }
    return labelToCount;
  }

  __getFilterSortedLabels(labelToCount) {
    let labels = Object.keys(labelToCount);
    // console.log('got labels', labels);
    if (this.excludeZeroCountLabels) {
      labels = labels.filter((label) => labelToCount[label] > 0);
    }
    if (this.excludeSpecialLabels) {
      labels = labels.filter((label) => !label.startsWith('_'));
    }
    if (this.sortBy === 'count') {
      labels = _.sortBy(labels, (label) => -labelToCount[label]);
    } else if (this.sortBy === 'label') {
      labels = labels.sort();
    }
    // console.log('got sorted labels', labels);
    return labels;
  }

  __updatePanel(container, labelToCount) {
    container.empty();
    const labels = this.__getFilterSortedLabels(labelToCount);
    labels.forEach((label) => {
      const count = labelToCount[label];
      const search = $('<span class="categoryName"></span>').text(label).click(
        () => this.__searchLabel(label)
      );
      const labelElem = $('<div></div>')
        .append(search)
        .append($('<span></span>').text(' (' + count + ')'));
      container.append(labelElem);
    });
    return labels;
  }

  updateSolrLabels() {
    this.update(true, true);
  }

  __refreshSolrLabels(key, source, query, cb) {
    this.__querySolrLabels(key,source || this.searchController.source, SearchModule.facetOrderIndex, query,
      (err, labelCounts) => {
        if (labelCounts) { this.update(true); }
        if (cb) { cb(err, labelCounts); }
      });
  }

  __querySolrLabels(key, source, sort, query, callback) {
    console.log('query labels', key);
    this.searchController.facetFieldSearch({
      query: query,
      source: source,
      facetField: this.labelName,
      facetSort: sort,
      success: (data, textStatus, jqXHR) => {
        const resultsList = data.facet_counts.facet_fields;
        const labelCounts = this.__resultsToLabelCounts(resultsList[this.labelName]);
        // console.log('labelCounts', labelCounts, resultsList);
        this.__cachedLabelCounts.set(key, labelCounts);
        callback(null, labelCounts);
      },
      error: (jqXHR, textStatus, errorThrown) => {
        console.warn('Error getting categories', textStatus);
        if (query == null && !this.__cachedLabelCounts[key]) {
          this.__cachedLabelCounts.set(key, null);
        }
        callback('Error getting categories');
      }
    });
  }

  __searchLabel(label) {
    const query = this.labelName + ':"' + label + '"';
    this.searchController.setSearchText(query);
    this.searchController.search(query);
  }

}

module.exports = LabelCountsPanel;