const Constants = require('Constants');
const Object3DUtil = require('geo/Object3DUtil');
const _ = require('util/util');

$.fn.filterByData = function(prop, val) {
  return this.filter(
    function() { return $(this).data(prop)==val; }
  );
}

class MaskToObjectPanel {
  /**
   * Creates UI for looking at what instances are associated with what objects
   * @param params
   * @param params.container
   * @param params.annotations {MaskAnnotations}
   * @param params.sceneState {SceneState}
   * @param params.objectMaskInfos {ObjectInfoStore}
   * @param params.orderBy {string} `label`|`annotation`
   * @param params.getObjectIconUrl {function(THREE.Object3D)}
   * @param params.onHoverLabel {function({id: int, label: string}, flag)}
   * @param params.onClickLabel {function({id: int, label: string})}
   * @param params.onDeleteLabel {function({id: int, label: string})}
   * @param params.onHoverObject {function(THREE.Object3D, flag)}
   * @param params.onClickObject {function(THREE.Object3D)}
   * @param params.onDeleteObject {function(THREE.Object3D)}
   * @param params.onSpecifyPoint {function({id: int}, THREE.Object3D)}
   * @param [params.contextMenu=null] {Object} Options for context menu
   **/
  constructor(params) {
    this.container = params.container;
    this.annotations = params.annotations;
    this.sceneState = params.sceneState;
    this.objectMaskInfos = params.objectMaskInfos;
    this.__getObjectIconUrl = params.getObjectIconUrl;
    this.__onHoverLabelCb = params.onHoverLabel;
    this.__onClickLabelCb = params.onClickLabel;
    this.__onDeleteLabelCb = params.onDeleteLabel;
    this.__onHoverObjectCb = params.onHoverObject;
    this.__onClickObjectCb = params.onClickObject;
    this.__onDeleteObjectCb = params.onDeleteObject;
    this.__onSpecifyPointCb = params.onSpecifyPoint;
    this.__orderBy = params.orderBy;
    this.__imageSize = 128;
    // Context menu options (see https://swisnl.github.io/jQuery-contextMenu/docs.html)
    // (see http://swisnl.github.io/jQuery-contextMenu/demo/input.html)
    this.__contextMenuOptions = this.__prepareContextMenuOptions(params.contextMenu);

    // State
    this.__hoveredMaskInfo = null;
    this.__hoveredObject3d = null;
    this.__selectedMaskIds = [];
    this.__selectedObject3d = null;
  }

  get orderBy() {
    return this.__orderBy;
  }

  set orderBy(orderBy) {
    this.__orderBy = orderBy;
    this.__refreshPanel();
  }

  __isSelectedMaskId(id) {
    return this.__selectedMaskIds.indexOf(id) >= 0;
  }

  __isSelectedObject3D(object3dOrUuid) {
    return this.__selectedObject3d &&
      (this.__selectedObject3d === object3dOrUuid || this.__selectedObject3d.uuid === object3dOrUuid);
  }

  __createLabel(id, label, labelClass) {
    const labelDiv = $('<div></div>')
      .attr('class', 'roundBorder maskLabel ' + labelClass)
      .attr('data-id', id)
      .append($('<span></span>').text(label));
    return labelDiv;
  }

  __hasComment(ann) {
    return ann.comment != null || ann.reason != null;
  }

  __getLabelClass(maskInfo, annotation) {
    const hasComment = this.__hasComment(annotation);
    const nObjects = annotation.objects? annotation.objects.length : 0;
    let labelClass = 'red';
    if (maskInfo.isMissing) {
      labelClass = 'red';
    } else if (nObjects > 0) {
      labelClass = hasComment? 'green comment' : 'green';
    } else if (hasComment) {
      labelClass = 'grey comment';
    }
    if (this.__isSelectedMaskId(maskInfo.id)) {
      labelClass += ' selected';
    }
    return labelClass;
  }

