import {
	ChordToken,
	HeaderToken,
	isChordToken,
	MarkerToken,
	RhythmToken,
	Token
} from "../src/sheet-parsing/tokens";
import {tokenizeLine} from "../src/sheet-parsing/tokenizeLine";
import {SheetChord} from "../src/chordsUtils";

describe('Parsing / Tokenization', () => {
	const chordLineMarker = '%c';
	const textLineMarker = '%t';
	const lineIndex = 0;

	describe('basic token types', () => {
		test('should tokenize words and whitespace', () => {
			const line = 'Hello world';
			const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(result.tokens).toEqual<Token[]>(
				[
					{
						type: 'word',
						value: 'Hello',
						range: [0, 5]
					},
					{
						type: 'whitespace',
						value: ' ',
						range: [5, 6]
					},
					{
						type: 'word',
						value: 'world',
						range: [6, 11]
					}
				]
			);
		});

		test('should tokenize words and whitespace, not starting at first line', () => {
			const line = 'Hello world';
			const result = tokenizeLine(line, 10, chordLineMarker, textLineMarker);

			expect(result.tokens[2].range).toStrictEqual([16, 21]);
		});

		test('should identify chord line markers', () => {
			const line = 'Am G F %c';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(7);
			expect(tokens[6]).toEqual<MarkerToken>({
				type: 'marker',
				value: '%c',
				range: [7, 9]
			});
		});


		test('should identify text line markers', () => {
			const line = 'Lyrics here %t';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens[tokens.length - 1]).toEqual<MarkerToken>({
				type: 'marker',
				value: '%t',
				range: [12, 14]
			});
		});
	});


	describe('chord detection', () => {
		test('should handle basic chords', () => {
			const line = 'Am C G D';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(7);
			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];

			expect(chordTokens).toHaveLength(4);

			expect(chordTokens[0].chord.tonic).toBe('A');
			expect(chordTokens[0].chord.type).toBe('minor');
			expect(chordTokens[0].chord.bass).toBe("");

			expect(chordTokens[1].chord.tonic).toBe('C');
			expect(chordTokens[1].chord.type).toBe('major');
			expect(chordTokens[1].chord.bass).toBe("");

			expect(chordTokens[2].chord.tonic).toBe('G');
			expect(chordTokens[3].chord.tonic).toBe('D');

			chordTokens.filter(t => t.type === 'chord').forEach((token) => {
				expect(token.range).toEqual([line.indexOf(token.value), line.indexOf(token.value) + token.value.length]);
				expect(token.chordSymbol.range).toEqual([0, token.chordSymbol.value.length]);
			});
		});

		test('should handle complex chords', () => {
			const line = 'Cmaj7 Dm7b5 G7sus4';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(5);
			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];

			expect(chordTokens).toEqual<ChordToken[]>([
					{
						type: 'chord',
						value: 'Cmaj7',
						range: [0, 5],
						chord: expect.any(Object),
						chordSymbol: { value: 'Cmaj7', range: [0, 5] },
						trailingSpaces: 1
					},
					{
						type: 'chord',
						value: 'Dm7b5',
						range: [6, 11],
						chord: expect.any(Object),
						chordSymbol: { value: 'Dm7b5', range: [0, 5] },
						trailingSpaces: 1
					},
					{
						type: 'chord',
						value: 'G7sus4',
						range: [12, 18],
						chord: expect.any(Object),
						chordSymbol: { value: 'G7sus4', range: [0, 6]},
					}
				]
			);
		});

		test('should count the spaces after a chord, but not tabs or spaces after inline chords', () => {
			const trailingSpaces = (line: string) => tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker)
				.tokens.filter(isChordToken).map(token => token.trailingSpaces);

			expect(trailingSpaces('C   G')).toEqual([3, undefined]);
			expect(trailingSpaces('C G')).toEqual([1, undefined]);
			expect(trailingSpaces('C \t G')).toEqual([undefined, undefined]);
			expect(trailingSpaces('[C]   [G]')).toEqual([undefined, undefined]);
			expect(trailingSpaces('Am*[x02210]   C')).toEqual([3, undefined]);
		});

		// helper type for tests that check only some chord fields
		type ChordTokenWithPartialChord = Pick<Partial<ChordToken>, Exclude<keyof ChordToken, 'chord'>> & {
			chord: Partial<SheetChord>
		};

		test('should handle slash/bass chords', () => {
			const line = 'C/G Am/F Dm7/C';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(5);
			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];

			expect(chordTokens).toMatchObject<ChordTokenWithPartialChord[]>([
					{
						range: [0, 3],
						chord: { tonic: 'C', type: 'major', bass: 'G' },
						chordSymbol: { value: 'C/G', range: [0, 3] }
					},
					{
						range: [4, 8],
						chord: { tonic: 'A', type: 'minor', bass: 'F' },
						chordSymbol: { value: 'Am/F', range: [0, 4] }
					},
					{
						range: [9, 14],
						chord: { tonic: 'D', type: 'minor seventh', bass: 'C' },
						chordSymbol: { value: 'Dm7/C', range: [0, 5] }
					}
					]);
		});

		test('should handle inline chords', () => {
			const line = 'The [C#/D#] Eastern world, it [F# spec.] is ex-[G#7  ]plodin\'';
			const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			const tokens = result.tokens;
			expect(result.isChordLine).toBe(false);

			const chordTokens = tokens.filter(t => t.type === 'chord');
			expect(chordTokens).toHaveLength(3);

			expect(chordTokens[0]).toMatchObject<Partial<ChordToken>>({
				value: '[C#/D#]',
				chord: expect.any(Object),
				chordSymbol: { value: 'C#/D#', range: [1, 6]},
				inlineChord: {
					openingBracket: { value: '[', range: [0, 1] },
					closingBracket: { value: ']', range: [6, 7] }
				}
			});

			expect(chordTokens[1]).toMatchObject<Partial<ChordToken>>({
				value: '[F# spec.]',
				chord: expect.any(Object),
				chordSymbol: {value: 'F#', range: [1, 3]},
				inlineChord: {
					openingBracket: { value: '[', range: [ 0, 1 ] },
					closingBracket: { value: ']', range: [ 9, 10 ] },
					auxText: { value: ' spec.', range: [ 3, 9 ] }
				}
			});

			expect(chordTokens[2]).toMatchObject<Partial<ChordToken>>({
				value: '[G#7  ]',
				range: [ 47, 54 ],
				chord: expect.any(Object),
				chordSymbol: { value: 'G#7', range: [ 1, 4 ]},
				inlineChord: {
					openingBracket: { value: '[', range: [.0, 1 ] },
					closingBracket: { value: ']', range: [ 6, 7 ] },
					auxText: { value: '  ', range: [ 4, 6 ] },
				}
			});


			const wordTokens = tokens.filter(t => t.type === 'word');
			expect(wordTokens).toHaveLength(7);
			expect(wordTokens.map(t => t.value)).toEqual(['The', 'Eastern', 'world,', 'it', 'is', 'ex-', 'plodin\'']);

		});

		test('inline chords 2', () => {
			const line = '[D]He\'s like a [G]scat[D/F#]tered [C]me[Em/B]mo[Am]ry[Bm]  [D]';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);
			expect(tokens.filter(isChordToken).map(token => token.value)).toEqual(
				["[D]", "[G]", "[D/F#]", "[C]", "[Em/B]", "[Am]", "[Bm]", "[D]"]
			);
		});

		test('should handle user-defined chords', () => {
			const line = 'Some Am[x02210] user-defined C*4[3|x32010] chords C°[x34_24_]';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];
			expect(chordTokens[0]).toMatchObject<ChordTokenWithPartialChord> ({
				range: [5, 15],
				chord: {
					userDefinedChord: {
						"frets": "x02210",
						"position": 0,
					}
				},
				chordSymbol: { value: "Am", range: [0, 2] },
				userDefinedChord: {
					openingBracket: { value: '[', range: [2, 3] },
					frets: { value: 'x02210', range: [3, 9] },
					closingBracket: { value: ']', range: [9, 10] }
				}
			});

			expect(chordTokens[1]).toMatchObject<ChordTokenWithPartialChord>({
				range: [29, 42],
				chord: {
					userDefinedChord: {
						frets: 'x32010',
						position: 3
					}
				},
				chordSymbol: { value: "C*4", range: [0, 3]},
				userDefinedChord: {
					openingBracket: { value: '[', range: [3, 4] },
					position: { value: '3', range: [4, 5] },
					positionSeparator: { value: '|', range: [5, 6] },
					frets: { value: 'x32010', range: [6, 12] },
					closingBracket: { value: ']', range: [12, 13] }
				}
			});

			expect(chordTokens[2]).toMatchObject<ChordTokenWithPartialChord>({
				range: [50, 61],
				chord: {
					userDefinedChord: {
						frets: 'x34_24_',
						position: 0
					}
				},
				chordSymbol: { value: "C°", range: [0, 2] },
			});
		});

		test('should handle user-defined chords with non-ASCII symbols (#42)', () => {
			const line = 'Bø[2|_12x231_] BΔ[x2323x] B♭[x1333x] C#m7(b5)[x123x]';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];
			expect(chordTokens.map(t => t.chordSymbol.value)).toEqual(['Bø', 'BΔ', 'B♭', 'C#m7(b5)']);
			expect(chordTokens[0]).toMatchObject<ChordTokenWithPartialChord>({
				range: [0, 14],
				chord: {
					userDefinedChord: {
						frets: '_12x231_',
						position: 2
					}
				},
				chordSymbol: { value: 'Bø', range: [0, 2] }
			});
		});

		test('should not treat bracketed text without valid frets as user-defined chord', () => {
			const line = 'Test[abc] lyrics';
			const { tokens, isChordLine } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens.filter(t => isChordToken(t))).toHaveLength(0);
			expect(isChordLine).toBe(false);
		});

		test('should handle user-defined chords with space-separated multi-digit frets', () => {
			const line = 'Db[8 10 x 12 12 12] test';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];
			expect(chordTokens).toHaveLength(1);
			expect(chordTokens[0]).toMatchObject<ChordTokenWithPartialChord>({
				range: [0, 19],
				chord: {
					userDefinedChord: {
						frets: "8 10 x 12 12 12",
						position: 0
					}
				},
				chordSymbol: { value: "Db", range: [0, 2] },
				userDefinedChord: {
					openingBracket: { value: '[', range: [2, 3] },
					frets: { value: '8 10 x 12 12 12', range: [3, 18] },
					closingBracket: { value: ']', range: [18, 19] }
				}
			});
		});

		test('should handle user-defined chords with comma-separated multi-digit frets', () => {
			const line = 'Bb[9,8,8,8,9,8] test';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			const chordTokens = tokens.filter(t => isChordToken(t)) as ChordToken[];
			expect(chordTokens).toHaveLength(1);
			expect(chordTokens[0]).toMatchObject<ChordTokenWithPartialChord>({
				range: [0, 15],
				chord: {
					userDefinedChord: {
						frets: "9,8,8,8,9,8",
						position: 0
					}
				},
				chordSymbol: { value: "Bb", range: [0, 2] },
				userDefinedChord: {
					openingBracket: { value: '[', range: [2, 3] },
					frets: { value: '9,8,8,8,9,8', range: [3, 14] },
					closingBracket: { value: ']', range: [14, 15] }
				}
			});
		});
	});

	describe('headers', () => {
		describe('valid headers', () => {
			test('basic header with no spaces', () => {
				const line = '[Verse 1]';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				expect(result.tokens).toMatchObject<Partial<HeaderToken>[]>([
					{
						value: '[Verse 1]',
						range: [0, 9],
						openingBracket: { value: '[', range: [0, 1] },
						closingBracket: { value: ']', range: [8, 9] },
						headerName: { value: 'Verse 1', range: [1, 8] },
					}]
				);
			});

			test('header with surrounding whitespace', () => {
				const line = '  [Chorus]  ';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				expect(result.tokens).toHaveLength(3);
				expect(result.tokens).toMatchObject<Partial<Token | HeaderToken>[]>([
					{ type: "whitespace" },
					{
						value: '  [Chorus]  ',
						headerName: { value: 'Chorus', range: [3, 9] },
						openingBracket: { value: '[', range: [2, 3] },
						closingBracket: { value: ']', range: [9, 10] },
						range: [0, 12],
					},
					{ type: "whitespace" }
				]);
			});

			test('header with surrounding whitespace, not starting on first line', () => {
				const line = '  [Chorus]  ';
				const result = tokenizeLine(line, 10, chordLineMarker, textLineMarker);

				expect(result.tokens).toHaveLength(3);
				expect(result.tokens[1]).toMatchObject<Partial<HeaderToken>>({
					value: '  [Chorus]  ',
					range: [10, 22]
				});
			});

			test('header with special characters', () => {
				const line = '[Bridge #2 (alternate)]';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				expect(result.tokens[0]).toMatchObject<Partial<HeaderToken>>({
					type: 'header',
					headerName: { value: 'Bridge #2 (alternate)', range: [1, 22] },
					openingBracket: { value: '[', range: [0, 1] },
					closingBracket: { value: ']', range: [22, 23] },
				});
			});

			test('header with opening bracket in content', () => {
				const line = '[Verse [1]';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				expect(result.tokens[0]).toMatchObject<Partial<HeaderToken>>({
					type: 'header',
					headerName: { value: 'Verse [1', range: [1, 9] },
					openingBracket: { value: '[', range: [0, 1] },
					closingBracket: { value: ']', range: [9, 10] },
				});
			});
		});

		describe('invalid headers', () => {
			test('header in middle of line', () => {
				const line = 'Hello [Verse 1] there';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				const headerTokens = result.tokens.filter(t => t.type === 'header');
				expect(headerTokens).toHaveLength(0);
			});

			test('unclosed header', () => {
				const line = '[Verse 1';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				const headerTokens = result.tokens.filter(t => t.type === 'header');
				expect(headerTokens).toHaveLength(0);
			});

			test('multiple headers on one line', () => {
				const line = '[Verse 1][Chorus]';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				const headerTokens = result.tokens.filter(t => t.type === 'header');
				expect(headerTokens).toHaveLength(0);
			});

			test('empty header', () => {
				const line = '[]';
				const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

				const headerTokens = result.tokens.filter(t => t.type === 'header');
				expect(headerTokens).toHaveLength(0);
			});

			// TODO just brackets with whitespace shouldn't be detected as header
			// test('just brackets with whitespace', () => {
			// 	const line = '[   ]';
			// 	const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);
			//
			// 	const headerTokens = result.tokens.filter(t => t.type === 'header');
			// 	expect(headerTokens).toHaveLength(0);
			// });
		});
	});

	describe('rhythm patterns', () => {
		test('rhythm patterns with whitespace', () => {
			const line = '| / /  |    %    |';
			const { tokens } = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);
			const rythmTokens = tokens.filter(t => t.type === 'rhythm') as RhythmToken[];
			expect(rythmTokens).toHaveLength(6);
			expect(rythmTokens).toMatchObject<Partial<RhythmToken>[]>([
				{ value: '|', range: [0, 1] },
				{ value: '/', range: [2, 3] },
				{ value: '/', range: [4, 5] },
				{ value: '|', range: [7, 8] },
				{ value: '%', range: [12, 13] },
				{ value: '|', range: [17, 18] }
			]);
		});

		test('rhythm patterns with chords', () => {
			const line = '| G / / / | Am / C /  |    %    |';
			const tokens = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker)
							.tokens
							.filter(t => t.type !== 'whitespace');

			expect(tokens).toHaveLength(13);
			expect(tokens).toMatchObject<Partial<RhythmToken | ChordToken>[]>([
				{ type: 'rhythm', value: '|' },
				{ type: 'chord', value: 'G' },
				{ type: 'rhythm', value: '/' },
				{ type: 'rhythm', value: '/' },
				{ type: 'rhythm', value: '/' },
				{ type: 'rhythm', value: '|' },
				{ type: 'chord', value: 'Am' },
				{ type: 'rhythm', value: '/' },
				{ type: 'chord', value: 'C' },
				{ type: 'rhythm', value: '/' },
				{ type: 'rhythm', value: '|' },
				{ type: 'rhythm', value: '%' },
				{ type: 'rhythm', value: '|' }
			]);
		});

		test('rhythm patterns with chords and words', () => {
			const line = '| G / Am once | F repeat /  % to coda';
			const tokens = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker)
				.tokens
				.filter(t => t.type !== 'whitespace');

			expect(tokens).toHaveLength(12);
			expect(tokens).toMatchObject<Partial<RhythmToken | ChordToken | Token>[]>([
				{ type: 'rhythm', value: '|' },
				{ type: 'chord', value: 'G' },
				{ type: 'rhythm', value: '/' },
				{ type: 'chord', value: 'Am' },
				{ type: 'word', value: 'once' },
				{ type: 'rhythm', value: '|' },
				{ type: 'chord', value: 'F' },
				{ type: 'word', value: 'repeat' },
				{ type: 'rhythm', value: '/' },
				{ type: 'rhythm', value: '%' },
				{ type: 'word', value: 'to' },
				{ type: 'word', value: 'coda' }
			]);
		});

		test('no chord (NC) markers with chords', () => {
			const lines = [
				"  Am       NC",
				" N.C.       C ",
				"   Am  N. C. Am",
				"     Am   N C"
			];

			const tokens = lines.flatMap(line =>
				tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker)
					.tokens
					.filter(t => t.type !== 'whitespace')
			);
			expect(tokens).toHaveLength(9);
			expect(tokens).toMatchObject<Partial<RhythmToken | ChordToken>[]>([
				{type: "chord", value: "Am"},
				{type: "rhythm", value: "NC"},
				{type: "rhythm", value: "N.C."},
				{type: "chord", value: "C"},
				{type: "chord", value: "Am"},
				{type: "rhythm", value: "N. C."},
				{type: "chord", value: "Am"},
				{type: "chord", value: "Am"},
				{type: "rhythm", value: "N C"}
			]);
		});

		test('text with forward slashes should not be rhythm', () => {
			const line = 'look at this/that thing';
			const result = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(result.tokens.filter(t => t.type === 'rhythm')).toHaveLength(0);
		});
	});

	describe('should detect chord line / text lines', () => {
		test('should detect chord line', () => {
			let result = tokenizeLine("A", lineIndex, chordLineMarker, textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(1);

			result = tokenizeLine("A bla", lineIndex, chordLineMarker, textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(0);

			result = tokenizeLine("A bla C", lineIndex, chordLineMarker, textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(2);

			result = tokenizeLine("Am G F (comment that breaks chord detection) C", lineIndex, chordLineMarker,
				textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(0);

			result = tokenizeLine("A Ana e a Ema estão a comer e a beber em casa", lineIndex, chordLineMarker,
				textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(7);
		});

		test('should detect chord line with chord line marker', () => {
			let result = tokenizeLine("Am G F (comment that breaks chord detection) C %c", lineIndex, chordLineMarker,
				textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(4);

			result = tokenizeLine("Am G F (comment that breaks chord detection) C [chords!]", lineIndex, "[chords!]",
				"[text!]");
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(4);
		});

		test('should detect text line with text line marker', () => {
			let result = tokenizeLine("A Ana e a Ema estão a comer e a beber em casa %t", lineIndex, chordLineMarker,
				textLineMarker);
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(0);

			result = tokenizeLine("A Ana e a Ema estão a comer e a beber em casa [text!]", lineIndex, "[chords!]",
				"[text!]");
			expect(result.tokens.filter(t => t.type === 'chord')).toHaveLength(0);
		});
	});

	describe('edge cases', () => {
		test('should handle empty lines', () => {
			const line = '';
			const {tokens, isChordLine} = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(0);
			expect(isChordLine).toBe(false);
		});

		test('should handle lines with only whitespace', () => {
			const line = '    ';
			const {tokens, isChordLine} = tokenizeLine(line, lineIndex, chordLineMarker, textLineMarker);

			expect(tokens).toHaveLength(1);
			expect(tokens[0].type).toBe('whitespace');
			expect(isChordLine).toBe(false);
		});
	});
});
