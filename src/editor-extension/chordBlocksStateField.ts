import {
	ChordToken,
	Instrument,
	isChordLine,
	isChordToken,
	isHeaderToken,
	isMarkerToken,
	tokenizeLine
} from "../chordsUtils";
import {Decoration, DecorationSet, EditorView, ViewUpdate} from "@codemirror/view";
import {
	Compartment,
	EditorState,
	Facet,
	Line,
	Range,
	RangeSet,
	RangeSetBuilder,
	RangeValue,
	StateEffect,
	StateField,
	Transaction
} from "@codemirror/state";
import {ensureSyntaxTree, syntaxTree} from "@codemirror/language";
import {Tree} from "@lezer/common";
import {ChordSheetsSettings} from "../chordSheetsSettings";
import {ChordOverviewWidget} from "./chordOverviewWidget";
import {ChordBlockToolsWidget} from "./chordBlockToolsWidget";
import ChordsDB from "@tombatossals/chords-db";

class ParsedUntilRangeValue extends RangeValue {
	endSide = -1;
	point = true;
}

export interface IChordBlockRangeValue {
	instrument: Instrument
	partiallyParsed: boolean
}

class ChordBlockRangeValue extends RangeValue implements IChordBlockRangeValue {
	endSide: number;

	constructor(readonly instrument: Instrument, readonly partiallyParsed = false) {
		super();
		this.endSide = partiallyParsed ? 0 : -1;
	}
}

interface ChordBlocksParseResult<T extends boolean> {
	parsedUntil: Range<ParsedUntilRangeValue>;
	chordDecos: T extends true ? Range<Decoration>[] : null;
	chordBlockRanges: Range<ChordBlockRangeValue>[];
	danglingBlockDef: OpenBlockDef | null;
}

interface OpenBlockDef {
	from: number;
	value: IChordBlockRangeValue;
}

export interface ChordBlocksState {
	ranges: RangeSet<ChordBlockRangeValue>;
	blockDecos: DecorationSet;
	chordDecos: DecorationSet;
	parsedUntil: Range<ParsedUntilRangeValue>;
	danglingBlockDef: OpenBlockDef | null;
}

export const chordSheetViewportUpdateEffect = StateEffect.define<void>();
export const finishParsingIncompleteBlockEffect = StateEffect.define<{
	blockDef: OpenBlockDef
	callback: (resultState: ChordBlocksState) => void
}>();

export const chordSheetsConfig = new Compartment();
export const chordSheetsConfigFacet = Facet.define<ChordSheetsSettings, Required<ChordSheetsSettings>>({
	// assume that this facet will only be present once in the editor's state, so we can just get the first value
	combine: values => values[0],
	static: true,
});

export function ifDebug(state: EditorState, func: () => void) {
	if (state.facet(chordSheetsConfigFacet).debug) {
		func();
	}
}

function shouldShowChordOverviewInEditor(stateOrConfig: EditorState | ChordSheetsSettings) {
	const config = stateOrConfig instanceof EditorState ? stateOrConfig.facet(chordSheetsConfigFacet) : stateOrConfig;
	return config.showChordOverview === "always" || config.showChordOverview === "edit";
}

function initializeChordBlocksState(state: EditorState): ChordBlocksState {
	if (state.doc.length === 0) {
		return {
			ranges: RangeSet.empty,
			blockDecos: Decoration.none,
			chordDecos: Decoration.none,
			parsedUntil: new ParsedUntilRangeValue().range(0),
			danglingBlockDef: null
		};
	} else {
		const greedyParsing = shouldShowChordOverviewInEditor(state);
		const chordBlocks = parseChordBlocks(state, 0, state.doc.length, true, null, false, greedyParsing);
		const chordBlockRangeSet = RangeSet.of(chordBlocks.chordBlockRanges);

		const chordDecoSet = Decoration.set(chordBlocks.chordDecos);
		return {
			ranges: chordBlockRangeSet,
			blockDecos: getChordBlockDecos(state.facet(chordSheetsConfigFacet), chordBlockRangeSet, chordDecoSet),
			chordDecos: chordDecoSet,
			parsedUntil: chordBlocks.parsedUntil,
			danglingBlockDef: chordBlocks.danglingBlockDef
		};
	}
}

