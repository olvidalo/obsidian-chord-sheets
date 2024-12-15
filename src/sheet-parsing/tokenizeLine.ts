import {ChordInfo, ChordToken, HeaderToken, MarkerToken, Token, TokenizedLine} from "./tokens";
import escapeStringRegexp from "escape-string-regexp";
import {Chord} from "tonal";

function offsetIndex(indexArray: [number, number], offset: number): [number, number] {
	return indexArray && [indexArray[0] + offset, indexArray[1] + offset];
}

function relativeIndex(indexArray: [number, number], matchIndex: number): [number, number] {
	return indexArray && [indexArray[0] - matchIndex, indexArray[1] - matchIndex];
}

export function tokenizeLine(line: string, lineIndex: number, chordLineMarker: string, textLineMarker: string): TokenizedLine {
	const chordLineMarkerPattern = escapeStringRegexp(chordLineMarker);
	const textLineMarkerPattern = escapeStringRegexp(textLineMarker);

	const tokenPattern = new RegExp(
		`(?<header>(?<=^\\s*)(\\[)([^\\]]+)(])(?=\\s*$))|(?<marker>${textLineMarkerPattern}|${chordLineMarkerPattern})\\s*$|(?<inline_chord>(\\[)([^\\s\\]]+)([^\\[()]*)(]))|(?<user_defined_chord>([A-Z][A-Za-z0-9#()+-°/*]*)\\[(([0-9]+)\\|)?([0-9x_]+)])|(?<word>([[\\]/|%]+)|[^\\s\\[]+)|(?<ws>\\s+)`,
		"gd");

	const tokens: Token[] = [];
	const possibleChordOrRhythmTokens = new Map<Token, ChordInfo | "rhythm">;
	let wordTokenCount: number = 0;
	let markerValue: MarkerToken['value'] | null = null;
	let headerToken: HeaderToken | null = null;
	let hasUserDefinedChord = false;

	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(line)) !== null) {
		const indices = match.indices!.map(indexTuple => offsetIndex(indexTuple, lineIndex));
		const indexGroups = Object.fromEntries(
			Object.entries((match.indices!.groups!)).map(([group, index]) => [group, offsetIndex(index, lineIndex)])
		);

		const groups = match.groups!;

		if (groups.word) {
			const index = indexGroups.word!;

			const token: Token = {
				type: 'word',
				value: groups.word,
				index
			};

			const possibleRhythmToken = match[17];
			if (possibleRhythmToken) {
				possibleChordOrRhythmTokens.set(token, "rhythm");
			} else {
				const tonalJsChord = Chord.get(groups.word);
				const {tonic, type, aliases: typeAliases} = tonalJsChord;
				const chord = tonic ? {tonic, type, typeAliases, bass: tonalJsChord.bass || null} : null;

				if (chord) {
					possibleChordOrRhythmTokens.set(token, {
						chord,
						chordSymbol: groups.word,
						chordSymbolIndex: relativeIndex(index, index[0])
					});
				}
			}

			tokens.push(token);
			wordTokenCount++;
		} else if (groups.user_defined_chord) {
			const {12: chordSymbol, 14: position, 15: frets} = match;
			const {12: chordSymbolIndex} = indices;

			const chordToken: ChordToken = {
				value: groups.user_defined_chord,
				index: indexGroups.user_defined_chord,
				type: "chord",
				chord: {
					tonic: "",
					type: "chord",
					typeAliases: [],
					bass: "",
					userDefinedChord: {
						frets,
						position: position ? parseInt(position) : 0,
					}
				},
				chordSymbol,
				chordSymbolIndex: relativeIndex(chordSymbolIndex, indexGroups.user_defined_chord[0]),
			};
			tokens.push(chordToken);
			hasUserDefinedChord = true;

		} else if (groups.inline_chord) {
			const {7: startTag, 8: chordSymbol, 9: auxText, 10: endTag} = match;
			const {7: startTagIndex, 8: chordSymbolIndex, 9: auxTextIndex, 10: endTagIndex} = indices.map(
				index => relativeIndex(index, indexGroups.inline_chord[0])
			);

			const tonalJsChord = Chord.get(chordSymbol);
			const {tonic, type, aliases: typeAliases} = tonalJsChord;
			const chord = tonic ? {tonic, type, typeAliases, bass: tonalJsChord.bass || null} : null;

			const baseToken = {value: groups.inline_chord, index: indexGroups.inline_chord};

			if (chord) {
				const chordToken: ChordToken = {
					...baseToken,
					type: "chord",
					chord,
					startTag: {value: startTag, index: startTagIndex},
					...(auxText && {auxText: {value: auxText, index: auxTextIndex}}),
					endTag: {value: endTag, index: endTagIndex},
					chordSymbol,
					chordSymbolIndex,
				};
				tokens.push(chordToken);
			} else {
				tokens.push({type: "word", ...baseToken});
			}
		} else if (groups.ws) {
			tokens.push({type: 'whitespace', value: groups.ws, index: indexGroups.ws});

		} else if (groups.marker) {
			markerValue = groups.marker;
			tokens.push({type: 'marker', value: markerValue, index: indexGroups.marker});

		} else if (groups.header) {
			const {2: startTag, 3: headerName, 4: endTag} = match;
			const {2: startTagIndex, 3: headerNameIndex, 4: endTagIndex} = indices.map(
				index => relativeIndex(index, indexGroups.header[0])
			);

			headerToken = {
				type: 'header',
				value: groups.header,
				index: indexGroups.header,
				startTag, headerName, endTag,
				startTagIndex, headerNameIndex, endTagIndex
			};

			tokens.push(headerToken);
		}
	}

	const isChordLine = markerValue === chordLineMarker
		? true
		: markerValue === textLineMarker
			? false
			: hasUserDefinedChord || possibleChordOrRhythmTokens.size / wordTokenCount > 0.5;

	if (isChordLine) {
		for (const [token, tokenInfo] of possibleChordOrRhythmTokens) {
			if (tokenInfo === "rhythm") {
				token.type = "rhythm";
			} else {
				Object.assign(token, {type: "chord"}, tokenInfo);
			}
		}
	}

	return {tokens, isChordLine};
}
