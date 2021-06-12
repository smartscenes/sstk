const AxisSelectionWidget = require('./ui/AxisSelectionWidget');
const RangeWidget = require('./ui/RangeWidget');

class DomHelper {
	constructor(params) {
		this.container = params.container;
		this.assetPaths = params.assetPaths;
		this.articulationTypes = params.articulationTypes;

		this.mouse = {};
		this.allowPropagation = false;
		this.allowHinge = false;
	}

	appendArticulationTypes(element, articulationTypes, selectedType, addBaseParts) {
		for (let t of articulationTypes) {
			const div = $(`<div class=${t.class} antn-dialog-section></div>`);
			const checked = (selectedType === t.type)? "checked" : "";
			div.append(
				`<div class="antn-dialog-option splay-option">
				  <label>${t.label}</label>
				 <input id="${t.id}" type="radio" name="antn" ${checked}>
				</div>`);
			if (addBaseParts) {
				div.append(
					`<div class="${t.class} antn-dialog-base-selector hidden">
					  <div class="antn-dialog-base-selector-header">Select base part(s):</div>
				  </div>`);
			}
			div.append(
				`<div class="${t.class}-axis antn-dialog-base-selector hidden">
				<div class="antn-dialog-base-selector-header">Specify axis of ${t.motionType}:</div>
				</div>`);

			element.append(div);
		}
	}

	displayAnnotationWizard(part, children, type) {
		$("#main").html('');
		$("#main").append(`<div id="antn-dialog" class="fixed">
			<div id="antn-dialog-title">Add Articulation: ${part.name}</div>
			<div id="antn-dialog-content"></div>
			<div id="antn-dialog-buttons">
				<div class="antn-dialog-button" id="cancel">Cancel</div>
				<div class="antn-dialog-button" id="submit">Save</div>
			</div>
		</div>`);
		const articulationTypes = [
			{ id: 'translation', label: 'Translation', class: 'translation',
				motionType: 'translation', type: this.articulationTypes.TRANSLATION},
			{ id: 'central-rotation', label: this.allowHinge? 'Central Rotation' : 'Rotation', class: 'central rotation',
				motionType: 'rotation', type: this.articulationTypes.ROTATION}
	  ];
		if (this.allowHinge) {
			articulationTypes.push({ id: 'hinge-rotation', label: 'Hinge Rotation', class: 'hinge rotation',
				motionType: 'rotation', type: this.articulationTypes.HINGE_ROTATION})
		}
		this.appendArticulationTypes($("#antn-dialog-content"), articulationTypes, type, children);
		$("#antn-dialog").css("max-height", "80%");
		$("#antn-dialog").css("overflow", "auto");
		if (this.antnDialogTop) {
			 $("#antn-dialog")[0].style.top = this.antnDialogTop;
		}
		if (this.antnDialogLeft) {
			 $("#antn-dialog")[0].style.left = this.antnDialogLeft;
		}

		this.makeDraggable($("#antn-dialog-title"), $("#antn-dialog"), pos => {
			this.antnDialogTop = pos.top;
			this.antnDialogLeft = pos.left;
		});
	}

	makeDraggable(triggerElement, draggableElement, onDragged) {
		draggableElement = draggableElement || triggerElement;
		let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
		triggerElement.on('mousedown', (event) => {
			event.preventDefault();

			pos3 = event.clientX;
			pos4 = event.clientY;

			triggerElement.on('mouseup', () => {
				triggerElement.off('mouseup');
				triggerElement.off('mousemove');

				triggerElement.mousemove((event) => {
					const rect = this.container.getBoundingClientRect();
					this.mouse.x = ((event.clientX - rect.left)/this.container.clientWidth) * 2 - 1;
					this.mouse.y = -((event.clientY - rect.top)/this.container.clientHeight) * 2 + 1;
				});
			});

			triggerElement.on('mousemove', (event) => {
				event.preventDefault();

				pos1 = pos3 - event.clientX;
				pos2 = pos4 - event.clientY;
				pos3 = event.clientX;
				pos4 = event.clientY;

				const top = (draggableElement.offset().top - pos2) + "px";
				const left = (draggableElement.offset().left- pos1) + "px";

				draggableElement[0].style.top = top;
				draggableElement[0].style.left = left;

				if (onDragged) {
					onDragged({top: top, left: left});
				}
			})
		});
	}

