import { ChordType } from "tonal";

interface CustomChordType {
	intervals: string[];
	aliases: string[];
	name: string;
}

// Extensions in parentheses, like 7(5+) or m7(9), don't need aliases here, see chordExtensions.ts.
// The Brazilian notation (cifragem) writes some types differently: 7M, m7M, º, º7, 5+, 4 for sus4 (also used
// elsewhere, and far more common in chord sheets than tonal's quartal chord, which stays available as "quartal"),
// and in its older form without parentheses: m5-/7, m7-5, 5-/7, 7-5, m7+, m5+, m5-, 7-9, 5-.
const customChordTypes: CustomChordType[] = [
	extendChordType("7#5", { aliases: ["7+5"] }),
	extendChordType("M7", { aliases: ["7M"] }),
	extendChordType("mM7", { aliases: ["mmaj7", "m+7", "m7M", "m7+"] }),
	extendChordType("maj9", { aliases: ["M9", "9M"]}),
	extendChordType("m7b5", { aliases: ["m5-/7", "m7-5"] }),
	extendChordType("7b5", { aliases: ["5-/7", "7-5"] }),
	extendChordType("m#5", { aliases: ["m5+"] }),
	extendChordType("7b9", { aliases: ["7-9"] }),
	extendChordType("Mb5", { aliases: ["5-"] }),
	extendChordType("dim", { aliases: ["º", "m5-"] }),
	extendChordType("dim7", { aliases: ["º7"] }),
	extendChordType("sus4", { aliases: ["4"] }),
	extendChordType("aug", { aliases: ["5+"] }),
	{
		name: "suspended four sharp five",
		intervals: ["1P", "4P", "5A"],
		aliases: ["sus4#5"]
	},
	extendChordType("madd4", { aliases: ["madd11"] }),
	{
		name: "added eleventh",
		intervals: ["1P", "3M", "5P", "11P"],
		aliases: ["add11", "add4"]
	},
	{
		name: "seventh added eleventh",
		intervals: ["1P", "3M", "5P", "7m", "11P"],
		aliases: ["7add11", "7add4"]
	},
	{
		name: "ninth added eleventh",
		intervals: ["1P", "3M", "5P", "7m", "9M", "11P"],
		aliases: ["9add11"]
	},
	{
		name: "sixth added eleventh",
		intervals: ["1P", "3M", "5P", "6M", "11P"],
		aliases: ["6add11"]
	},
	{
		name: "suspended second seventh",
		intervals: ["1P", "2M", "5P", "7m"],
		aliases: ["7sus2"]
	},
	{
		name: "suspended second sixth",
		intervals: ["1P", "2M", "5P", "6M"],
		aliases: ["6sus2"]
	},
	{
		name: "suspended fourth sixth",
		intervals: ["1P", "4P", "5P", "6M"],
		aliases: ["6sus4"]
	},
	{
		name: "minor seventh added thirteenth",
		intervals: ["1P", "3m", "5P", "7m", "13M"],
		aliases: ["m7add13"]
	},
	{
		name: "major seventh added thirteenth",
		intervals: ["1P", "3M", "5P", "7M", "13M"],
		aliases: ["maj7add13"]
	},
	{
		name: "minor flat sixth",
		intervals: ["1P", "3m", "5P", "6m"],
		aliases: ["mb6"]
	},
	{
		name: "minor added flat ninth",
		intervals: ["1P", "3m", "5P", "9m"],
		aliases: ["mb9"]
	},
	{
		name: "minor seventh flat ninth",
		intervals: ["1P", "3m", "5P", "7m", "9m"],
		aliases: ["m7b9"]
	}
];

function extendChordType(type: string, chordTypeExtension: Partial<CustomChordType> ): CustomChordType {
	const originalChordType = ChordType.get(type);
	if (originalChordType.empty) {
		throw new Error(`Error while extending chord type: chord type ${type} not found.`);
	}
	const mergedAliases = [...originalChordType.aliases, ...(chordTypeExtension.aliases || [])];
	return {
		...originalChordType,
		...chordTypeExtension,
		aliases: mergedAliases
	};
}

export function addCustomChordTypes() {
	customChordTypes.forEach(({ intervals, aliases, name }) => {
		ChordType.add(intervals, aliases, name);
	});
}
