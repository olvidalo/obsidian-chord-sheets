import {SheetChord} from "../chordsUtils";

export interface Token {
	type: 'word' | 'chord' | 'whitespace' | 'marker' | 'header' | 'rhythm';
	value: string;
	range: [start: number, end: number];
}

interface SubToken {
	value: string;
	range: [start: number, end: number];
}

export interface ChordInfo {
	chord: SheetChord
	chordSymbol: SubToken

	inlineChord?: {
		openingBracket: SubToken
		auxText?: SubToken
		closingBracket: SubToken
	}

	userDefinedChord?: {
		openingBracket: SubToken
		closingBracket: SubToken
		position?: SubToken
		positionSeparator?: SubToken
		frets: SubToken
	}
}

export type ChordToken = Token & ChordInfo & {
	type: "chord"
};
export type RhythmToken = Token & {
	type: "rhythm"
};

export interface MarkerToken extends Token {
	type: 'marker',
}

export interface HeaderToken extends Token {
	type: 'header'
	openingBracket: SubToken
	headerName: SubToken
	closingBracket: SubToken
}

export interface TokenizedLine {
	tokens: Token[]
	isChordLine: boolean
}

export function isChordToken(token: Token | null | undefined): token is ChordToken {
	return token?.type === 'chord' && 'chord' in token;
}

export function isRhythmToken(token: Token | null | undefined): token is RhythmToken {
	return token?.type === 'rhythm';
}

export function isMarkerToken(token: Token | null | undefined): token is MarkerToken {
	return !!token && token.type === 'marker';
}

export function isHeaderToken(token: Token | null | undefined): token is HeaderToken {
	return !!token && token.type === 'header';
}