  __createDeleteIcon(callback) {
    return $('<img class="delete"/>').attr('src', Constants.imagesDir + '/16/delete.png')
      .attr('title', 'Remove').attr('alt', 'Remove')
      .attr('height','16px')
      .click(callback);
  }

  __createClickIcon(callback) {
    return $('<img class="click"/>').attr('src', Constants.imagesDir + '/icons/click.png')
      .attr('title', 'Click and update point position').attr('alt', 'Click and update point position')
      .attr('height','16px')
      .click(callback);
  }

  __createBadge(text) {
    return $('<span><span>').addClass('badge').addClass('badge-default').text(text);
  }

  __getObjectInfo(object3d) {
    const info = _.pick(object3d.userData, ['id']);
    const modelInstance =  Object3DUtil.getModelInstance(object3d);
    if (modelInstance && modelInstance.model.info) {
      const modelFields = ['fullId', 'name', 'category', 'wnsynsetkey', 'description'];
      _.defaults(info, _.pick(modelInstance.model.info, modelFields));
    }
    return info;
  }
  __createObjectsImages(objects) {
    const objectsDiv = $('<div class="maskObjects"></div>');
    if (objects) {
      for (let maskObjectPair of objects) {
        const object3d = maskObjectPair.object3d;
        const imageUrl = this.__getObjectIconUrl? this.__getObjectIconUrl(object3d) : null;
        const icon = imageUrl? $(`<img class="objectImage" src="${imageUrl}" width="${this.__imageSize}px"/>`) : $('<div>object</div>');
        icon.hover(() => this.__onHoverObject(object3d, true), () => this.__onHoverObject(object3d, false));
        icon.click(() => this.__onClickObject(object3d, false));
        icon.dblclick(() => this.__onClickObject(object3d, true));
        const objectDiv = $(`<span class="maskObject"></span>`);
        const info = this.__getObjectInfo(object3d);
        objectDiv.attr('title', JSON.stringify(info, null, ' '));
        const delIcon = this.__createDeleteIcon(() => {
          this.__onDeleteObject(object3d);
        });
        if (object3d.userData.isFrozen) {
          objectDiv.addClass('frozen');
        }
        const lockstate = object3d.userData.isFrozen? "lock" : "unlock";
        const buttons = $('<span class="searchOverlay"></span>').css('z-index', 1).css('position', 'absolute').css('top', '2px').css('left', '2px');
        const lockIcon = $(`<i class="lockstate fas fa-${lockstate}"></i>`)
          .click(() => {
            const flag = !object3d.userData.isFrozen;
            this.freezeObject(object3d, flag);
          });
        buttons.append(lockIcon);

        objectDiv.data('uuid', object3d.uuid);
        objectDiv.append(buttons);
        objectDiv.append(icon);
        objectDiv.append(delIcon);
        const nMasksForObject = this.annotations.findObject3DMasks(object3d).length;
        if (nMasksForObject > 1) {
          objectsDiv.append(this.__createBadge(nMasksForObject).attr('title', 'Multiple masks associated with object'));
        }

        objectsDiv.append(objectDiv);
      }
    }
    return objectsDiv;
  }

  __createAnnotationDiv(maskInfo, annotation) {
    const annDiv = $('<div class="maskAnnotation"></div>');
    annDiv.append(`<div>id: ${maskInfo.id}</div>`);
    const hasComment = this.__hasComment(annotation);
    if ((annotation && annotation.objects && annotation.objects.length) || hasComment) {
      const objectsDiv = this.__createObjectsImages(annotation.objects);
      annDiv.append(objectsDiv);
      if (annotation.comment) {
        annDiv.append(annotation.comment).append('<br/>');
      }
      if (annotation.reason) {
        annDiv.append(annotation.reason).append('<br/>');
      }
      annDiv.removeClass('noAnnotation');
    } else {
      annDiv.append($('<span class="noAnnotation"></span>').text('Please annotate with object or comment'));
      annDiv.addClass('noAnnotation');
    }
    this.__updateAnnotationStyle(annDiv);
    return annDiv;
  }

