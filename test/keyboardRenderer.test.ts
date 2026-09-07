import {Chord} from "tonal";
import {addCustomChordTypes} from "../src/customChordTypes";
import {getKeyboardRange, getKeyboardVoicings} from "../src/instruments/keyboardRenderer";

beforeAll(() => {
	addCustomChordTypes();
});

// MIDI numbers used below: C4 = 60, E4 = 64, G4 = 67, C5 = 72, E5 = 76, B5 = 83

describe("getKeyboardVoicings", () => {
	const voicings = (symbol: string) => getKeyboardVoicings(Chord.get(symbol));
	const midi = (symbol: string) => voicings(symbol).map(v => v.map(n => n.midi));
	const names = (symbol: string) => voicings(symbol).map(v => v.map(n => n.name));
	const roots = (symbol: string) => voicings(symbol).map(v => v.map(n => n.isRoot));

	describe("notes", () => {
		test("a triad has the root position and two inversions, each starting in octave 4", () => {
			expect(midi("C")).toEqual([
				[60, 64, 67],   // C4 E4 G4
				[64, 67, 72],   // E4 G4 C5
				[67, 72, 76],   // G4 C5 E5
			]);
		});

		test("a seventh chord has the root position and three inversions", () => {
			expect(midi("Cmaj7")).toEqual([
				[60, 64, 67, 71],
				[64, 67, 71, 72],
				[67, 71, 72, 76],
				[71, 72, 76, 79],
			]);
		});

		test("names follow the chord's spelling", () => {
			expect(names("Bb")[0]).toEqual(["Bb", "D", "F"]);
			expect(names("F#")[0]).toEqual(["F#", "A#", "C#"]);
		});

		test("double accidentals are simplified, single ones are kept", () => {
			// tonal spells Dbdim as Db Fb Abb
			expect(names("Dbdim")[0]).toEqual(["Db", "E", "G"]);
		});

		test("chord types that only exist as an alias in tonal are voiced correctly", () => {
			// Chord.get("Bmadd9").type is "" — which is also the alias of a major chord
			expect(names("Bmadd9")[0]).toEqual(["B", "D", "F#", "C#"]);
		});

		test("custom chord types are voiced", () => {
			expect(names("Cmmaj7")[0]).toEqual(["C", "Eb", "G", "B"]);
		});
	});

	describe("root", () => {
		test("the root is marked in every inversion", () => {
			expect(roots("C")).toEqual([
				[true, false, false],
				[false, false, true],
				[false, true, false],
			]);
		});

		test("the root is marked even when a foreign bass lies below it", () => {
			expect(roots("C/D")).toEqual([[false, true, false, false]]);
		});
	});

	describe("slash chords", () => {
		test("a chord tone as bass yields only the matching inversion", () => {
			expect(midi("C/E")).toEqual([[64, 67, 72]]);
			expect(midi("C/G")).toEqual([[67, 72, 76]]);
			expect(names("Am7/G")).toEqual([["G", "A", "C", "E"]]);
		});

		test("a bass outside the chord is placed below the chord", () => {
			expect(midi("C/D")).toEqual([[62, 72, 76, 79]]);   // D4 | C5 E5 G5
			expect(names("C/D")).toEqual([["D", "C", "E", "G"]]);
		});
	});

	test("a symbol tonal does not know yields no voicings", () => {
		// e.g. the chord name of a user-defined shape like Xy[x899xx]
		expect(voicings("Xy")).toEqual([]);
	});
});

describe("getKeyboardRange", () => {
	// Every chord gets the same two octaves from C4;
	// only chords reaching further get another octave.
	const range = (voicings: number[][]) => {
		const {fromMidi, toMidi} = getKeyboardRange(voicings.flat());
		return [fromMidi, toMidi];
	};

	test("a triad gets two octaves, C4–B5, however far its inversions reach", () => {
		expect(range([[60, 64, 67], [64, 67, 72], [67, 72, 76]])).toEqual([60, 83]);   // C
		expect(range([[62, 66, 69], [66, 69, 74], [69, 74, 78]])).toEqual([60, 83]);   // D
	});

	test("an empty keyboard, for the missing-diagram placeholder, gets two octaves", () => {
		expect(range([])).toEqual([60, 83]);
	});

	test("a slash chord with a single voicing gets the same two octaves", () => {
		expect(range([[64, 67, 72]])).toEqual([60, 83]);   // C/E
	});

	test("a chord reaching beyond the second octave gets a third", () => {
		// C13, last inversion: A4 C5 E5 G5 Bb5 D6
		expect(range([[60, 64, 67, 70, 74, 81], [69, 72, 76, 79, 82, 86]])).toEqual([60, 95]);
	});
});
