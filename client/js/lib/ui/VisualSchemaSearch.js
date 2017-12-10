var Backbone = require('backbone');
var _ = require('util');
require('visualsearch');

function VisualSearch(params) {
  this.schema = params.schema;
  this.filters = params.filters;
  this.debug = params.debug;
  this.init(params);
}

VisualSearch.prototype.init = function(params) {
  var scope = this;
  var initialQuery = '';
  var filters = {};
  var limitedFields = [];
  var requiredFilters = [];
  if (params.filters) {
    // Make sure required filters precedes optional ones
    // this is so we guarantee that they will stick
    params.filters = _.sortBy(params.filters, function(x) { return x.required? -1 : 1;  });

    initialQuery = params.filters.map( function(x) {
      var v = (x.value != undefined)? x.value : x.values[0];
      return x.field + ':' + v;
    }).join(' ');
    limitedFields = params.filters.filter( function(x) { return x.limited; }).map( function(x) { return x.field; });
    requiredFilters = params.filters.filter( function(x) { return x.required; });
    filters = _.keyBy(params.filters, 'field');
  }
  scope.limitedFields = limitedFields;

  function __filterValuesFn(f, v, i) {
    if (f.name === 'category') {
      return !v.startsWith('_');
    } else {
      return true;
    }
  }
  function __updateFieldsForQuery(filterString) {
    if (!scope.__cachedFields[filterString]) {
      // Make a copy of our fields (this will be used for updating the autocomplete information based on current filters)
      scope.__cachedFields[filterString] = {};
      scope.__cachedFields[filterString].fieldsByName = _.cloneDeep(scope.schema.fieldsByName);
    }
    if (!scope.__cachedFields[filterString]['QueryFieldStats'] || !scope.__cachedFields[filterString]['QueryFieldValues']) {
      scope.schema.getFieldMetadata({
        filter: filterString,
        filterValuesFn: filterValuesFn,
        fieldsByName: scope.__cachedFields[filterString].fieldsByName,
        callback: function (q, v) {
          scope.__cachedFields[filterString][q] = v;
        }
      });
    }
  }
  function __getFields(filterString) {
    var f = scope.__cachedFields[filterString] || scope.__cachedFields[''];
    return f.fieldsByName;
  }
  function __clearCache() {
    scope.__cachedFields = {};
  }
  function __updateFields(forceRecache) {
    if (forceRecache) {
      __clearCache();
    }
    var facets = scope.visualSearch.searchQuery.models;
    for (var i = 0; i < facets.length; i++) {
      if (i < requiredFilters.length) {
        //console.log(facets[i]);
        facets[i].set('required', true);
      }
    }
    var queryStrings = scope.__getFilterStrings();
    for (var i = 0; i < queryStrings.length; i++) {
      var qs = queryStrings[i];
      __updateFieldsForQuery(qs);
    }
    // Clean out unused facet choices...
    var keys = Object.keys(scope.__cachedFields);
    if (keys.length > scope.__cachedFieldsLimit) {
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] && queryStrings.indexOf(keys[i]) < 0) {
          delete scope.__cachedFields[keys[i]];
        }
      }
    }
    //console.log(scope.__cachedFields);
  }

  var filterValuesFn = (this.debug)? null : __filterValuesFn;
  scope.attributes = scope.schema.fields.map( function(x) { return { label: x.label, value: x.name }; });
  scope.attributes = scope.attributes.filter( function(x) {
    return limitedFields.indexOf(x.value) < 0;
  });
  this.lastQuery = null;
  this.filterString = '';
  // Cache of our fields by query
  this.__cachedFields = {};
  this.__cachedFieldsLimit = 50;

  // Update field information if schema is updated
  scope.schema.Subscribe('FieldTypesInitialized', this, function() {
    __updateFields(true);
  });
  this.__updateFields = __updateFields;  // TODO: clean this up

  var refreshed = false;
  // Set up visual search
  this.visualSearch = VS.init({
    container: params.container,
    query: initialQuery,
    showFacets : true,
    readOnly   : false,
    callbacks: {
      search : function(query, searchCollection) {
        if (scope.lastQuery !== query) {
          // Update autocomplete choices when query has changed
          __updateFields();
          scope.filterString = scope.getFilterString();
          refreshed = true;
        }
        //console.log(searchCollection);
        //        console.log(scope.visualSearch.searchQuery.facets());
      },
      facetMatches: function(callback) {
        var fields = __getFields(scope.filterString);
        callback(scope.attributes.filter( function(a) {
          var field = fields[a.value];
          if (field.compute) {
            return false; // don't handle computed fields for now
          } else {
            return !field || !field.values || field.values.length > 0;
          }
        }));
      },
      valueMatches: function(facet, searchTerm, callback)  {
        var fields = __getFields(scope.__getFilterStringWithout(facet));
        var sfield = scope.schema.getField(facet) || scope.schema.getFieldByLabel(facet);
        var field = fields[sfield.name];
        var filter = filters[field.name] || {};
        // Create appropriate controls for field
        if (field.type === 'categorical') {
          var v = filter.values || field.values;
          if (field.counts) {
            v = v.map(function (x) {
              var c = field.counts[x];
              var label = (c != null)? x + ' ' + c : x;
              return {value: x, label: label};
            });
          }
          callback(v);
        } else if (field.type === 'numeric') {
          var stats = filter.stats || field.stats || {};
          var min = (field.min != undefined) ? field.min : stats.min;
          var max = (field.max != undefined) ? field.max : stats.max;
          var values = [min, max];
          if (searchTerm) {
            var s = searchTerm.replace('[', '').replace(']', '');
            var pts = s.split(' TO ');
            if (pts.length === 2 && !isNaN(pts[0]) && !isNaN(pts[1])) {
              values = pts;
            }
          }
          if (!isNaN(values[0]) && !isNaN(values[1])) {
            // Do slider only if values are OK
            setTimeout(function () {
              scope.displaySlider({
                min: min,
                max: max,
                isInteger: field.isInteger(),
                values: values,
                callback: callback
              });
            }, 0);
          }
        } else if (field.type == 'boolean') {
          callback(['true','false']);
        }
      }
    }
  });

  // Update field information first time
  __updateFields();
  //console.log(this.visualSearch);
};

