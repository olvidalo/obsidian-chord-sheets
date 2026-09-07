import {enharmonicToggle, replaceChordSymbol, transpose} from "../src/chordProcessing";
import {ChangeSet, ChangeSpec, Text} from "@codemirror/state";
import {testingSong} from "./data/testing-song";
import {testingSongInline} from "./data/testing-song-inline";
import {ChordSymbolRange} from "../src/editor-extension/chordSheetsViewPlugin";

import {isChordToken} from "../src/sheet-parsing/tokens";
import {tokenizeLine} from "../src/sheet-parsing/tokenizeLine";

export function getChordSymbolRangesForLine(line: string, lineIndex = 0): ChordSymbolRange[] {
	const {tokens} = tokenizeLine(line, lineIndex, '%c', '%t');

	return tokens
		.filter(isChordToken)
		.map(token => ({
			from: token.range[0] + token.chordSymbol.range[0],
			to: token.range[0] + token.chordSymbol.range[1],
			chordSymbol: token.chordSymbol.value,
			chord: token.chord,
			tokenTo: token.range[1],
			trailingSpaces: token.trailingSpaces ?? 0
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

function applyToSheet(sourceSheet: string, changes: ChangeSpec[]) {
	return ChangeSet.of(changes, sourceSheet.length).apply(Text.of(sourceSheet.split('\n'))).toString();
}

function enharmonicToggleSheet(sourceSheet: string) {
	return applyToSheet(sourceSheet, enharmonicToggle(getChordRangesForSheet(sourceSheet).chordRanges));
}

function transposeSheet(sourceSheet: string, direction: "up" | "down") {
	return applyToSheet(sourceSheet, transpose(getChordRangesForSheet(sourceSheet).chordRanges, direction));
}

describe('Transposition', () => {

	test('should transpose a simple chord', () => {
		const chordRanges = getChordSymbolRangesForLine('Am');
		const changes = transpose(chordRanges, "up");

		expect(changes).toEqual([
			{ from: 0, to: 2, insert: 'A#m' }
		]);
	});

	test('should transpose simple chords up', () => {
		const chordRanges = getChordSymbolRangesForLine('Am C');
		const changes = transpose(chordRanges, "up");

		expect(changes).toEqual([
			{ from: 0, to: 2, insert: 'A#m' },
			{ from: 3, to: 4, insert: 'C#' }
		]);
	});

	test('should transpose slash chords up', () => {
		const chordRanges = getChordSymbolRangesForLine('C/G');
		const changes = transpose(chordRanges, "up");

		expect(changes).toEqual([
			{ from: 0, to: 3, insert: 'C#/G#' }
		]);
	});

	test('should transpose chords down', () => {
		const chordRanges = getChordSymbolRangesForLine('Dm7 Bbmaj7 C/G');
		const changes = transpose(chordRanges, "down");

		expect(changes).toEqual([
			{ from: 0, to: 3, insert: 'C#m7' },
			{ from: 4, to: 10, insert: 'Amaj7' },
			{ from: 10, insert: ' ' },
			{ from: 11, to: 14, insert: 'B/F#' },
		]);
	});

	test('should transpose inline chords', () => {
		const chordRanges = getChordSymbolRangesForLine('[Am]Some [Cmaj7/G]text [Dm7/C aux text]');
		const changes = transpose(chordRanges, "up");
		expect(changes).toEqual([
			{ from: 1, to: 3, insert: 'A#m' },
			{ from: 10, to: 17, insert: 'C#maj7/G#' },
			{ from: 24, to: 29, insert: 'D#m7/C#' },
		]);
	});

	test('should not transpose user-defined chords', () => {
		const chordRanges = getChordSymbolRangesForLine('Am*[x02210]');
		const changes = transpose(chordRanges, "up");

		expect(changes).toEqual([]);
	});



	function testTransposeSheet(
		direction: "up" | "down",
		testCases: [index: string, sheet: string][]
	) {
		test.each(testCases.slice(1))(`should transpose %d step(s) ${direction}`, (index, transposedSheet) => {
			const sourceSheet = testCases[parseInt(index) - 1][1];
			expect(transposeSheet(sourceSheet, direction)).toEqual(transposedSheet);
		});
	}

	describe('should correctly transpose longer sheets, chords-over-lyrics', () => {

		const upwardsTests: [index: string, sheet: string][] = Object.entries([testingSong.orig, ...testingSong.up]);
		const downwardsTests: [index: string, sheet: string][] = Object.entries([testingSong.orig, ...testingSong.down]);

		testTransposeSheet("up", upwardsTests);
		testTransposeSheet("down", downwardsTests);
	});

	describe('should correctly transpose longer sheets, inline chords', () => {
		const upwardsTests: [index: string, sheet: string][] = Object.entries([testingSongInline.orig, ...testingSongInline.up]);
		const downwardsTests: [index: string, sheet: string][] = Object.entries([testingSongInline.orig, ...testingSongInline.down]);

		testTransposeSheet("up", upwardsTests);
		testTransposeSheet("down", downwardsTests);

	});
});

describe("Alignment: spaces after a chord absorb the symbol's length change", () => {
	test("removes as many spaces as the symbol grows", () => {
		expect(transpose(getChordSymbolRangesForLine("C    G"), "up")).toEqual([
			{from: 0, to: 1, insert: "C#"},
			{from: 1, to: 2},
			{from: 5, to: 6, insert: "G#"}
		]);
		expect(transposeSheet("C    G", "up")).toEqual("C#   G#");
		expect(transposeSheet("C/G   Am", "up")).toEqual("C#/G# A#m");
	});

	test("keeps at least one space", () => {
		expect(transposeSheet("C G", "up")).toEqual("C# G#");
		expect(transposeSheet("C/G  Am", "up")).toEqual("C#/G# A#m");
	});

	test("inserts spaces when the symbol shrinks", () => {
		expect(enharmonicToggleSheet("Cb  Dm")).toEqual("B   Dm");
		expect(transposeSheet("C#   G", "down")).toEqual("C    F#");
	});

	test("does nothing without spaces after the token", () => {
		expect(transposeSheet("C#", "down")).toEqual("C");
		expect(transposeSheet("C\tG", "up")).toEqual("C#\tG#");
	});

	test("never touches inline chords", () => {
		expect(transposeSheet("[C]   [G]", "up")).toEqual("[C#]   [G#]");
	});

	test("treats following words like chords", () => {
		expect(transposeSheet("C   G   (x2)", "up")).toEqual("C#  G#  (x2)");
	});

	test("adjusts after the whole token, including a fingering", () => {
		expect(enharmonicToggleSheet("Cb*[x02210]   C")).toEqual("B*[x02210]    C");
	});

	test("round trip keeps the columns, and the width when there was a space to spare", () => {
		expect(transposeSheet(transposeSheet("C   G", "up"), "down")).toEqual("C   G");
		expect(transposeSheet(transposeSheet("C G", "up"), "down")).toEqual("C  G");
	});

	test("replaceChordSymbol", () => {
		const [first] = getChordSymbolRangesForLine("C/E  G");
		expect(applyToSheet("C/E  G", replaceChordSymbol([first], "C"))).toEqual("C    G");
	});
});

describe("Enharmonic toggle", () => {
	test("should toggle enharmonically, simple chords, # -> b", () => {
		expect(enharmonicToggleSheet("A#m C# G#")).toEqual("Bbm Db Ab");
	});

	test("should toggle enharmonically, simple chords, b -> #", () => {
		expect(enharmonicToggleSheet("Bbm Db Ab")).toEqual( "A#m C# G#");
	});

	test("should toggle enharmonically, complex chords", () => {
		expect(enharmonicToggleSheet("F#add9 F#7b5 C#maj7 C#6 C#maj7")).toEqual("Gbadd9 Gb7b5 Dbmaj7 Db6 Dbmaj7");
		expect(enharmonicToggleSheet("Gbadd9 Gb7b5 Dbmaj7 Db6 Dbmaj7")).toEqual("F#add9 F#7b5 C#maj7 C#6 C#maj7");
	});

	test("should toggle enharmonically, slash chords", () => {
		expect(enharmonicToggleSheet("C#maj7/D# - A#m7/F# - F#maj7/G# - Fm7/C - A#m7/D# - D#m7/G# - C#maj7/F - C#/G#"))
			.toEqual("Dbmaj7/Eb - Bbm7/Gb - Gbmaj7/Ab - Fm7/C - Bbm7/Eb - Ebm7/Ab - Dbmaj7/F - Db/Ab");
	});
});