  __updateAnnotationStyle(annDiv) {
    const scope = this;
    annDiv.find('.maskObject').each(function() {
      const uuid = $( this ).data('uuid');
      if (scope.__isSelectedObject3D(uuid)) {
        //console.log('isSelected true', uuid);
        $(this).find('.objectImage').addClass('selected');
      } else {
        //console.log('isSelected false', uuid);
        $(this).find('.objectImage').removeClass('selected');
      }
    });
  }

  __createLabelElement(maskInfo, annotation) {
    const element = $('<div class="maskLabelDiv"></div>');
    element.data('id', maskInfo.id);
    const labelClass = this.__getLabelClass(maskInfo, annotation);
    const label = this.__createLabel(maskInfo.id, maskInfo.label, labelClass);
    let labelInput;
    if (maskInfo.isCustom) {
      labelInput = $('<input type="text"/>').hide();
      labelInput.change((event) => {
        maskInfo.label = labelInput.val();
        labelInput.hide();
        label.find('span').text(maskInfo.label);
      });
      label.append(labelInput);
    }
    label.hover(() => this.__onHoverLabel(maskInfo, true), () => this.__onHoverLabel(maskInfo, false));
    label.click((event) => {
      if (maskInfo.isCustom && event.shiftKey) {
        // allow editing of label
        labelInput.val(maskInfo.label);
        label.find('span').text('');
        labelInput.show();
      } else {
        this.__onClickLabel(maskInfo, false);
      }
    });
    label.dblclick(() => {
      this.__onClickLabel(maskInfo, true);
    });
    label.attr('title', JSON.stringify({ id: maskInfo.id, type: maskInfo.type }));
    element.append(label);
    if (maskInfo.isCustom) {
      // custom mask
      const delIcon = this.__createDeleteIcon(() => {
        this.__onDeleteLabel(maskInfo);
      });
      element.append(delIcon);
    }
    if (maskInfo.isCustom && this.__onSpecifyPointCb) {
      // custom mask
      const clickIcon = this.__createClickIcon(() => {
        const object3d = (annotation.objects)? annotation.objects[0] : null;
        this.__onSpecifyPoint(maskInfo, object3d);
      });
      element.append(clickIcon);
    }
    const annDiv = this.__createAnnotationDiv(maskInfo, annotation).hide();
    element.append(annDiv);
    return element;
  }

  __showAnnotationDiv(labelInfo, flag) {
    const annDiv = labelInfo.element.find('.maskAnnotation');
    if (flag) {
      annDiv.show();
      this.__updateAnnotationStyle(annDiv);
    } else {
      annDiv.hide();
    }
  }

  __updateLabelElement(labelInfo, annotation) {
    const labelClass = this.__getLabelClass(labelInfo, annotation);
    labelInfo.element.find('.maskLabel').removeClass('red green grey comment selected').addClass(labelClass);
    if (annotation) {
      labelInfo.element.find('.maskAnnotation').remove();
      const annDiv = this.__createAnnotationDiv(labelInfo, annotation).hide();
      labelInfo.element.append(annDiv);
    }
    const showDetails = this.__isSelectedMaskId(labelInfo.id);
    this.__showAnnotationDiv(labelInfo, showDetails);
  }


  __onHoverLabel(maskInfo, flag) {
    const id = maskInfo.id;
    const labelInfo = this.__idToLabelInfo[id];
    const showDetails = flag || this.__isSelectedMaskId(maskInfo.id);
    this.__showAnnotationDiv(labelInfo, showDetails);
    if (flag) {
      this.__hoveredMaskInfo = maskInfo;
    } else {
      this.__hoveredMaskInfo = null;
    }
    if (this.__onHoverLabelCb) {
      this.__onHoverLabelCb(maskInfo, flag);
    }
  }

  __onClickLabel(maskInfo, isDblClick) {
    if (this.__onClickLabelCb) {
      this.__onClickLabelCb(maskInfo, isDblClick);
    }
  }

