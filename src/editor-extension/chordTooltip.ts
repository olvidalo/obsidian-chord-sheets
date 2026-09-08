import tippy, {Instance} from "tippy.js";
import {makeChordDiagram, PersistVoicing} from "../chordDiagrams";

import {ChordToken} from "../sheet-parsing/tokens";
import {Instrument} from "../instruments/types";

export class ChordTooltip {
	private readonly instance: Instance | null = null;
	readonly popper: HTMLDivElement;


	constructor(private containerEl: HTMLElement) {
		this.popper = containerEl.createDiv({
			cls: "chord-sheet-chord-popup"
		});

		this.instance = tippy(this.containerEl, { // Temporary target
			trigger: 'manual', // We'll manually control show/hide,
			interactive: true,
			render: () => {
				return {popper: this.popper};
			}
		});
	}

	show(target: HTMLElement, instrument: Instrument, chordToken: ChordToken, diagramWidth: number, persistVoicing?: PersistVoicing): void {
		this.popper.appendChild(makeChordDiagram(instrument, chordToken, diagramWidth, persistVoicing));

		if (this.instance) {
			this.instance.setProps({
				getReferenceClientRect: () => target.getBoundingClientRect()
			});

			this.instance.show();
		}
	}


	hide(): void {
		if (this.instance) {
			this.instance.hide();
			if (this.popper.firstChild) {
				this.popper.firstChild.remove();
			}
		}
	}
}
