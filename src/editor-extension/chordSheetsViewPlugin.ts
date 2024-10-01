import {Decoration, EditorView, PluginValue, ViewPlugin, ViewUpdate} from "@codemirror/view";
import {ChordToken, isChordToken} from "../chordsUtils";
import {ChordTooltip} from "./chordTooltip";
import {ChordSheetsSettings} from "../chordSheetsSettings";
import {ChangeSet, ChangeSpec} from "@codemirror/state";
import {
	ChordBlocksState,
	chordBlocksStateField,
	chordSheetsConfig,
	chordSheetsConfigFacet,
	chordSheetViewportUpdateEffect,
	finishParsingIncompleteBlockEffect,
	IChordBlockRangeValue,
	ifDebug
} from "./chordBlocksStateField";

export interface TransposeEventDetail {
	direction: "up" | "down",
	blockDef: {
		from: number
		to: number
		value: IChordBlockRangeValue
	}
}

export const chordSheetEditorPlugin = () => ViewPlugin.fromClass(ChordSheetsViewPlugin, {
	eventHandlers: {
		click: function (event: MouseEvent, view: EditorView) {
			const target = event.target as HTMLElement;
			ifDebug(view.state, () => console.log(view.posAtDOM(target)));
			if (target.nodeName === "BUTTON" && target.classList.contains("chord-sheet-transpose")) {
				event.stopPropagation();
				const pos = view.posAtDOM(target);
				const chordBlockRange = view.state.field(chordBlocksStateField).ranges.iter(pos);
				if (chordBlockRange.value) {
					const transposeEvent = new CustomEvent<TransposeEventDetail>('chord-sheet-transpose', {
						detail: {
							direction: target.classList.contains("chord-sheet-transpose-up") ? "up" : "down",
							blockDef: {
								from: chordBlockRange.from,
								to: chordBlockRange.to,
								value: chordBlockRange.value
							}
						}
					});
					window.dispatchEvent(transposeEvent);
				}
			}
		},
		mousemove: function (event: MouseEvent, view: EditorView) {
			const {showChordDiagramsOnHover} = view.state.facet(chordSheetsConfigFacet);
			if (
				view.state.field(chordBlocksStateField).ranges.size === 0
				|| !(showChordDiagramsOnHover === "always" || showChordDiagramsOnHover === "edit")
			) {
				return;
			}

			const pos = view.posAtCoords({x: event.clientX, y: event.clientY});
			let isOverEl = false;
			if (pos) {
				view.state.field(chordBlocksStateField).chordDecos.between(pos, pos, (_from, _to, deco) => {
					if (!deco.spec.token) {
						return;
					}

					if (this.currentDeco != deco) {
						this.tooltip.hide();
						if (isChordToken(deco.spec.token)) {
							const chordToken: ChordToken = deco.spec.token;
							const dom = view.domAtPos(pos);
							let el = dom.node.parentElement;
							while (el && !el.classList.contains("chord-sheet-chord")) {
								el = el.parentElement;
							}
							if (el) {
								// Check if the mouse is actually over the element "el". This is necessary because domAtCoords
								// seems to also return the element when the coords are before or after the end of the line.
								const elRect = el.getBoundingClientRect();
								isOverEl = event.clientX >= elRect.left && event.clientX <= elRect.right && event.clientY >= elRect.top && event.clientY <= elRect.bottom;

								if (isOverEl) {
									const currentBlock = view.state.field(chordBlocksStateField).ranges.iter(pos);
									const diagramWidth = view.state.facet(chordSheetsConfigFacet).diagramWidth;
									if (currentBlock.value) {
										this.currentDeco = deco;
										this.currentEl = el;
										this.tooltip.show(el, currentBlock.value.instrument, chordToken, diagramWidth);
									}
								}
							}
						}

					}
					return false;
				});

				if (this.currentDeco && !isOverEl) {
					const tooltipRect = this.tooltip.popper.getBoundingClientRect();
					const targetRect = this.currentEl?.getBoundingClientRect();

					if (targetRect) {
						const isMouseOverTooltip = event.clientX >= tooltipRect.left && event.clientX <= tooltipRect.right
							&& event.clientY >= tooltipRect.top && event.clientY <= tooltipRect.bottom;

						const isMouseBetweenTargetAndTooltipHorizontal = (event.clientY >= targetRect.top && event.clientY <= tooltipRect.bottom)
							&& ((event.clientX >= targetRect.left && event.clientX <= tooltipRect.left) || (event.clientX <= targetRect.right && event.clientX >= tooltipRect.right));

						const isMouseBetweenTargetAndTooltipVertical = (event.clientX >= targetRect.left && event.clientX <= tooltipRect.right)
							&& ((event.clientY >= targetRect.top && event.clientY <= tooltipRect.top) || (event.clientY <= targetRect.bottom && event.clientY >= tooltipRect.bottom));

						if (isMouseOverTooltip || isMouseBetweenTargetAndTooltipHorizontal || isMouseBetweenTargetAndTooltipVertical) {
							// Do not hide tooltip if the mouse is over the tooltip itself or if it is between the target element and tooltip.
							return;
						}
					}

					this.currentDeco = null;
					this.currentEl = null;
					this.tooltip.hide();
				}
			}
		}
	}
});

