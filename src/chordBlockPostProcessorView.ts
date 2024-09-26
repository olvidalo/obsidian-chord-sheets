import {MarkdownRenderChild} from "obsidian";
import {
	ChordToken,
	Instrument,
	isChordToken,
	isHeaderToken,
	isMarkerToken,
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
			highlightSectionHeaders
		} = this.settings;

		if (this.containerEl.children.length > 0) {
			this.containerEl.empty();
		}

		const lines = this.source.split("\n");
		const chordTokens: ChordToken[] = [];

		const codeEl = this.containerEl.createEl("code", {cls: "chord-sheet-chord-block-preview"});
		for (const line of lines) {
			const tokenizedLine = tokenizeLine(line, chordLineMarker, textLineMarker);

			const lineDiv = codeEl.createDiv({
				cls: "chord-sheet-chord-line"
			});

			for (const token of tokenizedLine.tokens) {
				if (tokenizedLine.isChordLine && isChordToken(token)) {
					chordTokens.push(token);
					const tokenEl = lineDiv.createSpan({
						cls: `chord-sheet-chord-name${highlightChords ? " chord-sheet-chord-highlight" : ""}`,
						text: token.value
					});
					if (showChordDiagramsOnHover) {
						this.attachChordDiagram(token, tokenEl);
					}
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
