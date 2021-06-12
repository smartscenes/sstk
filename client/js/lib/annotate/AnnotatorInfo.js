var Constants = require('Constants');
var _ = require('util/util');

// Light weight class with information for annotation tool to create json
function AnnotatorInfo(auth, settings) {
  this.auth = auth;
  this.settings = _.defaults(Object.create(null), settings || {}, {
    // Other fields: appId, type
    sessionId: Constants.getGlobalOrDefault('sessionId', 'local-session'),
    condition: Constants.getGlobalOrDefault('condition', 'test'),
    task: Constants.getGlobal('task'),
    taskMode: 'manual'
  });
}

// Returns a stub with basic information for annotation
AnnotatorInfo.prototype.getStub = function() {
  return _.defaults(Object.create(null), {
    userId: this.auth.userId
  }, this.settings);
};

// Returns merged annotation record
AnnotatorInfo.prototype.getMerged = function(info) {
  var stub = this.getStub();
  return _.merge(stub, info);
};

module.exports = AnnotatorInfo;



