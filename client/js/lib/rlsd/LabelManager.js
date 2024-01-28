const AttachmentInfo = require('model/AttachmentInfo');
const _ = require('util/util');

class LabelManager {
  constructor(config, assetManager) {
    this.config = config;
    this.assetManager = assetManager;

    // Initialize map of label to attachment side
    this.__labelToAttachmentSide = _.invertMulti(this.config.attachment_surface);
  }

  getLinkedQuery(categoryInfo) {
    if (categoryInfo && categoryInfo.linked_query) {
      return {
        queryType: 'linked',
        query: categoryInfo.linked_query,
        source: categoryInfo.linked_source,
        parent: categoryInfo.category,        // TODO: rename to parent_category
        text: categoryInfo.name
      };
    }
  }

  lookupLinkedQuery(source, category) {
    const categoryInfo = this.assetManager.getAssetInfo(source + '.' + category);
    return this.getLinkedQuery(categoryInfo);
  }

  getCategoryQuery(categoryInfo) {
    if (categoryInfo) {
      return {
        queryType: categoryInfo.subcat_query? 'category' : 'linked',
        query: categoryInfo.subcat_query? categoryInfo.subcat_query : categoryInfo.linked_query,
        source: categoryInfo.subcat_query? categoryInfo.source : categoryInfo.linked_source,
        parent: categoryInfo.category,        // TODO: rename to parent_category
        text: categoryInfo.name
      };
    }
  }

  lookupCategoryQuery(source, category) {
    const categoryInfo = this.assetManager.getAssetInfo(source + '.' + category);
    return this.getCategoryQuery(categoryInfo);
  }

  getCategoryTrail(source, category, trail) {
    const crumbs = trail || [];
    const query = this.lookupCategoryQuery(source, category);
    if (query) {
      if (query.parent) {
        this.getCategoryTrail(source, query.parent, crumbs);
      }
      crumbs.push(query);
    }
    return crumbs;
  }

  /**
   * Returns information about a query based on the label
   * @param maskLabel {string}
   * @returns {{source: *, text: *, queryString: *, maskLabel}|{text, queryString: string, maskLabel}|{source, text, queryString, maskLabel}}
   */
  maskLabelToQuery(maskLabel) {
    const matches = this.config.search_query.label_query_mapping.filter((a)=>(a.label === maskLabel));
    console.assert(matches.length <= 1); // Should be 1 when the system is complete.
    if (matches.length > 0) {
      const match = matches[0];
      if (match.query) {
        return {
          query: match.query,
          source: match.source,
          text: match.name,
          maskLabel: maskLabel
        };
      } else if (match.category && this.assetManager) {
        // lookup query by category
        const source = match.source != null? match.source : this.config.search_query.default_source;
        const query = this.lookupCategoryQuery(source, match.category);
        if (query) {
          query.crumbs = this.getCategoryTrail(source, match.category);
          query.maskLabel = maskLabel;
          //query.text = (match.name != null) ? match.name : query.name;
          return query;
        }
      }
    }
    console.warn("Fallback: No matching label mapping rule for label " + maskLabel);
    return {
      query: "text:" + maskLabel,
      text: maskLabel,
      maskLabel: maskLabel
    };
  }

  maskLabelToChildAttachment(maskLabel) {
    const attachmentSurface = this.__labelToAttachmentSide[maskLabel];
    let restrictToArch = true;

    if (attachmentSurface === 'bottom') {
      const notOnArch = this.config.putOnArchOnly.disable_mask_labels;
      if (notOnArch.includes(maskLabel)) {
        restrictToArch = false;
      }
    }

    return new AttachmentInfo(attachmentSurface, null, restrictToArch? ['arch'] : null);
  }
}

module.exports = LabelManager;