	hideAnnotationWizard() {
		$("#main").html('');
	}

	displayBaseOptions(children, basePids) {
		if (children) {
			$(".translation.antn-dialog-base-selector").html(
				`<div class="antn-dialog-base-selector-header">Select base part(s):</div>`);
			$(".hinge.antn-dialog-base-selector").html(
				`<div class="antn-dialog-base-selector-header">Select base part(s):</div>`);
			$(".central.antn-dialog-base-selector").html(
				`<div class="antn-dialog-base-selector-header">Select base part(s):</div>`);
		}

		children.forEach((child) => {
			$(".translation.antn-dialog-base-selector").append(
				`<div id="${child.pid}" class="antn-dialog-base-selector-option splay-option">
					<label>${child.name}</label>
					<input id="${child.pid}" class="child" type="checkbox" name="translation" value="${child.pid}">
				</div>`);

			$(".hinge.rotation.antn-dialog-base-selector").append(
				`<div id="${child.pid}" class="antn-dialog-base-selector-option splay-option">
					<label>${child.name}</label>
					<input id="${child.pid}" class="child" type="checkbox" name="hinge" value="${child.pid}">
				</div>`);

			$(".central.rotation.antn-dialog-base-selector").append(
				`<div id="${child.pid}" class="antn-dialog-base-selector-option splay-option">
					<label>${child.name}</label>
					<input id="${child.pid}" class="child" type="checkbox" name="central" value="${child.pid}">
				</div>`);

			if (basePids.includes(child.pid)) {
				$('.translation.antn-dialog-base-selector input').last().attr('checked', true);
				$('.hinge.antn-dialog-base-selector input').last().attr('checked', true);
				$('.central.antn-dialog-base-selector input').last().attr('checked', true);
			}
		});
	}

	displaySidebar(pid, parts, annotations, playing) {
		$("#sidebar-top").html('');
		$("#sidebar-top").append(`
			<div id="part-title">
				<div id="part-name">${parts[pid].name}</div>
			</div>`);

		if (annotations && annotations.length) {
			annotations.forEach((annotation, i) =>
				this.appendAnnotation(parts, annotation, parts[pid], i, playing));
		} else {
			$("#sidebar-top").append(`
				<div id="no-antn-data-container">
					<div id="no-antn-data">
						There is no annotation data yet.
					</div>
				</div>`);
		}

		$("#sidebar-top").append(`
			<div id="add-antn-container">
				<div id="add-antn">+ Add Articulation</div>
			</div>`);
	}

	appendAnnotation(parts, annotation, part, ind, playing) {
		$("#sidebar-top").append(`
			<div class="part-antn">
				<div class="part-antn-title">${annotation.type}
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
						(${annotation.origin[0].toFixed(2)},
						 ${annotation.origin[1].toFixed(2)},
						 ${annotation.origin[2].toFixed(2)})
					</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Axis:</div>
					<div class="part-antn-data-value">
						(${annotation.axis[0].toFixed(2)},
						 ${annotation.axis[1].toFixed(2)},
						 ${annotation.axis[2].toFixed(2)})
					</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Min range:</div>
					<div class="part-antn-data-value">${(annotation.rangeMin/Math.PI).toFixed(2)}π</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Max range:</div>
					<div class="part-antn-data-value">${(annotation.rangeMax/Math.PI).toFixed(2)}π</div>
				</div>
				<div class="part-antn-data">
					<div class="part-antn-data-type">Base parts:</div>
					<div class="part-antn-data-value">
						${annotation.base.map(pid => parts[pid].name).join(', ')}
					</div>
				</div>
			</div>`);
	}

