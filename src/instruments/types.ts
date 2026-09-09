import {IChordsDB} from "@tombatossals/chords-db";
import {SheetChord} from "../chordsUtils";

export type FrettedInstrument = keyof IChordsDB;
export type KeyboardInstrument = "piano";
export type Instrument = FrettedInstrument | KeyboardInstrument;

export function isKeyboardInstrument(instrument: Instrument): instrument is KeyboardInstrument {
	return instrument === "piano";
}

export class NoDiagramError extends Error {}

export interface ChordDiagram {
	readonly numVoicings: number;
	readonly initialVoicing?: number;
	render(index: number, width: number): HTMLDivElement;
	voicingName?(index: number): string;
}

export interface InstrumentRenderer {
	readonly instrument: Instrument;
	readonly label: string;

	getDiagram(chord: SheetChord, chordName: string): ChordDiagram;
	renderMissing(width: number): HTMLDivElement;
}

