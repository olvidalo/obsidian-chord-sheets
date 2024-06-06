import {Chord, Note} from "tonal";
import {ChordDef, IChordsDB, InstrumentChords} from "@tombatossals/chords-db";

export type Instrument = keyof IChordsDB;

export interface SheetChord {
	tonic: string,
	type: string,
	typeAliases: string[],
	slash: boolean
}

export interface Token {
	type: 'word' | 'chord' | 'whitespace';
	value: string;
	index?: number;
}

export interface ChordToken extends Token {
	type: 'chord'
	chord: SheetChord
}

export function isChordToken(token: Token | null | undefined): token is ChordToken {
	return !!token && token.type === 'chord' && 'chord' in token;
}

interface TokenizedLine {
	tokens: Token[]
	wordTokens: Token[]
}

interface ChordLine extends TokenizedLine {
	chordTokens: ChordToken[]
}

export function isChordLine(tokenizedLine: TokenizedLine): tokenizedLine is ChordLine {
	return 'chordTokens' in tokenizedLine;
}

export function getTonicVariations(tonic: string) {
	const tonicVariations = [
		tonic, Note.simplify(tonic), Note.enharmonic(tonic)
	];

	// the guitar database of chords-db has C# as Csharp etc.
	const sharp = "#";
	const sharpVariation = tonicVariations.find(variation => variation?.contains(sharp));
	if (sharpVariation) {
		tonicVariations.push(sharpVariation.replace(sharp, "sharp"));
	}
	return tonicVariations;
}

export function tokenizeLine(line: string): TokenizedLine | ChordLine {
	const tokenPattern = /(?<word>\S+)|(?<spaces>[^\S\n]+)/g;
	const tokens: Token[] = [];
	const wordTokens: Token[] = [];
	const chordTokens: ChordToken[] = [];
	let match: RegExpExecArray | null;

	while ((match = tokenPattern.exec(line)) !== null) {
		if (match.groups?.word) {
			const tonalJsChord = Chord.get(match[1]);
			let chord: SheetChord | null = null;

			// tonal.js does not catch slash chords (like C/E)
			if (tonalJsChord.empty && match[1].contains("/")) {
				const [tonic, type] = Chord.tokenize(match[1]);
				chord = {tonic, type, typeAliases: [], slash: true};
			} else {
				const {tonic, type, aliases: typeAliases} = tonalJsChord;
				if (tonic != null) {
					chord = {tonic, type, typeAliases, slash: false};
				}
			}

			const token: Token = {
				type: chord ? 'chord' : 'word',
				value: match[1],
				index: match.index,
				...(chord && {chord})
			};
			tokens.push(token);
			wordTokens.push(token);
			if (chord) {
				chordTokens.push(token as ChordToken);
			}
		} else if (match.groups?.spaces) {
			tokens.push({type: 'whitespace', value: match[2]});
		}
	}

	const isChordLine = chordTokens.length / wordTokens.length > 0.5;

	return isChordLine
		? {tokens, wordTokens, chordTokens}
		: {tokens, wordTokens};
}

export function transposeNote(note: string, direction: "up" | "down") {
	const transposedNote = Note.transpose(note, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedNote) : Note.simplify(transposedNote);
}

export function findDbChord(chordToken: ChordToken, instrumentChords: InstrumentChords) {
	const tonic = chordToken.chord.tonic;
	const tonicVariations = getTonicVariations(tonic);

	const availableTonicKeys = Object.keys(instrumentChords.chords);
	const tonicKey = availableTonicKeys.find(note => tonicVariations.includes(note));
	let dbChord: ChordDef | undefined;
	if (tonicKey) {
		dbChord = instrumentChords.chords[tonicKey].find(testChord => testChord.suffix === chordToken.chord.type || chordToken.chord.typeAliases.includes(testChord.suffix));
	}
	return dbChord;
}

export function uniqueChordTokens(chordTokens: ChordToken[]) {
	const seenValues = new Set<string>();
	return chordTokens.filter(token => {
		if (!seenValues.has(token.value)) {
			seenValues.add(token.value);
			return true;
		}
		return false;
	});
}

export function chordSequenceString(chordTokens: ChordToken[]) {
	return JSON.stringify(chordTokens.map(token => token.value));
}