	displayRotationBaseOptions(type) {
		$(".translation.antn-dialog-base-selector").addClass("hidden");
		$(".translation-axis.antn-dialog-base-selector").addClass("hidden");
		$(".rotation.antn-dialog-base-selector").addClass("hidden");
		$(".rotation-axis.antn-dialog-base-selector").addClass("hidden");
		$(`.${type} .rotation.antn-dialog-base-selector`).removeClass("hidden");
	}

	displayTranslationBaseOptions() {
		$(".rotation.antn-dialog-base-selector").addClass("hidden");
		$(".rotation-axis.antn-dialog-base-selector").addClass("hidden");
		$(".translation.antn-dialog-base-selector").removeClass("hidden");
	}

	displayTranslationAxisOptions(axisOptions, axisIndex, currentRangeMin, currentRangeMax) {
		let element = $(".translation-axis.antn-dialog-base-selector");
		element.removeClass("hidden");

		element.html(
			'<div class="antn-dialog-base-selector-header">Specify axis of translation:</div>');

		element.append(
			`<div class="antn-dialog-base-selector-option splay-option">
				<span>Axis of Translation:&nbsp</span>
				<select name="aot"></select>
			</div>
			<br>`);

		const axisSelectionWidget = new AxisSelectionWidget($(".translation-axis select[name=aot]"), 'main');
		axisSelectionWidget.setAxisOptions(axisOptions, axisIndex, true);

		const rangeWidget = this.appendTranslationSliders(element, axisOptions, axisIndex, currentRangeMin, currentRangeMax);
		return { axisSelectionWidget: axisSelectionWidget, rangeWidget: rangeWidget };
	}

	appendTranslationSliders(element, axisOptions, axisIndex, currentRangeMin, currentRangeMax) {
		element.append('<div class="antn-dialog-base-selector-header">Set Range of Motion: </div>');
		const t = axisOptions[axisIndex].translation;
		const rangeWidget = new RangeWidget({
			name: "range" + axisIndex,
			min: t.fullRangeMin, max: t.fullRangeMax,
			rangeMin: currentRangeMin, rangeMax: currentRangeMax,
			step: 0.001, defaultValue: 0, labelUnit: 'm'
		}, element);
		return rangeWidget;
	}

	displayRotationAxisOptions(type, axisOptions, axisIndex, refAxisIndex, pivotOptions, rotationRangeMin, rotationRangeMax, edge) {
		let element = $(`.${type}.rotation-axis.antn-dialog-base-selector`);
		element.removeClass("hidden");

		element.html(
			'<div class="antn-dialog-base-selector-header">Specify axis of rotation:</div>');

		element.append(
			`<div class="antn-dialog-base-selector-option splay-option">
				<span>Axis of Rotation:&nbsp</span>
				<select name="aor"></select>
			</div>
			<br>`);

		const axisSelectionWidget = new AxisSelectionWidget($(".rotation-axis select[name=aor]"), 'main');
		axisSelectionWidget.setAxisOptions(axisOptions, axisIndex, true);

		element.append(
			`<div class="antn-dialog-base-selector-option splay-option">
				<span>Reference Axis:&nbsp</span>
				<select name="aorr"></select>
			</div>
			<br>`);

		const axisSelectionWidget2 = new AxisSelectionWidget($(".rotation-axis select[name=aorr]"), 'ref');
		axisSelectionWidget2.setAxisOptions(axisOptions, refAxisIndex, false, function(opt, index) {
			return index !== axisIndex;
		});

		const rangeWidget = this.appendRotationSliders(element, type, pivotOptions, rotationRangeMin, rotationRangeMax, edge, true);

		return { axisSelectionWidget: axisSelectionWidget, refAxisSelectionWidget: axisSelectionWidget2, rangeWidget: rangeWidget };
	}

