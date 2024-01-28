class PartForm {
  constructor(params)
  {
    this.groupNames = params.groupNames;
    this.onDone = params.onDone;
    this.__config = params.part;
  }

  show() {
    // Requires special bootbox with form support
    const questions = [
      {
        "title": "Type",
        "name": "group",
        "inputType": "select",
        "inputOptions": this.groupNames.map((x) => { return { text: x, value: x }; }),
        "value": this.__config.group
      }
    ];
    const dialog = bootbox.form({
      title: this.__config.label,
      inputs: questions,
      callback: (results) => {
        if (results) {
          questions.forEach((q,i) => {
            this.__config[q.name] = results[i];
          });
        }
        this.onDone(this.__config);
      }
    });
  }
}

module.exports = PartForm;