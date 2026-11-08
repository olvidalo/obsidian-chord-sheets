import {Note} from "tonal";
import {isNoteName, tokenizeChordSymbol} from "./chordsUtils";
import {ChordSymbolRange} from "./editor-extension/chordSheetsViewPlugin";
import {ChangeSpec} from "@codemirror/state";
import {Instrument, isKeyboardInstrument} from "./instruments/types";
import {FRET_DEFINITION} from "./instruments/fretRenderer";

export type NoteProcessor = (note: string) => string;

function transposeNote(chordTonic: string, direction: "up" | "down"): string {
	const transposedNote = Note.transpose(chordTonic, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedNote) : Note.simplify(transposedNote);
}

export function processChords(chordRanges: ChordSymbolRange[], processNote: NoteProcessor, instrument: Instrument) {
	const changes: ChangeSpec[] = [];
	for (const chordRange of chordRanges) {
		const {chordSymbol, chord, tokenTo} = chordRange;
		const definition = chord.userDefinedChord;
		const newSymbol = processSymbol(chordSymbol, processNote);
		if (definition && isKeyboardInstrument(instrument)) {
			const newDefinition = definition.replace(/[^\s|]+/g, token => isNoteName(token) ? processNote(token) : token);
			const newToken = `${newSymbol}[${newDefinition}]`;
			if (newToken !== `${chordSymbol}[${definition}]`) {
				changes.push(...replacementChanges(chordRange, newToken, tokenTo));
			}
		} else if (newSymbol !== chordSymbol) {
			changes.push(...replacementChanges(chordRange, newSymbol));
		}
	}

	return changes;
}

function processSymbol(chordSymbol: string, processNote: NoteProcessor): string {
	const [tonic, type, bass] = tokenizeChordSymbol(chordSymbol);
	return bass ? `${processNote(tonic)}${type}/${processNote(bass)}` : processNote(tonic) + type;
}

export function replaceChordSymbol(chordRanges: ChordSymbolRange[], newSymbol: string): ChangeSpec[] {
	return chordRanges
		.filter(chordRange => !chordRange.chord.userDefinedChord)
		.flatMap(chordRange => replacementChanges(chordRange, newSymbol));
}

/** Replaces from the symbol start up to `to` and lets the spaces after the token absorb the length change. */
function replacementChanges({from, to: symbolTo, tokenTo, trailingSpaces}: ChordSymbolRange, newText: string, to = symbolTo): ChangeSpec[] {
	const changes: ChangeSpec[] = [{from, to, insert: newText}];
	const growth = newText.length - (to - from);

	if (growth < 0 && trailingSpaces > 0) {
		changes.push({from: tokenTo, insert: " ".repeat(-growth)});
	} else if (growth > 0 && trailingSpaces > 1) {
		changes.push({from: tokenTo, to: tokenTo + Math.min(growth, trailingSpaces - 1)});
	}

	return changes;
}

export function transpose(chordRanges: ChordSymbolRange[], direction: "up" | "down", instrument: Instrument) {
	const processNote: NoteProcessor = (note) => transposeNote(note, direction);
	if (isKeyboardInstrument(instrument)) {
		return processChords(chordRanges, processNote, instrument);
	}

	const changes: ChangeSpec[] = [];
	for (const chordRange of chordRanges) {
		const {chordSymbol, chord, tokenTo} = chordRange;
		const definition = chord.userDefinedChord;
		if (!definition) {
			changes.push(...processChords([chordRange], processNote, instrument));
			continue;
		}
		const newDefinition = shiftFretDefinition(definition, direction === "up" ? 1 : -1);
		if (newDefinition === null) continue;
		const newToken = `${processSymbol(chordSymbol, processNote)}[${newDefinition}]`;
		changes.push(...replacementChanges(chordRange, newToken, tokenTo));
	}
	return changes;
}

/** Moves a fret shape like "x_24432_", "4|x2x132" or "0 10 10 12 8 8" by `delta` frets; null if not a fret shape. */
export function shiftFretDefinition(definition: string, delta: number): string | null {
	const groups = FRET_DEFINITION.exec(definition)?.groups;
	if (!groups) return null;
	const spaced = /[\s,]/.test(groups.frets);
	const symbols = spaced ? groups.frets.match(/\d+|x|_/g) : groups.frets.split("");
	if (!symbols) return null;

	const position = groups.position ? parseInt(groups.position) : 0;
	let frets = symbols.map(symbol => /\d/.test(symbol) ? parseInt(symbol) : symbol);

	// positioned shapes move by changing the position unless it would drop below 1
	if (position > 0 && position + delta >= 1) {
		return `${position + delta}|${groups.frets}`;
	}
	if (position > 0) {
		frets = frets.map(fret => typeof fret === "number" && fret > 0 ? fret + position - 1 : fret);
	}

	frets = frets.map(fret => typeof fret === "number" ? fret + delta : fret);
	// wrap an octave up when moving below the nut
	if (frets.some(fret => typeof fret === "number" && fret < 0)) {
		frets = frets.map(fret => typeof fret === "number" ? fret + 12 : fret);
	}

	const needsSeparator = spaced || frets.some(fret => typeof fret === "number" && fret > 9);
	return frets.join(needsSeparator ? " " : "");
}

export function enharmonicToggle(chordTokenRanges: ChordSymbolRange[], instrument: Instrument) {
	return processChords(chordTokenRanges, Note.enharmonic, instrument);
}
