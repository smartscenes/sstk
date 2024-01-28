function TabsControl(params) {
  this._tabs = params.tabs;
  this._tabsElement = $(params.tabsDiv || '#tabs');
  this.onTabsActivate = params.onTabsActivate;
  this.onTabActivated = params.onTabActivated;
  this.keymap = params.keymap;
}

TabsControl.prototype.hookupFunctions = function(target) {
  target.getActiveTab = this.getActiveTab.bind(this);
  target.activateTab = this.activateTab.bind(this);
  target.disableTab = this.disableTab.bind(this);
};

// Function for dealing with tabs
TabsControl.prototype.__getTabIndex = function (name, defaultIndex) {
  const i = this._tabs? this._tabs.indexOf(name) : undefined;
  if (i >= 0) return i;
  else return defaultIndex;
};

TabsControl.prototype.getActiveTab = function() {
  const active = this._tabsElement.tabs( "option", "active" );
  return this._tabs? this._tabs[active] : active;
};

TabsControl.prototype.activateTab = function(nameOrIndex) {
  const tabIndex = (typeof(nameOrIndex) === 'string')? this.__getTabIndex(nameOrIndex) : nameOrIndex;
  // console.log('activate tab', nameOrIndex, tabIndex);
  if (tabIndex != null) {
    this._tabsElement.tabs({active: tabIndex});
  }
};

TabsControl.prototype.disableTab = function(nameOrIndex, hide) {
  const tabIndex = (typeof(nameOrIndex) === 'string')? this.__getTabIndex(nameOrIndex) : nameOrIndex;
  //console.log('disable tab', nameOrIndex, tabIndex);
  if (tabIndex != null) {
    this._tabsElement.tabs('disable', tabIndex);
    if (hide) {
      //console.log('hide tab', nameOrIndex, tabIndex);
      $(this._tabsElement.find('li').get(tabIndex)).hide();
    }
  }
};

TabsControl.prototype.initTabs = function() {
  const scope = this;
  // ['scenes', 'models', 'textures', 'colors', 'arch', 'scans', 'sceneHierarchy', 'bvh', 'sceneGen']
  this._tabsElement.bind('tabsactivate', function (event, ui) {
    if (scope.onTabsActivate) {
      scope.onTabsActivate();
    }
    const tab = scope.getActiveTab();
    if (this.keymap) {
      this.keymap.setScope(tab);
    }
    if (scope.onTabActivated) {
      scope.onTabActivated(tab);
    }
  });
};

module.exports = TabsControl;
