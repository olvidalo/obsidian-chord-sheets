import {ChordToken} from "./sheet-parsing/tokens";
import {Chord, ChordType, Note} from "tonal";
import {extendedTypeChroma} from "./chordExtensions";


export type SheetChord = ReturnType<typeof Chord.get> & {
	userDefinedChord?: string
};


// Wrapper for tonal to handle slash chords for chord types that contain a slash themselves,
// such as C6/9/E, which tonal would parse as unknown chord type "6/9/E".
// Only a note after the last slash is a bass: in 7(4/9) or 7/4 the slash belongs to the chord type.
export function tokenizeChordSymbol(symbol: string): [tonic: string, type: string, bass: string] {
	const [tonic, type, bass] = Chord.tokenize(symbol);
	const lastSlash = type.lastIndexOf("/");
	const afterLastSlash = type.slice(lastSlash + 1);
	if (!ChordType.get(type).empty || lastSlash === -1 || !isNoteName(afterLastSlash)) {
		return [tonic, type, bass];
	}
	return [tonic, type.slice(0, lastSlash), afterLastSlash];
}

export function parseChordSymbol(symbol: string): SheetChord {
	const [tonic, symbolType, bass] = tokenizeChordSymbol(symbol);
	// a trailing slash is a rhythm mark, as in "G/ / /", not a bass
	const type = symbolType.endsWith("/") ? symbolType.slice(0, -1) : symbolType;
	const chord = Chord.getChord(type, tonic, bass);
	if (!chord.empty) {
		return chord;
	}
	// tonal's dictionary has no extensions like 7(b9), 7M(9/11+) or m7/b5
	const extendedChroma = extendedTypeChroma(type);
	return extendedChroma ? Chord.getChord(extendedChroma, tonic, bass) : chord;
}

/** "E" or "Bb", but not a degree like "3" or "b7" (which tonal would read as the note B7). */
export function isNoteName(token: string): boolean {
	const note = Note.get(token);
	return !note.empty && note.oct === undefined;
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
