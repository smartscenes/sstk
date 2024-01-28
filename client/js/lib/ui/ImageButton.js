class ImageButton {
  constructor(opts) {
    this.iconUrl = opts.iconUrl;
    this.activeUrl = opts.activeUrl || opts.iconUrl;
    this.hoverUrl = opts.hoverUrl || opts.iconUrl;
    this.__isActive = opts.__isActive;
    this.element = $('<img/>').attr('src', this.iconUrl);
    if (opts.container) {
      opts.container.append(this.element);
    }
    if (opts.click) {
      this.element.click(opts.click);
    }
  }

  get isActive() {
    return this.__isActive;
  }

  set isActive(v) {
    this.__isActive = v;
    if (this.activeUrl) {
      this.element.attr('src', this.__getIconUrl(v, false));
    }
  }

  __getIconUrl(isActive, isHover) {
    if (isActive) {
      return isHover? this.hoverUrl : this.activeUrl;
    } else {
      return isHover? this.hoverUrl : this.iconUrl;
    }
  }

  onHover(flag) {
    this.element.attr('src', this.__getIconUrl(this.isActive, flag));
  }
}

module.exports = ImageButton;