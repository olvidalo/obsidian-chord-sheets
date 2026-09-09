import {ChordToken} from "./sheet-parsing/tokens";
import {Chord, ChordType} from "tonal";


export type SheetChord = ReturnType<typeof Chord.get> & {
	userDefinedChord?: string
};


// Wrapper for tonal to handle slash chords for chord types that contain a slash themselves,
// such as C6/9/E, which tonal would parse as unknown chord type "6/9/E".
export function tokenizeChordSymbol(symbol: string): [tonic: string, type: string, bass: string] {
	const [tonic, type, bass] = Chord.tokenize(symbol);
	if (!ChordType.get(type).empty || !type.includes("/")) {
		return [tonic, type, bass];
	}
	const lastSlash = type.lastIndexOf("/");
	return [tonic, type.slice(0, lastSlash), type.slice(lastSlash + 1)];
}

export function parseChordSymbol(symbol: string): SheetChord {
	const [tonic, type, bass] = tokenizeChordSymbol(symbol);
	return Chord.getChord(type, tonic, bass);
}


export function uniqueChordTokens(chordTokens: ChordToken[]) {
	const seen = new Set<string>();

	return chordTokens.filter(token => {
		const key = token.chordSymbol.value + (token.chord.userDefinedChord || "");
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function chordSequenceString(chordTokens: ChordToken[]) {
	return JSON.stringify(chordTokens.map(token => token.value));
}
