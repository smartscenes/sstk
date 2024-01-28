const PubSub = require('PubSub');
const PartForm = require('./PartForm');
const _ = require('util/util');

class PartsSelectionUI extends PubSub {
  /**
   * Add part pills
   * @param parts {Part[]}
   * @param options.container {jQuery} Element on which the part pills should be placed
   * @param [options.groupParts] {boolean} Whether parts should be grouped
   */
  constructor(parts, options) {
    super();
    this.parts = parts;
    this.container = options.container;
    this.groupParts = options.groupParts;
    this.groupNames = ['part', 'fixed part', 'object', 'fixed object', 'arch', 'unknown'];
  }

  getFirstPid() {
    return this.getPartTags().first().data('id');
  }

  create(parts, annotations) {
    if (this.groupParts) {
      const grouped = _.groupBy(parts.filter(p => p), part => {
        if (part.group != null) {
          return part.group;
        } else if (part.isArch) {
          return 'arch';
        } else if (part.isObject) {
          return 'object';
        } else if (part.isPart) {
          if (part.isFixedBasePart) {
            return 'fixed part';
          } else {
            return 'part';
          }
        } else {
          return 'unknown';
        }
      });
      const groupNames = this.groupNames;
      this.__groupToContainer = {};
      for (let i = 0; i < groupNames.length; i++) {
        const name = groupNames[i];
        const groupParts = grouped[name];
        const subcontainer = $('<span></span>');
        subcontainer.data('group', name);
        subcontainer.text(name).append('&nbsp;');
        this.__groupToContainer[name] = subcontainer;
        this.container.append(subcontainer);
        if (groupParts) {
          groupParts.forEach((part) => {
            if (part) {
              part.group = name;
            }
          });
          this.addPartPills(subcontainer, groupParts, annotations);
        }
      }
    } else {
      this.addPartPills(this.container, parts, annotations);
    }
  }

  isPartEditable(part) {
    return !(part.isArch || part.label === 'unknown');
  }

  setPartGroup(part, group) {
    if (!this.isPartEditable(part)) {
      return; // not changeable
    }
    if (group === 'fixed') {
      if (part.isPart) {
        group = 'fixed part';
      } else if (part.isObject) {
        group = 'fixed object';
      } else {
        // not changeable
        return;
      }
    } else if (group === 'moveable') {
      if (part.isPart) {
        group = 'part';
      } else if (part.isObject) {
        group = 'object';
      } else {
        // not changeable
        return;
      }
    }
    if (part.group != group) {
      part.group = group;
      this.__movePartPill(part, group);
    }
  }

  __movePartPill(part, group) {
    const pill = this.getPartPill(part.pid);
    const currParentGroup = pill.parent().data('group');
    if (currParentGroup === group) {
      // Already under current parent
      return;
    }
    // find position to insert (alphabetical)
    const subcontainer = this.__groupToContainer[group];
    const pills = this.getPartTags(subcontainer);
    let inserted = false;
    for (let i = 0; i < pills.length; i++) {
      if ($(pills[i]).data('name') > part.name) {
        // insert here
        $(pills[i]).before(pill);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      subcontainer.append(pill);
    }
  }

  /**
   * Make part pill
   * @param part {Part}
   * @param isAnnotated {boolean}
   * @returns {jQuery}
   */
  __makePartPill(part, isAnnotated) {
    const pid = part.pid;
    const name = part.name;
    const partElement =
      $(`<div class="part-tag enabled" id="part-${pid}">
							${name}<span class="needs-review hidden">•</span>
						</div>`).data('id', pid).data('name', name);

    if (isAnnotated) {
      partElement.addClass('annotated');
    }
    return partElement;
  }

  /**
   * Add part pills to container
   * @param container
   * @param parts {Part[]}
   * @param annotations Map of pid to annotations for part
   */
  addPartPills(container, parts, annotations) {
    parts = _.sortBy(_.filter(parts, p => p), 'name');
    for (let part of parts) {
      if (part != null) {
        const partElement = this.__makePartPill(part, annotations[part.pid]);
        container.append(partElement);
      }
    }
  }

  getPartTags(container) {
    container = container || this.container;
    return container.find('.part-tag');
  }

  getPartPill(pid) {
    return this.container.find(`#part-${pid}`);
  }

  clickPartPill(pid) {
    this.getPartPill(pid).click();
  }

  setPartTagSelected(pid, disableTags=false) {
    const partTags = this.getPartTags();
    const partPill = this.getPartPill(pid);
    partTags.removeClass('selected');
    partPill.addClass('selected');
    partPill.find('.needs-review').addClass("hidden");

    if (disableTags) {
      partTags.removeClass('enabled');
    }
  }

  unsetPartTagAnnotated(pid) {
    const partPill = this.getPartPill(pid);
    partPill.removeClass('annotated');
  }

  clearAllPartTagAnnotated() {
    this.getPartTags().removeClass('annotated');
  }

  setPartTagAnnotated(pid, siblings) {
    const partTags = this.getPartTags();
    const partPill = this.getPartPill(pid);

    partTags.addClass('enabled');
    partPill.addClass('annotated');
    partPill.find('.needs-review').addClass('hidden');

    if (siblings) {
      siblings.forEach(pid => {
        this.getPartPill(pid).addClass('annotated');
        this.getPartPill(pid).find('.needs-review').removeClass('hidden');
      });
    }
  }

  updatePartTags(annotations) {
    this.parts.forEach((targetPart) => {
      const pid = targetPart.pid;
      const partPill = this.getPartPill(pid);
      if (annotations[pid]) {
        partPill.addClass('annotated');
      } else {
        partPill.removeClass('annotated');
      }
      this.__movePartPill(targetPart, targetPart.group);
    });
  }

  editPart(part) {
    const isEditable = this.isPartEditable(part);
    if (!isEditable) {
      // not editable
      return;
    }
    if (!this.__partForm) {
      this.__partForm = new PartForm({
        groupNames: (part.isPart)? ['part', 'fixed part'] : ['object', 'fixed object', 'arch'],
        part: _.pick(part, ['pid', 'label', 'group']),
        onDone: (p) => {
          this.__partForm = null;
          this.setPartGroup(part, p.group);
        }
      });
      this.__partForm.show();
    }
  }

  bindEvents() {
    // Highlight part in scene when hovering over part-tag in sidebar
    this.parts.forEach((targetPart) => {
      const pid = targetPart.pid;
      const partPill = this.getPartPill(pid);
      partPill.mouseenter((event) => {
        this.Publish('hover', pid, targetPart, true);
      });

      partPill.mouseleave((event) => {
        this.Publish('hover', pid, targetPart, false);
      });

      partPill.click((event) => {
        this.Publish('select', pid, targetPart);
      });

      partPill.dblclick((event) => {
        this.editPart(targetPart);
      });
    });
  }

}

module.exports = PartsSelectionUI;