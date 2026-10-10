import ChordsDB from "@tombatossals/chords-db";
import {Chord} from "tonal";
import {findDbChord, getTonicVariations} from "../src/instruments/fretRenderer";
import {addCustomChordTypes} from "../src/customChordTypes";

const guitar = ChordsDB.guitar;

beforeAll(() => {
	addCustomChordTypes();
});

describe("findDbChord", () => {

	describe("exact type match", () => {
		test("C resolves to the major suffix", () => {
			expect(findDbChord(Chord.get("C"), guitar)?.suffix).toBe("major");
		});

		test("Am resolves to the minor suffix", () => {
			const dbChord = findDbChord(Chord.get("Am"), guitar);
			expect(dbChord?.key).toBe("A");
			expect(dbChord?.suffix).toBe("minor");
		});
	});

	describe("alias match", () => {
		// tonal names these "dominant seventh" / "major seventh" etc. —
		// only the alias list contains the db suffix spelling
		test.each([
			["C7", "7"],
			["Cmaj7", "maj7"],
			["Cm7", "m7"],
			["Cdim7", "dim7"],
		])("%s resolves via alias to suffix %s", (symbol, expectedSuffix) => {
			expect(findDbChord(Chord.get(symbol), guitar)?.suffix).toBe(expectedSuffix);
		});

		test.each(["Csus4", "Csus", "C4"])("%s resolves to the single sus4 entry", (symbol) => {
			// the db used to carry a second "sus" list of the same chord; now only sus4 exists
			expect(findDbChord(Chord.get(symbol), guitar)?.suffix).toBe("sus4");
		});

		test.each([
			["Cmaj11", "maj11"],
			["Cmaj7sus2", "maj7sus2"],
			["Cmmaj9", "mmaj9"],
			["Caug9", "aug9"],
			["Cmaj7b5", "maj7b5"],
		])("%s resolves to the db suffix %s, which tonal doesn't know", (symbol, expectedSuffix) => {
			expect(findDbChord(Chord.get(symbol), guitar)?.suffix).toBe(expectedSuffix);
		});

		test("Cmmaj7 resolves via the custom chord type alias", () => {
			expect(findDbChord(Chord.get("Cmmaj7"), guitar)?.suffix).toBe("mmaj7");
		});
	});

	describe("tonic key resolution", () => {
		test("sharp tonics map to the db's 'sharp' spelling", () => {
			// chords-db uses Csharp/Fsharp instead of C#/F#
			expect(findDbChord(Chord.get("C#m"), guitar)?.suffix).toBe("minor");
			expect(findDbChord(Chord.get("F#7"), guitar)?.suffix).toBe("7");
		});

		test("flat tonics without a db key resolve enharmonically", () => {
			// no Db key in chords-db — resolves via C# -> Csharp
			expect(findDbChord(Chord.get("Db"), guitar)?.suffix).toBe("major");
		});

		test("sharp tonics without a db key resolve enharmonically", () => {
			// no Dsharp key in chords-db — resolves via Eb
			const dbChord = findDbChord(Chord.get("D#m"), guitar);
			expect(dbChord?.key).toBe("Eb");
			expect(dbChord?.suffix).toBe("minor");
		});
	});

	describe("slash chords", () => {
		test.each([
			["C/E", "/E"],
			["Cm/G", "m/G"],
			["C7/G", "7/G"],
		])("%s resolves to bass suffix %s", (symbol, expectedSuffix) => {
			expect(findDbChord(Chord.get(symbol), guitar)?.suffix).toBe(expectedSuffix);
		});

		test("a bass note without a db entry yields null instead of falling back to the bassless chord", () => {
			// chords-db has no "/D#" suffix for C
			expect(findDbChord(Chord.get("C/D#"), guitar)).toBeNull();
		});

		test("a chord type without a name doesn't resolve to the major chord over the bass", () => {
			// tonal's madd9 has no name, "" + "/G" would be the db's A/G
			expect(Chord.get("Amadd9/G").type).toBe("");
			expect(findDbChord(Chord.get("Amadd9/G"), guitar)).toBeNull();
		});
	});

	describe("not found", () => {
		test("an unknown chord type yields null", () => {
			const chord = {...Chord.get("C"), type: "quartal", aliases: ["4q"]};
			expect(findDbChord(chord, guitar)).toBeNull();
		});

		test("an unknown tonic yields null", () => {
			const chord = {...Chord.get("C"), tonic: "H"};
			expect(findDbChord(chord, guitar)).toBeNull();
		});
	});
});

describe("getTonicVariations", () => {
	test("sharp tonics include the chords-db 'sharp' spelling", () => {
		expect(getTonicVariations("C#")).toEqual(expect.arrayContaining(["C#", "Csharp"]));
	});

	test("flat tonics include the enharmonic sharp spellings", () => {
		expect(getTonicVariations("Db")).toEqual(expect.arrayContaining(["Db", "C#", "Csharp"]));
	});
});