export class ChordSheetsViewPlugin implements PluginValue {
	currentDeco: Decoration | null;
	currentEl: HTMLElement | null;
	tooltip;

	constructor(private view: EditorView) {
		this.tooltip = new ChordTooltip(view.dom);
	}


	getChordSheetBlockAtCursor(): {
		from: number,
		to: number,
		value: IChordBlockRangeValue
	} | null {
		const cursorPos = this.view.state.selection.main.from;

		let from: number | null = null;
		let to: number | null = null;
		let blockValue: IChordBlockRangeValue | null = null;
		this.view.state.field(chordBlocksStateField).ranges.between(cursorPos, cursorPos, (blockFrom, blockTo, value) => {
			from = blockFrom;
			to = blockTo;
			blockValue = {partiallyParsed: value.partiallyParsed, instrument: value.instrument};
			return false;
		});

		if (from !== null && to !== null && blockValue !== null) {
			return {from, to, value: blockValue};
		}

		return null;
	}

	async getChordTokensForBlock(blockDef: { from: number, to: number, value: IChordBlockRangeValue }) {
		const chordTokens: ChordToken[] = [];

		let chordBlocksState: ChordBlocksState;
		let chordBlockEnd: number;
		if (blockDef.value.partiallyParsed) {
			chordBlocksState = await new Promise<ChordBlocksState>((resolve) =>
				this.view.dispatch({
					effects: finishParsingIncompleteBlockEffect.of({
						blockDef, callback: resolve
					})
				}));
			chordBlockEnd = chordBlocksState.ranges.iter(blockDef.from).to;

		} else {
			chordBlocksState = this.view.state.field(chordBlocksStateField);
			chordBlockEnd = blockDef.to;
		}

		chordBlocksState.chordDecos.between(blockDef.from, chordBlockEnd, (_from, _to, value) => {
			if (value.spec.type === "chord") {
				chordTokens.push(value.spec.token);
			}
		});

		return chordTokens;
	}

	hasChordBlocks(): boolean {
		return this.view.state.field(chordBlocksStateField).ranges.size > 0;
	}


	update(update: ViewUpdate) {
		if (update.docChanged) {
			// document changes are handled by the state field
			return;
		}

		if (update.viewportChanged) {
			const {parsedUntil} = update.state.field(chordBlocksStateField);
			ifDebug(update.state, () => console.log("Viewport to: " + update.view.viewport.to, "parsedUntil", parsedUntil.from));

			if (update.view.viewport.to > parsedUntil.from) {
				ifDebug(update.state, () => console.log("Out of parse"));
				setTimeout(() => update.view.dispatch({effects: chordSheetViewportUpdateEffect.of()}));

			}

		}
	}

	destroy() {
		this.tooltip.hide();
		this.tooltip.popper.remove();
	}

	updateSettings(settings: ChordSheetsSettings) {
		this.view.dispatch({
			effects: chordSheetsConfig.reconfigure(chordSheetsConfigFacet.of({...settings}))
		});
	}

	applyChanges(changes: ChangeSpec[]) {
		this.view.dispatch({changes: ChangeSet.of(changes, this.view.state.doc.length)});
	}
}
