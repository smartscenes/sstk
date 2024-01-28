// Class that is responsible for animation the scene based on the selected articulations
class BasePlayer {
  constructor(params) {
    this.enabled = true;
    this.__isPlaying = !!params.isPlaying; // force to be a boolean
    this.playWidget = null;
    if (params.playWidget) {
      this.bindPlayWidget(params.playWidget);
    }
  }

  get isPaused() {
    return !this.isPlaying;
  }

  set isPaused(v) {
    this.isPlaying = !v;
  }

  get isPlaying() {
    return this.__isPlaying;
  }

  set isPlaying(v) {
    this.__isPlaying = v;
    if (this.playWidget) {
      this.playWidget.isPlaying = this.__isPlaying;
    }
  }

  set isDisplayWidgetsVisible(flag) {
    this.__isDisplayWidgetsVisible = flag;
  }

  get isDisplayWidgetsVisible() {
    return this.__isDisplayWidgetsVisible;
  }

  pause() {
    this.isPlaying = false
  }

  play() {
    this.isPlaying = true;
  }

  turnOn() {
    this.play();
  }

  turnOff() {
    this.pause();
  }

  toggle() {
    if (!this.isPlaying) {
      this.play();
    } else {
      this.pause();
    }
    return this.isPlaying;
  }

  get playPercent() {
    // todo override (percent that has played)
  }

  set playPercent(v) {
    // todo override (percent that has played)
  }

  bindPlayWidget(widget) {
    BasePlayer.bindPlayWidget(this, widget);
  }

  /**
   * Bind player and widget
   * @param player {BasePlayer}
   * @param widget {PlaySliderWidget}
   */
  static bindPlayWidget(player, widget) {
    //console.log('bindPlayWidget', widget);
    player.playWidget = widget;
    // Setup slider
    const slider = widget.slider;
    const updateAnim = (value) => {
      player.playPercent = value;
      widget.isPlaying = false;
    };
    slider.change(updateAnim, updateAnim);
    slider.updateValue = () => {
      const playerValue = player.playPercent;
      if (playerValue != null) {
        slider.value = playerValue;
      }
    };
    widget.Unsubscribe('PlayPause', player);
    widget.Subscribe('PlayPause', player, (action,isPlaying) => {
      player.isPlaying = isPlaying;
    });
    widget.isPlaying = player.isPlaying;
    widget.Unsubscribe('ShowWidgets', player);
    widget.Subscribe('ShowWidgets', player, (action,isVisible) => {
      player.isDisplayWidgetsVisible = isVisible;
    });
    widget.isWidgetVisible = player.isDisplayWidgetsVisible;
  }
}

// Exports
module.exports = BasePlayer;
