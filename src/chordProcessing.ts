import {Chord, Note} from "tonal";
import {ChordSymbolRange} from "./editor-extension/chordSheetsViewPlugin";
import {ChangeSpec} from "@codemirror/state";

function transposeNote(chordTonic: string, direction: "up" | "down") {
	const transposedTonic = Note.transpose(chordTonic, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedTonic) : Note.simplify(transposedTonic);
}

function enharmonicNote(chordTonic: string) {
	return Note.enharmonic(chordTonic);
}

export function transpose(chordRanges: ChordSymbolRange[], direction: "up" | "down") {
	const changes: ChangeSpec[] = [];
	for (const chordRange of chordRanges) {
		if (chordRange.chord.userDefinedChord === undefined) {
			const {from, to, chordSymbol} = chordRange;
			const [chordTonic, chordType, bassNote] = Chord.tokenize(chordSymbol);

			const simplifiedTonic = transposeNote(chordTonic, direction);

			let transposedChord;
			if (bassNote) {
				transposedChord = simplifiedTonic + chordType + "/" + transposeNote(bassNote, direction);
			} else {
				transposedChord = simplifiedTonic + (chordType ?? "");
			}

			changes.push({from: from, to: to, insert: transposedChord});
		}
	}
	return changes;
}

export function enharmonicToggle(chordTokenRanges: ChordSymbolRange[]) {
	const changes: ChangeSpec[] = [];
	for (const chordTokenRange of chordTokenRanges) {
		const [chordTonic, chordType, bassNote] = Chord.tokenize(chordTokenRange.chordSymbol);
		const simplifiedTonic = enharmonicNote(chordTonic);

		let enharmonizedChord;

		if (bassNote) {
			enharmonizedChord = simplifiedTonic + chordType + "/" + enharmonicNote(bassNote);
		} else {
			enharmonizedChord = simplifiedTonic + (chordType ?? "");
		}

		const chordStartIndex = chordTokenRange.from;
		const chordEndIndex = chordTokenRange.to;
		changes.push({from: chordStartIndex, to: chordEndIndex, insert: enharmonizedChord});
	}
	return changes;
}
