import {Chord, Note} from "tonal";
import {ChordDef, IChordsDB, InstrumentChords} from "@tombatossals/chords-db";
import escapeStringRegexp from "escape-string-regexp";

export type Instrument = keyof IChordsDB;


export interface UserDefinedChord {
	frets: string;
	position: number;
}

export interface SheetChord {
	tonic: string,
	type: string,
	typeAliases: string[],
	bass: string | null,
	userDefinedChord?: UserDefinedChord
}

export interface Token {
	type: 'word' | 'chord' | 'whitespace' | 'marker' | 'header' | 'rhythm';
	value: string;
	index: [start: number, end: number];
}

interface ChordInfo {
	chord: SheetChord
	chordSymbol: string
	chordSymbolIndex: [start: number, end: number]

	startTag?: {value: string, index: [start: number, end: number]}
	auxText?: {value: string; index: [start: number, end: number]}
	endTag?: {value: string; index: [start: number, end: number]}
}

export type ChordToken = Token & ChordInfo & {
	type: "chord"
};

export function isChordToken(token: Token | null | undefined): token is ChordToken {
	return token?.type === 'chord' && 'chord' in token;
}

export type RhythmToken = Token & {
	type: "rhythm"
};

export function isRhythmToken(token: Token | null | undefined): token is RhythmToken {
	return token?.type === 'rhythm';
}

export interface MarkerToken extends Token {
	type: 'marker',
}

export function isMarkerToken(token: Token | null | undefined): token is MarkerToken {
	return !!token && token.type === 'marker';
}

export interface HeaderToken extends Token {
	type: 'header'
	startTag: string
	startTagIndex: [start: number, end: number]
	headerName: string
	headerNameIndex: [start: number, end: number]
	endTag: string
	endTagIndex: [start: number, end: number]
}

export function isHeaderToken(token: Token | null | undefined): token is HeaderToken {
	return !!token && token.type === 'header';
}

