const PubSub = require('PubSub');
const SliderWidget = require('ui/widget/SliderWidget');

class PlaySliderWidget extends PubSub {
  constructor(params) {
    super();
    this.slider = new SliderWidget({
      name: 'animateArticulations',
      min: 0,
      max: 100,
      value: 0,
      step: 1,
      labelMin: (params && params.getLabel)? params.getLabel(0) : null,
      labelMax: (params && params.getLabel)? params.getLabel(100) : null,
      showMinMaxValues: false,
      addMinMaxValueButtons: false
    });
    this.playPauseButton = $('<i class="fas fa-play"></i>');
    this.__playButtonSpan = $('<span class="part-antn-edit-button"></span>')
      .append(this.playPauseButton)
      .css('padding', '4px 4px').css('margin','0 4px');
    this.__isPlaying = false;
    if (params && params.isWidgetVisible != null) {
      this.showWidgetsButton = $('<i class="fas fa-compass"></i>');
      this.__showWidgetSpan = $('<span class="part-antn-edit-button"></span>')
        .append(this.showWidgetsButton)
        .css('padding', '4px 4px').css('margin','0 4px');
      this.isWidgetVisible = params.isWidgetVisible;
    }
  }

  bindEvents() {
    this.playPauseButton.click(() => {
      const action = this.__isPlaying? 'pause':'play';
      //console.log('click ' + action);
      this.isPlaying = !this.__isPlaying;
      this.Publish('PlayPause', action, this.__isPlaying);
    });
    if (this.showWidgetsButton) {
      this.showWidgetsButton.click(() => {
        const action = this.__isWidgetVisible ? 'hide' : 'show';
        //console.log('click ' + action);
        this.isWidgetVisible = !this.__isWidgetVisible;
        this.Publish('ShowWidgets', action, this.__isWidgetVisible);
      });
    }
  }

  appendTo(element, buttonsParent) {
    element.append(this.slider.element);
    buttonsParent = buttonsParent || element;
    buttonsParent.append(this.__playButtonSpan);
    if (this.__showWidgetSpan) {
      buttonsParent.append(this.__showWidgetSpan);
    }
  }

  get isPlaying() { return this.__isPlaying; }

  set isPlaying(v) {
    this.__isPlaying = v;
    if (this.__isPlaying) {
      this.playPauseButton.removeClass('fa-play');
      this.playPauseButton.addClass('fa-pause');
      this.playPauseButton.attr('title', 'Pause');
    } else {
      this.playPauseButton.removeClass('fa-pause');
      this.playPauseButton.addClass('fa-play');
      this.playPauseButton.attr('title', 'Articulate');
    }
  }

  get isWidgetVisible() { return this.__isWidgetVisible; }

  set isWidgetVisible(v) {
    this.__isWidgetVisible = v;
    if (this.showWidgetsButton) {
      if (this.__isWidgetVisible) {
        this.showWidgetsButton.css('color', 'black');
        this.showWidgetsButton.attr('title', 'Hide widgets');
      } else {
        this.showWidgetsButton.css('color', 'gray');
        this.showWidgetsButton.attr('title', 'Show widgets');
      }
    }
  }
}

module.exports = PlaySliderWidget;