// noinspection JSUnusedGlobalSymbols

import {addIcon, debounce, Editor, MarkdownFileInfo, MarkdownView, Notice, Plugin, TFile, View} from 'obsidian';
import {EditorView, ViewPlugin} from "@codemirror/view";
import {Instrument} from "./chordsUtils";
import {ChordBlockPostProcessorView} from "./chordBlockPostProcessorView";
import {ChordSheetsSettings, DEFAULT_SETTINGS} from "./chordSheetsSettings";
import {Extension} from "@codemirror/state";
import {
	chordSheetEditorPlugin,
	ChordSheetsViewPlugin,
	ChordSymbolRange,
	EnharmonicToggleEventDetail,
	TransposeEventDetail
} from "./editor-extension/chordSheetsViewPlugin";
import {InstrumentChangeEventDetail} from "./editor-extension/chordBlockToolsWidget";
import {AutoscrollControl, SPEED_CHANGED_EVENT} from "./autoscrollControl";
import {ChordSheetsSettingTab} from "./chordSheetsSettingTab";
import {IChordSheetsPlugin} from "./chordSheetsPluginInterface";
import {chordSheetsEditorExtension} from "./editor-extension/chordSheetsEditorExtension";
import ChordsDB from "@tombatossals/chords-db";
import {addCustomChordTypes} from "./customChordTypes";
import {enharmonicToggle, transpose} from "./chordProcessing";


const AUTOSCROLL_SPEED_PROPERTY = "autoscroll-speed";

export default class ChordSheetsPlugin extends Plugin implements IChordSheetsPlugin {
	settings: ChordSheetsSettings;
	editorPlugin: ViewPlugin<ChordSheetsViewPlugin>;
	editorExtension: Extension[] | null;

	viewAutoscrollControlMap = new WeakMap<View, AutoscrollControl>();

