'use strict';

define(['Constants', 'assets/AssetManager', 'geo/Object3DUtil', 'util/util', 'jquery.contextMenu'],
  function (Constants, AssetManager, Object3DUtil, _) {
    /**
     * Create a expandable panel that shows the current materials for a given object
     *
     * @param container - main container for showing materials
     * @constructor
     */
    function ModelMaterialsPanel(container) {
      this.init(container);
    }

    ModelMaterialsPanel.prototype.init = function (container) {
      // Main container for showing materials associated with this model
      this.container = container;
      // Whether the materials are expanded or not
      this.showMaterials = false;
      // What object the materials are for
      this.object3D = null;
      // What materials does the object have
      this.materials = null;
      // The currently selected material element (jquery element)
      this.selected = null;
      // Assign false "ID" color sequence to model material groups
      this.falseColorMaterials = false;
      // Highlight currently selected material groups
      this.highlightSelectedMaterial = true;
    };

    /**
     * Update materials and textures panels to show materials/textures
     *   associated with the current model
     * @param object3D
     */
    ModelMaterialsPanel.prototype.setObject3D = function (object3D) {
      this.object3D = object3D;
      this.materials = this.getMaterials(object3D);
      this.selected = null;
      this.update('all');
    };

    ModelMaterialsPanel.prototype.update = function (defaultOption) {
      this.updateMaterials(defaultOption);
    };

    ModelMaterialsPanel.prototype.getResizedImage = function (elem, width, height) {
      var img;
      if (elem instanceof HTMLCanvasElement) {
        img = new Image();
        img.src = elem.toDataURL('image/png');
      } else if (elem instanceof HTMLImageElement) {
        var canvas = document.createElement('canvas');
        canvas.width = elem.width;
        canvas.height = elem.height;
        canvas.getContext('2d').drawImage(elem, 0, 0);
        img = new Image();
        img.src = canvas.toDataURL('image/png');
      } else {
        console.error('Cannot get resized image: element is unsupported', elem);
      }
      img.height = height;
      img.width = width;
      return img;
    };

    /**
     * Returns a element of the requested width/height that can be used to represent the specified
     *   material.  Empty div is returned if there is no material.
     * @param material
     * @param width
     * @param height
     * @return {*}
     */
    ModelMaterialsPanel.prototype.getMaterialPreview = function (material, width, height) {
      var img;
      if (material && material.map && material.map.image) {
        img = this.getResizedImage(material.map.image, width, height);
      } else if (material && material.bumpMap && material.bumpMap.image) {
        img = this.getResizedImage(material.bumpMap.image, width, height);
      } else {
        img = $('<div></div>')
          .css('display', 'inline-block')
          .css('width', width + 'px')
          .css('height', height + 'px');
        if (material && material.color) {
          var color = material.color.getStyle();
          img.css('background-color', color);
          if (material.transparent) {
            img.css('opacity', material.opacity);
          }
        }
      }
      return img;
    };

    /**
     * Updates the preview images for all the materials
     */
    ModelMaterialsPanel.prototype.updateMaterialsPreview = function () {
      var scope = this;
      this.container.find('[class^="modelMaterial"]').each(
        function () {
          var info = $(this).data('info');
          //noinspection JSValidateTypes
          if (info && (info.type === 'material' || info.type === 'mesh')) {
            var entry = scope.materials[info.id];
            var div = $(this).children('.materialPreview');
            if (entry && div) {
              div.empty();
              var img = scope.getMaterialPreview(entry.material, 10, 10);
              div.append(img);
              $(img).click(function (id, mesh) {
                scope.revertMaterial(id, mesh);
              }.bind(scope, entry.id, info.mesh));
              var newMaterial = (info.mesh === undefined) ? entry.newMaterial : entry.meshes[info.mesh].material;
              if (newMaterial === entry.material) newMaterial = null;
              img = scope.getMaterialPreview(newMaterial, 10, 10);
              div.append(img);
            }
          }
        }
      );
    };

    ModelMaterialsPanel.prototype.getMeshElem = function (mesh, faceIndex) {
      var material = mesh.material;
      if (mesh.saveMaterial) {
        material = mesh.saveMaterial;
      }
      if (Array.isArray(material)) {
        var materialIndex = mesh.geometry.faces[faceIndex].materialIndex;
        material = material[materialIndex];
      } else if (material instanceof THREE.MultiMaterial) {
        var materialIndex = mesh.geometry.faces[faceIndex].materialIndex;
        material = material.materials[materialIndex];
      }

      // Get entry from material
      var entry = this.materials[material.id];
      if (!entry) {
        console.warn('No entry for material ' + material.id);
        return;
      }

      var meshIndex;
      if (entry.meshes.length > 1) {
        // Get mesh index from entry
        for (var i = 0; i < entry.meshes.length; i++) {
          if (entry.meshes[i] === mesh) {
            meshIndex = i;
            break;
          }
        }
      }
      // Get dom elem
      var elemId = 'modelMaterial' + material.id;
      var expandDiv;
      if (meshIndex !== undefined) {
        expandDiv = this.container.find('#' + elemId + '-expand');
        elemId = elemId + '-mesh' + meshIndex;
      }
      var elem = this.container.find('#' + elemId);
      return {
        elem: elem,
        expand: expandDiv
      };
    };

    ModelMaterialsPanel.prototype.selectMesh = function (mesh, faceIndex) {
      var elems = this.getMeshElem(mesh, faceIndex);
      if (!elems) { return; }
      var elem = elems.elem;
      var expandDiv = elems.expand;
      // Show materials
      if (!this.showMaterials) {
        var materialsLabel = this.container.find('.modelMaterialsLabel');
        if (materialsLabel) materialsLabel.click();
      }

      // Show meshes
      if (expandDiv) {
        var closedExpandDiv = expandDiv.filter('.materialNodeClosed');
        if (closedExpandDiv) {
          closedExpandDiv.click();
        }
      }
      if (elem) {
        elem.click();
      }
    };

    ModelMaterialsPanel.prototype.setSelected = function (elem) {
      if (this.selected) {
        var info = this.selected.data('info');
        this.selected.addClass('modelMaterial').removeClass('modelMaterialSelected');
        if (info.type !== 'original') {
          this.revertTemporaryMaterial(info.id, info.mesh);
        }
      }
      this.selected = elem;
      var info = elem.data('info');
      if (this.selected) {
        this.selected.addClass('modelMaterialSelected').removeClass('modelMaterial');
        if (info.type === 'original') {
          this.revertMaterials();
        }
      }
      if (elem && this.highlightSelectedMaterial && info.type !== 'original') {
        var mat = Object3DUtil.getSimpleFalseColorMaterial('selected', new THREE.Color(0xef9f56));
        mat.side = THREE.FrontSide;
        this.setMaterial(mat, info.id, info.mesh, true);
      }
    };

    ModelMaterialsPanel.prototype.falseColorAllMaterials = function () {
      for (var id in this.materials) {
        if (this.materials.hasOwnProperty(id)) {
          var entry = this.materials[id];
          if (entry.type === 'material') {
            var mid = entry.id;
            var mat = Object3DUtil.getSimpleFalseColorMaterial(mid, null);
            entry.newMaterial = mat;
            this.setMaterial(mat, mid, undefined, false);
          }
        }
      }
    };

    /**
     * Initializes the available materials for the object
     */
    ModelMaterialsPanel.prototype.updateMaterials = function (defaultOption) {
      var selections = [];
      for (var id in this.materials) {
        if (this.materials.hasOwnProperty(id)) {
          var entry = this.materials[id];
          selections.push({
            text: entry.name + ': ' + entry.meshes.length,
            type: 'material',
            id: id
          });
        }
      }
      selections.push({
        text: 'Original',
        type: 'original',
        id: 'original'
      });

      // Clear any previous data associated with this material
      // this.container.find('*').empty().remove();
      this.selected = null;
      this.container.empty();

      // Bind context menu
      /*     this.container.attr('class','context-menu-one');
       $(function(){
       $.contextMenu({
       selector: '.context-menu-one',
       callback: function(key, options) {
       var m = "clicked: " + key;
       console.log(m);
       },
       items: {
       "revert": {name: "Revert"},
       "sep1": "---------",
       "quit": {name: "Quit", icon: "quit"}
       }
       });

       $('.context-menu-one').on('click', function(e){
       console.log('clicked', this);
       })
       }); */

      var materialElems = $('<div class="modelMaterials"></div>');
      if (!this.showMaterials) {
        materialElems.hide();
      }
      var scope = this;
      for (var i = 0; i < selections.length; i++) {
        var selection = selections[i];
        var materialElemId = 'modelMaterial' + selection.id;
        //console.log(selection.text);
        var elem = $('<div class="modelMaterial"></div>')
          .text(selection.text)
          .attr('id', materialElemId);
        if (defaultOption && defaultOption === selection.id) {
          elem.addClass('modelMaterialSelected').removeClass('modelMaterial');
          this.selected = elem;
        }
        if (selection.type === 'material') {
          var entry = this.materials[selection.id];
          if (entry && entry.material) {
            var div = $('<div class="materialPreview"></div>').css('display', 'inline-block');
            elem.prepend(div);
            var expandDiv = $('<div class="materialNode"></div>').attr('id', materialElemId + '-expand');
            elem.prepend(expandDiv);
            // Add elements for changing material for individual meshes
            if (entry.meshes.length === 1) {
              var mesh = entry.meshes[0];
              //console.log(mesh);
              var matSpec = _.pick(entry.material, ['name', 'color', 'emissive', 'specular', 'shininess', 'opacity', 'transparent', 'reflectivity', 'flatShading', 'metalness', 'roughness']);
              matSpec.map = entry.material.map ? entry.material.map.name : null;
              if (mesh.faceIndices) {
                var m = mesh.mesh;
                matSpec.meshname = (m.name) ? m.name : m.uuid + '-faces-' + mesh.faceIndices.length;
              } else {
                matSpec.meshname = (mesh.name) ? mesh.name : mesh.uuid;
              }
              elem.attr('title', JSON.stringify(matSpec, undefined, 2));
            } else if (entry.meshes.length > 1) {
              // Multiple meshes
              var meshesDiv = $('<div class="materialMeshes"></div>').css('display', 'none');
              for (var j = 0; j < entry.meshes.length; j++) {
                var mesh = entry.meshes[j];
                //console.log(mesh);
                var meshtext = 'mesh' + j;
                var title = (mesh.name) ? mesh.name : mesh.uuid;
                if (mesh.faceIndices) {
                  title = (mesh.mesh.name) ? mesh.mesh.name : mesh.mesh.uuid + '-faces-' + mesh.faceIndices.length;
                  meshtext = meshtext + '-faces-' + mesh.faceIndices.length;
                }
                var info = { text: meshtext, id: selection.id, mesh: j, type: 'mesh' };

                var meshDiv = $('<div class="modelMaterial"></div>')
                  .text(info.text)
                  .attr('id', materialElemId + '-mesh' + j)
                  .attr('title', title);
                div = $('<div class="materialPreview"></div>').css('display', 'inline-block');
                meshDiv.prepend(div);
                div = $('<div></div>').css({ 'width': '22px', 'height': '10px', 'display': 'inline-block' });
                meshDiv.prepend(div);
                meshDiv.data('info', info);
                /*jshint -W083 */
                meshDiv.click(
                  function (e) {
                    scope.setSelected($(this));
                    e.stopPropagation();
                  }
                );
                meshesDiv.append(meshDiv);
              }
              elem.append(meshesDiv);
              expandDiv.addClass('materialNodeClosed');
              expandDiv.click(
                function (expandDiv, meshesDiv) {
                  meshesDiv.toggle();
                  if (meshesDiv.is(':visible')) {
                    expandDiv.removeClass('materialNodeClosed');
                    expandDiv.addClass('materialNodeExpanded');
                  } else {
                    expandDiv.removeClass('materialNodeExpanded');
                    expandDiv.addClass('materialNodeClosed');
                  }
                  //return false;
                }.bind(this, expandDiv, meshesDiv)
              );
            }
          }
        }
        elem.data('info', selection);
        /*jshint -W083 */
        elem.click(
          function () {
            scope.setSelected($(this));
          }
        );

        materialElems.append(elem);
      }

      var materialsLabel = $('<div class="modelMaterialsLabel"></div>').text('Materials');
      materialsLabel.click(
        function () {
          this.showMaterials = !this.showMaterials;
          if (this.showMaterials) {
            materialElems.show();
            this.updateMaterialsPreview();
          } else {
            materialElems.hide();
          }
        }.bind(this)
      );
      this.container.append(materialsLabel);
      this.container.append(materialElems);

      // Override with id coloring if flag is set
      if (this.falseColorMaterials) {
        this.falseColorAllMaterials();
      }

      this.updateMaterialsPreview();
    };


    function setMeshMaterial(meshEntry, newMaterial, revertTemporary, temporary) {
      var multiMaterial = meshEntry.materialIndex !== undefined && meshEntry.mesh &&
        (Array.isArray(meshEntry.mesh.material) || meshEntry.mesh.material instanceof THREE.MultiMaterial);
      if (multiMaterial && !meshEntry.material) {
        var mats = meshEntry.mesh.material.materials || meshEntry.mesh.material;
        meshEntry.material = mats[meshEntry.materialIndex];
      }

      if (revertTemporary) {
        if (meshEntry.saveMaterial) {
          meshEntry.material = meshEntry.saveMaterial;
        }
        meshEntry.saveMaterial = null;
      } else {
        if (temporary) {
          meshEntry.saveMaterial = meshEntry.material;
        } else if (meshEntry.saveMaterial) {
          meshEntry.saveMaterial = newMaterial;
        }
        meshEntry.material = newMaterial;
      }
      if (multiMaterial) {
        // individual materials for faces
        if (meshEntry.material) {
          var mats = meshEntry.mesh.material.materials || meshEntry.mesh.material;
          mats[meshEntry.materialIndex] = meshEntry.material;
        } else {
          console.log('No material for meshEntry');
          console.log(meshEntry);
        }
      }

    }

    /**
     * Replaces the material (identified by id) on the object by the newMaterial
     * @param newMaterial - New material to use
     * @param id - id of old material to replace
     * @param meshIndex - (Optional) index of mesh for which material is set
     *    if not specified, id is extracted from selected element.
     *    If "Original" is selected, no materials are replaced.
     * @param temporary - Temporary material only (don't remember)
     */
    ModelMaterialsPanel.prototype.setMaterial = function (newMaterial, id, meshIndex, temporary) {
      if (!newMaterial) return;
      var revertTemporary = (newMaterial === 'revert' && temporary);
      if (!id) {
        if (this.selected) {
          var info = this.selected.data('info');
          if (info) {
            if (info.type === 'original') return;
            id = info.id;
            meshIndex = info.mesh;
          }
        }
      }
      if (!id) {
        console.error('No material id provided, cannot set new material.');
        return;
      }

      var entry = this.materials[id];
      if (entry) {
        if (meshIndex === undefined) {
          for (var i = 0; i < entry.meshes.length; i++) {
            var meshEntry = entry.meshes[i];
            setMeshMaterial(meshEntry, newMaterial, revertTemporary, temporary);
          }
          if (!temporary) {
            if (entry.material) {
              entry.newMaterial = newMaterial;
            } else if (entry.materials) {
              for (var j = 0; j < entry.materials.length; j++) {
                var e2 = this.materials[entry.materials[j]];
                if (e2.material) {
                  e2.newMaterial = newMaterial;
                }
              }
            }
          }
        } else {
          var i = meshIndex;
          var meshEntry = entry.meshes[i];
          setMeshMaterial(meshEntry, newMaterial, revertTemporary, temporary);
        }
      } else {
        console.error('Cannot find material ' + id);
      }
      this.updateMaterialsPreview();
    };

    /**
     * Revert the material identified by id to the original material
     * @param id - identifies material to revert
     * @param meshIndex - (Optional) index of mesh to revert
     */
    ModelMaterialsPanel.prototype.revertTemporaryMaterial = function (id, meshIndex) {
      this.setMaterial('revert', id, meshIndex, true);
    };

    /**
     * Revert the material identified by id to the original material
     * @param id - identifies material to revert
     * @param meshIndex - (Optional) index of mesh to revert
     */
    ModelMaterialsPanel.prototype.revertMaterial = function (id, meshIndex) {
      var entry = this.materials[id];
      if (entry) {
        this.setMaterial(entry.material, id, meshIndex);
      } else {
        console.log('No material entry for id ' + id);
      }
    };

    /**
     * Revert all materials on the object to the original
     */
    ModelMaterialsPanel.prototype.revertMaterials = function () {
      for (var id in this.materials) {
        if (this.materials.hasOwnProperty(id)) {
          this.revertMaterial(id, undefined);
        }
      }
    };

    ModelMaterialsPanel.prototype.getMaterialMappings = function () {
      var meshMaterials = {};
      var materials = {};
      var origMaterials = {};

      var allMeshes = this.materials['all'].meshes;
      for (var i = 0; i < allMeshes.length; i++) {
        var mesh = allMeshes[i];
        var meshName = (mesh.name === undefined) ? '_mesh' + i : mesh.name;
        if (mesh.material.id !== undefined) {
          var m = materials[mesh.material.id];
          if (m === undefined) {
            materials[mesh.material.id] = {
              material: mesh.material
            };
          }
          meshMaterials[mesh.id] = {
            name: meshName,
            materialId: mesh.material.id
          };
        } else {
          console.error('No id for mesh material for mesh ' + meshName);
        }
      }

      var nMaterialsWithPerMeshChanges = 0;
      var nMaterialsChanged = 0;
      for (var id in this.materials) {
        if (this.materials.hasOwnProperty(id)) {
          var entry = this.materials[id];
          if (entry.material) {
            var allMeshesSameMatAsThis = true;
            for (i = 0; i < entry.meshes; i++) {
              var mesh = entry.meshes[i];
              if (mesh.material !== entry.material) {
                meshMaterials[mesh.id].origMaterialId = entry.material.id;
              }
              var meshMatDiffers = (entry.newMaterial) ?
                (entry.newMaterial !== mesh.material) : (entry.material !== mesh.material);
              if (meshMatDiffers) {
                allMeshesSameMatAsThis = false;
              }
            }
            if (!materials[entry.material.id]) {
              materials[entry.material.id] = {
                replaced: true,
                material: entry.material
              };
            }
            if (!origMaterials[entry.material.id]) {
              origMaterials[entry.material.id] = {
                allMeshesUseMat: allMeshesSameMatAsThis
              };
            }
            if (!allMeshesSameMatAsThis) nMaterialsWithPerMeshChanges++;
            if (entry.newMaterial && entry.newMaterial !== entry.material) {
              origMaterials[entry.material.id].newMaterialId = entry.newMaterial.id;
              nMaterialsChanged++;
            }
          }
        }
      }

      return {
        meshes: meshMaterials,
        materials: materials,
        origMaterials: origMaterials,
        nMaterialsWithPerMeshChanges: nMaterialsWithPerMeshChanges,
        nMaterialsChanged: nMaterialsChanged
      };
    };

    ModelMaterialsPanel.prototype.getMaterialMappingsAsJsonString = function() {
      var materials = this.getMaterialMappings();
      if (materials.nMaterialsChanged > 0) {
        // There are material changes - report them
        var materialsString = JSON.stringify(materials, Object3DUtil.stringifyReplacer, ' ');
        console.log(materialsString);
        return materialsString;
      }
    };

    /**
     * Returns materials on the object
     * @param object3D
     * @return {Object}
     */
    ModelMaterialsPanel.prototype.getMaterials = function (object3D) {
      var materials = Object3DUtil.getMaterials(object3D);
      return materials;
    };


    // Exports
    return ModelMaterialsPanel;

  });
