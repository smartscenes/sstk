// const dat = require('dat.gui');
//
// dat.GUI.prototype.getFolder = function (name) {
//   // dat.gui
//   return this.__folders[name] || this.addFolder(name);
// };


const dat = require('lil.gui');

dat.GUI.prototype.__addFolder = dat.GUI.prototype.addFolder;

dat.GUI.prototype.addFolder = function (name) {
  var folder = this.__addFolder(name);
  folder.close();
  return folder;
};


dat.GUI.prototype.getFolder = function (name) {
  // lil.gui
  for (let folder of this.folders) {
    if (folder._title === name) {
      return folder;
    }
  }
  return this.addFolder(name);
};

dat.GUI.prototype.update = function() {
  for (let i in this.__controllers) {
    if (this.__controllers.hasOwnProperty(i)) {
      this.__controllers[i].updateDisplay();
    }
  }
  for (let name in this.__folders) {
    if (this.__folders.hasOwnProperty(name)) {
      this.__folders[name].update();
    }
  }
};

module.exports = dat;