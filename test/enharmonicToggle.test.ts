import {getChordRangesForSheet} from "./utils/utils";
import {enharmonicToggle} from "../src/chordProcessing";
import {ChangeSet} from "@codemirror/state";

function enharmonicToggleSheet(sourceSheet: string) {
	const {text, chordRanges} = getChordRangesForSheet(sourceSheet);
	const changes = enharmonicToggle(chordRanges);
	return ChangeSet.of(changes, sourceSheet.length).apply(text).toString();
}

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
	})
})
