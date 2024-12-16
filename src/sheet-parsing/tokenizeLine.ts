import {ChordInfo, ChordToken, HeaderToken, MarkerToken, Token, TokenizedLine} from "./tokens";
import escapeStringRegexp from "escape-string-regexp";
import {Chord} from "tonal";
import {SheetChord} from "../chordsUtils";


function offsetRange(indexArray: [number, number], offset: number): [number, number] {
	return indexArray && [indexArray[0] + offset, indexArray[1] + offset];
}

function getChord(maybeChordSymbol: string): SheetChord {
	const tonalJsChord = Chord.get(maybeChordSymbol);
	const {tonic, type, aliases: typeAliases} = tonalJsChord;
	return {tonic: tonic ?? "", type, typeAliases, bass: tonalJsChord.bass || null};
}

export function tokenizeLine(line: string, lineIndex: number, chordLineMarker: string, textLineMarker: string): TokenizedLine {
	const tokens: Token[] = [];

	const headerPattern = /(?<leadingWs>^\s*)(?<open>\[)(?<name>[^\]]+)(?<close>])(?<trailingWs>\s*$)/d;
	const headerMatch = line.match(headerPattern);
	if (headerMatch) {
		const {leadingWs, open: startTag, name: headerName, close: endTag, trailingWs} = headerMatch.groups!;
		const {leadingWs: leadingWsRange, open: startTagRange, name: headerNameRange, close: endTagRange, trailingWs: trailingWsRange} = headerMatch.indices!.groups!;

		if (leadingWs) {
			tokens.push({type: "whitespace", value: leadingWs, index: offsetRange(leadingWsRange, lineIndex)});
		}

		const headerToken: HeaderToken = {
			type: "header",
			value: headerMatch[0],
			index: offsetRange(headerMatch.indices![0], lineIndex),
			startTag, headerName, endTag,
			startTagIndex: startTagRange, headerNameIndex: headerNameRange, endTagIndex: endTagRange
		};
		tokens.push(headerToken);

		if (trailingWs) {
			tokens.push({type: "whitespace", value: trailingWs, index: offsetRange(trailingWsRange, lineIndex)});
		}

		return {tokens, isChordLine: false};
	}


	const chordLineMarkerPattern = escapeStringRegexp(chordLineMarker);
	const textLineMarkerPattern = escapeStringRegexp(textLineMarker);

	// The tokenization loop eats the line from start to end, so we have to match
	// each inline token against the start of the string.
	// The order of the patterns is significant!
	const inlinePatterns = {
		// line type markers at the end of the line, can be user defined, default "%t" and "%c"
		lineMarker: new RegExp(`^(?<marker>${textLineMarkerPattern}|${chordLineMarkerPattern})\\s*$`, "d"),

		// Inline chord notation in brackets mixed with words, optional auxiliarry test, eg:
		// [Am]Some [Dm aux. text]lyrics
		inlineChord: /^(?<open>\[)(?<chordSymbol>[^\s\]]+)(?<auxText>[^[()]*)(?<close>])/d,

		// Chord symbol with custom shape definition in brackets, optionally barre position:
		// Bbadd13[x13333], Dm6[4|x2x132] (with barree position), B*[_224442_] (with barre markers).
		// Chord symbol must start with uppercase, can contain #()+-°/*
		userDefinedChord: /^(?<chordSymbol>[A-Z][A-Za-z0-9#()+-°/*]*)(?<open>\[)(?:(?<pos>[0-9]+)(?<posSep>\|))?(?<frets>[0-9x_]+)(?<close>])/d,

		// Possible rhythm markers: bar lines (|), strums (/), repeats (%), etc
		// Interpretation depends on line context.
		wordOrRhythm: /^[[\]/|%]+/d,

		// Any text that isn't whitespace or starting with [ could be chord symbols.
		// Interpretation depends on line context.
		wordOrChord: /^[^\s[]+/d,

		// Record whitespace so that the input can be exactly recreated in the reading
		// view markdown post processor
		whitespace: /^\s+/d,
	};

	const possibleChordOrRhythmTokens = new Map<Token, ChordInfo | "rhythm">;
	let wordTokenCount: number = 0;
	let markerValue: MarkerToken['value'] | null = null;
	let hasUserDefinedChord = false;

	let remainingLine = line;
	let pos = lineIndex;
	while (remainingLine.length > 0) {
		let match: RegExpMatchArray | null = null;
		for (const [name, pattern] of Object.entries(inlinePatterns)) {

			match = remainingLine.match(pattern);
			if (match) {
				const matchValue = match[0];
				const matchIndex = match.indices![0];

				const baseToken: Pick<Token, "value" | "index"> = {
					value: matchValue,
					index: offsetRange(matchIndex, pos)
				};

				switch (name) {
					case "lineMarker": {
						markerValue = matchValue;
						tokens.push({...baseToken, type: "marker"});
						break;
					}

					case "wordOrRhythm": {
						const possibleRhythmToken: Token = {
							...baseToken, type: "word"
						};
						possibleChordOrRhythmTokens.set(possibleRhythmToken, "rhythm");
						tokens.push(possibleRhythmToken);
						break;
					}

					case "inlineChord": {
						const {open: startTag, chordSymbol, auxText, close: endTag} = match.groups!;
						const {
							open: startTagIndex,
							chordSymbol: chordSymbolIndex,
							auxText: auxTextIndex,
							close: endTagIndex
						} = match.indices!.groups!;

						const chord = getChord(chordSymbol);

						if (chord.tonic) {
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
							// does not look like a chord, treat as word
							tokens.push({type: "word", ...baseToken});
						}
						break;
					}

					case "userDefinedChord": {
							const {chordSymbol, pos: position, frets} = match.groups!;
							const {chordSymbol: chordSymbolIndex } = match.indices!.groups!;

							const chordToken: ChordToken = {
								...baseToken,
								type: "chord",
								chord: {
									...getChord(chordSymbol),
									userDefinedChord: { frets, position: position ? parseInt(position) : 0}
								},
								chordSymbol,
								chordSymbolIndex,
							};

							tokens.push(chordToken);
							hasUserDefinedChord = true;
						break;
					}

					case "wordOrChord": {
						const resultToken: Token = {
							...baseToken, type: "word"
						};

						const chord = getChord(matchValue);
						if (chord?.tonic) {
							possibleChordOrRhythmTokens.set(resultToken, {
								chord,
								chordSymbol: matchValue,
								chordSymbolIndex: matchIndex
							});
						}

						tokens.push(resultToken);
						wordTokenCount++;
						break;
					}

					case "whitespace": {
						tokens.push({...baseToken, type: "whitespace"});
						break;
					}
				}

				pos += match[0].length;
				remainingLine = remainingLine.slice(match[0].length);
				break;
			}
		}

		if (!match) {
			// The inline patterns should have covered all possible input, all characters should be matched
			// by at least wordOrChord.
			throw new Error(
				`We shouldn't be here: no token pattern match for remaining line: ${remainingLine}\n` +
				`Please report this as a bug.`
			);
		}
	}

	const isChordLine =
			markerValue === chordLineMarker ? true :
			markerValue === textLineMarker ? false :
			hasUserDefinedChord || possibleChordOrRhythmTokens.size / wordTokenCount > 0.5;

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
