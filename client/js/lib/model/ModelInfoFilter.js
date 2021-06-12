var ModelInfoFilter = {};

ModelInfoFilter.ArchCategories = ['door', 'arch', 'garage_door', 'window', 'stairs', 'column', 'partition', 'roof'];
ModelInfoFilter.PortalCategories = ['door', 'arch', 'garage_door', 'window'];

ModelInfoFilter.getHasCategoryInFilter = function(targetCategories) {
    return function(ModelInfoFilter) {
        var match = false;
        if (ModelInfoFilter && ModelInfoFilter.category) {
            var categories = ModelInfoFilter.category;
            for (var i = 0; i < categories.length; i++) {
                if (targetCategories.indexOf(categories[i]) >= 0) {
                    match = true;
                    break;
                }
            }
        }
        return match;
    };
};

ModelInfoFilter.getIgnoreCategoryInFilter = function(targetCategories) {
    var fn = ModelInfoFilter.getHasCategoryInFilter(targetCategories);
    return function(x) { return !fn(x); };
};

ModelInfoFilter.getFilter = function(params) {
    if (params.emptyRoom) {
        return ModelInfoFilter.getHasCategoryInFilter(ModelInfoFilter.PortalCategories);
    } else if (params.archOnly) {
        return ModelInfoFilter.getHasCategoryInFilter(ModelInfoFilter.ArchCategories);
    } else if (params.loadModelFilter === 'ignorePortals') {
        return !ModelInfoFilter.getIgnoreCategoryInFilter(ModelInfoFilter.PortalCategories);
    } else if (params.loadModelFilter && params.loadModelFilter.categories) {
        return ModelInfoFilter.getHasCategoryInFilter(params.loadModelFilter.categories);
    } else if (params.loadModelFilter && params.loadModelFilter.ignoreCategories) {
        return ModelInfoFilter.getIgnoreCategoryInFilter(params.loadModelFilter.ignoreCategories);
    } else {
        console.warn("Invalid model filter", params.loadModelFilter);
    }
};

module.exports = ModelInfoFilter;