  __onDeleteLabel(maskInfo) {
    if (this.__onDeleteLabelCb) {
      this.__onDeleteLabelCb(maskInfo);
    }
  }

  __onSpecifyPoint(maskInfo, ann) {
    if (this.__onSpecifyPointCb) {
      this.__onSpecifyPointCb(maskInfo, ann)
    }
  }

  __onHoverObject(object3d, flag) {
    if (flag) {
      this.__hoveredObject3d = object3d;
    } else {
      this.__hoveredObject3d = null;
    }
    if (this.__onHoverObjectCb) {
      this.__onHoverObjectCb(object3d, flag);
    }
  }

  __onClickObject(object3d, isDblClick) {
    if (this.__onClickObjectCb) {
      this.__onClickObjectCb(object3d, isDblClick);
    }
  }

  __onDeleteObject(object3d) {
    if (this.__onDeleteObjectCb) {
      this.__onDeleteObjectCb(object3d);
    }
  }

  __getLabelIdFromElement(elem) {
    const labelElement = elem.closest('.maskLabelDiv');
    const labelId = labelElement.data('id');
    return labelId;
  }

  __getObjectUUIDFromElement(elem) {
    const element = elem.closest('.maskObject');
    const uuid = element.data('uuid');
    return uuid;
  }

  __findMaskAssignmentFromLabelInfo(uuid, labelInfo) {
    if (labelInfo && labelInfo.ann && labelInfo.ann.objects) {
      for (let maskobj of labelInfo.ann.objects) {
        if (maskobj.object3d.uuid === uuid) {
          return maskobj;
        }
      }
    }
  }

  __prepareContextMenuOptions(options) {
    let contextMenuOptions = null;
    if (options) {
      if (options.items) {
        const globalItems = [];
        const labelItems = [];
        const objectItems = [];
        // Have the item callbacks be on the selected label
        _.forEach(options.items, (item, key) => {
          if (item.callback) {
            globalItems.push(item);
          }
          if (item.labelCallback) {
            const labelItem = _.clone(item);
            labelItem.callback = (key, opt) => {
              const labelId = this.__getLabelIdFromElement(opt.$trigger);
              const labelInfo = this.__idToLabelInfo[labelId];
              labelItem.labelCallback(labelId, labelInfo);
            };
            labelItems.push(labelItem);
          }
          if (item.objectCallback) {
            const objectItem = _.clone(item);
            objectItem.callback = (key, opt) => {
              const labelId = this.__getLabelIdFromElement(opt.$trigger);
              const objectuuid = this.__getObjectUUIDFromElement(opt.$trigger);
              const labelInfo = this.__idToLabelInfo[labelId];
              const maskobj = this.__findMaskAssignmentFromLabelInfo(objectuuid, labelInfo);
              objectItem.objectCallback(labelId, labelInfo, objectuuid, maskobj.object3d);
            };
            objectItems.push(objectItem);
          }
        });

        contextMenuOptions = [];
        if (globalItems.length) {
          const globalOptions = _.clone(options);
          globalOptions.items = globalItems;
          contextMenuOptions.push(globalOptions);
        }
        if (labelItems.length) {
          const labelOptions = _.clone(options);
          labelOptions.items = labelItems;
          labelOptions.selector = '.maskLabelDiv';
          contextMenuOptions.push(labelOptions);
        }
        if (objectItems.length) {
          const objectOptions = _.clone(options);
          objectOptions.items = objectItems;
          objectOptions.selector = '.maskObject';
          contextMenuOptions.push(objectOptions);
        }
      }
    }
    return contextMenuOptions;
  }
  __setupContextPanel() {
    if (this.__contextMenuOptions) {
      //console.log('setup contextMenuOptions: ', this.contextMenuOptions);
      if ($.contextMenu) {
        for (let options of this.__contextMenuOptions) {
          if (!options.__isSetup) {
            this.container.contextMenu(options);
            if (!options.selector) {
              options.__isSetup = true;
            }
          }
        }
      } else {
        console.error('No $.contextMenu: Please include jquery-contextmenu');
      }
    }
  }