export const chordBlocksStateField = StateField.define<ChordBlocksState>({
	create: (state: EditorState) => {
		return initializeChordBlocksState(state);
	},

	update: (value, tr) => {
		if (tr.docChanged) {
			// Handle document updates
			return updateChordBlocks({changes: tr.changes, state: tr.state}, value);
		} else if (
			tr.reconfigured
			&& tr.startState.facet(chordSheetsConfigFacet) !== tr.state.facet(chordSheetsConfigFacet)
		) {
			// Handle settings changed

			const oldSettings = tr.startState.facet(chordSheetsConfigFacet);
			const newSettings = tr.state.facet(chordSheetsConfigFacet);

			// for some settings, all chord blocks need to be reparsed on change
			if (
				oldSettings?.defaultInstrument !== newSettings?.defaultInstrument
				|| oldSettings?.blockLanguageSpecifier !== newSettings?.blockLanguageSpecifier
				|| oldSettings?.textLineMarker !== newSettings?.textLineMarker
				|| oldSettings?.chordLineMarker !== newSettings?.chordLineMarker
				|| oldSettings?.highlightChords !== newSettings.highlightChords
				|| oldSettings?.highlightSectionHeaders !== newSettings?.highlightSectionHeaders
		) {
				return initializeChordBlocksState(tr.state);
			}

			// for most settings, only the chord block decorations need to be updated
			return {
				...value,
				blockDecos: getChordBlockDecos(tr.state.facet(chordSheetsConfigFacet), value.ranges, value.chordDecos)
			};
		} else {
			// Handle effects

			let {ranges, blockDecos, chordDecos, parsedUntil, danglingBlockDef} = value;
			tr.effects.forEach(effect => {
				if (effect.is(chordSheetViewportUpdateEffect)) {
					const config = tr.state.facet(chordSheetsConfigFacet);
					const parseFrom = danglingBlockDef !== null ? Math.min(parsedUntil.from + 1, danglingBlockDef.from) : parsedUntil.from + 1;
					ifDebug(tr.state, () => console.log("Update viewport in state field from: ", parseFrom));
					const greedyParsing = shouldShowChordOverviewInEditor(config);
					const newBlocks = parseChordBlocks(tr.state, parseFrom, tr.state.doc.length, true, danglingBlockDef, false, greedyParsing);
					if (newBlocks.chordBlockRanges.length > 0) {
						ranges = ranges.update({
							filter: () => false,
							filterFrom: newBlocks.chordBlockRanges.first()?.from,
							add: newBlocks.chordBlockRanges
						});

						danglingBlockDef = newBlocks.danglingBlockDef;
					}

					if (newBlocks.chordDecos.length > 0) {
						chordDecos = chordDecos.update({
							filter: () => false,
							filterFrom: newBlocks.chordDecos.first()?.from,
							add: newBlocks.chordDecos
						});
					}

					parsedUntil = newBlocks.parsedUntil;
					blockDecos = getChordBlockDecos(config, ranges, chordDecos);
				} else if (effect.is(finishParsingIncompleteBlockEffect)) {
					const lastParsedPosition = syntaxTree(tr.state).length;
					const parseStart = tr.state.doc.lineAt(lastParsedPosition).from;
					const results = parseChordBlocks(tr.state, parseStart, tr.state.doc.length, true, effect.value.blockDef, true, true);
					const config = tr.state.facet(chordSheetsConfigFacet);

					ranges = ranges.update({
						filter: () => false,
						filterFrom: effect.value.blockDef.from,
						add: results.chordBlockRanges
					});

					chordDecos = chordDecos.update({
						filter: () => false,
						filterFrom: lastParsedPosition,
						add: results.chordDecos
					});

					blockDecos = getChordBlockDecos(config, ranges, chordDecos);
					parsedUntil = results.parsedUntil;
					danglingBlockDef = results.danglingBlockDef;

					effect.value.callback({ranges, blockDecos: blockDecos, chordDecos, parsedUntil, danglingBlockDef});
				}
			});
			return {ranges, blockDecos: blockDecos, chordDecos, parsedUntil, danglingBlockDef};
		}
	},
	provide: (f) => [
		EditorView.decorations.from(f, (val) => val.blockDecos),
		EditorView.decorations.from(f, (val) => val.chordDecos)
	]
});

