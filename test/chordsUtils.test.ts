import {parseChordSymbol, tokenizeChordSymbol, uniqueChordTokens} from "../src/chordsUtils";
import {tokenizeLine} from "../src/sheet-parsing/tokenizeLine";
import {isChordToken} from "../src/sheet-parsing/tokens";
import {addCustomChordTypes} from "../src/customChordTypes";

describe("tokenizeChordSymbol", () => {
	test("only a note after the last slash is a bass", () => {
		expect(tokenizeChordSymbol("C6/9/E")).toEqual(["C", "6/9", "E"]);
		expect(tokenizeChordSymbol("A7(4/9)")).toEqual(["A", "7(4/9)", ""]);
		expect(tokenizeChordSymbol("A7(4/9)/C#")).toEqual(["A", "7(4/9)", "C#"]);
		expect(tokenizeChordSymbol("D7/4")).toEqual(["D", "7/4", ""]);
		expect(tokenizeChordSymbol("Bm7/b5")).toEqual(["B", "m7/b5", ""]);
	});
});

describe("parseChordSymbol", () => {
	beforeAll(() => {
		addCustomChordTypes();
	});

	// same pitch classes over the same root and bass
	const expectSameChord = (symbol: string, equivalent: string) => {
		const chord = parseChordSymbol(symbol);
		const expected = parseChordSymbol(equivalent);
		expect(chord.empty).toBe(false);
		expect([chord.tonic, chord.chroma, chord.bass]).toEqual([expected.tonic, expected.chroma, expected.bass]);
	};

	test("recognizes extensions in parentheses (#56)", () => {
		expectSameChord("B7(b9)", "B7b9");
		expectSameChord("Cm7(b5)", "Cm7b5");
		expectSameChord("Cm(add9)", "Cmadd9");
		expectSameChord("C6(9)", "C69");
		expectSameChord("Cm(maj7)", "CmMaj7");
		expectSameChord("C7(b9,#11)", "C7b9#11");
		expectSameChord("C7(#11,b9)", "C7b9#11");
		expectSameChord("C#m7(b5)/G", "C#m7b5/G");
	});

	test("recognizes minor flat ninth chords (#56)", () => {
		expect(parseChordSymbol("Bm(b9)").intervals).toEqual(["1P", "3m", "5P", "9m"]);
		expect(parseChordSymbol("Bm7(b9)").intervals).toEqual(["1P", "3m", "5P", "7m", "9m"]);
	});

	test("recognizes the Brazilian notation (cifragem)", () => {
		expectSameChord("D7(9)", "D9");
		expectSameChord("C(9)", "Cadd9");
		expectSameChord("D7M", "Dmaj7");
		expectSameChord("D7M(9)", "Dmaj9");
		expectSameChord("Cm7M", "CmMaj7");
		expectSameChord("Bm7(5-)", "Bm7b5");
		expectSameChord("Bm7(5b)", "Bm7b5");
		expectSameChord("E7(9-)", "E7b9");
		expectSameChord("E7(9+)", "E7#9");
		expectSameChord("A7(4)", "A7sus4");
		expectSameChord("D7/4", "D7sus4");
		expectSameChord("A4/7", "A7sus4");
		expectSameChord("A7(4/9)", "A9sus4");
		expectSameChord("A7(4/9)/C#", "A9sus4/C#");
		expectSameChord("D7/4(9)", "D9sus4");
		expectSameChord("C6(9/11+)", "C69#11");
		expectSameChord("Cº", "Cdim");
		expectSameChord("Cº7", "Cdim7");
		expectSameChord("C5+", "Caug");
	});

	test("reads 4 as sus4, not tonal's quartal chord", () => {
		expectSameChord("D4", "Dsus4");
		expectSameChord("G4(6)", "G6sus4");
		expectSameChord("G4/6", "G6sus4");
		expectSameChord("E4(7/9)", "E9sus4");
		expectSameChord("E4/7/9", "E9sus4");
		expectSameChord("D7/9/11", "D9add11");
		expectSameChord("Cquartal", "Cquartal");
		expect(parseChordSymbol("Cquartal").notes).toEqual(["C", "F", "Bb", "Eb"]);
	});

	test("recognizes the older Brazilian notation without parentheses", () => {
		expectSameChord("Bm5-/7", "Bm7b5");
		expectSameChord("Bm7-5", "Bm7b5");
		expectSameChord("Bb5-/7", "Bb7b5");
		expectSameChord("D7-5", "D7b5");
		expectSameChord("Am7+", "AmMaj7");
		expectSameChord("Bm5+", "Bm#5");
		expectSameChord("Dm5-", "Ddim");
		expectSameChord("B7-9", "B7b9");
		expectSameChord("F#5-", "F#Mb5");
		// but 7+ stays augmented, as tonal has it
		expectSameChord("A7+", "A7#5");
	});

	test("an added degree keeps the chord tones, a plain 4 suspends the third", () => {
		expectSameChord("C(add4)", "Cadd4");
		expectSameChord("C7(add4)", "C7add4");
		expect(parseChordSymbol("C(add4)").notes).toContain("E");
		expectSameChord("C7(4)", "C7sus4");
	});

	test("accepts add2, but not a plain 2, which is sus2 in cifragem and add9 elsewhere", () => {
		expectSameChord("D(add2)", "Dadd9");
		expectSameChord("Am(add2)", "Amadd9");
		expect(parseChordSymbol("D(2)").empty).toBe(true);
	});

	test("recognizes chord types tonal doesn't have", () => {
		expectSameChord("Dadd4", "Dadd11");
		expectSameChord("Amadd11", "Amadd4");
		expectSameChord("A7(11)", "A7add11");
		expectSameChord("A7/11", "A7add4");
		expect(parseChordSymbol("D9(11)").notes).toEqual(["D", "F#", "A", "C", "E", "G"]);
		expect(parseChordSymbol("D6(11)").notes).toEqual(["D", "F#", "A", "B", "G"]);
		expect(parseChordSymbol("D7sus2").notes).toEqual(["D", "E", "A", "C"]);
		expect(parseChordSymbol("G6sus2").notes).toEqual(["G", "A", "D", "E"]);
		expect(parseChordSymbol("D6sus4").notes).toEqual(["D", "G", "A", "B"]);
		expectSameChord("Am7/13", "Am7add13");
		expectSameChord("C7M(6)", "Cmaj7add13");
		expect(parseChordSymbol("Am(b6)").notes).toEqual(["A", "C", "E", "F"]);
	});

	test("recognizes a degree after a slash as an extension", () => {
		expectSameChord("Bm7/b5", "Bm7b5");
		expectSameChord("E7/b9", "E7b9");
		expectSameChord("A7/9", "A9");
	});

	test("ignores a trailing slash (rhythm)", () => {
		expectSameChord("G/", "G");
		expectSameChord("Em7/", "Em7");
	});

	test("keeps the custom types written with parentheses", () => {
		expectSameChord("C7(5+)", "C7#5");
		expectSameChord("C7(+5)", "C7#5");
		expectSameChord("Am7(9)", "Am9");
		expectSameChord("C4(5+)", "Csus4#5");
	});

	test("does not turn other things in parentheses into chords", () => {
		for (const symbol of ["C(x2)", "A(men)", "Ah,", "E5(VII)", "G(PM)", "E(barre)", "D(G)", "D(2)", "G5/A5"]) {
			expect(parseChordSymbol(symbol).empty).toBe(true);
		}
	});
});

describe("uniqueChordTokens", () => {
	const unique = (line: string) => uniqueChordTokens(tokenizeLine(line, 0, "%c", "%t").tokens.filter(isChordToken)).map(t => t.value);

	test("keeps the first occurrence of a symbol", () => {
		expect(unique("C G C Am G")).toEqual(["C", "G", "Am"]);
	});

	test("a symbol with its own definition is another chord", () => {
		expect(unique("C C[x32010] C C7[3 7 9] C7[1 5 | 3 b7 9] C7[3 7 9]")).toEqual(["C", "C[x32010]", "C7[3 7 9]", "C7[1 5 | 3 b7 9]"]);
	});

	test("inline chords count by symbol, whatever the brackets contain", () => {
		expect(unique("[Am]Some [Am aux]text [Am]")).toEqual(["[Am]"]);
	});
});
