import {EditorView, WidgetType} from "@codemirror/view";
import {chordSequenceString, uniqueChordTokens} from "../chordsUtils";
import {makeChordOverview} from "../chordDiagrams";
import {PersistVoicingEventDetail} from "./chordSheetsViewPlugin";

import {ChordToken} from "../sheet-parsing/tokens";
import {Instrument} from "../instruments/types";

export class ChordOverviewWidget extends WidgetType {

	private readonly chordSequenceString: string;
	public readonly uniqueChordTokens: ChordToken[];

	constructor(
		private instrument: Instrument,
		private diagramWidth: number,
		chordTokens: ChordToken[],
	) {
		super();
		this.uniqueChordTokens = uniqueChordTokens(chordTokens);
		this.chordSequenceString = chordSequenceString(this.uniqueChordTokens);
	}

	get estimatedHeight(): number {
		return 300;
	}

	ignoreEvent(event: Event): boolean {
		return event.type !== "mousemove";
	}

	eq(other: ChordOverviewWidget): boolean {
		return this.instrument === other.instrument
			&& this.diagramWidth === other.diagramWidth
			&& this.uniqueChordTokens.length === other.uniqueChordTokens.length
			&& this.uniqueChordTokens.every((value, index) => value === other.uniqueChordTokens[index]);
	}

	updateDOM(dom: HTMLElement, view: EditorView): boolean {
		const chordOverview = this.getChordOverviewEl(dom);
		const {
			chordSequence: previousChordSequence,
			instrument: previousInstrument,
			diagramWidth: previousDiagramWidth
		} = chordOverview.dataset;

		const previousDiagramWidthInt = previousDiagramWidth ? parseInt(previousDiagramWidth) : 0;
		if (
			this.chordSequenceString !== previousChordSequence
			|| this.instrument !== previousInstrument
			|| this.diagramWidth !== previousDiagramWidthInt
		) {
			this.updateChordOverview(chordOverview, view);
			view.requestMeasure();
		}

		return true;
	}

	toDOM(view: EditorView): HTMLElement {
		const el = createDiv({cls: "chord-sheet-chord-overview-container"});
		const chordOverviewEl = el.createDiv({cls: ["chord-sheet-chord-overview", "chord-sheet-preview-mode"]});

		this.updateChordOverview(chordOverviewEl, view);
		view.requestMeasure();
		return el;
	}

	private updateChordOverview(chordOverview: HTMLElement, view: EditorView, instrument: Instrument = this.instrument) {
		chordOverview.replaceChildren();
		makeChordOverview(instrument, chordOverview, this.uniqueChordTokens, this.diagramWidth, (chordToken, newSymbol) => {
			window.dispatchEvent(new CustomEvent<PersistVoicingEventDetail>("chord-sheet-persist-voicing", {
				detail: {pos: view.posAtDOM(chordOverview), chordSymbol: chordToken.chordSymbol.value, newSymbol, onlyAtPos: false}
			}));
		});
	}

	private getChordOverviewEl(el: HTMLElement): HTMLElement {
		return el.querySelector(".chord-sheet-chord-overview")!;
	}
}
