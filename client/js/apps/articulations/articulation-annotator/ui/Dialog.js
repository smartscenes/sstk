const PubSub = require('PubSub');

class Dialog extends PubSub {
  constructor(container, editable, supportSave) {
    super();
    this.container = container;
    this.editable = editable;
    this.supportSave = supportSave;
    this.__position = null;
  }

  create(title) {
    let dialog;
    this.clear();
    if (this.supportSave) {
      dialog = $(`<div class="antn-dialog fixed">
        <div class="antn-dialog-title">${title}</div>
        <div class="antn-dialog-content"></div>
        <div class="antn-dialog-buttons">
          <div class="antn-dialog-button cancel-btn">Cancel</div>
          <div class="antn-dialog-button submit-btn">Save</div>
        </div>
      </div>`);
    } else {
      dialog = $(`<div class="antn-dialog fixed">
        <div class="antn-dialog-title">${title}</div>
        <div class="antn-dialog-content"></div>
        <div class="antn-dialog-buttons">
          <div class="antn-dialog-button cancel-btn">Close</div>
        </div>
      </div>`);
    }
    dialog.css("max-height", "80%");
    dialog.css("overflow", "auto");
    if (this.__position) {
      dialog[0].style.top = this.__position.top;
      dialog[0].style.left = this.__position.left;
    }
    this.container.append(dialog);
    return dialog;
  }

  clear() {
    this.container.empty();
  }

  close() {
    // Like clear but issues close event
    this.clear();
    this.Publish('close');
  }

  updatePosition(pos) {
    this.__position = pos;
  }

  getTitleDiv() {
    return this.container.find('.antn-dialog-title');
  }

  getContentDiv() {
    return this.container.find('.antn-dialog-content');
  }

  getButtonsDiv() {
    return this.container.find('.antn-dialog-buttons');
  }

  onSave(cb) {
    this.container.find('.submit-btn').click((event) => { cb(); });
  }

  onCancel(cb) {
    this.container.find('.cancel-btn').click((event) => { cb(); });
  }
}

module.exports = Dialog;