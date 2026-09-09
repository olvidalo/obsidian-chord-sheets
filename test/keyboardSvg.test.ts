import {handDividerX, isWhiteKey, KeyMarker, labelRowsOf, layOutKeys} from "../src/instruments/keyboardSvg";

// C4 = 60, C#4 = 61, B4 = 71, A#4 = 70

describe("layOutKeys", () => {
	test("one octave has seven white keys side by side and five black keys between them", () => {
		const keys = layOutKeys({fromMidi: 60, toMidi: 71});

		expect(keys).toHaveLength(12);
		expect(keys.filter(key => key.isWhite).map(key => key.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);

		const blackKeys = keys.filter(key => !key.isWhite);
		expect(blackKeys.map(key => key.midi)).toEqual([61, 63, 66, 68, 70]);
		// a black key straddles the gap: its centre lies exactly on the edge between two white keys
		expect(blackKeys.map(key => key.x + 0.31)).toEqual([1, 2, 4, 5, 6]);
	});

	test("a range starting or ending on a black key is widened to the white keys around it", () => {
		const keys = layOutKeys({fromMidi: 61, toMidi: 70});
		expect(keys[0].midi).toBe(60);
		expect(keys[keys.length - 1].midi).toBe(71);
	});
});

describe("isWhiteKey", () => {
	test("C D E F G A B are white, the rest black", () => {
		expect([60, 62, 64, 65, 67, 69, 71].every(isWhiteKey)).toBe(true);
		expect([61, 63, 66, 68, 70].some(isWhiteKey)).toBe(false);
	});
});

describe("labelRowsOf", () => {
	const keys = layOutKeys({fromMidi: 60, toMidi: 83});
	const keyOf = new Map(keys.map(key => [key.midi, key]));
	const rows = (midis: number[]) => {
		const markers = midis.map(midi => ({midi, label: "", emphasized: false}));
		return markers.map(marker => labelRowsOf(markers, keyOf).get(marker));
	};

	test("labels stay in one row unless their keys are neighbours", () => {
		expect(rows([60, 64, 67])).toEqual([0, 0, 0]);        // C E G
		expect(rows([64, 65])).toEqual([0, 0]);               // E F: neighbouring white keys, a full key apart
		expect(rows([67, 68])).toEqual([0, 1]);               // G G#
		expect(rows([60, 61, 62])).toEqual([0, 1, 0]);        // C C# D
	});
});

describe("handDividerX", () => {
	const keys = layOutKeys({fromMidi: 60, toMidi: 95});
	const markers = (left: number[], right: number[]): KeyMarker[] => [
		...left.map(midi => ({midi, label: "", emphasized: false, hand: "left" as const})),
		...right.map(midi => ({midi, label: "", emphasized: false, hand: "right" as const}))
	];

	test("no line without a hand split", () => {
		expect(handDividerX(keys, [{midi: 60, label: "C", emphasized: true}])).toBeNull();
	});

	test("on the white key edge nearest to the middle of the gap", () => {
		expect(handDividerX(keys, markers([60, 67], [76, 82, 86]))).toBe(7);   // C4 G4 | E5: between B4 and C5
		expect(handDividerX(keys, markers([67], [69]))).toBe(5);              // G4 | A4
	});

	test("moves to the edge of a pressed black key sitting on that edge", () => {
		expect(handDividerX(keys, markers([67], [68, 71]))).toBeCloseTo(4.69);   // G4 | G#4: left edge of G#
		expect(handDividerX(keys, markers([70], [71, 74]))).toBeCloseTo(6.31);   // Bb4 | B4: right edge of Bb
	});
});