  init() {
    this.__refreshPanel();
  }

  onResize() {
    this.__refreshPanel();
  }

  __refreshPanel() {
    this.container.empty();
    const idToInfo = this.objectMaskInfos? this.objectMaskInfos.idObjectInfoMap : new Map();
    const parent = this.container;
    const idToLabelInfo = {};
    idToInfo.forEach((info, id) => {
      const annotation = this.annotations.getAnnotation(id);
      idToLabelInfo[id] = {
        id: id,
        label: info.label,
        ann: annotation,
        isMissing: info.isMissing,
        element: this.__createLabelElement(info, annotation)
      };
    });
    let sorted = [...idToInfo.keys()];
    if (this.orderBy === 'annotation') {
      sorted = _.sortBy(sorted, (id) => {
        const ann = idToLabelInfo[id].ann;
        const hasComment = this.__hasComment(ann);
        const nObjects = ann.objects? ann.objects.length : 0;
        return [nObjects, hasComment];
      });
    } else if (this.orderBy === 'label') {
      sorted = _.sortBy(sorted, (id) => {
        return idToLabelInfo[id].label;
      });
    } else {
      sorted = _.sortBy(sorted, (id) => id);
    }
    for (let id of sorted) {
      parent.append(idToLabelInfo[id].element);
    }
    this.__idToLabelInfo = idToLabelInfo;
    this.__setupContextPanel();
  }

  update(params) {
    if (params && params.objectMaskInfos !== undefined) {
      this.objectMaskInfos = params.objectMaskInfos;
    }
    this.__refreshPanel();
  }

  get selectedMaskIds() {
    return this.__selectedMaskIds;
  }

  set selectedMaskIds(ids) {
    const rawIds = (ids != null)? (Array.isArray(ids)? ids : [ids]) : [];
    const sortedIds = _.sortBy(_.unique(rawIds));
    const updateIds = _.union(_.difference(this.__selectedMaskIds, sortedIds), _.difference(sortedIds, this.__selectedMaskIds));
    const sameIds = _.intersection(this.__selectedMaskIds, sortedIds);
    this.__selectedMaskIds = sortedIds;
    for (let id of updateIds) {
      this.updateAnnotation(id);
    }
    for (let id of sameIds) {
      this.updateAnnotation(id, true);
    }
  }

  get selectedObject3d() {
    return this.__selectedObject3d;
  }

  set selectedObject3d(obj) {
    this.__selectedObject3d = obj;
  }

  get hoveredMaskInfo() {
    return this.__hoveredMaskInfo;
  }
  get hoveredObject3d() {
    return this.__hoveredObject3d;
  }

  updateAnnotation(id, updateSelectionOnly) {
    if (id != null && this.__idToLabelInfo) {
      const labelInfo = this.__idToLabelInfo[id];
      if (updateSelectionOnly) {
        this.__updateAnnotationStyle(labelInfo.element);
      } else {
        labelInfo.ann = this.annotations.getAnnotation(id);
        this.__updateLabelElement(labelInfo, labelInfo.ann);
      }
    }
  }

  freezeLabelObjects(labelInfo, flag) {
    // console.log(labelInfo, flag);
    if (labelInfo) {
      if (labelInfo.ann && labelInfo.ann.objects) {
        for (let assigned of labelInfo.ann.objects) {
          this.freezeObject(assigned.object3d, flag);
        }
      }
    }
  }

  freezeObject(object3D, flag) {
    if (object3D) {
      object3D.userData.isFrozen = flag;
      const element = this.container.find('.maskObject').filterByData('uuid', object3D.uuid);
      if (flag) {
        element.addClass('frozen');
        element.find('.lockstate').addClass('fa-lock').removeClass('fa-unlock');
      } else {
        element.removeClass('frozen');
        element.find('.lockstate').addClass('fa-unlock').removeClass('fa-lock');
      }
    }

  }
}


module.exports = MaskToObjectPanel;