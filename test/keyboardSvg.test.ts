import {isWhiteKey, layOutKeys} from "../src/instruments/keyboardSvg";

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
