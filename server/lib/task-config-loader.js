const fs = require('fs');
const YAML = require('yamljs');
const csv = require('papaparse');
const path = require('path');
const _ = require('lodash');

class TaskConfigLoader {

  constructor(log) {
    this.log = log;
  }

  loadFile(filename) {
    this.log.info('loading file ' + filename);
    var content = fs.readFileSync(filename, {encoding: 'utf8'});
    if (filename.endsWith('yml')) {
      return YAML.parse(content);
    } else if (filename.endsWith('json')) {
      return JSON.parse(content);
    } else if (filename.endsWith('csv')) {
      return csv.parse(content, {header: true}).data;
    } else if (filename.endsWith('tsv')) {
      return csv.parse(content, {header: true, delimiter: '\t', quoteChar: '\0'}).data;
    } else {
      this.log.error('Unsupported file format ' + filename);
    }
  }

  loadFileIfString(v, basepath, quiet) {
    if (typeof v === 'string') {
      var filename = basepath ? path.resolve(basepath, v) : v;
      if (quiet) {
        try {
          return this.loadFile(filename);
        } catch (error) {
          this.log.error('Error loading file: ' + filename, error);
        }
      } else {
        return this.loadFile(filename);
      }
    } else {
      return v;
    }
  }

  loadTaskConfig(relbasepath, filename) {
    this.log.info('loading task config ' + filename);
    filename = path.resolve(relbasepath, filename);
    var taskConfig = this.loadFile(filename);
    var task = {
      config: taskConfig
    };
    var basepath = path.dirname(filename);
    task.scansToAnnotate = this.loadFileIfString(taskConfig.scansToAnnotate, basepath, true);
    task.annotationChecks = this.loadFileIfString(taskConfig.annotationChecks, basepath);
    task.labels = this.loadFileIfString(taskConfig.labels, basepath);
    task.surveys = this.loadFileIfString(taskConfig.surveys, basepath);
    var categoryParts = this.loadFileIfString(taskConfig.categoryParts, basepath);
    if (categoryParts) {
      task.categoryParts = _.keyBy(categoryParts, 'name');
    }
    return task;
  }
}

module.exports = TaskConfigLoader;