function __escapeString(str) {
  return '"' + str.replace('"', '\"') + '"';
}

function __getFacetString(schema, m) {
  var facet = m.attributes.category;
  var value = m.attributes.value;
  var sfield = schema.getField(facet) || schema.getFieldByLabel(facet);
  if (sfield && sfield.type === 'categorical') {
    value = __escapeString(value);
  }
  return facet + ':' + value;
}

VisualSearch.prototype.setSchema = function (schema) {
  this.schema = schema;
  this.attributes = this.schema.fields.map( function(x) { return { label: x.label, value: x.name }; });
  this.attributes = this.attributes.filter( function(x) {
    return this.limitedFields.indexOf(x.value) < 0;
  }.bind(this));
  this.schema.Subscribe('FieldTypesInitialized', this, function() {
    this.__updateFields(true);
  }.bind(this));
  // Update field information first time
  this.__updateFields(true);
  // TODO: Need to update the current set of filters
};

VisualSearch.prototype.getConstraints = function() {
  var scope = this;
  var query = this.visualSearch.searchQuery;
  var constraints = query.models;
  constraints = constraints.filter( function(m) {
    var facet = m.attributes.category;
    var sfield = scope.schema.getField(facet, true) || scope.schema.getFieldByLabel(facet);
    if (!sfield) {
      console.log('Ignore unknown field ' + facet + ' for schema ' + scope.schema.name, scope.schema);
    }
    return !!sfield; // Filter out unknown fields (maybe a bit aggressive if field not explicitly specified in schema)
  });
  return constraints;
};

VisualSearch.prototype.getFilterString = function () {
  var scope = this;
  var constraints = this.getConstraints();
  var filterString = constraints.map( function(m) {
    return '+' + __getFacetString(scope.schema, m);
  }).join(' ');
  return filterString;
};

VisualSearch.prototype.__getFilterStringWithout = function (facet) {
  var scope = this;
  var constraints = this.getConstraints();
  constraints = constraints.filter(function(m) {
    return m.attributes.category !== facet;
  });
  var filterString = constraints.map( function(m) {
    return '+' + __getFacetString(scope.schema, m);
  }).join(' ');
  return filterString;
};

// Return array of filter strings that we should keep...
VisualSearch.prototype.__getFilterStrings = function () {
  var scope = this;
  var constraints = this.getConstraints();
  var filters = constraints.map( function(m) {
    return '+' + __getFacetString(scope.schema, m);
  });
  var filterStrings = [];
  if (filters.length) {
    // Build up from 0 to n
    for (var i = 0; i < filters.length+1; i++) {
      var fs = _.slice(filters, 0, i);
      filterStrings.push(fs.join(' '));
    }

    // without ith
    for (var i = 0; i < filters.length-1; i++) {
      var fs =  _.concat(_.slice(filters, 0, i), _.slice(filters, i + 1));
      filterStrings.push(fs.join(' '));
    }
  } else {
    filterStrings.push('');
  }
  //console.log(filterStrings);
  return filterStrings;
};

