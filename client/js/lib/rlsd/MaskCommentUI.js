const PubSub = require('PubSub');
const UIUtil = require('ui/UIUtil');
const _ = require('util/util');

class MaskCommentUI extends PubSub {
  constructor(container) {
    super();
    this.__setup(container);
    this.active = false;
  }

  display(commentJson) {
    this.__container.show();
    //this.__popup.style.display = 'block';
    if (commentJson != null) {
      this.comment = commentJson.comment;
      this.reason = commentJson.reason;
      this.__deleteBtn.show();
      //this.__deleteBtn.style.display = 'inline-block';
    } else {
      this.clear();
      this.__deleteBtn.hide();
      //this.__deleteBtn.style.display = 'none';
    }
    this.active = true;
  }

  close(clear) {
    if (clear) {
      this.clear();
    }
   // this.__popup.style.display = 'none';
    this.__container.hide();
    this.active = false;
    this.Publish('close');
  }

  get comment() {
    const comment = this.__commentInput.val().trim();
    if (comment.length > 0) {
      return comment;
    }
  }

  set comment(comment) {
    if (comment == null) {
      this.__commentInput.val('');
    } else {
      this.__commentInput.val(comment);
    }
  }

  get reason() {
    const reason = this.__reasonInput.val();
    if (reason !== 'NONE') {
      return reason;
    }
  }

  set reason(code) {
    if (code == null) {
      this.__reasonInput.val('NONE');
    } else {
      this.__reasonInput.val(code);
    }
  }

  getJson() {
    return {
      'reason': this.reason,
      'comment': this.comment
    };
  }

  clear() {
    this.comment = null;
    this.reason = null;
  }

  __initUI(container) {
    this.__container = $(container);
    this.__closeBtn = $('<span class="popup-close">&times;</span>');
    this.__submitBtn = $('<input type="button" id="popup-submit" value="Submit">');
    this.__deleteBtn = $('<input type="button" id="popup-delete" value="Delete">');
    this.__commentInput = $('<textarea rows="3" id="popup-input"></textarea>');
    const reasonSelect = UIUtil.createSelect({
      id: "popup-select",
      options: MaskCommentUI.REASON_CODES.map(x => { return { value: x.code, text: x.text }; }),
      text: "Reason"
    });
    this.__reasonInput = reasonSelect.select;
    const content = $('<div class="popup-content"></div>');
    const header = $('<div class="popup-header"></div>');
    header.append(this.__closeBtn).append('<h2>Please enter notes for mask</h2>');
    content.append(header);
    const body = $('<div class="popup-body"></div>');
    const form = $('<form class="popup-form"></form>');
    form.append(reasonSelect.label);
    form.append(this.__reasonInput);
    form.append($('<label for="popup-input">Comment</label>'));
    form.append(this.__commentInput);
    form.append('<br/>');
    form.append(this.__submitBtn);
    form.append(this.__deleteBtn);
    body.append(form);
    content.append(body);
    this.__container.append(content);
  }

  __setup(container) {
    this.__initUI(container);
    this.__closeBtn.click(() => {
      this.close();
    });
    window.onclick = (event) => {
      if (event.target === this.__container.get(0)) {
        this.close(true);
      }
    };
    this.__submitBtn.click(() => {
      const commentJson = this.getJson();
      this.Publish('submit', commentJson);
      this.close(true);
      return false;
    });
    this.__deleteBtn.click(() => {
      this.Publish('delete');
      this.close(true);
    });
  }
}

MaskCommentUI.REASON_CODES = [
  { code: 'NONE', text: 'None' },
  { code: 'NO-SHAPE-MATCH', text: 'Could not match object shape well'},
  { code: 'NO-FUNCTION-MATCH', text: 'Could not find an object with perfect functional match'},
  { code: 'NO-STRUCTURE-MATCH', text: 'Could not find an object with perfect structural match'},
  { code: 'HIDDEN-FROM-VIEW', text: 'Object is not visible: hidden from view by other objects'},
  { code: 'FAR-AWAY', text: 'Object is too far away for accurate placement'},
  { code: 'WRONG-CATEGORY', text: 'Mask has incorrect label'},
  { code: 'INVALID-MASK', text: 'Mask is invalid (does not correspond to an object in the image)'}
];

MaskCommentUI.REASON_CODE_MAP = _.keyBy(MaskCommentUI.REASON_CODES, 'code');

module.exports = MaskCommentUI;