function linesOfChordBlocks(ranges: RangeSet<ChordBlockRangeValue>, state: EditorState) {
	const rangeIter = ranges.iter();
	const linesInRanges = new Set<number>();
	while (rangeIter.value) {
		const {from, to} = rangeIter;
		const firstLineNum = state.doc.lineAt(from).number;
		const lastLineNum = state.doc.lineAt(to).number;
		if (lastLineNum - firstLineNum > 0) {
			for (let lineIndex = firstLineNum + 1; to === state.doc.length ? lineIndex <= lastLineNum : lineIndex < lastLineNum; lineIndex++) {
				linesInRanges.add(lineIndex);
			}
		}
		rangeIter.next();
	}

	return Array.from(linesInRanges).map(lineNo => state.doc.line(lineNo));
}

function updateChordBlocks({changes, state}: Pick<ViewUpdate & Transaction, 'changes' | 'state'>, value: ChordBlocksState) {
	const settings = state.facet(chordSheetsConfigFacet);

	let {ranges, chordDecos, parsedUntil, danglingBlockDef} = value;
	ifDebug(state, () => console.log("updateChordBlocks called"));

	// map old ranges and decorations to accommodate changes
	ranges = ranges.map(changes);

	chordDecos = chordDecos.map(changes);
	parsedUntil = new ParsedUntilRangeValue().range(changes.mapPos(parsedUntil.from));

	const changedChordBlockLineNumbers = new Set<number>();

	/*
	 We need to reparse the chord block ranges if any change was made
	 -  inside an existing chord block because
	    - a starting or ending marker could have been removed
	 	- an ending marker could have been added in the middle
	 - 	outside a chord block because
	 	- a starting marker could have been added

	 We always need to parse
	 	- from start of the change
	 	- until the end of the document OR the end of the next chord block
			- 	because if an ending marker is introduced in an existing block


	*/

	let newRanges: RangeSet<ChordBlockRangeValue> = ranges;
	const reparseRanges: {
		start: number,
		end: number,
		touchedBlocks: {from: number, to: number, value: ChordBlockRangeValue}[]
	}[] = [];

	// Change sets are ordered by position in the document
	// https://discuss.codemirror.net/t/iterators-can-be-hard-to-work-with-for-beginners/3533/10
	changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
		const reparseStart = state.doc.lineAt(fromB).from;

		// the reparse range ends at the last block that is touched by the change range
		// from there the next block end or document end

		// STEP A: determine the necessary reparse range for this change
		const touchedBlocks: {from: number, to: number, value: ChordBlockRangeValue}[] = [];
		const currentBlockRange = ranges.iter(fromB);
		while (currentBlockRange.value && currentBlockRange.from < toB) {
			touchedBlocks.push({from: currentBlockRange.from, to: currentBlockRange.to, value: currentBlockRange.value});
			currentBlockRange.next();
		}

		const reparseEnd = currentBlockRange.value ? currentBlockRange.to : toB;
		if (!reparseRanges.length || reparseEnd > reparseRanges[reparseRanges.length - 1].end) {
			// If current reparse range does not overlap with the last one in reparseRanges, add it.
			reparseRanges.push({start: reparseStart, end: reparseEnd, touchedBlocks});
		} else {
			// Else, it overlaps so extend the last reparse range
			reparseRanges[reparseRanges.length - 1].end = reparseEnd;
		}


		// STEP B: record the lines affected by this change that are inside existing chord blocks
		const changeStartLineNum = state.doc.lineAt(fromB).number;
		const changeEndLineNum = state.doc.lineAt(toB).number;
		for (const touchedBlock of touchedBlocks) {
			const blockStartLineNum = state.doc.lineAt(touchedBlock.from).number;
			const blockEndLineNum = state.doc.lineAt(touchedBlock.to).number;
			for (let lineIndex = changeStartLineNum; lineIndex <= changeEndLineNum; lineIndex++) {
				if (lineIndex > blockStartLineNum && (state.doc.length === touchedBlock.to ? lineIndex <= blockEndLineNum : lineIndex < blockEndLineNum)) {
					changedChordBlockLineNumbers.add(lineIndex);
				}
			}
		}
	});

	const greedyParsing = shouldShowChordOverviewInEditor(settings);
	for (const reparseRange of reparseRanges) {

		// Are we starting to parse inside a block?
		const firstBlock = reparseRange.touchedBlocks.length ? reparseRange.touchedBlocks[0] : null;
		const openBlockDef = firstBlock && reparseRange.start > firstBlock.from ? {
			from: firstBlock.from,
			value: firstBlock.value
		} : null;

		const parseResult = parseChordBlocks(state, reparseRange.start, reparseRange.end, false, openBlockDef, false, greedyParsing);
		const parsedChordBlockRanges = parseResult?.chordBlockRanges;

		if (parsedChordBlockRanges && parseResult?.danglingBlockDef) {
			parsedChordBlockRanges.pop();
			const parseLastBlockResult = parseChordBlocks(state, parseResult.danglingBlockDef.from, state.doc.length, false, danglingBlockDef, true, greedyParsing);
			parsedChordBlockRanges.push(...parseLastBlockResult.chordBlockRanges);
			parsedUntil = parseLastBlockResult.parsedUntil;
			danglingBlockDef = parseLastBlockResult.danglingBlockDef;
		} else if (parseResult) {
			parsedUntil = parseResult && parseResult.parsedUntil > parsedUntil ? parseResult.parsedUntil : parsedUntil;
			danglingBlockDef = danglingBlockDef ?? parseResult?.danglingBlockDef ?? null;
		}

		newRanges = newRanges.update({
			filter: () => false,
			filterFrom: reparseRange.start,
			filterTo: Math.max(reparseRange.end, parseResult?.chordBlockRanges.last()?.to ?? 0),
			add: parsedChordBlockRanges
		});
	}


	// chords
	const oldLines = linesOfChordBlocks(ranges, state);
	const newLines = linesOfChordBlocks(newRanges, state);

	const addedLines = newLines.filter(line => !oldLines.some(oldLine => oldLine.number === line.number));
	const removedLines = oldLines.filter(line => !newLines.some(newLine => newLine.number === line.number));

	removedLines.forEach(line => chordDecos = chordDecos.update({
		filter: () => false, filterFrom: line.from, filterTo: line.to
	}));
	addedLines.forEach(line => chordDecos = chordDecos.update({
		add: chordDecosForLineAt(line, settings)
	}));
	changedChordBlockLineNumbers.forEach(lineNo => {
		const line = state.doc.line(lineNo);
		chordDecos = chordDecos.update({
			filter: () => false, filterFrom: line.from, filterTo: line.to, add: chordDecosForLineAt(line, settings)
		});
	});

	ifDebug(state, () => console.log({
		"Removed lines": removedLines.map(line => line.number),
		"Added lines": addedLines.map(line => line.number),
		"Changed lines": Array.from(changedChordBlockLineNumbers.values())
	}));


	return {
		ranges: newRanges,
		blockDecos: getChordBlockDecos(state.facet(chordSheetsConfigFacet), newRanges, chordDecos),
		chordDecos,
		parsedUntil,
		danglingBlockDef
	};
}

