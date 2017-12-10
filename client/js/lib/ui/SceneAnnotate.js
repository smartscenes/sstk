'use strict';

define(['Constants'],
    function (Constants) {
      function SceneAnnotate(params) {
        // Container in which the scene hierarchy is displayed
        this.container = params.container;
        // Application callback indicating annotation submitted
        this.onAnnotationSubmittedCallback = params.onAlignSubmittedCallback;
        // URL to use for submitting annotations
        this.submitAnnotationsUrl = params.submitAnnotationsUrl || (Constants.baseUrl + '/submitSceneAnnotations');
        // Application callback fetching next target to align
        this.nextTargetCallback = params.nextTargetCallback;
        this.init();
      }

      SceneAnnotate.prototype.init = function () {
        // Elements to display
        // categories (, delimited)
        this.categoriesField = $('<textarea></textarea>')
            .attr('id', 'sceneAnnotateCategories').attr('rows', '4').attr('cols','20');
        // attributes (, delimited)
        this.attributesField = $('<textarea></textarea>')
            .attr('id', 'sceneAnnotateAttributes').attr('rows', '4').attr('cols','20');
        // description
        this.descriptionField = $('<textarea></textarea>')
            .attr('id', 'sceneAnnotateDescription').attr('rows', '4').attr('cols','20');

        // Hook up submit button
        this.submitButton = $('<button></button>').attr('id','submitSceneAnnotation').text('Submit');
        this.submitButton.click(this.submit.bind(this));
        // Hook up reset button
        this.resetButton = $('<button></button>').attr('id','resetSceneAnnotation').text('Reset');
        this.resetButton.click(this.reset.bind(this));
        // Hook up next button
        this.nextButton = $('<button></button>').attr('id','nextSceneAnnotation').text('Next');
        this.nextButton.click(this.next.bind(this));
        this.submitButtons = $().add(this.submitButton).add(this.resetButton).add(this.nextButton);

        var categoriesDiv = $('<div></div>');
        categoriesDiv.append($('<label></label>').attr('for','sceneAnnotateCategories').text('Categories'));
        categoriesDiv.append('<br/>');
        categoriesDiv.append(this.categoriesField);
        this.container.append(categoriesDiv);
        var attributesDiv = $('<div></div>');
        attributesDiv.append($('<label></label>').attr('for','sceneAnnotateAttributes').text('Attributes'));
        attributesDiv.append('<br/>');
        attributesDiv.append(this.attributesField);
        this.container.append(attributesDiv);
        var descriptionDiv = $('<div></div>');
        descriptionDiv.append($('<label></label>').attr('for','sceneAnnotateDescription').text('Description'));
        descriptionDiv.append('<br/>');
        descriptionDiv.append(this.descriptionField);
        this.container.append(descriptionDiv);
        this.container.append(this.resetButton);
        this.container.append(this.submitButton);
        this.container.append(this.nextButton);

        this.container.find('textarea').bind('keydown', function (e) {
          e.stopPropagation();
        });
        this.setSceneId(undefined);
      };


      SceneAnnotate.prototype.setSceneId = function (sceneId) {
        if (this.sceneId !== sceneId) {
          this.reset();
          this.sceneId = sceneId;
        }
        var inputs = this.submitButtons;
        if (this.sceneId) {
          inputs.prop('disabled', false);
        } else {
          inputs.prop('disabled', true);
        }
      };

      SceneAnnotate.prototype.next = function () {
        if (this.nextTargetCallback) {
          this.nextTargetCallback();
        }
      };

      SceneAnnotate.prototype.reset = function () {
        this.categoriesField.val('');
        this.attributesField.val('');
        this.descriptionField.val('');
      };

      SceneAnnotate.prototype.submit = function () {
        if (!this.sceneId) return;
        var sceneId = this.sceneId;
        var description = this.descriptionField.val().trim();
        var attributes = this.attributesField.val().split(',').map(function (v) { return v.trim(); });
        var categories = this.categoriesField.val().split(',').map(function (v) { return v.trim(); });
        var params = {
          sceneId: sceneId,
          //            userId: (window.globals)? window.globals.userId : "unknown",
          updateMain: Constants.submitUpdateMain
        };
        if (description) params.description = description;
        if (attributes)  params.attributes = attributes;
        if (categories)  params.category = categories;
        var data = jQuery.param(params);
        var inputs = this.submitButtons;
        inputs.prop('disabled', true);
        $.ajax
        ({
          type: 'POST',
          url: this.submitAnnotationsUrl,
          data: data,
          success: function (response, textStatus, jqXHR) {
            console.log('Annotations successfully submitted for ' + sceneId + '!!!');
            // Refresh to next model
            if (this.onAnnotationSubmittedCallback) {
              this.onAnnotationSubmittedCallback();
            }
          }.bind(this),
          error: function (jqXHR, textStatus, errorThrown) {
            console.error('Error submitting annotations for '  + sceneId + '!!!');
          },
          complete: function () {
            // Re-enable inputs
            inputs.prop('disabled', false);
          }
        });
      };

      // Exports
      return SceneAnnotate;
    });