	async onload() {
		addCustomChordTypes();
		await this.loadSettings();
		this.app.workspace.trigger("parse-style-settings");
		addIcon("enharmonic-toggle", enharmonicToggleIcon);

		// Register code block post processor for reading mode

		this.registerMarkdownPostProcessor((element, context) => {
			const codeblocks = element.querySelectorAll("code[class*=language-chords]");
			for (let index = 0; index < codeblocks.length; index++) {
				const codeblock = codeblocks.item(index);
				const langClass = Array.from(codeblock.classList).find(cls => cls.startsWith("language-chords"))?.substring(9);
				if (langClass) {
					const instrumentString = langClass.split("-")[1];
					const instrument = instrumentString as Instrument ?? this.settings.defaultInstrument;
					context.addChild(new ChordBlockPostProcessorView(
						codeblock.parentElement!,
						instrument as Instrument,
						this.settings
					));
				}
			}

		});



		// Register editor extension for edit / live preview mode

		this.editorPlugin = chordSheetEditorPlugin();
		this.editorExtension = chordSheetsEditorExtension(this.settings, this.editorPlugin);
		this.registerEditorExtension(this.editorExtension);


		// Handle chord sheet custom events sent by the editor extension

		this.registerDomEvent(window, "chord-sheet-instrument-change", (event: CustomEvent<InstrumentChangeEventDetail>) => {
			const editor = this.app.workspace.activeEditor?.editor;
			const { selectedInstrument, from } = event.detail;
			if (editor) {
				const editorView = editor.cm as EditorView;
				this.changeInstrument(editorView, selectedInstrument as Instrument, from);
			}
		});

		this.registerDomEvent(window, "chord-sheet-transpose", async (event: CustomEvent<TransposeEventDetail>) => {
			const {direction, blockDef} = event.detail;
			const editor = this.app.workspace.activeEditor?.editor;

			if (editor) {
				// @ts-ignore
				const editorView = editor.cm as EditorView;
				const chordPlugin = editorView?.plugin(this.editorPlugin);
				if (chordPlugin) {
					const chordTokens = await chordPlugin.getChordSymbolRangesForBlock(blockDef);
					this.transpose(chordTokens, editorView, direction);
				}
			}
		});

        this.registerDomEvent(window, "chord-sheet-enharmonic-toggle", async (event: CustomEvent<EnharmonicToggleEventDetail>) => {
			const {blockDef} = event.detail;
			const editor = this.app.workspace.activeEditor?.editor;

			if (editor) {
				// @ts-ignore
				const editorView = editor.cm as EditorView;
				const chordPlugin = editorView?.plugin(this.editorPlugin);
				if (chordPlugin) {
					const chordTokens = await chordPlugin.getChordSymbolRangesForBlock(blockDef);
					this.enharmonicToggle(chordTokens, editorView);
				}
			}
		});


		// Handle obsidian events

		const debounceAutoscrollUpdate = debounce((view: View | MarkdownFileInfo | null) => {
			this.stopAllAutoscrolls();
			if (view instanceof MarkdownView) {
				this.updateAutoscrollButton(view);
			}
		}, 100, false);


		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view) {
					debounceAutoscrollUpdate(leaf.view);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, view) => {
				debounceAutoscrollUpdate(view);
			})
		);


		// Register editor commands

		this.addCommand({
			id: 'block-instrument-change-default',
			name: `Change instrument for the current chord block to the default instrument (${(this.settings.defaultInstrument)})`,
			editorCheckCallback: (checking: boolean, _editor: Editor, view: MarkdownView)  => {
				return this.changeInstrumentCommand(view, this.editorPlugin, checking, null);
			}
		});

		for (const instrument of Object.keys(ChordsDB) as Instrument[]) {
			this.addCommand({
				id: `block-instrument-change-${instrument}`,
				name: `Change instrument for the current chord block to ${instrument}`,
				editorCheckCallback: (checking: boolean, _editor: Editor, view: MarkdownView)  => {
					return this.changeInstrumentCommand(view, this.editorPlugin, checking, instrument);
				}
			});
		}

		this.addCommand({
			id: 'transpose-block-up',
			name: 'Transpose current chord block one semitone up',
			editorCheckCallback: (checking: boolean, editor: Editor) =>
				this.transposeCommand(editor, this.editorPlugin, checking, "up")
		});

		this.addCommand({
			id: 'transpose-block-down',
			name: 'Transpose current chord block one semitone down',
			editorCheckCallback: (checking: boolean, editor: Editor) =>
				this.transposeCommand(editor, this.editorPlugin, checking, "down")
		});

        this.addCommand({
			id: 'enharmonic-toggle',
			name: 'Enharmonically toggle chords in current block between sharp (#) and flat (b).',
			editorCheckCallback: (checking: boolean, editor: Editor) =>
				this.enharmonicToggleCommand(editor, this.editorPlugin, checking)
		});

		this.addCommand({
			id: 'toggle-autoscroll',
			name: 'Toggle autoscroll',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					return false;
				}

				if (!checking) {
					this.toggleAutoscroll(view);
				}

				return true;
			}
		});

		this.addCommand({
			id: 'autoscroll-increase',
			name: 'Increase autoscroll speed',
			editorCheckCallback: (checking: boolean) => this.adjustScrollSpeedCommand('increase', checking)
		});

		this.addCommand({
			id: 'autoscroll-decrease',
			name: 'Decrease autoscroll speed',
			editorCheckCallback: (checking: boolean) => this.adjustScrollSpeedCommand('decrease', checking)
		});

		this.addCommand({
			id: 'autoscroll-save',
			name: 'Save current autoscroll speed to frontmatter',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view?.file) {
					return;
				}

				const autoscrollControl = this.viewAutoscrollControlMap.get(view);
				const speed = autoscrollControl?.speed ?? this.settings.autoscrollDefaultSpeed;


				if (!checking) {
					this.saveAutoscrollSpeed(view.file, speed);
				}

				return true;
			}
		});


		this.addSettingTab(new ChordSheetsSettingTab(this.app, this));

		if (this.getMetadataType(AUTOSCROLL_SPEED_PROPERTY) !== "number") {
			this.app.metadataTypeManager.setType(AUTOSCROLL_SPEED_PROPERTY, "number");
		}
	}

	private getMetadataType(property: string) {
		// new API >= 1.9.2
		if (this.app.metadataTypeManager.getTypeInfo) {
			// @ts-ignore
			const typeInfo = this.app.metadataTypeManager.getTypeInfo(property);
			return typeInfo?.expected.type;
		}

		// old API <= 1.9.1
		return this.app.metadataTypeManager.getAssignedType?.(property);
	}

	private changeInstrumentCommand(view: MarkdownView, plugin: ViewPlugin<ChordSheetsViewPlugin>, checking: boolean, instrument: Instrument | null) {
		const editorView = view.editor.cm as EditorView;
		const chordPlugin = editorView.plugin(plugin);
		if (chordPlugin) {
			const chordSheetBlockAtCursor = chordPlugin.getChordSheetBlockAtCursor();
			if (!chordSheetBlockAtCursor) {
				return false;
			}

			if (!checking) {
				this.changeInstrument(editorView, instrument, chordSheetBlockAtCursor.from);
			}
		}

		return true;
	}

	private transposeCommand(editor: Editor, plugin: ViewPlugin<ChordSheetsViewPlugin>, checking: boolean, direction: "up" | "down") {
		const editorView = editor.cm as EditorView;
		const chordPlugin = editorView.plugin(plugin);
		if (chordPlugin) {
			const chordSheetBlockAtCursor = chordPlugin.getChordSheetBlockAtCursor();
			if (!chordSheetBlockAtCursor) {
				return false;
			}

			if (!checking) {
				chordPlugin.getChordSymbolRangesForBlock(chordSheetBlockAtCursor).then(
					chordTokens => this.transpose(chordTokens, editorView, direction)
				);
			}
		}

		return true;
	}

    private enharmonicToggleCommand(editor: Editor, plugin: ViewPlugin<ChordSheetsViewPlugin>, checking: boolean) {
		const editorView = editor.cm as EditorView;
		const chordPlugin = editorView.plugin(plugin);
		if (chordPlugin) {
			const chordSheetBlockAtCursor = chordPlugin.getChordSheetBlockAtCursor();
			if (!chordSheetBlockAtCursor) {
				return false;
			}

			if (!checking) {
				chordPlugin.getChordSymbolRangesForBlock(chordSheetBlockAtCursor).then(
					chordTokens => this.enharmonicToggle(chordTokens, editorView)
				);
			}
		}

		return true;
	}

	private adjustScrollSpeedCommand(action: 'increase' | 'decrease', checking: boolean) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return false;
		}

		const autoscrollControl = this.viewAutoscrollControlMap.get(view);
		if (!autoscrollControl || !autoscrollControl.isRunning) {
			return false;
		}

		if (!checking) {
			if (autoscrollControl) {
				action === 'increase' ? autoscrollControl.increaseSpeed() : autoscrollControl.decreaseSpeed();
			}
		}

		return true;
	}

	private changeInstrument(editor: EditorView, selectedInstrument: Instrument | null, blockStart: number) {
		const languageSpecifier = this.settings.blockLanguageSpecifier;
		const newInstrumentDef = selectedInstrument === null
			? languageSpecifier
			: `${languageSpecifier}-${selectedInstrument}`;
		const editorView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (editorView) {
			const lineNo = editorView.editor.offsetToPos(blockStart).line;
			const startLine = editorView.editor.getLine(lineNo);
			const newLine = startLine.replace(/\w+\S+/, newInstrumentDef);
			// editorView.editor.setLine(lineNo, newLine)
			editor.plugin(this.editorPlugin)?.applyChanges([{
				from: blockStart,
				to: blockStart + startLine.length,
				insert: newLine
			}]);
		}
	}

	private transpose(chordRanges: ChordSymbolRange[], editor: EditorView, direction: "up" | "down") {
		const changes = transpose(chordRanges, direction);
		editor.plugin(this.editorPlugin)?.applyChanges(changes);
	}

    private enharmonicToggle(chordTokenRanges: ChordSymbolRange[], editor: EditorView) {
		const changes = enharmonicToggle(chordTokenRanges);
		if (changes.length === 0) {
			new Notice("No chords with accidentals were found.");
			return;
		}
		editor.plugin(this.editorPlugin)?.applyChanges(changes);
	}

	private toggleAutoscroll(view: MarkdownView) {
		const autoscrollControl = this.viewAutoscrollControlMap.get(view);

		if (autoscrollControl?.isRunning) {
			autoscrollControl.stop();
		} else {
			this.startAutoscroll(view);
		}

		this.updateAutoscrollButton(view);

	}

	private updateAutoscrollButton(view: MarkdownView | MarkdownFileInfo) {
		// @ts-expect-error, not typed
		const editorView = view.editor.cm as EditorView;
		const plugin = editorView.plugin(this.editorPlugin);
		if (plugin && view instanceof MarkdownView) {
			const existingEl: HTMLElement | null = view.containerEl.querySelector(".chord-sheet-autoscroll-action");

			const shouldShowButton = this.settings.showAutoscrollButton === "always"
				|| (
					plugin.hasChordBlocks() && this.settings.showAutoscrollButton === "chord-blocks"
				);

			if (shouldShowButton) {
				const autoscrollControl = this.viewAutoscrollControlMap.get(view);
				const icon = autoscrollControl?.isRunning ? "pause-circle" : "play-circle";
				if (!existingEl || icon !== existingEl.dataset.icon) {
					existingEl?.remove();
					const viewEl = view.addAction(icon, "Toggle autoscroll", () => {
						this.toggleAutoscroll(view);
					});
					viewEl.addClass("chord-sheet-autoscroll-action");
					viewEl.dataset.icon = icon;
				}
			} else if (existingEl) {
				existingEl.remove();
			}
		}
	}

	private getAutoscrollSpeedFromFrontmatter(file: TFile | null): number | null {
		if (!file) {
			return null;
		}
		const frontmatterSpeedValue = this.app.metadataCache.getFileCache(file)?.frontmatter?.[AUTOSCROLL_SPEED_PROPERTY];
		const frontmatterSpeedNumber = parseInt(frontmatterSpeedValue);
		return frontmatterSpeedNumber && !isNaN(frontmatterSpeedNumber)
			? frontmatterSpeedNumber
			: null;
	}

	private startAutoscroll(view: MarkdownView) {
		const activeFile = view.file;
		if (!activeFile) {
			return;
		}

		const frontmatterSpeed = this.getAutoscrollSpeedFromFrontmatter(activeFile);

		let autoscrollControl = this.viewAutoscrollControlMap.get(view);
		if (autoscrollControl) {
			if (frontmatterSpeed && frontmatterSpeed != autoscrollControl.speed) {
				autoscrollControl.speed = frontmatterSpeed;
			}
		} else {
			const speed = frontmatterSpeed ?? this.settings.autoscrollDefaultSpeed;

			autoscrollControl = new AutoscrollControl(view, speed);
			this.registerEvent(autoscrollControl.events.on(SPEED_CHANGED_EVENT, (newSpeed: number) => {
				// Update the speed saved in frontmatter if needed

				const file = view.file;
				if (!file) {
					return;
				}

				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				const isSpeedInFrontmatter = frontmatter && AUTOSCROLL_SPEED_PROPERTY in frontmatter;

				if (this.settings.alwaysSaveAutoscrollSpeedToFrontmatter || isSpeedInFrontmatter) {
					this.saveAutoscrollSpeed(file, newSpeed);
				}
			}));

			this.viewAutoscrollControlMap.set(view, autoscrollControl);
		}

		autoscrollControl.start();
	}

	private saveAutoscrollSpeed(file: TFile, newSpeed: number) {
		this.app.fileManager.processFrontMatter(file, frontmatter => {
			frontmatter[AUTOSCROLL_SPEED_PROPERTY] = this.getMetadataType(AUTOSCROLL_SPEED_PROPERTY) === "number"
				? newSpeed
				: newSpeed.toString();
		}).then();
	}

	stopAllAutoscrolls() {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view.getViewType() === "markdown") {
				const autoscrollControl = this.viewAutoscrollControlMap.get(leaf.view);
				autoscrollControl?.stop();
			}
		});
	}

	applyNewSettingsToEditors() {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view.getViewType() === "markdown") {
				const markdownView = leaf.view as MarkdownView;
				const editorView = markdownView.editor?.cm as EditorView | null;
				markdownView.previewMode?.rerender(true);
				const chordPlugin = editorView?.plugin(this.editorPlugin);
				chordPlugin?.updateSettings(this.settings);
			}
		});

		if (this.editorExtension) {
			this.editorExtension.length = 0;
			this.editorExtension.push(...chordSheetsEditorExtension(this.settings, this.editorPlugin));
			this.app.workspace.updateOptions();
		}
	}


	onunload() {
		this.stopAllAutoscrolls();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const enharmonicToggleIcon = `<g>
    <path d="m 67.938374,81.624479 c 2.039181,-1.006678 3.932707,-2.348915 5.971893,-3.556933 3.058768,-2.147583 6.263191,-4.160945 8.884993,-6.84542 C 84.615959,69.4101 86.21817,66.926959 86.145346,63.8398 86.072466,60.551317 83.96051,58.068173 81.70285,56.725929 78.279936,54.645461 74.128749,54.444121 70.123215,56.323277" style="stroke-width:7.75711"/>
    <line x1="67.719902" y1="32.028694" x2="67.647064" y2="81.356026" style="stroke-width:7.75711"/>
    <g transform="matrix(4.3305517,0,0,4.3305517,-0.68684179,0.35334386)">
      <line x1="5.8633256" y1="5.3617735" x2="5.8478827" y2="16.646721"/>
      <line x1="9.8784332" y1="4.2660093" x2="9.8629894" y2="15.550956"/>
    </g>
    <g transform="matrix(4.3305517,0,0,4.3305517,-1.389032,-0.21026658)">
      <g transform="translate(0,0.49467325)">
        <path d="M 12.426756,6.5789032 3.6238563,8.7457333"/>
        <line x1="12.426755" y1="11.437944" x2="3.6238565" y2="13.604775"/>
      </g>
    </g>
  </g>`;