function getChordBlockDecos(config: ChordSheetsSettings, chordBlockRanges: RangeSet<ChordBlockRangeValue>, chordDecoRanges: DecorationSet): RangeSet<Decoration> {
	const builder = new RangeSetBuilder<Decoration>();

	try {
		const chordBlockIter = chordBlockRanges.iter();
		while (chordBlockIter.value) {
			const chordTokens: ChordToken[] = [];
			chordDecoRanges.between(chordBlockIter.from, chordBlockIter.to, (_from, _to, value) => {
				if (value.spec.type === "chord") {
					chordTokens.push(value.spec.token);
				}
			});


			if (shouldShowChordOverviewInEditor(config)) {
				builder.add(chordBlockIter.from, chordBlockIter.from, Decoration.widget({
					widget: new ChordOverviewWidget(chordBlockIter.value.instrument, config.diagramWidth, chordTokens),
					side: -1,
					block: true
				}));
			}

			builder.add(chordBlockIter.from, chordBlockIter.from, Decoration.line({
				class: config.debug ? "chord-sheet-block-start debug" : "chord-sheet-block-start",
				side: -1
			}));

			if (config.showTransposeControl || config.showInstrumentControl) {
				builder.add(chordBlockIter.from, chordBlockIter.from, Decoration.widget({
					widget: new ChordBlockToolsWidget(chordBlockIter.value.instrument, config.showTransposeControl, config.showInstrumentControl, shouldShowChordOverviewInEditor(config)),
					side: 0,
					block: false
				}));
			}


			if (config.debug) {
				builder.add(chordBlockIter.to - 1, chordBlockIter.to, Decoration.mark({
					class: "chord-sheet-block-end debug",
					side: -1
				}));
			}

			chordBlockIter.next();
		}
	} catch (e) {
		if (config.debug) {
			const iter = chordBlockRanges.iter();
			const blocks = [];
			while (iter.value) {
				blocks.push({from: iter.from, to: iter.to, value: iter.value});
				iter.next();
			}
			throw e;
		}
	}

	return builder.finish();
}

