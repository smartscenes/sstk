const EditArticulationUI = require('./ui/EditArticulationUI');
const PartGeomUI = require('./ui/PartGeomUI');
const SidePanel = require('./ui/SidePanel');
const PartConnectivityGraphViz = require('./ui/PartConnectivityGraphViz');
const PartHierarchyGraphViz = require('./ui/PartHierarchyGraphViz');

class DomHelper {
	constructor(params) {
		this.container = params.container;
		this.assetPaths = params.assetPaths;

		this.allowAddGeometry = params.allowAddGeometry;
  	this.allowPropagation = false;

		// UI components
		this.editArticulationUI = new EditArticulationUI({
			container: $('#main'),
			articulationTypes: params.articulationTypes,
			motionStates: params.motionStates,
			allowSelectAttached: params.allowSelectAttached,
			allowAnimateArticulationWidget: true
		});
		this.sidebar = new SidePanel({
			container: $('#sidebar'),
			groupParts: params.groupParts
		});
		this.partGeomUI = null;
	}

	get partsSelectionUI() {
		return this.sidebar.partsSelectionUI;
	}

	get playArticulationUIs() {
		return this.sidebar.playArticulationUIs;
	}

	createPartGeomUI(part, root, maxGeoms) {
		const ui = new PartGeomUI(part, root, {
			container: $('#main'),
			maxGeoms: maxGeoms
		});
		ui.create();
		return ui;
	}

	createPartsSelectionUI(parts, annotations) {
		return this.sidebar.createPartsSelectionUI(parts, annotations);
	}

	displayAnnotationWizard(part, candidateBaseParts, type, tag) {
		const dialog = this.editArticulationUI.create(part, candidateBaseParts, type, tag);
		this.makeDraggable(this.editArticulationUI.getTitleDiv(), dialog, pos => {
			this.editArticulationUI.updatePosition(pos);
		});
	}

	hideAnnotationWizard() {
		this.editArticulationUI.clear();
	}

