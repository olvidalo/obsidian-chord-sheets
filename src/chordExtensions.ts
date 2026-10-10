import {ChordType, Interval, Pcset} from "tonal";

// Chord types with extensions in parentheses, which tonal's dictionary doesn't contain (#56): 7(b9), m(add9), and
// the Brazilian notation (cifragem, see Cifra Club's "padrão de cifragem"), e.g. 7M(9), m7(5-), 7(4/9), 6(9/11+).
// Degrees can also follow slashes instead, or before the parentheses: m7/b5, 7/9/11, 7/4(9).
// The degrees are applied to the type before them. The result is looked up by its pitch classes,
// so 7(9) is the dominant ninth and 7(#11,b9) the same as 7b9#11.
// Cifra Club notation reference:
// https://suporte.cifraclub.com.br/pt-BR/support/solutions/articles/64000308284-conheca-o-padr%C3%A3o-de-cifragem-de-acordes-do-cifra-club
const EXTENDED_TYPE = /^(?<base>[^(/]*)(?:\/(?<afterSlash>[^()]+))?(?:\((?<inParentheses>[^()]*)\))?$/;

// A degree, altered before or after it by b/# or -/+: 9, b9, -9, 9-, 9b, #11, 11+, add9. 7M is the major seventh.
const DEGREE = /^(?<add>add)?(?<before>[-+b#]?)(?<num>2|4|5|6|7|9|11|13)(?<after>[-+b#M]?)$/;

// The unaltered degrees. In chord symbols, a plain 7 is the minor seventh.
const NATURAL: Record<string, string> = {"2": "2M", "4": "4P", "5": "5P", "6": "6M", "7": "7m", "9": "9M", "11": "11P", "13": "13M"};

// The chroma of the extended chord type, to look it up in tonal's dictionary.
export function extendedTypeChroma(type: string): string | null {
	const match = type.match(EXTENDED_TYPE)?.groups;
	const base = ChordType.get(match?.base ?? "");
	const degrees = [match?.afterSlash, match?.inParentheses].filter(Boolean).join("/").split(/[/,]/);
	if (!match || base.empty || !degrees[0]) {
		return null;
	}

	let intervals = base.intervals;
	for (const degree of degrees) {
		const parsedDegree = parseDegree(degree);
		if (!parsedDegree) {
			return null;
		}
		intervals = [...intervals.filter(i => Interval.get(i).num !== parsedDegree.replaces), parsedDegree.interval];
	}
	return Pcset.get(intervals).chroma;
}

// One degree: the interval it brings in, and the degree of the chord it replaces, if any.
function parseDegree(degree: string): { interval: string, replaces: number | null } | null {
	const match = (degree === "maj7" ? "7M" : degree).match(DEGREE)?.groups;
	if (!match || (match.before && match.after)) {
		return null;
	}
	const added = Boolean(match.add);
	const num = Number(match.num);
	// a plain 2 is ambiguous: sus2 in cifragem, add9 elsewhere
	if (num === 2 && !added) {
		return null;
	}
	const interval = alteredInterval(match.num, match.before || match.after);
	if (!interval) {
		return null;
	}
	const replaces = added
		? null
		// a 4 suspends the third
		: num === 4
			? 3
			// an altered fifth or seventh replaces the plain one
			: num === 5 || num === 7
				? num
				: null;
	// everything else is added, as is any degree written with add
	return {interval, replaces};
}

function alteredInterval(num: string, alteration: string): string | null {
	if (alteration === "M") {
		return num === "7" ? "7M" : null;
	}

	const natural = NATURAL[num];
	if (alteration === "b" || alteration === "-") return Interval.subtract(natural, "1A") ?? null;
	if (alteration === "#" || alteration === "+") return Interval.add(natural, "1A") ?? null;
	return natural;
}