interface TokenizedLine {
	tokens: Token[]
	isChordLine: boolean
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

function offsetIndex(indexArray: [number, number], offset: number): [number, number] {
	return indexArray && [indexArray[0] + offset, indexArray[1] + offset];
}

export function tokenizeLine(line: string, lineIndex: number, chordLineMarker: string, textLineMarker: string): TokenizedLine {
	const chordLineMarkerPattern = escapeStringRegexp(chordLineMarker);
	const textLineMarkerPattern = escapeStringRegexp(textLineMarker);

	const tokenPattern = new RegExp(
		`(?<header>(?<=^\\s*)(\\[)([^\\]]+)(])(?=\\s*$))|(?<marker>${textLineMarkerPattern}|${chordLineMarkerPattern})\\s*$|(?<inline_chord>(\\[)(\\S+)([^\\[()]*)(]))|(?<user_defined_chord>([A-Z][A-Za-z0-9#()+-°/]*)(\\[)([0-9]+\\|)?([0-9x_]+)(]))|(?<word>([[\\]/|%]+)|[^\\s\\[]+)|(?<ws>\\s+)`,
		"gd");

	const tokens: Token[] = [];
	const possibleChordOrRhythmTokens = new Map<Token, ChordInfo | "rhythm">;
	let wordTokenCount: number = 0;
	let markerValue: MarkerToken['value'] | null = null;
	let headerToken: HeaderToken | null = null;

	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(line)) !== null) {
		const indices = match.indices!.map(indexTuple => offsetIndex(indexTuple, lineIndex));
		const indexGroups = Object.fromEntries(
			Object.entries((match.indices!.groups!)).map(([group, index]) => [group, offsetIndex(index, lineIndex)])
		);

		const groups = match.groups!;

		if (groups.word) {
			const index = indexGroups.word!;

			const token: Token = {
				type: 'word',
				value: groups.word,
				index
			};

			const possibleRhythmToken = match[12];
			if (possibleRhythmToken) {
				possibleChordOrRhythmTokens.set(token, "rhythm");
			} else {
				const tonalJsChord = Chord.get(groups.word);
				const {tonic, type, aliases: typeAliases} = tonalJsChord;
				const chord = tonic ? {tonic, type, typeAliases, bass: tonalJsChord.bass || null} : null;

				if (chord) {
					possibleChordOrRhythmTokens.set(token, {
						chord,
						chordSymbol: groups.word,
						chordSymbolIndex: index
					});
				}
			}

			tokens.push(token);
			wordTokenCount++;
		} else if (groups.user_defined_chord) {
			const {0: chordSymbol} = match;
			const {0: chordSymbolIndex} = indices;
			const baseToken = {value: groups.user_defined_chord, index: indexGroups.user_defined_chord};
			const chord_name: string = chordSymbol.substring(0, chordSymbol.indexOf('['));
			let frets: string = chordSymbol.substring(chordSymbol.indexOf('[') + 1, chordSymbol.indexOf(']'));
			let position: string = "0";

			if (frets.includes('|')) {
				position = frets.substring(0, frets.indexOf('|'));
				frets = frets.substring(frets.lastIndexOf('|') + 1);
			}

			const chordToken: ChordToken = {
				value: baseToken.value,
				index: baseToken.index,
				type: "chord",
				chord: {
					tonic: "",
					type: "chord",
					typeAliases: [],
					bass: "",
					userDefinedChord: {
						frets,
						position: parseInt(position),
					}
				},
				chordSymbol: chord_name,
				chordSymbolIndex: [chordSymbolIndex[0], chordSymbolIndex[0] + chord_name.length],
			};
			tokens.push(chordToken);

		} else if (groups.inline_chord) {
			const {7: startTag, 8: chordSymbol, 9: auxText, 10: endTag} = match;
			const {7: startTagIndex, 8: chordSymbolIndex, 9: auxTextIndex, 10: endTagIndex} = indices;

			const tonalJsChord = Chord.get(chordSymbol);
			const {tonic, type, aliases: typeAliases} = tonalJsChord;
			const chord = tonic ? {tonic, type, typeAliases, bass: tonalJsChord.bass || null} : null;

			const baseToken = {value: groups.inline_chord, index: indexGroups.inline_chord};

			if (chord) {
				const chordToken: ChordToken = {
					...baseToken,
					type: "chord",
					chord,
					startTag: {value: startTag, index: startTagIndex},
					...(auxText && {auxText: {value: auxText, index: auxTextIndex}}),
					endTag: {value: endTag, index: endTagIndex},
					chordSymbol,
					chordSymbolIndex,
				};
				tokens.push(chordToken);
			} else {
				tokens.push({type: "word", ...baseToken});
			}
		} else if (groups.ws) {
			tokens.push({ type: 'whitespace', value: groups.ws, index: indexGroups.ws });

		} else if (groups.marker) {
			markerValue = groups.marker;
			tokens.push({ type: 'marker', value: markerValue, index: indexGroups.marker });

		} else if (groups.header) {
			const { 2: startTag, 3: headerName, 4: endTag } = match;
			const { 2: startTagIndex, 3: headerNameIndex, 4: endTagIndex } = indices;

			headerToken = {
				type: 'header',
				value: groups.header,
				index: indexGroups.header,
				startTag, headerName, endTag,
				startTagIndex, headerNameIndex, endTagIndex
			};

			tokens.push(headerToken);
		}
	}

	const isChordLine = markerValue === chordLineMarker
		? true
		: markerValue === textLineMarker
			? false
			: possibleChordOrRhythmTokens.size / wordTokenCount > 0.5;

	if (isChordLine) {
		for (const [token, tokenInfo] of possibleChordOrRhythmTokens) {
			if (tokenInfo === "rhythm") {
				token.type = "rhythm";
			} else {
				Object.assign(token, {type: "chord"}, tokenInfo);
			}
		}
	}

	return {tokens, isChordLine};
}

export function transposeTonic(chordTonic: string, direction: "up" | "down") {
	const transposedTonic = Note.transpose(chordTonic, direction === "up" ? "2m" : "-2m");
	return direction === "up" ? Note.enharmonic(transposedTonic) : Note.simplify(transposedTonic);
}

export function findDbChord(chordToken: ChordToken, instrumentChords: InstrumentChords) {
	const tonic = chordToken.chord.tonic;
	const tonicVariations = getTonicVariations(tonic);

	const availableTonicKeys = Object.keys(instrumentChords.chords);
	const tonicKey = availableTonicKeys.find(note => tonicVariations.includes(note));

	let dbChord: ChordDef | undefined;

	if (!tonicKey) {
		return null;
	}

	if (chordToken.chord.bass) {
		// First priority: Exact match with bass note
		const bassSuffix = `/${chordToken.chord.bass}`;
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => testChord.suffix === chordToken.chord.type + bassSuffix
		);
		if (dbChord) return dbChord;

		// Second priority: Alias match with bass note
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => chordToken.chord.typeAliases.some(alias => testChord.suffix === alias + bassSuffix)
		);
		if (dbChord) return dbChord;
	}

	// Third priority: Exact match without bass note
	dbChord = instrumentChords.chords[tonicKey].find(
		testChord => testChord.suffix === chordToken.chord.type
	);
	if (dbChord) return dbChord;

	// Fourth priority: Alias match without bass note
	dbChord = instrumentChords.chords[tonicKey].find(
		testChord => chordToken.chord.typeAliases.includes(testChord.suffix)
	);

	return dbChord ?? null;
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