function parseChordBlocks(state: EditorState, from: number, to: number, parseChords: true, openBlockFrom: OpenBlockDef | null, stopAfterFirstBlock: boolean, greedy: boolean): ChordBlocksParseResult<true>;
function parseChordBlocks(state: EditorState, from: number, to: number, parseChords: false, openBlockFrom: OpenBlockDef | null, stopAfterFirstBlock: boolean, greedy: boolean): ChordBlocksParseResult<false>;
function parseChordBlocks(state: EditorState, from: number, to: number, parseChords = true, openBlockFrom: OpenBlockDef | null = null, stopAfterFirstBlock = false, greedy = false): ChordBlocksParseResult<boolean> {
	ifDebug(state, () => console.log("parseChordBlocks", {from, to, parseChords, openBlockFrom}));
	const chordBlockRanges: Range<ChordBlockRangeValue>[] = [];
	const chordDecos: Range<Decoration>[] = [];
	const settings = state.facet(chordSheetsConfigFacet);

	let instrument = openBlockFrom === null
		? settings.defaultInstrument
		: openBlockFrom.value.instrument;
	let currentBlockStart: number | null = openBlockFrom?.from ?? null;

	const processedChordLines = new Set<number>();

	let tree: Tree | null = null;
	const iterate = (_from: number = from, _stopAfterFirstBlock: boolean = stopAfterFirstBlock) => {
		let skip = false;
		tree?.iterate({
			from: _from,
			to,
			enter(node) {
				if (skip) {
					return false;
				}

				if (node.type.name.contains("HyperMD-codeblock-begin")) {
					const line = state.doc.lineAt(node.from);

					// It is safe to interpolate the user-provided block language specifier without escaping
					// as only characters a-z are allowed (provided this is set using the settings UI in Obsidian).
					const chordBlockStartMatch = line.text.match(`^(?:~{3,}|\`{3,})(${settings.blockLanguageSpecifier})\\b-?(.*)`);
					if (chordBlockStartMatch) {
						if (chordBlockStartMatch[2]) {
							if (!Object.keys(ChordsDB).includes(chordBlockStartMatch[2])) {
								console.error(`Unknown instrument: ${chordBlockStartMatch[2]}`);
								return false;
							}

							instrument = chordBlockStartMatch[2] as Instrument;
						}

						currentBlockStart = node.from;
					}
				} else if (
					currentBlockStart !== null && node.type.name.contains("HyperMD-codeblock-end")) {
					chordBlockRanges.push(new ChordBlockRangeValue(instrument).range(currentBlockStart, node.to));
					currentBlockStart = null;
					instrument = settings.defaultInstrument;


					if (_stopAfterFirstBlock) {
						skip = true;
						return false;
					}
				} else if (parseChords && (currentBlockStart !== null)) {
					const line = state.doc.lineAt(node.from);
					if (!processedChordLines.has(line.number)) {
						chordDecos.push(...chordDecosForLineAt(line, settings));
						processedChordLines.add(line.number);
					}
				}
			},
		});
	};

	tree = syntaxTree(state);
	iterate();

	let currentTreeLength = tree.length;
	if (greedy) {
		// if parsing stopped in the middle of a chord block, push the parser forward step by step until the
		// end is found
		let triedMs = 0;
		const parseMs = 1;
		const parseTimeout = 500;
		while (currentBlockStart !== null && currentTreeLength != state.doc.length && triedMs <= parseTimeout) {
			ifDebug(state, () => console.log(`Parse forward: ${currentTreeLength + 100}`));
			tree = ensureSyntaxTree(state, Math.min(currentTreeLength + 100, state.doc.length), parseMs);
			triedMs += parseMs;
			if (tree) {
				iterate(currentTreeLength, true);
				currentTreeLength = tree.length;
			}
			if (currentBlockStart === null) {
				ifDebug(state, () => {
					console.log("🎉 found end!: " + chordBlockRanges.last()?.to);
					console.log({currentRealTreeLength: syntaxTree(state).length});
				});
			}
		}
	}


	let danglingBlock: Range<ChordBlockRangeValue> | null = null;
	// block is still open, so parsing stopped in the middle of a block or block is unclosed
	if (currentBlockStart !== null) {
		if (greedy) {
			ifDebug(state, () => console.log(`Could not find end of block starting at ${currentBlockStart} before timeout.`));
		}
		ifDebug(state, () => console.log(`Dangling block at ${currentBlockStart}`));
		danglingBlock = new ChordBlockRangeValue(instrument, true).range(currentBlockStart, currentTreeLength);
		chordBlockRanges.push(danglingBlock);
	}

	const result = {
		chordBlockRanges,
		chordDecos: parseChords ? chordDecos : null,
		parsedUntil: new ParsedUntilRangeValue().range(Math.min(to, syntaxTree(state).length)),
		danglingBlockDef: danglingBlock ? {from: danglingBlock.from, value: danglingBlock.value} : null
	};
	ifDebug(state, () => console.debug("parseChordBlocks result", result));

	return result;
}


