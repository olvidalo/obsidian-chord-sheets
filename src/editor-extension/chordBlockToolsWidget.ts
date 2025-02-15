import {EditorView, WidgetType} from "@codemirror/view";
import {Instrument} from "../chordsUtils";
import {chordBlocksStateField} from "./chordBlocksStateField";
import {setIcon, setTooltip} from "obsidian";

export interface InstrumentChangeEventDetail {
	selectedInstrument: string
	from: number
}


export class ChordBlockToolsWidget extends WidgetType {
	constructor(
		private instrument: Instrument,
		private showTransposeControl: boolean,
		private showInstrumentControl: boolean,
		private showEnharmonicToggleControl: boolean,
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
            && this.showEnharmonicToggleControl === other.showEnharmonicToggleControl
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

        const enharmonicToggleButton = this.getEnharmonicToggleButton(dom);
		if (this.showEnharmonicToggleControl) {
			!enharmonicToggleButton && this.createEnharmonicToggleButton(dom);
		} else {
			enharmonicToggleButton?.remove();
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
        if (this.showEnharmonicToggleControl) {
			this.createEnharmonicToggleButton(containerEl);
		}

		if (this.showInstrumentControl) {
			this.createInstrumentControl(containerEl, view);
		}

		return containerEl;
	}

	private createInstrumentControl(containerEl: HTMLElement, view: EditorView): void {
		const el = document.createElement("select");
		el.classList.add("dropdown", "chord-sheet-instrument-change");

		const instrumentOption = (instrument: Instrument, name: string) => {
			return Object.assign(document.createElement("option"), {
				value: instrument,
				text: name,
				selected: this.instrument === instrument
			});
		};

		el.append(instrumentOption("guitar", "Guitar"));
		el.append(instrumentOption("ukulele", "Ukulele"));
		el.append(instrumentOption("mandolin", "Mandolin"));


		el.append(document.createElement("hr"));
		el.append(instrumentOption("ukulele-d-tuning", "Ukulele (D tuning)"));
		el.append(instrumentOption("ukulele-baritone", "Ukulele (Baritone)"));


		el.addEventListener("change", (event) => {
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
		});
		setIcon(buttonDown, 'move-down');
		setTooltip(buttonDown, 'Transpose down');

		const label = Object.assign(document.createElement('span'), {
			className: 'chord-sheet-transpose-label',
		});
		setIcon(label, 'music');

		const buttonUp = Object.assign(document.createElement('button'), {
			className: 'chord-sheet-transpose chord-sheet-transpose-up',
		});
		setIcon(buttonUp, 'move-up');
		setTooltip(buttonUp, 'Transpose up');

		el.append(buttonDown, label, buttonUp);
		containerEl.firstElementChild?.prepend(el);
	}

    private createEnharmonicToggleButton(containerEl: HTMLElement): void {
		const el = Object.assign(document.createElement("button"), {
			className: 'chord-sheet-enharmonic-toggle',
		});
		setIcon(el, 'enharmonic-toggle');
		setTooltip(el, 'Enharmonic toggle (# ↔ b)');

		containerEl.firstElementChild?.prepend(el);
	}

	private getInstrumentSelect(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector("select");
	}

	private getTransposeControl(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector(".chord-sheet-transpose-control");
	}

    private getEnharmonicToggleButton(el: HTMLElement): HTMLSelectElement | null {
		return el.querySelector(".chord-sheet-enharmonic-toggle");
	}
}
