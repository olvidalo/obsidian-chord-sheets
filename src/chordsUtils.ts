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

// A variant label at the end of a chord symbol names a voicing of that chord: C*, C*4, Fm:2, C/E*.
const CHORD_VARIANT = /(?:\*\w*|:[\w-]+)$/;

export function splitChordVariant(symbol: string): [base: string, variant: string] {
	const match = symbol.match(CHORD_VARIANT);
	return match && match.index ? [symbol.slice(0, match.index), match[0]] : [symbol, ""];
}

export function parseChordSymbol(symbol: string): SheetChord {
	const chord = parsePlainChordSymbol(symbol);
	const [base, variant] = splitChordVariant(symbol);
	return chord.empty && variant ? parsePlainChordSymbol(base) : chord;
}

function parsePlainChordSymbol(symbol: string): SheetChord {
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


/**
 * Lets a bare chord symbol reuse a definition written elsewhere in its chord block, e.g. Bbadd13 after
 * Bbadd13[x13333]. The nearest definition above the chord wins, otherwise the first one below it.
 * Expects all chord tokens of one block in document order; returns them in the same order, replacing
 * each reference with a copy that carries the definition.
 */
export function resolveChordReferences(chordTokens: readonly ChordToken[]): ChordToken[] {
	const definitions = new Map<string, {index: number, token: ChordToken}[]>();
	chordTokens.forEach((token, index) => {
		if (token.chord.userDefinedChord) {
			const symbol = token.chordSymbol.value;
			definitions.set(symbol, [...definitions.get(symbol) ?? [], {index, token}]);
		}
	});

	const resolveReference = (token: ChordToken, index: number): ChordToken => {
		const candidates = token.chord.userDefinedChord ? undefined : definitions.get(token.chordSymbol.value);
		if (!candidates) {
			return token;
		}

		const above = candidates.filter(candidate => candidate.index < index);
		const definition = above[above.length - 1] ?? candidates[0];
		return {
			...token,
			chord: {...token.chord, userDefinedChord: definition.token.chord.userDefinedChord},
			definedBy: definition.token
		};
	};

	return chordTokens.map(resolveReference);
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
	return JSON.stringify(chordTokens.map(token => [token.value, token.chord.userDefinedChord ?? null]));
}
