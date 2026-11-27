import ChordsDB from "@tombatossals/chords-db";
import {
	getFretValues,
	findMatchingVoicingIndex,
	dbVoicingToDefinition
} from "../src/instruments/fretRenderer";
import { ChordDef } from "@tombatossals/chords-db";

describe("getFretValues", () => {
	test("parses compact fret notation", () => {
		expect(getFretValues("x32010")).toEqual([-1, 3, 2, 0, 1, 0]);
	});

	test("parses comma-separated multi-digit frets", () => {
		expect(getFretValues("x,10,12,12,11,x")).toEqual([-1, 10, 12, 12, 11, -1]);
	});

	test("parses a base-fret prefix", () => {
		expect(getFretValues("3|x32010")).toEqual([-1, 3, 2, 0, 1, 0]);
	});

	test("returns null for invalid notation", () => {
		expect(getFretValues("not-a-chord")).toBeNull();
	});
});

describe("findMatchingVoicingIndex", () => {
	const cMajor = ChordsDB.guitar.chords.C.find(chord => chord.suffix === "major")!;

	test("matches the first C major voicing", () => {
		expect(findMatchingVoicingIndex("x32010", cMajor)).toBe(0);
	});

	test("matches the first voicing with a base-fret prefix", () => {
		expect(findMatchingVoicingIndex("3|x32010", cMajor)).toBe(0);
	});

	test("returns -1 for an unmatched fingering", () => {
		expect(findMatchingVoicingIndex("x55555", cMajor)).toBe(-1);
	});

	test("returns -1 for a different number of strings", () => {
		expect(findMatchingVoicingIndex("3201", cMajor)).toBe(-1);
	});
});

describe("dbVoicingToDefinition", () => {
	const cMajor = ChordsDB.guitar.chords.C.find(chord => chord.suffix === "major")!;

	test("serializes the first C major voicing", () => {
		expect(dbVoicingToDefinition(cMajor, 0)).toBe("x32010");
	});

	test("serializes a voicing with a base-fret prefix", () => {
		expect(dbVoicingToDefinition(cMajor, 1)).toBe("3|x13331");
	});

	test("serializes double-digit frets with comma separators", () => {
		const chord = {
			positions: [{
				frets: [8, 10, 10, 10, 12, 8],
				baseFret: 8
			}]
		} as ChordDef;

		expect(dbVoicingToDefinition(chord, 0)).toBe("8|8,10,10,10,12,8");
	});
});
