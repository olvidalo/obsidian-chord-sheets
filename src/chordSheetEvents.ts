import {IChordBlockRangeValue} from "./editor-extension/chordBlocksStateField";

/**
 * Window events sent by the editor extension's widgets and handled by the plugin in main.ts,
 * which resolves the active editor and applies the change.
 */

export interface InstrumentChangeEventDetail {
	selectedInstrument: string
	from: number
}

export interface TransposeEventDetail {
	direction: "up" | "down",
	blockDef: {
		from: number
		to: number
		value: IChordBlockRangeValue
	}
}

export interface EnharmonicToggleEventDetail {
	blockDef: {
		from: number
		to: number
		value: IChordBlockRangeValue
	}
}

export interface PersistVoicingEventDetail {
	pos: number;
	chordSymbol: string;
	newSymbol: string;
	onlyAtPos: boolean;
}

declare global {
	// noinspection JSUnusedGlobalSymbols
	interface WindowEventMap {
		"chord-sheet-instrument-change": CustomEvent<InstrumentChangeEventDetail>;
		"chord-sheet-transpose": CustomEvent<TransposeEventDetail>;
		"chord-sheet-enharmonic-toggle": CustomEvent<EnharmonicToggleEventDetail>;
		"chord-sheet-persist-voicing": CustomEvent<PersistVoicingEventDetail>;
	}
}
