import {MarkdownRenderChild} from "obsidian";
import {
	ChordToken,
	Instrument,
	isChordToken,
	isHeaderToken,
	isMarkerToken,
	isRhythmToken,
	tokenizeLine,
	uniqueChordTokens
} from "./chordsUtils";
import tippy from "tippy.js/headless";
import {makeChordDiagram, makeChordOverview} from "./chordDiagrams";
import {ChordSheetsSettings} from "./chordSheetsSettings";

export class ChordBlockPostProcessorView extends MarkdownRenderChild {
	source: string;

	constructor(
		containerEl: HTMLElement,
		private instrument: Instrument,
		private settings: ChordSheetsSettings
	) {
		super(containerEl);
	}

	async onload() {

		const codeEl = this.containerEl.getElementsByTagName("code").item(0);
		if (codeEl) {
			this.source = codeEl.innerText;
		}

		this.render();
	}

	private render() {
		const {
			chordLineMarker,
			textLineMarker,
			showChordDiagramsOnHover,
			showChordOverview,
			diagramWidth,
			highlightChords,
			highlightSectionHeaders,
			highlightRhythmMarkers
		} = this.settings;

		if (this.containerEl.children.length > 0) {
			this.containerEl.empty();
		}

		const codeEl = this.containerEl.createEl("code", {cls: "chord-sheet-chord-block-preview"});

		const chordTokens: ChordToken[] = [];
		const lines = this.source.split("\n");
		let currentIndex = 0;
		for (const line of lines) {
			const tokenizedLine = tokenizeLine(line, currentIndex, chordLineMarker, textLineMarker);

			const lineDiv = codeEl.createDiv({
				cls: "chord-sheet-chord-line"
			});

			for (const token of tokenizedLine.tokens) {
				if (isChordToken(token)) {
					chordTokens.push(token);
					const chordSpan = lineDiv.createSpan({
						cls: "chord-sheet-chord",
					});

					if (token.startTag) {
						chordSpan.createSpan({
							cls: `chord-sheet-inline-chord-tag`,
							text: token.startTag.value
						});
					}

					chordSpan.createSpan({
						cls: `chord-sheet-chord-name${highlightChords ? " chord-sheet-chord-highlight" : ""}`,
						text: token.chordSymbol
					});

					if (token.auxText) {
						chordSpan.createSpan({
							cls: `chord-sheet-inline-chord-aux-text`,
							text: token.auxText.value
						});
					}

					if (token.endTag) {
						chordSpan.createSpan({
                            cls: `chord-sheet-inline-chord-tag`,
                            text: token.endTag.value
                        });
					}


					if (showChordDiagramsOnHover) {
						this.attachChordDiagram(token, chordSpan);
					}
				} else if (highlightRhythmMarkers && isRhythmToken(token)) {
					lineDiv.createSpan({
						cls: `chord-sheet-rhythm-marker`,
						text: token.value
					});
				} else if (isMarkerToken(token)) {
					lineDiv.createSpan({
						cls: `chord-sheet-line-marker`,
						text: token.value
					});
				} else if (highlightSectionHeaders && isHeaderToken(token)) {
					lineDiv.addClass("chord-sheet-section-header");
					const headerSpan = lineDiv.createSpan({
						cls: "chord-sheet-section-header-content",
					});
					headerSpan.createSpan({
						cls: `chord-sheet-section-header-tag`,
						text: token.startTag
					});
					headerSpan.createSpan({
						cls: `chord-sheet-section-header-name cm-strong`,
                        text: token.headerName
					});
					headerSpan.createSpan({
						cls: `chord-sheet-section-header-tag`,
						text: token.endTag
					});
				} else {
					lineDiv.append(document.createTextNode(token.value));
				}
			}

			currentIndex = currentIndex + line.length;
		}

		if (showChordOverview) {
			const uniqueTokens = uniqueChordTokens(chordTokens);
			const overviewContainerEl = createDiv({cls: "chord-sheet-chord-overview-container"});
			const overviewEl = overviewContainerEl.createDiv({cls: "chord-sheet-chord-overview"});
			makeChordOverview(this.instrument, overviewEl, uniqueTokens, diagramWidth);
			this.containerEl.prepend(overviewContainerEl);
		}
	}

	private attachChordDiagram(token: ChordToken, tokenEl: HTMLElement) {
		const popper = document.createElement("div");
		const { instrument, settings } = this;
		const { diagramWidth } = settings;

		popper.classList.add("chord-sheet-chord-popup");

		// noinspection JSUnusedGlobalSymbols
		tippy(tokenEl, {
			interactive: true,
			render() {
				return {popper};
			},
			onShow(instance) {
				const chordBox = makeChordDiagram(instrument, token, diagramWidth);
				if (chordBox) {
					instance.popper.appendChild(chordBox);
				} else {
					return false;
				}
			},
			onHidden(instance) {
				instance.popper.empty();
			}
		});

	}

}
