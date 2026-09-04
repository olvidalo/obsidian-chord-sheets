import {ChordToken} from "./sheet-parsing/tokens";
import {Chord} from "tonal";


export interface UserDefinedChord {
	frets: string;
	position: number;
}

export type SheetChord = ReturnType<typeof Chord.get> & {
	userDefinedChord?: UserDefinedChord
};


export function uniqueChordTokens(chordTokens: ChordToken[]) {
	const seenValues = new Set<string>();

	return chordTokens.filter(token => {
		if (!seenValues.has(token.chordSymbol.value)) {
			seenValues.add(token.chordSymbol.value);
			return true;
		}
		return false;
	});
}

export function chordSequenceString(chordTokens: ChordToken[]) {
	return JSON.stringify(chordTokens.map(token => token.value));
}
