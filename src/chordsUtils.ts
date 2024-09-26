import {Chord, Note} from "tonal";
import {ChordDef, IChordsDB, InstrumentChords} from "@tombatossals/chords-db";
import escapeStringRegexp from "escape-string-regexp";

export type Instrument = keyof IChordsDB;

export interface SheetChord {
	tonic: string,
	type: string,
	typeAliases: string[],
	bass: string | null
}

export interface Token {
	type: 'word' | 'chord' | 'whitespace' | 'marker' | 'header';
	value: string;
	index: number;
}

export interface ChordToken extends Token {
	type: 'chord'
	chord: SheetChord
}

export function isChordToken(token: Token | null | undefined): token is ChordToken {
	return !!token && token.type === 'chord' && 'chord' in token;
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
	headerName: string
	headerNameIndex: number
	endTag: string
	endTagIndex: number
}

export function isHeaderToken(token: Token | null | undefined): token is HeaderToken {
	return !!token && token.type === 'header';
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

export function tokenizeLine(line: string, chordLineMarker: string, textLineMarker: string): TokenizedLine | ChordLine {
	const chordLineMarkerPattern = escapeStringRegexp(chordLineMarker);
	const textLineMarkerPattern = escapeStringRegexp(textLineMarker);

	const tokenPattern = new RegExp(
		`(?<header>(?<=^\\s*)(\\[)([^\\]]+)(])(?=\\s*$))|(?<marker>${textLineMarkerPattern}|${chordLineMarkerPattern})\\s*$|(?<word>\\S+)|(?<ws>\\s+)`,
		"g");

	const tokens: Token[] = [];
	const wordTokens: Token[] = [];
	const chordTokens: ChordToken[] = [];
	let markerValue: MarkerToken['value'] | null = null;
	let headerToken: HeaderToken | null = null;

	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(line)) !== null) {
		if (match.groups?.word) {

			const tonalJsChord = Chord.get(match.groups.word);
			let chord: SheetChord | null = null;


			const {tonic, type, aliases: typeAliases} = tonalJsChord;
			if (tonic != null) {
				chord = {tonic, type, typeAliases, bass: tonalJsChord.bass || null};
			}

			const token: Token = {
				type: chord ? 'chord' : 'word',
				value: match.groups.word,
				index: match.index,
				...(chord && {chord})
			};
			tokens.push(token);
			wordTokens.push(token);
			if (chord) {
				chordTokens.push(token as ChordToken);
			}

		} else if (match.groups?.ws) {
			tokens.push({ type: 'whitespace', value: match.groups.ws, index: match.index });

		} else if (match.groups?.marker) {
			markerValue = match.groups.marker;
			tokens.push({ type: 'marker', value: markerValue, index: match.index });

		} else if (match.groups?.header) {
			const [ , , startTag, headerName, endTag] = match;
			const headerNameIndex = match.index + startTag.length;
			const endTagIndex = headerNameIndex + headerName.length;

			headerToken = {
				type: 'header',
				value: match.groups.header,
				index: match.index,
				startTag, headerName, endTag, headerNameIndex, endTagIndex
			};

			tokens.push(headerToken);
		}
	}

	const isChordLine = markerValue === chordLineMarker
		? true
		: markerValue === textLineMarker
			? false
			: chordTokens.length / wordTokens.length > 0.5;

	return {tokens, wordTokens, ...(isChordLine && { chordTokens })};
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