VisualSearch.prototype.getQueryString = function () {
  var scope = this;
  var constraints = this.getConstraints();
  var filterString = constraints.map( function(m) {
    return __getFacetString(scope.schema, m);
  }).join(' AND ');
  if (!filterString) {
    filterString = '*:*';  // Allow all
  }
  return filterString;
};

function identity(x) {
  return x;
}

VisualSearch.prototype.displaySlider = function(options) {
  var min = options.min;
  var max = options.max;
  if (min == null || max == null) return;

  //var scope = this;
  var selected = this.visualSearch.searchBox.selected();
  var callback = options.callback;
  var facetDiv = $('.search_facet.is_editing .search_facet_input_container');
  var input = facetDiv.find('input');

  // Put the selected values VS autocomplete
  //console.log(this.visualSearch);
  //console.log(selected);
  var setVisualSearch = function (values) {
    var label = '[' + values[0] + ' TO ' + values[1] + ']';
    //console.log(label);
    input.val(label);  // update input
    if (selected && selected.length > 0) {
      // update model and make sure to resize
      selected[0].model.set({'range': values, 'value': label}, { 'silent': true });
      selected[0].box.trigger('resize.autogrow', null);
    }
    //callback([value]);
    //$("ul.VS-interface:visible li.ui-menu-item a:first").click();
  };

  var sliderDiv = facetDiv.find('.vs-slider');
  var scale = (options.max - options.min) > 1000? 'logarithmic' : 'linear';
  var step = options.step;
  if (!step) {
    step = (options.isInteger || (options.max - options.min) > 3)? 1 : (options.max - options.min)/10;
  }
  var fn = { to: identity, from: identity };  // to: go from normal to slider scale
  if (scale === 'logarithmic') {
    step = 1;
    fn = {
      // From raw value to slider value (see bootstrap slider toPercentage)
      to: function(value) {
        if (options.max === options.min) {
          return 0;
        } else {
          var max = Math.log(options.max);
          var min = options.min === 0 ? 0 : Math.log(options.min);
          var v = value === 0 ? 0 : Math.log(value);
          return 100 * (v - min) / (max - min);
        }
      },
      // From slider to raw value (see bootstrap slider toValue)
      from: function(percentage) {
        var min = (options.min === 0) ? 0 : Math.log(options.min);
        var max = Math.log(options.max);
        var value = Math.exp(min + (max - min) * percentage / 100);
        value = options.min + Math.round((value - options.min) / step) * step;
        /* Rounding to the nearest step could exceed the min or
         * max, so clip to those values. */
        if (value < options.min) {
          return options.min;
        } else if (value > options.max) {
          return options.max;
        } else {
          return value;
        }
      }
    };
  }

  var smin = fn.to(min); // Slider min
  var smax = fn.to(max); // Slider max

  // Make sure visual search matches slider
  if (!input.val()) {
    setVisualSearch(options.values);
  }
  var values = options.values.map( fn.to );
  if (sliderDiv.length === 0) {
    sliderDiv = $('<div class="vs-slider"></div>');
    var slider = $('<div></div>');
    slider.slider({
      range: true,
      min: smin,
      max: smax,
      values: values,
      step: step,
      slide: function( event, ui ) {
        setVisualSearch([fn.from(ui.values[0]),fn.from(ui.values[1])]);
      }
    });

    sliderDiv.width(100);
    sliderDiv.append(slider);
    facetDiv.append(sliderDiv);

    //selected[0].box.bind('blur', function(event) {
    //  console.log('box blur');
    //  //sliderDiv.hide();
    //});
  } else {
    sliderDiv.show();
  }
};

// See https://github.com/Djo/visualsearch-with-datepicker
VisualSearch.prototype.displayDatepicker = function (callback) {
  var input = $('.search_facet.is_editing input.search_facet_input');

  var removeDatepicker = function () {
    input.datepicker("destroy");
  };

  // Put a selected date into the VS autocomplete and trigger click
  var setVisualSearch = function (date) {
    removeDatepicker();
    callback([date]);
    $("ul.VS-interface:visible li.ui-menu-item a:first").click();
  };

  input.datepicker({
    dateFormat: 'yy-mm-dd',
    onSelect: setVisualSearch,
    onClose: removeDatepicker
  });
  input.datepicker('show');
};


module.exports = VisualSearch;