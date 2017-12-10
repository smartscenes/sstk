'use strict';

define(['jquery.countdown'],
    function () {

      function MultiLineTextForm(container, submissionUrl, countdownTime) {
        this.container = container;
        this.submissionUrl = submissionUrl;
        this.countdownTime = countdownTime;
        this.init();
      }

      MultiLineTextForm.prototype.init = function () {
        this.container.attr('oncontextmenu', 'return false;');
        var header = $('<h3>Attributes</h3>');
        this.container.append(header);

        var form = $('<form id="responseForm" action="' + this.submissionUrl + '" method="post"></form>');
        this.container.append(form);

        var modelIdField = $('<input type="hidden" name="modelId" id="modelId" />');
        form.append(modelIdField);

        var userIdField = $('<input type="hidden" name="userId" id="userId" />');
        form.append(userIdField);

        var text1 = $('<input type="text" class="clonableInput" name="text1" id="text1" onkeypress="if (event.keyCode == 13) {$(\'#buttonAdd\').click();} return event.keyCode != 13;"/>');
        form.append(text1);

        var buttonsDiv = $('<div id="buttonsDiv"></div>');
        var buttonAdd = $('<input type="button" id="buttonAdd" value="ADD"/>');
        var buttonRemove = $('<input type="button" id="buttonRemove" value="REMOVE"/>');
        var buttonDone = $('<input type="submit" id="buttonDone" value="DONE"/>');
        buttonsDiv.append(buttonAdd);
        buttonsDiv.append(buttonRemove);
        buttonsDiv.append(buttonDone);
        form.append(buttonsDiv);

        buttonAdd.click(function () {
          var num = $('.clonableInput').length;    // how many "duplicatable" input fields we currently have
          var newNum = num + 1;      // the numeric ID of the new input field being added

          // create the new element via clone(), and manipulate it's ID using newNum value
          var textElem = $('#text' + num);
          var newElem = textElem.clone().attr('id', 'text' + newNum);

          // manipulate the name/id values of the input inside the new element
          newElem.attr('id', 'text' + newNum).attr('name', 'text' + newNum).val('');

          // insert the new element after the last "duplicatable" input field
          textElem.after(newElem);

          // enable the "remove" button
          $('#buttonRemove').prop('disabled', false);

          // move focus to last item
          $('input:text:visible:last').focus();
        });

        buttonRemove.click(function () {
          var num    = $('.clonableInput').length;    // how many "duplicatable" input fields we currently have
          $('#text' + num).remove();        // remove the last element

          // if only one element remains, disable the "remove" button
          if (num - 1 === 1)
              $('#buttonRemove').prop('disabled',true);
        });

        buttonRemove.prop('disabled',true);

        $('#countdownDiv').countdown({
          until: this.countdownTime,
          format: 'MS',
          compact: true,
          onExpiry: function () {$('#buttonDone').click();}
        });
      };

      // Exports
      return MultiLineTextForm;

    });
