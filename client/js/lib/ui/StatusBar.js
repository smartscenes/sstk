class StatusBadge {
  constructor(params) {
    this.badge = this.__createStatusBadge();
    this.name = params.name;
    this.key = params.key;
    if (params.click) {
      this.badge.click(params.click);
    }
    this.setLabel(params.label);
    this.setEnabled(params.enabled);
    this.setActive(params.active);
  }

  __createStatusBadge() {
    return $('<span><span>').addClass('badge').addClass('badge-default');
  }

  setLabel(label) {
    this.label = label;
    this.badge.text(label);
  }

  setActive(flag) {
    this.active = flag;
    if (flag) {
      this.badge.addClass('active');
    } else {
      this.badge.removeClass('active');
    }
  }

  setEnabled(flag) {
    this.enabled = flag;
    if (flag) {
      this.badge.removeClass('disabled');
    } else {
      this.badge.addClass('disabled');
    }
  }
}

class StatusBar {
  constructor(params) {
    this.element = params.element;
    this.badges = {};
    this.init(params);
  }

  init(params) {
    for (let b of params.badges) {
      const badge = new StatusBadge(b);
      this.badges[b.name] = badge;
      this.element.append(badge.badge);
    }
  }
}

module.exports = StatusBar;