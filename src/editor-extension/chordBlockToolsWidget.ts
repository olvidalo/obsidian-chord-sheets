import {EditorView, WidgetType} from "@codemirror/view";
import {Instrument} from "../chordsUtils";
import {chordBlocksStateField} from "./chordBlocksStateField";
import ChordsDB from "@tombatossals/chords-db";

export interface InstrumentChangeEventDetail {
	selectedInstrument: string
	from: number
}


export class ChordBlockToolsWidget extends WidgetType {
	constructor(
		private instrument: Instrument,
		private showTransposeControl: boolean,
		private showInstrumentControl: boolean,
		private showEnharmonicControl: boolean,
		private chordOverviewVisible: boolean
	) {
		super();
	}

	ignoreEvent(event: Event): boolean {
		return event.type !== "click" && event.type !== "mousemove";
	}

	eq(other: ChordBlockToolsWidget) {
		return this.instrument === other.instrument
			&& this.showTransposeControl === other.showTransposeControl
            && this.showEnharmonicControl === other.showEnharmonicControl
			&& this.showInstrumentControl === other.showInstrumentControl
			&& this.chordOverviewVisible === other.chordOverviewVisible;
	}

	updateDOM(dom: HTMLElement, view: EditorView): boolean {
		const hasWithChordOverviewClass = dom.classList.contains("with-chord-overview");
		if (this.chordOverviewVisible) {
			!hasWithChordOverviewClass && dom.classList.add("with-chord-overview");
		} else {
			hasWithChordOverviewClass && dom.classList.remove("with-chord-overview");
		}

		const transposeControl = this.getTransposeControl(dom);
		if (this.showTransposeControl) {
			!transposeControl && this.createTransposeControl(dom);
		} else {
			transposeControl?.remove();
		}

		const instrumentSelect = this.getInstrumentSelect(dom);
		if (this.showInstrumentControl) {
			if (instrumentSelect) {
				if (instrumentSelect.value !== this.instrument) {
					instrumentSelect.value = this.instrument;
				}
			} else {
				this.createInstrumentControl(dom, view);
			}
		} else {
			instrumentSelect && instrumentSelect.remove();
		}

        const enharmonicButton = this.getEnharmonicButton(dom);
		if (this.showEnharmonicControl) {
			!enharmonicButton && this.createEnharmonicButton(dom);
		} else {
			enharmonicButton?.remove();
		}

		return true;
	}

	toDOM(view: EditorView): HTMLElement {
		const containerEl = document.createElement("div");
		containerEl.classList.add("chord-sheet-tools-container");
		if (this.chordOverviewVisible) {
			containerEl.classList.add("with-chord-overview");
		}

		const el = document.createElement("div");
		el.classList.add("chord-sheet-tools");
		containerEl.append(el);

		if (this.showTransposeControl) {
			this.createTransposeControl(containerEl);
		}
        if (this.showEnharmonicControl) {
			this.createEnharmonicButton(containerEl);
		}

		if (this.showInstrumentControl) {
			this.createInstrumentControl(containerEl, view);
		}

		return containerEl;
	}

	private createInstrumentControl(containerEl: HTMLElement, view: EditorView): void {
		const el = document.createElement("select");
		el.classList.add("dropdown", "chord-sheet-instrument-change");

		for (const instrument of Object.keys(ChordsDB)) {
			const option = document.createElement("option");
			option.value = instrument;
			option.text = instrument.charAt(0).toUpperCase() + instrument.slice(1);
			option.selected = this.instrument === instrument;
			el.append(option);
		}

		el.addEventListener("change", event => {
			const target = event.target as HTMLSelectElement;
			const selectedInstrument = target.value;

			const pos = view.posAtDOM(target);
			const chordBlocksState = view.state.field(chordBlocksStateField);
			const chordBlockRange = chordBlocksState.ranges.iter(pos);
			const instrumentChangeEvent = new CustomEvent<InstrumentChangeEventDetail>('chord-sheet-instrument-change', {
				detail: {
					selectedInstrument,
					from: chordBlockRange.from
				}
			});
			window.dispatchEvent(instrumentChangeEvent);
		});

		containerEl.firstElementChild?.append(el);
	}

	private createTransposeControl(containerEl: HTMLElement): void {
		const el = Object.assign(document.createElement("div"), {
			className: 'chord-sheet-transpose-control'
		});

		const buttonDown = Object.assign(document.createElement('button'), {
			className: 'chord-sheet-transpose chord-sheet-transpose-down',
			textContent: '-1'
		});
		const label = Object.assign(document.createElement('span'), {
			className: 'chord-sheet-transpose-label',
			textContent: 'Transpose'
		});
		const buttonUp = Object.assign(document.createElement('button'), {
			className: 'chord-sheet-transpose chord-sheet-transpose-up',
			textContent: '+1'
		});

		el.append(buttonDown, label, buttonUp);
		containerEl.firstElementChild?.prepend(el);
	}

    private createEnharmonicButton(containerEl: HTMLElement): void {
		const el = Object.assign(document.createElement("button"), {
			className: 'chord-sheet-enharmonic',
            textContent: 'Enharmonic'
		});

		containerEl.firstElementChild?.prepend(el);
	}

	private getInstrumentSelect(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector("select");
	}

	private getTransposeControl(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector(".chord-sheet-transpose-control");
	}

    private getEnharmonicButton(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector(".chord-sheet-enharmonic");
	}
}
