import {MarkdownRenderChild} from "obsidian";
import {ChordToken, Instrument, isChordLine, isChordToken, tokenizeLine, uniqueChordTokens} from "./chordsUtils";
import tippy from "tippy.js/headless";
import {makeChordDiagram, makeChordOverview} from "./chordDiagrams";

export class ChordBlockPostProcessorView extends MarkdownRenderChild {
	source: string;

	constructor(
		containerEl: HTMLElement,
		private instrument: Instrument,
		private showChordOverview: boolean,
		private showChordDiagramsOnHover: boolean,
		private diagramWidth: number
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
		if (this.containerEl.children.length > 0) {
			this.containerEl.empty();
		}

		const lines = this.source.split("\n");
		const chordTokens: ChordToken[] = [];

		const codeEl = this.containerEl.createEl("code", {cls: "chord-sheet-chord-block-preview"});
		for (const line of lines) {
			const tokenizedLine = tokenizeLine(line);
			if (isChordLine(tokenizedLine)) {
				const lineDiv = codeEl.createDiv({
					cls: "chord-sheet-chord-line"
				});
				for (const token of tokenizedLine.tokens) {
					if (isChordToken(token)) {
						chordTokens.push(token);
						const tokenEl = lineDiv.createSpan({
							cls: "chord-sheet-chord-name",
							text: token.value
						});
						if (this.showChordDiagramsOnHover) {
							this.attachChordDiagram(token, tokenEl);
						}
					} else {
						lineDiv.appendChild(document.createTextNode(token.value));
					}
				}
			} else {
				codeEl.appendChild(document.createTextNode(line + "\n"));
			}
		}

		if (this.showChordOverview) {
			const uniqueTokens = uniqueChordTokens(chordTokens);
			const overviewContainerEl = createDiv({cls: "chord-sheet-chord-overview-container"});
			const overviewEl = overviewContainerEl.createDiv({cls: "chord-sheet-chord-overview"});
			makeChordOverview(this.instrument, overviewEl, uniqueTokens, this.diagramWidth);
			this.containerEl.prepend(overviewContainerEl);
		}
	}

	private attachChordDiagram(token: ChordToken, tokenEl: HTMLElement) {
		const popper = document.createElement("div");
		const {instrument, diagramWidth} = this;
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
