import {Chord} from "tonal";
import {addCustomChordTypes} from "../src/customChordTypes";
import {parseChordSymbol} from "../src/chordsUtils";
import {NoDiagramError} from "../src/instruments/types";
import {userDefinedVoicing, getKeyboardRange, getKeyboardVoicings, KeyboardDiagramRenderer} from "../src/instruments/keyboardRenderer";

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
			expect(names("Dbdim")[0]).toEqual(["Db", "Fb", "G"]);
			expect(names("Db7/Cb")[3]).toEqual(["Cb", "Db", "F", "Ab"]);
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
		test("a chord tone as bass yields all inversions, in root position order", () => {
			expect(midi("C/E")).toEqual(midi("C"));
			expect(names("Am7/G")[0]).toEqual(["A", "C", "E", "G"]);
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

describe("userDefinedVoicing", () => {
	const voicing = (definition: string, symbol: string) => userDefinedVoicing(definition, parseChordSymbol(symbol));
	const names = (definition: string, symbol: string) => voicing(definition, symbol)?.map(n => n.name);

	test("note names are placed as written, lowest first", () => {
		expect(voicing("E G B D", "Cmaj7")?.map(n => n.midi)).toEqual([64, 67, 71, 74]);
		expect(voicing("G C E", "C")?.map(n => n.isRoot)).toEqual([false, true, false]);
	});

	test("degrees mean the chord's own tones, alterations are explicit", () => {
		expect(names("3 7 9", "C7")).toEqual(["E", "Bb", "D"]);
		expect(names("3 7 9", "Cmaj7")).toEqual(["E", "B", "D"]);
		expect(names("1 b3 5", "C")).toEqual(["C", "Eb", "G"]);
		expect(names("b9 #11 13", "C7")).toEqual(["Db", "F#", "A"]);
		expect(names("b9", "Db7")).toEqual(["D"]);   // Ebb, shown simplified
		expect(names("1 5 | b7 9 3", "Dm7")).toEqual(["D", "A", "C", "E", "F"]);   // b7 lowers C#, not "C#b"
		expect(names("#4", "F")).toEqual(["B"]);   // Bb raised
		expect(voicing("1 5", "C")?.map(n => n.isRoot)).toEqual([true, false]);
	});

	test("a bar splits the hands, the right hand stacks above the left", () => {
		const hands = voicing("1 5 | 3 b7 9", "C7");
		expect(hands?.map(n => n.hand)).toEqual(["left", "left", "right", "right", "right"]);
		expect(hands?.map(n => n.midi)).toEqual([60, 67, 76, 82, 86]);   // C4 G4 | E5 Bb5 D6
		expect(voicing("E G B", "C")?.every(n => n.hand === undefined)).toBe(true);
	});

	test("rejects what is not a keyboard voicing, saying why", () => {
		expect(() => voicing("x02210", "C")).toThrow(NoDiagramError);
		expect(() => voicing("32233", "Bb")).toThrow("Not a chord degree (1 to 13): 32233");
		expect(() => voicing("1 | 3 | 5", "C")).toThrow(NoDiagramError);
		expect(() => voicing("1 |", "C")).toThrow(NoDiagramError);
		expect(() => voicing("3 5", "Xy")).toThrow(NoDiagramError);
	});
});

describe("KeyboardDiagramRenderer.getDiagram", () => {
	const diagram = (symbol: string) => new KeyboardDiagramRenderer("piano", "Piano").getDiagram(parseChordSymbol(symbol), symbol);

	test("starts on the voicing written in the sheet", () => {
		expect(diagram("C").initialVoicing).toBe(0);
		expect(diagram("C/E").initialVoicing).toBe(1);
		expect(diagram("C/G").initialVoicing).toBe(2);
		expect(diagram("C/D").initialVoicing).toBe(0);
		expect(diagram("C6/9/E").initialVoicing).toBe(1);
	});

	test("names every voicing as it would be written in the sheet", () => {
		const names = (symbol: string) => {
			const {numVoicings, voicingName} = diagram(symbol);
			return Array.from({length: numVoicings}, (_, i) => voicingName!(i));
		};
		expect(names("C")).toEqual(["C", "C/E", "C/G"]);
		expect(names("C/E")).toEqual(["C", "C/E", "C/G"]);
		expect(names("Am7/G")).toEqual(["Am7", "Am7/C", "Am7/E", "Am7/G"]);
		expect(names("C6/9").slice(0, 2)).toEqual(["C6/9", "C6/9/E"]);
		expect(names("Db7/Cb")[3]).toEqual("Db7/Cb");
		expect(names("C/D")).toEqual(["C/D"]);
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
