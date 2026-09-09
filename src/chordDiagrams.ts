import {chordSequenceString} from "./chordsUtils";
import {ChordToken} from "./sheet-parsing/tokens";
import {ChordDiagram, Instrument, NoDiagramError} from "./instruments/types";
import {getRenderer} from "./instruments/instruments";
import {setIcon, setTooltip} from "obsidian";

type VoicingChooserUpdateFn = (position: number) => void;
export interface PersistVoicing {
	/** "block": every occurrence of the written symbol in the chord block; "chord": only this one. */
	scope: "block" | "chord";
	persist(newSymbol: string): void;
}

export function makeChordDiagram(instrument: Instrument, chordToken: ChordToken, width = 100, persistVoicing?: PersistVoicing) {
	const containerEl = createDiv({cls: "chord-sheet-chord-diagram"});

	containerEl.createDiv({
		cls: ["chord-sheet-chord-name", "chord-sheet-chord-highlight"],
		text: chordToken.chordSymbol.value
	});

	const diagramContainer = containerEl.createDiv({cls: "chord-sheet-chord-container"});
	diagramContainer.setAttribute("data-tooltip-position", "top");

	const renderer = getRenderer(instrument);
	const symbol = chordToken.chordSymbol.value;

	const showMissing = (error: unknown) => {
		if (!(error instanceof NoDiagramError)) {
			console.error(`Chord Sheets: cannot draw ${symbol}`, error);
		}
		const missingEl = renderer.renderMissing(width);
		missingEl.addClass("chord-sheet-no-diagram");
		diagramContainer.replaceChildren(missingEl);
		diagramContainer.setAttribute("aria-label", error instanceof Error ? error.message : `Cannot draw ${symbol}`);
	};

	let chordDiagram: ChordDiagram;
	try {
		chordDiagram = renderer.getDiagram(chordToken.chord, symbol);
	} catch (error) {
		showMissing(error);
		return containerEl;
	}
	const diagram = chordDiagram;

	let currentPosition = diagram.initialVoicing ?? 0;

	let updateChooser: VoicingChooserUpdateFn = (_position: number) => {};

	const renderCurrentVoicing = () => {
		try {
			diagramContainer.replaceChildren(diagram.render(currentPosition, width));
		} catch (error) {
			showMissing(error);
		}
		updateChooser(currentPosition);
	};

	if (diagram.numVoicings > 1) {
		const voicingName = (index: number) => diagram.voicingName?.(index);
		const persistable = persistVoicing && !chordToken.chord.userDefinedChord ? persistVoicing : undefined;
		updateChooser = createVoicingChooser(containerEl, diagram.numVoicings, voicingName, (delta: -1 | 1) => {
			const next = currentPosition + delta;
			if (next < 0 || next >= diagram.numVoicings) return;
			currentPosition = next;

			renderCurrentVoicing();
		}, {voicing: currentPosition, symbol: chordToken.chordSymbol.value}, persistable);
	}

	renderCurrentVoicing();
	return containerEl;
}

export function makeChordOverview(
	instrument: Instrument, container: HTMLElement, chordTokens: ChordToken[], width?: number,
	persistVoicing?: (chordToken: ChordToken, newSymbol: string) => void
) {
	for (const chordToken of chordTokens) {
		const persistInBlock: PersistVoicing | undefined = persistVoicing && {
			scope: "block",
			persist: newSymbol => persistVoicing(chordToken, newSymbol)
		};
		container.appendChild(makeChordDiagram(instrument, chordToken, width, persistInBlock));
	}
	container.dataset.chordSequence = chordSequenceString(chordTokens);
	container.dataset.instrument = instrument;
	container.dataset.diagramWidth = `${width}`;
}


function createVoicingChooser(
	parent: HTMLElement, numVoicings: number, voicingName: (index: number) => string | undefined,
	onChange: (delta: -1 | 1) => void, written: {voicing: number, symbol: string}, persistVoicing?: PersistVoicing
): VoicingChooserUpdateFn {
	const chooserDiv = parent.createDiv({cls: "chord-sheet-position-chooser"});
	const prevBtn = chooserDiv.createSpan({cls: "chord-sheet-btn-prev-position", text: "<"});

	const labelSpan = chooserDiv.createSpan({cls: "chord-sheet-position-label"});
	const positionSpan = labelSpan.createSpan({cls: "chord-sheet-position"});
	labelSpan.createSpan({text: `/${numVoicings}`});
	const separatorSpan = labelSpan.createSpan();
	const nameSpan = labelSpan.createSpan({cls: "chord-sheet-voicing-name"});

	const nextBtn = chooserDiv.createSpan({cls: "chord-sheet-btn-next-position", text: ">"});

	prevBtn.addEventListener("click", () => { onChange(-1); });
	nextBtn.addEventListener("click", () => { onChange(1); });

	let updatePersistControl = (_index: number, _name: string | undefined) => {};
	if (persistVoicing) {
		const icon = createSpan({cls: "chord-sheet-persist-voicing-icon"});
		setIcon(icon, "pin");
		let persistableName: string | null = null;
		nameSpan.addEventListener("click", () => {
			if (persistableName) persistVoicing.persist(persistableName);
		});
		const describe = (newSymbol: string) => persistVoicing.scope === "block"
			? `Change all ${written.symbol} in this block to ${newSymbol}`
			: `Change this ${written.symbol} to ${newSymbol}`;
		updatePersistControl = (index, name) => {
			persistableName = name && index !== written.voicing ? name : null;
			nameSpan.toggleClass("chord-sheet-voicing-name-persistable", persistableName !== null);
			setTooltip(nameSpan, persistableName ? describe(persistableName) : "");
			if (persistableName) nameSpan.appendChild(icon);
		};
	}

	return (index: number) => {
		positionSpan.textContent = `${index + 1}`;
		const name = voicingName(index);
		separatorSpan.textContent = name ? " · " : "";
		nameSpan.textContent = name ?? "";
		updatePersistControl(index, name);
		prevBtn.toggleClass("chord-sheet-pos-btn-enabled", index > 0);
		nextBtn.toggleClass("chord-sheet-pos-btn-enabled", index < numVoicings - 1);
	};
}