	makeDraggable(triggerElement, draggableElement, onDragged) {
		draggableElement = draggableElement || triggerElement;
		let mouse = {};
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
					mouse.x = ((event.clientX - rect.left)/this.container.clientWidth) * 2 - 1;
					mouse.y = -((event.clientY - rect.top)/this.container.clientHeight) * 2 + 1;
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
			});
		});
	}

	displaySidebar(pid, parts, annotations, playing) {
		this.sidebar.update(pid, parts, annotations, playing);
	}

	showPlayButton(ind) {
		this.sidebar.playArticulationUIs[ind].showPlayButton();
	}

	showPauseButton(ind) {
		this.sidebar.playArticulationUIs[ind].showPauseButton();
	}

	createCommandString(shortcut) {
		return `<div class="command">
			<div class="shortcut">${shortcut.key}</div>
			<div class="desc">${shortcut.description}</div>
		</div>`;
	}

	addExpandable(parent, opts) {
		// collapsed (click to expand)
		const id = opts.id;
		const icon = opts.icon;
		const expandButton = $(`<i id="${id}-expand" class="expand-button fas ${icon}"></i>`);
		if (opts.help) {
			expandButton.attr('title', opts.help);
		}
		if (opts.shortname) {
			expandButton.append($('<span></span>').text(opts.shortname));
		}
		parent.append(expandButton);
		// expanded (click to collapse)
		const collapseButton = $(`<i id="${id}-collapse" class="collapse-button fas ${icon}"></i>`);
		const expanded = $(`
			<div id="${id}" class="commands-container hidden">
				<div class="commands-header">
				</div>
				<div class="commands">
				</div>
			</div>`);
		expanded.find('.commands-header').append(collapseButton).append(opts.header);
		expanded.find('.commands').append(opts.content);
		parent.append(expanded);

		expandButton.click(() => {
			expanded.removeClass('hidden');
			expandButton.addClass('hidden');
			if (opts.onExpand) {
				opts.onExpand();
			}
		});

		collapseButton.click(() => {
			expanded.addClass('hidden');
			expandButton.removeClass('hidden');
			if (opts.onCollapse) {
				opts.onCollapse();
			}
		});

		if (opts.draggable) {
			this.makeDraggable(expanded);
		}
		return {
			expand: () => expandButton.click(),
			collapse: () => collapseButton.click()
		};
	}

	displayMain() {
		this.sidebar.create();

		// Loading container
		$('#content').append(`
			<div id="loading-container">
				<div id="loading" class="loading">Loading&#8230;</div>
				<div id="loading-container-text">Loading <span id="loading-current"></span>...</div>
			</div>`);

		// Help
		const partKeyboardShortcuts = [
			{key: 'P', description: 'Toggle play/pause articulation'},
			{key: 'E', description: 'Edit articulation'},
			{key: 'A', description: 'Add articulation'},
			{key: 'M', description: 'Mark part/object as moveable'},
			{key: 'F', description: 'Mark part/object as fixed'},
			{key: 'C', description: 'Show/Hide not moving parts'},
		];
		const partKeyboardShortcutsHelp = partKeyboardShortcuts.map(
			(x) => this.createCommandString(x)).join('\n');

		const editArtKeyboardShortcuts =
			[{key: 'T', description: 'Set translation'},
				{key: 'R', description: 'Set rotation'},
				{key: 'Enter', description: 'Save articulation'},
				{key: 'Escape', description: 'Cancel articulation'}];

		const editArtKeyboardShortcutsHelp = editArtKeyboardShortcuts.map(
			(x) => this.createCommandString(x)).join('\n');


		let helpContent = `<div class="text">The following events trigger when a part is selected.</div>
				${partKeyboardShortcutsHelp}
				<div class="text">The following events trigger when the annotation wizard is open.</div>
				${editArtKeyboardShortcutsHelp}`;

		const otherCommandsShortcuts = [
			{key: 'Ctrl-I', description: 'Save image'},
			{key: 'B', description: 'Toggle allow any part as base'},
			{key: 'S', description: 'Suggest Axis'}
		];
		const otherCommandsHelp = otherCommandsShortcuts.map(
			(x) => this.createCommandString(x)).join('\n');
		helpContent = helpContent +  `<div class="text">Other commands</div>${otherCommandsHelp}`;
		if (this.allowAddGeometry) {
			const addGeomShortcuts = [
				{key: 'G', description: 'Add geometry'},
				{key: 'Ctrl-G', description: 'Show add geometry panel'}
			];
			const addGeomShortcutsHelp = addGeomShortcuts.map(
				(x) => this.createCommandString(x)).join('\n');
			helpContent = helpContent + `${addGeomShortcutsHelp}`;
		}

		this.addExpandable($('#content'), {
			id: 'help',
			icon: 'fa-question-circle',
			help: 'Help',
			header: 'Shortcuts/Commands',
			content: helpContent,
			draggable: true
		});

		// Some other stuff
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
		return this.sidebar.submitTextarea;
	}

	getSubmitButton() {
		return this.sidebar.submitButton;
	}

	setNotes(text) {
		this.sidebar.setNotes(text);
	}

	getNotes() {
		return this.sidebar.getNotes();
	}

	__addConnectivityGraphViz(imgUrlOrConnectivityGraph, isInitial) {
		const imgUrl = (typeof(imgUrlOrConnectivityGraph) === 'string')? imgUrlOrConnectivityGraph : null;
		const vizId = isInitial? 'connectivity-viz' : 'connectivity-viz-current';
		const vizExpId = isInitial? 'connectivity-viz-graph' : 'connectivity-viz-graph-current';
		const vizName = isInitial? null : ' (c)';
		const vizDesc = isInitial? 'Initial ' : 'Current ';
		if (imgUrl != null) {
			this.addExpandable($('#content'), {
				id: vizId,
				icon: 'fa-project-diagram',
				shortname: vizName,
				header: vizDesc + 'Connectivity Graph',
				help: vizDesc + 'connectivity graph',
				content: `<img src="${imgUrl}"/>`,
				draggable: true
			});
		} else {
			const connectivityViz = new PartConnectivityGraphViz({
				selector: `#${vizExpId}`,
				padding: [20,20],
				onClickNodeCallback: (part) => {
					console.log('clicked', part);
				},
				onHoverNodeCallback: (part, hovered) => {
					if (hovered) {
						console.log('hovered', part);
					}
				},
				separateConnectedComponents: true
			});
			const expandable = this.addExpandable($('#content'), {
				id: vizId,
				icon: 'fa-project-diagram',
				shortname: vizName,
				header: vizDesc + 'Connectivity Graph',
				help: vizDesc + 'connectivity graph',
				content: `<div id="${vizExpId}"></div>`,
				draggable: true,
				onExpand: () => {
					connectivityViz.onResize();
				}
			});
			connectivityViz.init();
			connectivityViz.setConnectivityGraph(imgUrlOrConnectivityGraph);
			connectivityViz.expand = expandable.expand;
			connectivityViz.collpase = expandable.collpase;
			return connectivityViz;
		}
	}

	addConnectivityGraphViz(imgUrlOrConnectivityGraph) {
		this.__addConnectivityGraphViz(imgUrlOrConnectivityGraph, true)
	}

	showCurrentConnectivityViz(connectivityGraph) {
		if (!this.connectivityViz) {
			this.connectivityViz = this.__addConnectivityGraphViz(connectivityGraph, false);
		} else {
			this.connectivityViz.setConnectivityGraph(connectivityGraph);
		}
		this.connectivityViz.expand();
	}

	showPartHierarchy(root) {
		if (!this.partHierarchyViz) {
			const partsUI = this.sidebar.partsSelectionUI;
			this.partHierarchyViz = new PartHierarchyGraphViz({
				selector: '#part-hierarchy-viz',
				onClickNodeCallback: (part) => {
					// console.log('clicked', part);
					if (part.pid != null) {
						partsUI.clickPartPill(part.pid);
					}
				},
				onHoverNodeCallback: (part, hovered) => {
					// if (hovered) {
					// 	console.log('hovered', part);
					// }
					if (part.pid != null) {
						partsUI.Publish('hover', part.pid, partsUI.parts[part.pid], hovered);
					}
				},
			});
			const expandable = this.addExpandable($('#content'), {
				id: 'part-hierarchy-viz',
				icon: 'fa-sitemap',
				header: 'Part Hierarchy',
				help: 'Part-based scene graph',
				content: '<div id="part-hierarchy-viz"></div>',
				draggable: true,
				onExpand: () => {
					this.partHierarchyViz.onResize();
				}
			});
			this.partHierarchyViz.expand = expandable.expand;
			this.partHierarchyViz.collapse = expandable.collapse;
			this.partHierarchyViz.init();
		}
		this.partHierarchyViz.setHierarchy(root);
		this.partHierarchyViz.expand();
	}

	showLoadingMessage(message) {
		$('#loading-current').html(message);
	}

	clearLoadingDialog() {
		$('#loading-container').css('display', 'none');
	}

}

// Exports
module.exports = DomHelper;
