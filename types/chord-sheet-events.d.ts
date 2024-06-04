import {InstrumentChangeEventDetail} from "../src/editor-extension/chordBlockToolsWidget";
import {TransposeEventDetail, EnharmonicEventDetail} from "../src/editor-extension/chordSheetsViewPlugin";

declare global {

	// noinspection JSUnusedGlobalSymbols
	interface WindowEventMap {
		"chord-sheet-instrument-change": CustomEvent<InstrumentChangeEventDetail>;
		"chord-sheet-transpose": CustomEvent<TransposeEventDetail>;
        "chord-sheet-enharmonic": CustomEvent<EnharmonicEventDetail>;
	}
}
