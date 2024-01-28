const Constants = require('Constants');
const _ = require('util/util');
// RLSD config overrides by compile time env variables
const RlsdConstants = Constants;

if (RlsdConstants.config.rlsd) {
  const rlsdBaseUrl = process.env.RLSD_HOST || Constants.baseUrl;
  RlsdConstants.config.rlsd = _.cloneDeepWithReplaceVars(RlsdConstants.config.rlsd, { baseUrl: Constants.baseUrl, rlsdBaseUrl: rlsdBaseUrl });
  RlsdConstants.config.rlsd.scene_wizard.shape_suggestor_endpoint.url = process.env.RLSD_SHAPE_SUGGESTER_ENDPOINT || RlsdConstants.config.rlsd.scene_wizard.shape_suggestor_endpoint.url;
  RlsdConstants.config.rlsd.scene_wizard.pose_suggestor_endpoint.url = process.env.RLSD_POSE_SUGGESTOR_ENDPOINT || RlsdConstants.config.rlsd.scene_wizard.pose_suggestor_endpoint.url;
  RlsdConstants.config.rlsd.scene_wizard.object_similarity_endpoint.url = process.env.RLSD_OBJECT_SIMILARITY_ENDPOINT || RlsdConstants.config.rlsd.scene_wizard.object_similarity_endpoint.url;
  RlsdConstants.config.rlsd.scene_manager.save_endpoint.url_prefix = process.env.RLSD_SCENE_MANAGER_SAVE_URL_PREFIX || RlsdConstants.config.rlsd.scene_manager.save_endpoint.url_prefix;
  RlsdConstants.config.rlsd.scene_manager.backend_url_prefix = process.env.RLSD_BACKEND_URL_PREFIX || RlsdConstants.config.rlsd.scene_manager.backend_url_prefix;
}

RlsdConstants.SELECT_MASK_ACTION = "Hold shift to select masks behind objects";
RlsdConstants.TOGGLE_MASK_ASSIGNMENT_ACTION = "Hold shift to assign/unassign masks";
RlsdConstants.ICON_PATH = Constants.highlightIconsDir;

module.exports = RlsdConstants;