	appendValueSlider(element, sliderName, sliderLabel, sliderMin, sliderMax, value) {
		element.append(
			`<div class="antn-dialog-base-selector-option">${sliderLabel}: </div>
			 <div class="range-slider-container">
				<div class="range-slider-label">Min</div>
				<section class="range-slider" name="${sliderName}">
				<span class="${sliderName}Values"></span>
				<input value="${value}" min="${sliderMin}" max="${sliderMax}" step="0.001" type="range">
				</section>
				<div class="range-slider-label">Max</div>
				</div>`);
	}

	appendRotationSliders(element, type, pivotOptions, rotationRangeMin, rotationRangeMax, edge, displayBasePivotPoint) {
		if (type === 'hinge') {
			if (displayBasePivotPoint) {
				element.append(
					`<div class="antn-dialog-base-selector-header">Select Base Part Pivot Point:</div>
						<div class="range-slider-container">
							<div>Left</div>
							<input id="edgePick" type="radio" value="0" name="edgePick">
							<div>Center</div>
							<input id="edgePick" type="radio" value="1" name="edgePick" checked>
							<div>Right</div>
							<input id="edgePick" type="radio" value="2" name="edgePick">
						</div>
						<br>`
				);
				$(`[name=edgePick][value=${edge}]`).prop("checked", true);
			}
		}
		// Append pivot point (origin) options and range of motion
		element.append('<div class="antn-dialog-base-selector-header">Adjust Pivot Point: </div>');
		for (let pivotOption of pivotOptions) {
			this.appendValueSlider(element, pivotOption.name, pivotOption.label, pivotOption.min, pivotOption.max, pivotOption.value);
		}
		element.append('<br><div class="antn-dialog-base-selector-header">Set Range of Motion: </div>');
		const rangeWidget = new RangeWidget({
				name: 'range',
				min: 0, max: 200,
				rangeMin: 100 * ((rotationRangeMin/Math.PI) + 1), rangeMax: 100 * ((rotationRangeMax/Math.PI) + 1),
				step: 0.5, defaultValue: 100,
				labelMin: '-π', labelMax: '+π'
			},
			element);
		return rangeWidget;
	}

	onEdgeSelect(cb) {
		$("[name=edgePick]").change((event) => {
			cb(parseInt(event.target.value));
		});
	}

	onLeftRightAxisChange(cb) {
		$(".rotation-axis .range-slider[name=left] input").on("input", event => {
			const slides = event.target.parentNode.getElementsByTagName("input");
		  	cb(parseFloat(slides[0].value));
		});
	}

	onUpDownAxisChange(cb) {
		$(".rotation-axis .range-slider[name=up] input").on("input", event => {
			const slides = event.target.parentNode.getElementsByTagName("input");
		  	cb(parseFloat(slides[0].value));
		});
	}

	onForwardBackAxisChange(cb) {
		$(".rotation-axis .range-slider[name=front] input").on("input", event => {
			const slides = event.target.parentNode.getElementsByTagName("input");
		  	cb(parseFloat(slides[0].value));
		});
	}

	getSaveAnnotationButton() {
		return $("#submit");
	}

	getCancelAnnotationButton() {
		return $("#cancel");
	}

	getTranslationOption() {
		return $("#translation");
	}

	getCentralRotationOption() {
		return $("#central-rotation");
	}

	getHingeRotationOption() {
		return $("#hinge-rotation");
	}

	getTranslationBaseOptions() {
		return $(".translation .child");
	}

	getRotationBaseOptions() {
		return $(".rotation .child");
	}

	getBaseOptions() {
		return $('.antn-dialog-base-selector-option');
	}

	getPartTags() {
		return $('.part-tag');
	}

	setPartTagSelected(ind, disableTags=false) {
		$('.part-tag').removeClass('selected');
		$(`#${ind}`).addClass('selected');
		$(`#${ind} .needs-review`).addClass("hidden");

		if (disableTags) {
			$('.part-tag').removeClass('enabled');
		}
	}

	getAddArticulationButton() {
		return $("#add-antn");
	}

	getPlayButton(ind) {
		return $(`.part-antn-edit-button.play.${ind}`);
	}

