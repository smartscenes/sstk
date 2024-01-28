'use strict';

/**
 * Simple Toolbar
 * Toolbar buttons states:
 *  active: clicked on
 *  disabled: user cannot click on disabled buttons (grayed out)
 * @param params
 * @constructor
 * @memberOf ui
 */
function Toolbar(params)
{
  this.app = params.app;
	this.elem = params.container;
  this.iconsPath = params.iconsPath;
	this.toolbarName = params.name || 'toolbar';

	this.buttons = {};
}

Toolbar.prototype.constructor = Toolbar;

Toolbar.prototype.init = function() {
  this.elem.hide();
  this.elem.show();
};

Toolbar.prototype.setIcon = function(button, iconName) {
  if (iconName) {
		var iconURL = this.iconsPath + iconName;
		button.css('background-image', 'url(' + iconURL + '_normal.png)');

		// Change the icon color when the button is active
		button.mousedown(function() {
			button.css('background-image', 'url(' + iconURL + '_active.png)');
			var mouseup = function() {
			button.css('background-image', 'url(' + iconURL + '_normal.png)');
			$(document).unbind('mouseup', mouseup);
			};
			$(document).mouseup(mouseup);
		});
  }
};

Toolbar.prototype.addMenuButton = function(name, tooltip, items) {
	var button = $('<div class="button"></div>')
		.attr('id', this.toolbarName + '-' + name)
		.attr('title', tooltip);
	var buttonLabel = $('<span class="buttonLabel dropdown-toggle"></span>')
		.attr('data-toggle', 'dropdown');
	var buttonText = $('<span class="buttonText"></span>').text(name);
	var caret = $('<span class="caret"></span>');
	button.append(buttonLabel.append(buttonText).append(caret));

	var btnElems = $('<li></li>').addClass('dropdown-menu');
	items.forEach((item) => {
		var itemElem = $('<a></a>').addClass('dropdown-item').text(item.label);
		itemElem.click(() => {
			buttonText.text(item.label);
			if (item.click) {
				item.click();
			}
			button.data('state', item.label);
		});
		btnElems.append($('<li></li>').append(itemElem));
	});
	button.append(btnElems);

	this.elem.append(button);
	this.buttons[name] = button;
};

Toolbar.prototype.setMenuButtonLabel = function(name, option) {
	const button = this.buttons[name];
	if (button) {
		button.find('.buttonText').text(option);
		button.data('state', option);
	}
};

Toolbar.prototype.addButton = function(name, tooltip, iconName, clickCallback, checkSelected) {
	var button = $('<div class="button"></div>');
	button.attr('id', this.toolbarName + '-' + name);
	button.attr('title', tooltip);
	button.append($('<span class="buttonLabel">' + name + '</span>'));
	button.checkSelected = checkSelected;

  this.setIcon(button, iconName);
	
	// Click callback
	if (clickCallback) {
		button.click(function () {
			if (!button.hasClass('disabled')) {
				var event = {
					type: 'toolbar'
				};
				clickCallback(event);
				if (checkSelected) {
					if (checkSelected()) {
						button.addClass('selected');
					} else {
						button.removeClass('selected');
					}
				}
			}
		});
	}
	if (checkSelected) {
		if (checkSelected()) {
			button.addClass('selected');
		} else {
			button.removeClass('selected');
		}
	}
	
	this.elem.append(button);
	this.buttons[name] = button;
};

Toolbar.prototype.updateButtonState = function(name, flag) {
	var button = this.buttons[name];
	if (button) {
		if (flag === undefined && button.checkSelected) {
			flag = button.checkSelected();
		}
		if (flag) {
			button.addClass('selected');
		} else {
			button.removeClass('selected');
		}
	}
};

Toolbar.prototype.setButtonWidth = function(name, length) {
	var button = this.buttons[name];
	if (button) {
		button.css('width', length);
	}
};

// Function to relabel a existing button (used for mturk tasks)
Toolbar.prototype.labelButton = function(name, label, tooltip, iconName) {
  var button = this.buttons[name];
  if (button) {
    button.attr('title', tooltip);
    button.find(".buttonLabel").text(label);
    if (iconName) {
      this.setIcon(button, iconName);
    }
  }
};

Toolbar.prototype.addSpacer = function() {
	this.elem.append($('<div class="spacer"></div>'));
};

Toolbar.prototype.enableButton = function(name) {
	var button = this.buttons[name];
	button && button.removeClass('disabled');
};

Toolbar.prototype.disableButton = function(name) {
	var button = this.buttons[name];
	button && button.addClass('disabled');
};

Toolbar.prototype.showButton = function(name) {
  var button = this.buttons[name];
  button && button.show();
};

Toolbar.prototype.hideButton = function(name) {
  var button = this.buttons[name];
  button && button.hide();
};

Toolbar.prototype.hide = function() {
	this.elem.hide();
};

Toolbar.prototype.show = function() {
	this.elem.show();
};

Toolbar.prototype.applyOptions = function(options) {
	if (options) {
		var hideButtons = options.hideButtons;
		if (hideButtons) {
			for (var i = 0; i < hideButtons.length; i++) {
				this.hideButton(hideButtons[i]);
			}
		}

		var showButtons = options.showButtons;
		if (showButtons) {
			for (var i = 0; i < showButtons.length; i++) {
				this.showButton(showButtons[i]);
			}
		}

		var labelOptions = options.labelOptions;
		if (labelOptions) {
			for (var i = 0; i < labelOptions.length; i++) {
				var labelName = labelOptions[i].name;
				var labelLabel = labelOptions[i].label;
				var labelTooltip = labelOptions[i].tooltip;
				var labelIconName = labelOptions[i].iconName;
				this.labelButton(labelName,labelLabel,labelTooltip,labelIconName);
			}
		}
	}
};


// Exports
module.exports = Toolbar;
