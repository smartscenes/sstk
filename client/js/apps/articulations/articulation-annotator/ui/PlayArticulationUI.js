const PubSub = require('PubSub');
const Articulation = require('articulations/Articulation');

class PlayArticulationUI extends PubSub {
  constructor(part, articulation, articulationIndex) {
    super();
    this.part = part;
    this.articulation = articulation;
    this.articulationIndex = articulationIndex;
  }

  create(parts, playing) {
    //parts, annotation, part, ind, playing
    const articulation = this.articulation;
    const ind = this.articulationIndex;
    const origin = articulation.origin;
    const axis = articulation.axis;
    const unit = (articulation.type === Articulation.Type.TRANSLATION)? 'm':'π';
    const min = (articulation.type === Articulation.Type.TRANSLATION)? articulation.rangeMin : articulation.rangeMin/Math.PI;
    const max = (articulation.type === Articulation.Type.TRANSLATION)? articulation.rangeMax : articulation.rangeMax/Math.PI;
    return $(`
			<div class="part-antn">
				<div class="part-antn-title">${articulation.type}
					<div class="part-antn-edit-buttons">
						<span class="part-antn-edit-button play ${ind} ${!playing ? '' : 'hidden'}"><i class="fas fa-play"></i></span>
						<span class="part-antn-edit-button pause ${ind} ${playing ? '' : 'hidden'}"><i class="fas fa-pause"></i></span>
						<span class="part-antn-edit-button edit ${ind}"><i class="fas fa-pen"></i></span>
						<span class="part-antn-edit-button delete ${ind}"><i class="fas fa-trash"></i></span>
					</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Origin:</div>
					<div class="part-antn-data-value">
						(${origin[0].toFixed(2)},
						 ${origin[1].toFixed(2)},
						 ${origin[2].toFixed(2)})
					</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Axis:</div>
					<div class="part-antn-data-value">
						(${axis[0].toFixed(2)},
						 ${axis[1].toFixed(2)},
						 ${axis[2].toFixed(2)})
					</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Min range:</div>
					<div class="part-antn-data-value">${min.toFixed(2)}${unit}</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Max range:</div>
					<div class="part-antn-data-value">${max.toFixed(2)}${unit}</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Base parts:</div>
					<div class="part-antn-data-value">
						${articulation.base.map(pid => parts[pid].name).join(', ')}
					</div>
				</div>
			</div>`);
  }

  getPlayButton() {
    const ind = this.articulationIndex;
    return $(`.part-antn-edit-button.play.${ind}`);
  }

  getPauseButton() {
    const ind = this.articulationIndex;
    return $(`.part-antn-edit-button.pause.${ind}`);
  }

  getEditButton() {
    const ind = this.articulationIndex;
    return $(`.part-antn-edit-button.edit.${ind}`);
  }

  getDeleteButton() {
    const ind = this.articulationIndex;
    return $(`.part-antn-edit-button.delete.${ind}`);
  }

  showPlayButton() {
    const ind = this.articulationIndex;
    $(`.part-antn-edit-button.play.${ind}`).removeClass('hidden');
    $(`.part-antn-edit-button.pause.${ind}`).addClass('hidden');
  }

  showPauseButton() {
    const ind = this.articulationIndex;
    $(`.part-antn-edit-button.play.${ind}`).addClass('hidden');
    $(`.part-antn-edit-button.pause.${ind}`).removeClass('hidden');
  }

  bindEvents() {
    this.getPlayButton().click(() => {
      this.Publish('play', this.articulation, this.articulationIndex);
      this.showPauseButton();
    });

    this.getPauseButton().click(() => {
      this.Publish('pause', this.articulation, this.articulationIndex);
      this.showPlayButton();
    });

    this.getEditButton().click(() => {
      this.Publish('edit', this.articulation, this.articulationIndex);
    });

    this.getDeleteButton().click(() => {
      this.Publish('delete', this.articulation, this.articulationIndex);
    });
  }
}

module.exports = PlayArticulationUI;