const PubSub = require('PubSub');

class ProgressBar extends PubSub {
  constructor(config) {
    super();
    this.__elements = {
      progress: config.progress,
      bar: config.bar,
      barText: config.barText
    };
    this.__init();
  }

  get width() {
    return this.__elements.progress.get(0).clientWidth;
  }

  get progressElement() {
    return this.__elements.progress;
  }

  __init() {
    const progress = this.__elements.progress;
    const bar = this.__elements.bar;
    const barText = this.__elements.barText;
    progress.css('visibility', 'visible');
    progress.css('width', `${this.width + 2}px`);
    bar.css('visibility', 'visible');
    barText.css('visibility', 'visible').css('bottom', '2px');
    return progress;
  }

  setVisible(flag) {
    const elems = Object.values(this.__elements);
    if (flag) {
      elems.forEach((elem) => {
        elem.css('visibility', 'visible');
      });
    } else {
      elems.forEach((elem) => {
        elem.css('visibility', 'hidden');
      });
    }
  }

  setHoverProgress(flag) {
    const progress = this.__elements.progress;
    if (flag) {
      progress.addClass('hoverProgress');
    } else {
      progress.removeClass('hoverProgress');
    }
  }

  update(completed, total) {
    const bar = this.__elements.bar;
    const barText = this.__elements.barText;
    barText.text(`${completed}/${total}`);
    const barWidth = (completed / total) * this.width;
    const textWidth = barText.width();
    const textLoc = this.width - (5/4) * textWidth;
    bar.get(0).style.width = `${barWidth}px`;
    if (barWidth < textLoc) {
      barText.css('left', `${textLoc}px`);
    } else {
      barText.css('left', `${(1/4) * textWidth}px`);
    }
  }
}

module.exports = ProgressBar;