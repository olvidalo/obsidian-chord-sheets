import {Chord, Note} from "tonal";
import {ChordSymbolRange} from "./editor-extension/chordSheetsViewPlugin";
import {ChangeSpec} from "@codemirror/state";

export type NoteProcessor = (note: string) => string;

function transposeNote(chordTonic: string, direction: "up" | "down"): string {
	const transposedNote = Note.transpose(chordTonic, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedNote) : Note.simplify(transposedNote);
}

export function processChords(chordRanges: ChordSymbolRange[], processNote: NoteProcessor, skipUserDefinedChords = false) {
	const changes: ChangeSpec[] = [];
	for (const chordRange of chordRanges) {
		if (skipUserDefinedChords && chordRange.chord.userDefinedChord) {
			continue;
		}

		const {chordSymbol} = chordRange;
		const [chordTonic, chordType, bassNote] = Chord.tokenize(chordSymbol);

		const processedTonic = processNote(chordTonic);
		const processedChord = bassNote
			? processedTonic + chordType + "/" + processNote(bassNote)
			: processedTonic + chordType;

		if (processedChord !== chordSymbol) {
			changes.push(...replacementChanges(chordRange, processedChord));
		}
	}

	return changes;
}

export function replaceChordSymbol(chordRanges: ChordSymbolRange[], newSymbol: string): ChangeSpec[] {
	return chordRanges.flatMap(chordRange => replacementChanges(chordRange, newSymbol));
}

function replacementChanges({from, to, chordSymbol, tokenTo, trailingSpaces}: ChordSymbolRange, newSymbol: string): ChangeSpec[] {
	const changes: ChangeSpec[] = [{from, to, insert: newSymbol}];
	const growth = newSymbol.length - chordSymbol.length;

	if (growth < 0 && trailingSpaces > 0) {
		changes.push({from: tokenTo, insert: " ".repeat(-growth)});
	} else if (growth > 0 && trailingSpaces > 1) {
		changes.push({from: tokenTo, to: tokenTo + Math.min(growth, trailingSpaces - 1)});
	}

	return changes;
}

export function transpose(chordRanges: ChordSymbolRange[], direction: "up" | "down") {
	return processChords(chordRanges, (note) => transposeNote(note, direction), true);
}

export function enharmonicToggle(chordTokenRanges: ChordSymbolRange[]) {
	return processChords(chordTokenRanges, Note.enharmonic);
}