	getPauseButton(ind) {
		return $(`.part-antn-edit-button.pause.${ind}`);
	}

	getEditButton(ind) {
		return $(`.part-antn-edit-button.edit.${ind}`);
	}

	getDeleteButton(ind) {
		return $(`.part-antn-edit-button.delete.${ind}`);
	}

	showPlayButton(ind) {
		$(`.part-antn-edit-button.play.${ind}`).removeClass('hidden');
		$(`.part-antn-edit-button.pause.${ind}`).addClass('hidden');
	}

	showPauseButton(ind) {
		$(`.part-antn-edit-button.play.${ind}`).addClass('hidden');
		$(`.part-antn-edit-button.pause.${ind}`).removeClass('hidden');
	}

	unsetAnnotation(ind) {
		$(`#${ind}`).removeClass("annotated");
	}

	/**
	 * Add part pills
	 * @param parts {Array<parts.Part>}
	 * @param annotations Map of pid to annotations for part
	 */
	addPartPills(parts, annotations) {
		parts = _.sortBy(_.filter(parts, p => p), 'name');
		for (let i = 0; i < parts.length; i++) {
			const pid = parts[i].pid;
			const name = parts[i].name;
			$('.labels').append(
				`<div class="part-tag enabled" id="${pid}">
							${name}<span class="needs-review hidden">•</span>
						</div>`);

			if (annotations && annotations[pid]) {
				$(`#${pid}`).addClass('annotated');
			}
		}
	}

	updatePartTags(partPid, siblings) {
		$(".part-tag").addClass("enabled");
		$(`#${partPid}`).addClass("annotated");
		$(`#${partPid} .needs-review`).addClass("hidden");

		if (siblings) {
			siblings.forEach(pid => {
				$(`#${pid}`).addClass("annotated");
				$(`#${pid} .needs-review`).removeClass("hidden");
			});
		}
	}

	displayMain() {
		$('#sidebar').append(
			`<div>
				<div id="sidebar-top"></div>
				<div id="sidebar-bottom">
					<div id="part-tags" class="labels"></div>
				</div>
			</div>`);

		$('#sidebar-bottom').append(`
			<div id="submit-txt">
				<textarea placeholder="Any comments or feedback about this model?"></textarea>
			</div>
			<div id="submit-attns">Submit Annotations</div>`);

		$('#content').append(`
			<div id="loading-container">
				<div id="loading" class="loading">Loading&#8230;</div>
				<div id="loading-container-text">Loading <span id="loading-current"></span>...</div>
			</div>`);

		$('#content').append(
			`<i id="help-expand" class="fas fa-question-circle"></i>`);

		$('#content').append(`
			<div id="help" class="commands-container hidden">
				<div class="commands-header">
					<i id="help-collapse" class="help fas fa-question-circle"></i>Shortcuts/Commands
				</div>
				<div class="commands">
					<div class="text">The following events trigger when a part is selected.</div>
					<div class="command">
						<div class="shortcut">C</div>
						<div class="desc">Show/Hide not moving parts</div>
					</div>
					<div class="command">
						<div class="shortcut">P</div>
						<div class="desc">Toggle play/pause articulation</div>
					</div>
					<div class="command">
						<div class="shortcut">E</div>
						<div class="desc">Edit articulation</div>
					</div>
					<div class="command">
						<div class="shortcut">A</div>
						<div class="desc">Add articulation</div>
					</div>
					<div class="text">The following events trigger when the annotation wizard is open.</div>
					<div class="command">
						<div class="shortcut">T</div>
						<div class="desc">Set translation</div>
					</div>
					<div class="command">
						<div class="shortcut">R</div>
						<div class="desc">Set central rotation</div>
					</div>
					<div class="command">
						<div class="shortcut">H</div>
						<div class="desc">Set hinge rotation</div>
					</div>
					<div class="command">
						<div class="shortcut">Enter</div>
						<div class="desc">Save articulation</div>
					</div>
					<div class="command">
						<div class="shortcut">Escape</div>
						<div class="desc">Cancel articulation</div>
					</div>
				</div>
			</div>`);

		$('#help-expand').click(() => {
			$('#help').removeClass('hidden');
			$('#help-expand').addClass('hidden');
		});

		$('#help-collapse').click(() => {
			$('#help').addClass('hidden');
			$('#help-expand').removeClass('hidden');
		});

		this.makeDraggable($('#help'));

		if (this.allowPropagation) {
			$('#content').append(`
				<div id="auto-suggest-checkbox">
					<label id="propagate-label">Propagate annotations</label>
					<input id="propagate" type="checkbox" name="propagate" checked>
				</div>`);
		}

		this.makeDraggable($('#auto-suggest-checkbox'));
	}

