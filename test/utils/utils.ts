import {ChordSymbolRange} from "../../src/editor-extension/chordSheetsViewPlugin";
import {isChordToken, tokenizeLine} from "../../src/chordsUtils";
import {Text} from "@codemirror/state";

export function getChordSymbolRangesForLine(line: string, lineIndex = 0): ChordSymbolRange[] {
	const {tokens} = tokenizeLine(line, lineIndex, '%c', '%t');

	return tokens
		.filter(isChordToken)
		.map(token => ({
			from: token.index[0] + token.chordSymbolIndex[0],
			to: token.index[0] + token.chordSymbolIndex[1],
			chordSymbol: token.chordSymbol,
			chord: token.chord
		}));
}

export function getChordRangesForSheet(sheet: string) {
	const text = Text.of(sheet.split('\n'));
	const chordRanges: ChordSymbolRange[] = [];
	for (let i = 1; i <= text.lines; i++) {
		const line = text.line(i);
		const chordRangesForLine = getChordSymbolRangesForLine(line.text, line.from);
		chordRanges.push(...chordRangesForLine);
	}
	return {text, chordRanges};
}
