import {chordSequenceString} from "./chordsUtils";
import {ChordToken} from "./sheet-parsing/tokens";
import {Instrument} from "./instruments/types";
import {getRenderer} from "./instruments/instruments";

type VoicingChooserUpdateFn = (position: number) => void;

export function makeChordDiagram(instrument: Instrument, chordToken: ChordToken, width = 100) {
	const containerEl = createDiv({cls: "chord-sheet-chord-diagram"});

	containerEl.createDiv({
		cls: ["chord-sheet-chord-name", "chord-sheet-chord-highlight"],
		text: chordToken.chordSymbol.value
	});

	const diagramContainer = containerEl.createDiv({cls: "chord-sheet-chord-container"});
	diagramContainer.setAttribute("data-tooltip-position", "top");

	const renderer = getRenderer(instrument);
	let currentPosition = 0;

	const chordDiagram = renderer.getDiagram(chordToken.chord);
	if (!chordDiagram) {
		const missingEl = renderer.renderMissing(width);
		missingEl.addClass("chord-sheet-no-diagram");
		diagramContainer.replaceChildren(missingEl);
		diagramContainer.setAttribute("aria-label", `No diagram found for ${chordToken.chordSymbol.value}`);

		return containerEl;
	}

	let updateChooser: VoicingChooserUpdateFn = (_position: number) => {};

	const renderCurrentVoicing = () => {
		diagramContainer.replaceChildren(chordDiagram.render(currentPosition, width));
		updateChooser(currentPosition);
	};

	if (chordDiagram.numVoicings > 1) {
		updateChooser = createVoicingChooser(containerEl, chordDiagram.numVoicings, (delta: -1 | 1) => {
			const next = currentPosition + delta;
			if (next < 0 || next >= chordDiagram.numVoicings) return;
			currentPosition = next;

			renderCurrentVoicing();
		});
	}

	renderCurrentVoicing();
	return containerEl;
}

export function makeChordOverview(instrument: Instrument, container: HTMLElement, chordTokens: ChordToken[], width?: number) {
	for (const chordToken of chordTokens) {
		container.appendChild(makeChordDiagram(instrument, chordToken, width));
	}
	container.dataset.chordSequence = chordSequenceString(chordTokens);
	container.dataset.instrument = instrument;
	container.dataset.diagramWidth = `${width}`;
}


function createVoicingChooser(parent: HTMLElement, numVoicings: number, onChange: (delta: -1 | 1) => void): VoicingChooserUpdateFn {
	const chooserDiv = parent.createDiv({cls: "chord-sheet-position-chooser"});
	const prevBtn = chooserDiv.createSpan({cls: "chord-sheet-btn-prev-position", text: "<"});

	const labelSpan = chooserDiv.createSpan({cls: "chord-sheet-position-label"});
	const positionSpan = labelSpan.createSpan({cls: "chord-sheet-position"});
	labelSpan.createSpan({text: `/${numVoicings}`});

	const nextBtn = chooserDiv.createSpan({cls: "chord-sheet-btn-next-position", text: ">"});

	prevBtn.addEventListener("click", () => { onChange(-1); });
	nextBtn.addEventListener("click", () => { onChange(1); });

	return (index: number) => {
		positionSpan.textContent = `${index + 1}`;
		prevBtn.toggleClass("chord-sheet-pos-btn-enabled", index > 0);
		nextBtn.toggleClass("chord-sheet-pos-btn-enabled", index < numVoicings - 1);
	};
}

