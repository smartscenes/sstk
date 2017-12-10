'use strict';

define(['math/RNG', 'base'], function (RNG) {

  // TODO: Have a concept of a dataset?
  function DataModel(searchUrl, constraints, fields, callback, random, start, rows, schema) {
    this.searchUrl = searchUrl;
    this.constraints = constraints;
    this.fields = fields;
    this.callback = callback;
    this.sort = random;
    this.start = start;
    this.rows = rows;
    this.schema = schema;
  }

  DataModel.prototype.onSuccessCallback = function (data, textStatus, jqXHR) {
    //construct a new data array with all necessary fields
    //var fields = this.fields;
    data = data.response.docs;

    if (this.schema) {
      this.schema.processData(data);
    }
    var filteredData = data.map(function (d) {
      //var dataObject = {};
      //for (var i = 0; i < fields.length; i++) {
      //  var name = fields[i];
      //  dataObject[name] = d[name];
      //}
      return d;
    });
    this.callback(filteredData);
  };

  DataModel.prototype.onFailureCallback = function (jqXHR, textStatus, errorThrown) {
    console.log(errorThrown);
  };

  DataModel.prototype.queryData = function () {
    var method = 'POST';
    var url = this.searchUrl;

    var sort = this.sort ? 'random_' + Math.ceil(RNG.global.random() * 1000000) + ' desc' : '';
    var queryData = {
      'q': this.constraints, //parse this if necessary, may not be in correct query format
      'fl': this.fields.toString(),
      'wt': 'json',
      'sort': sort,
      'start': (this.start || 0),
      'rows': (this.rows || 10000000)
    };

    $.ajax //ajax request
    ({
      type: method,
      url: url,
      data: queryData,
      dataType: 'jsonp',
      jsonp: 'json.wrf',
      success: this.onSuccessCallback.bind(this),
      error: this.onFailureCallback.bind(this),
      timeout: 300000
    });
  };

  //exports
  return DataModel;
});
