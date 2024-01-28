const PartsSelectionUI = require('./PartsSelectionUI');
const PlayArticulationUI = require('./PlayArticulationUI');

class SidePanel {
  constructor(params) {
    this.container = params.container;

    this.groupParts = params.groupParts;

    // UI components
    this.partsSelectionUI = null;
    this.playArticulationUIs = [];

    this.topPanel = null;
    this.bottomPanel = null;
    this.partTagsPanel = null;
    this.submitTextarea = null;
    this.submitButton = null;
    this.addArticulationButton = null;
  }

  create() {
    this.topPanel = $('<div id="sidebar-top"></div>');
    this.bottomPanel = $('<div id="sidebar-bottom"></div>');
    this.partTagsPanel = $('<div id="part-tags" class="labels"></div>');
    this.bottomPanel.append(this.partTagsPanel);
    this.container.append($('<div></div>').append(this.topPanel).append(this.bottomPanel));

    this.submitTextarea = $('<textarea placeholder="Any comments or feedback about this model?"></textarea>');
    this.submitButton = $('<div class="submit-button large-button">Submit Annotations</div>');
    this.bottomPanel.append($('<div id="submit-txt"></div>').append(this.submitTextarea)).append(this.submitButton);
  }

  createPartsSelectionUI(parts, annotations) {
    this.partsSelectionUI = new PartsSelectionUI(parts, {
      groupParts: this.groupParts,
      container: this.partTagsPanel
    });
    this.partsSelectionUI.create(parts, annotations);
    this.partsSelectionUI.bindEvents();
    return this.partsSelectionUI;
  }

  // Updates sidebar
  update(pid, parts, annotations, playing) {
    const sidebar = this.topPanel;
    sidebar.empty();
    sidebar.append(`
			<div id="part-title">
				<div id="part-name">${parts[pid].name}</div>
			</div>`);

    if (annotations && annotations.length) {
      this.playArticulationUIs = annotations.map((annotation, i) =>
        this.addArticulation(parts, annotation, parts[pid], i, playing));
    } else {
      sidebar.append(`
				<div id="no-antn-data-container">
					<div id="no-antn-data">
						There is no annotation data yet.
					</div>
				</div>`);
    }

    this.addArticulationButton = $('<div id="add-antn" class="add-btn">+ Add Articulation</div>');
    sidebar.append($('<div class="add-btn-container"></div>')
      .append(this.addArticulationButton)
    );
  }

  addArticulation(parts, annotation, part, ind, playing) {
    const playAnnUI = new PlayArticulationUI(part, annotation, ind);
    const element = playAnnUI.create(parts, playing);
    this.topPanel.append(element);
    playAnnUI.bindEvents();
    return playAnnUI;
  }

  showPlayButton(ind) {
    this.playArticulationUIs[ind].showPlayButton();
  }

  showPauseButton(ind) {
    this.playArticulationUIs[ind].showPauseButton();
  }

  setNotes(text) {
    this.submitTextarea.val(text);
  }

  getNotes() {
    return this.submitTextarea.val();
  }
}

// Exports
module.exports = SidePanel;
