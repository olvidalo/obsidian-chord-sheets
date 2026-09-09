import {Note} from "tonal";
import {tokenizeChordSymbol} from "./chordsUtils";
import {ChordSymbolRange} from "./editor-extension/chordSheetsViewPlugin";
import {ChangeSpec} from "@codemirror/state";
import {Instrument, isKeyboardInstrument} from "./instruments/types";

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

/** "E" or "Bb", but not a degree like "3" or "b7" (which tonal would read as the note B7). */
function isNoteName(token: string): boolean {
	const note = Note.get(token);
	return !note.empty && note.oct === undefined;
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
	// a custom fret shape cannot move with its symbol
	const movable = isKeyboardInstrument(instrument)
		? chordRanges
		: chordRanges.filter(range => !range.chord.userDefinedChord);
	return processChords(movable, (note) => transposeNote(note, direction), instrument);
}

export function enharmonicToggle(chordTokenRanges: ChordSymbolRange[], instrument: Instrument) {
	return processChords(chordTokenRanges, Note.enharmonic, instrument);
}