function chordDecosForLineAt(line: Line, {
	chordLineMarker,
	textLineMarker,
	highlightChords,
	highlightSectionHeaders
}: ChordSheetsSettings) {
	const chordDecos = [];
	const tokenizedLine = tokenizeLine(line.text, chordLineMarker, textLineMarker);

	if (isChordLine(tokenizedLine)) {
		if (highlightChords) {
			const lineDeco = Decoration.line({
				type: "line",
				class: "chord-sheet-chord-line"
			});
			chordDecos.push(lineDeco.range(line.from));
		}
	}

	for (const token of tokenizedLine.tokens) {
		if (isChordLine(tokenizedLine) && isChordToken(token)) {
			const deco = Decoration.mark({
				type: "chord",
				class: `chord-sheet-chord-name${highlightChords ? " chord-sheet-chord-highlight" : ""}`,
				token
			});
			const index = line.from + token.index;
			chordDecos.push(deco.range(index, index + token.value.length));

		} else if (isMarkerToken(token)) {
			const deco = Decoration.mark({
				class: "chord-sheet-line-marker",
				token
			});
			const index = line.from + token.index;
			chordDecos.push(deco.range(index, index + token.value.length));

		} else if (highlightSectionHeaders && isHeaderToken(token)) {
			const startTagIndex = line.from + token.index;
			const headerNameIndex = line.from + token.headerNameIndex;
			const endTagIndex = line.from + token.endTagIndex;
			const endIndex = endTagIndex + token.endTag.length;

			chordDecos.push(
				Decoration
					.line({ class: "chord-sheet-section-header", token })
					.range(line.from),
				Decoration
					.mark({ class: "chord-sheet-section-header-content", token })
					.range(startTagIndex, endIndex),
				Decoration
					.mark({ class: "chord-sheet-section-header-tag", token })
					.range(startTagIndex, startTagIndex + token.startTag.length),
				Decoration
					.mark({ class: "chord-sheet-section-header-name cm-strong", token })
					.range(headerNameIndex, headerNameIndex + token.headerName.length),
				Decoration.mark({ class: "chord-sheet-section-header-tag", token })
					.range(endTagIndex, endIndex)
			);
		}
	}

	return chordDecos;
}

