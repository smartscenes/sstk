const StatusBar = require('ui/StatusBar');

class RlsdStatusBar extends StatusBar {
  constructor(params) {
    super({
      element: params.element,
      badges: [
        { name: 'shiftAction', label: params.shiftAction, active: false, enabled: true },
        { name: 'ctrlAction', label: params.ctrlAction, active: false, enabled: true },
        { name: 'restrictToSurface',  label: 'Restrict Movement to Surface', active: false, enabled: true, key: 'r' },
        { name: 'freeWalk',  label: 'Free Walk', active: false, enabled: true, key: 'w' },
        { name: 'maskComment', label: 'Mask Comment', active: false, enabled: true, key: 'c' }
      ]
    });
  }

  init(params) {
    super.init(params);
    this.setFreeWalkMode(params.freeWalkMode);
    this.setAllowMaskComment(false);
    this.setRestrictToSurface(params.restrictToSurface);
  }

  setCtrlPressed(isPressed) {
    this.badges.ctrlAction.setActive(isPressed);
  }

  setShiftPressed(isPressed) {
    this.badges.shiftAction.setActive(isPressed);
  }

  setShiftActionLabel(label) {
    this.badges.shiftAction.setLabel(label);
  }

  setAllowMaskComment(flag) {
    this.badges.maskComment.setEnabled(flag);
    this.setMaskCommentActive(this.badges.maskComment.active);
  }

  setMaskCommentActive(flag) {
    const badge = this.badges.maskComment;
    badge.setActive(flag);
    if (flag) {
      badge.setLabel('press "esc" to cancel comment for mask');
    } else if (badge.key) {
      badge.setLabel('press "' + badge.key + '" to enter comment for mask');
    }
  }

  setFreeWalkMode(flag) {
    const badge = this.badges.freeWalk;
    badge.setActive(flag);
    if (flag) {
      badge.setLabel('press "esc" to exit free walk mode');
    } else if (badge.key)  {
      badge.setLabel('press "' + badge.key + '" to enter free walk mode');
    }
  }

  setRestrictToSurface(flag) {
    const badge = this.badges.restrictToSurface;
    badge.setActive(flag);
    if (flag) {
      badge.setLabel('press "' + badge.key + '" to allow attachment to other surfaces');
    } else if (badge.key)  {
      badge.setLabel('press "' + badge.key + '" to restrict movement to current attached surface');
    }
  }
}

module.exports = RlsdStatusBar;