// noinspection JSUnusedGlobalSymbols

import {debounce, Editor, MarkdownFileInfo, MarkdownView, Plugin, TFile, View} from 'obsidian';
import {EditorView, ViewPlugin} from "@codemirror/view";
import {Instrument, transposeTonic} from "./chordsUtils";
import {ChordBlockPostProcessorView} from "./chordBlockPostProcessorView";
import {ChordSheetsSettings, DEFAULT_SETTINGS} from "./chordSheetsSettings";
import {ChangeSpec, Extension} from "@codemirror/state";
import {
	ChordRange,
	chordSheetEditorPlugin,
	ChordSheetsViewPlugin,
	TransposeEventDetail
} from "./editor-extension/chordSheetsViewPlugin";
import {InstrumentChangeEventDetail} from "./editor-extension/chordBlockToolsWidget";
import {AutoscrollControl, SPEED_CHANGED_EVENT} from "./autoscrollControl";
import {ChordSheetsSettingTab} from "./chordSheetsSettingTab";
import {IChordSheetsPlugin} from "./chordSheetsPluginInterface";
import {chordSheetsEditorExtension} from "./editor-extension/chordSheetsEditorExtension";
import ChordsDB from "@tombatossals/chords-db";
import {addCustomChordTypes} from "./customChordTypes";
import {Chord} from "tonal";


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
					const chordTokens = await chordPlugin.getChordRangesForBlock(blockDef);
					this.transpose(chordTokens, editorView, direction);
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

		if (!this.app.metadataTypeManager.getAssignedType(AUTOSCROLL_SPEED_PROPERTY)) {
			this.app.metadataTypeManager.setType(AUTOSCROLL_SPEED_PROPERTY, "number");
		}
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
				chordPlugin.getChordRangesForBlock(chordSheetBlockAtCursor).then(
					chordTokens => this.transpose(chordTokens, editorView, direction)
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

	private transpose(chordRanges: ChordRange[], editor: EditorView, direction: "up" | "down") {
		const changes: ChangeSpec[] = [];
		for (const chordRange of chordRanges) {
			const { from, to, value } = chordRange;
			const [chordTonic, chordType, bassNote] = Chord.tokenize(value);
			const simplifiedTonic = transposeTonic(chordTonic, direction);

			let transposedChord;
			if (bassNote) {
				transposedChord = simplifiedTonic + chordType + "/" + transposeTonic(bassNote, direction);
			} else {
				transposedChord = simplifiedTonic + (chordType ?? "");
			}

			changes.push({from, to, insert: transposedChord});
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
			frontmatter[AUTOSCROLL_SPEED_PROPERTY] = this.app.metadataTypeManager.getAssignedType(AUTOSCROLL_SPEED_PROPERTY) === "number"
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

