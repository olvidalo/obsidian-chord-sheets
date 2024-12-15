import {Chord, Note} from "tonal";
import {ChordSymbolRange} from "./editor-extension/chordSheetsViewPlugin";
import {ChangeSpec} from "@codemirror/state";

export type NoteProcessor = (note: string) => string;

function transposeNote(chordTonic: string, direction: "up" | "down"): string {
	const transposedTonic = Note.transpose(chordTonic, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedTonic) : Note.simplify(transposedTonic);
}

function enharmonicNote(chordTonic: string): string {
	return Note.enharmonic(chordTonic);
}

export function processChords(chordRanges: ChordSymbolRange[], processNote: NoteProcessor, skipUserDefinedChords = false) {
	const changes: ChangeSpec[] = [];
	for (const chordRange of chordRanges) {
		if (skipUserDefinedChords && chordRange.chord.userDefinedChord) {
			continue;
		}

		const {from, to, chordSymbol} = chordRange;
		const [chordTonic, chordType, bassNote] = Chord.tokenize(chordSymbol);

		const processedTonic = processNote(chordTonic);
		const processedChord = bassNote
			? processedTonic + chordType + "/" + processNote(bassNote)
			: processedTonic + chordType;

		changes.push({from: from, to: to, insert: processedChord});
	}

	return changes;
}

export function transpose(chordRanges: ChordSymbolRange[], direction: "up" | "down") {
	return processChords(chordRanges, (note) => transposeNote(note, direction), true);
}

export function enharmonicToggle(chordTokenRanges: ChordSymbolRange[]) {
	return processChords(chordTokenRanges, enharmonicNote);
}