	autoSuggestOn() {
		return $("#propagate").is(':checked');
	}

	getSubmitTextArea() {
		return $('#submit-txt textarea');
	}

	getSubmitButton() {
		return $('#submit-attns');
	}

	setNotes(text) {
		$('#submit-txt textarea').val(text);
	}

	getNotes() {
		return $('#submit-txt textarea').val();
	}

	addConnectivityGraphViz(imgUrl) {
		$('#content').append(
			`<i id="connectivity-viz-expand" class="fas fa-project-diagram"></i>`);

		$('#content').append(`
			<div id="connectivity-viz" class="commands-container hidden">
				<div class="commands-header">
					<i id="connectivity-viz-collapse" class="connectivity-viz fas fa-project-diagram"></i>Connectivity Graph
				</div>
				<div class="commands">
					<img src="${imgUrl}"/>
				</div>
			</div>`);

		$('#connectivity-viz-expand').click(() => {
			$('#connectivity-viz').removeClass('hidden');
			$('#connectivity-viz-expand').addClass('hidden');
		});

		$('#connectivity-viz-collapse').click(() => {
			$('#connectivity-viz').addClass('hidden');
			$('#connectivity-viz-expand').removeClass('hidden');
		});

		this.makeDraggable($('#connectivity-viz'));
	}

	clearLoadingDialog() {
		$('#loading-container').css('display', 'none');
	}

	displayAutoAnnotationDialog() {
		$('#dialog').html(`
			<div id="antn-dialog">
				<div id="antn-dialog-title">Is this annotation correct?</div>
				<div id="antn-dialog-content">
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>Yes</label>
							<input id="yes" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>Yes, but the range is wrong</label>
							<input id="yes-but-range" type="radio" name="antn">
						</div>
						<div class="range-container"></div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No</label>
							<input id="no" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, axis is wrong</label>
							<input id="no-axis" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, type is wrong</label>
							<input id="no-type" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, this part is not articulated</label>
							<input id="no-not-articulated" type="radio" name="antn">
						</div>
					</div>
          <div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, there is a problem with this part.</label>
							<input id="problem" type="radio" name="antn">
						</div>
					</div>

				</div>
				<div id="antn-dialog-buttons">
					<div class="antn-dialog-button" id="submit">Submit</div>
				</div>
			</div>`);
	}

	// displayRotationRangeOptions(obb, rangeMin, rangeMax) {
	displayRotationRangeOptions(type, pivotOptions, rotationRangeMin, rotationRangeMax, edge) {
		$('.range-container').html('<div class="rotation-axis"></div>');
		const element = $('.rotation-axis');
		return this.appendRotationSliders(element, type, pivotOptions, rotationRangeMin, rotationRangeMax, edge, false);
	}

	displayTranslationRangeOptions(axisOptions, axisIndex, currentRangeMin, currentRangeMax) {
		$('.range-container').html('<div class="translation-axis"></div>');
		const element = $('.translation-axis');
		return this.appendTranslationSliders(element, axisOptions, axisIndex, currentRangeMin, currentRangeMax);
	}

	hideRangeOptions() {
		$('.range-container').html("");
	}
}

// Exports
module.exports = DomHelper;
