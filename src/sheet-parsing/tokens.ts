import {SheetChord} from "../chordsUtils";

export interface Token {
	type: 'word' | 'chord' | 'whitespace' | 'marker' | 'header' | 'rhythm';
	value: string;
	index: [start: number, end: number];
}

export interface ChordInfo {
	chord: SheetChord
	chordSymbol: string
	chordSymbolIndex: [start: number, end: number]

	startTag?: { value: string, index: [start: number, end: number] }
	auxText?: { value: string; index: [start: number, end: number] }
	endTag?: { value: string; index: [start: number, end: number] }
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
	startTag: string
	startTagIndex: [start: number, end: number]
	headerName: string
	headerNameIndex: [start: number, end: number]
	endTag: string
	endTagIndex: [start: number, end: number]
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
