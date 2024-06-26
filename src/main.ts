// noinspection JSUnusedGlobalSymbols

import {Editor, MarkdownFileInfo, MarkdownView, Plugin, TFile, View} from 'obsidian';
import {Chord, Note} from "tonal";
import {EditorView, ViewPlugin} from "@codemirror/view";
import {Instrument, transposeNote} from "./chordsUtils";
import {ChordBlockPostProcessorView} from "./chordBlockPostProcessorView";
import {ChordSheetsSettings, DEFAULT_SETTINGS} from "./chordSheetsSettings";
import {ChangeSpec, Extension} from "@codemirror/state";
import {
	chordSheetEditorPlugin,
	ChordSheetsViewPlugin,
	ChordTokenRange,
	EnharmonicToggleEventDetail,
	TransposeEventDetail
} from "./editor-extension/chordSheetsViewPlugin";
import {InstrumentChangeEventDetail} from "./editor-extension/chordBlockToolsWidget";
import {AutoscrollControl, SPEED_CHANGED_EVENT} from "./autoscrollControl";
import {ChordSheetsSettingTab} from "./chordSheetsSettingTab";
import {IChordSheetsPlugin} from "./chordSheetsPluginInterface";
import {chordSheetsEditorExtension} from "./editor-extension/chordSheetsEditorExtension";
import ChordsDB from "@tombatossals/chords-db";

const AUTOSCROLL_SPEED_PROPERTY = "autoscroll-speed";

export default class ChordSheetsPlugin extends Plugin implements IChordSheetsPlugin {
	settings: ChordSheetsSettings;
	editorPlugin: ViewPlugin<ChordSheetsViewPlugin>;
	editorExtension: Extension[] | null;

	viewAutoscrollControlMap = new WeakMap<View, AutoscrollControl>();

	async onload() {
		await this.loadSettings();


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
						this.settings.showChordOverview === "always" || this.settings.showChordOverview === "preview",
						this.settings.showChordDiagramsOnHover === "always" || this.settings.showChordDiagramsOnHover === "preview",
						this.settings.diagramWidth
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

		this.registerDomEvent(window, "chord-sheet-transpose", async (event: CustomEvent<TransposeEventDetail>) =>
            await this.handleChordSheetEvent(
				event,
				(chordTokens, editorView, detail) =>
					this.transpose(chordTokens, editorView, detail.direction)
			)
        );

        this.registerDomEvent(window, "chord-sheet-enharmonic-toggle", async (event: CustomEvent<EnharmonicToggleEventDetail>) =>
            await this.handleChordSheetEvent(
				event,
				(chordTokens, editorView, _detail) =>
					this.enharmonicToggle(chordTokens, editorView))
        );



		// Handle obsidian events

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.stopAllAutoscrolls();
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					this.updateAutoscrollButton(view);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, view) => {
				this.updateAutoscrollButton(view);
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
				this.processChordsCommand(editor, this.editorPlugin, checking, this.transpose.bind(this), "up")
		});

		this.addCommand({
			id: 'transpose-block-down',
			name: 'Transpose current chord block one semitone down',
			editorCheckCallback: (checking: boolean, editor: Editor) =>
				this.processChordsCommand(editor, this.editorPlugin, checking, this.transpose.bind(this), "down")
		});

        this.addCommand({
			id: 'enharmonic-toggle',
			name: 'Toggle chords between sharp (#) and flat (b) enharmonic equivalents',
			editorCheckCallback: (checking: boolean, editor: Editor) =>
				this.processChordsCommand(editor, this.editorPlugin, checking, this.enharmonicToggle.bind(this))
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

	async handleChordSheetEvent<T extends TransposeEventDetail | EnharmonicToggleEventDetail>(
		event: CustomEvent<T>,
		processFn: (chordTokenRange: ChordTokenRange[], editorView: EditorView, eventDetail: T) => void) {
		const {blockDef} = event.detail;
		const editor = this.app.workspace.activeEditor?.editor;

		if (editor) {
			// @ts-ignore
			const editorView = editor.cm as EditorView;
			const chordPlugin = editorView?.plugin(this.editorPlugin);
			if (chordPlugin) {
				const chordTokens = await chordPlugin.getChordTokensForBlock(blockDef);
				processFn(chordTokens, editorView, event.detail);
			}
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

	private processChordsCommand<T extends unknown[]>(
		editor: Editor,
		plugin: ViewPlugin<ChordSheetsViewPlugin>,
		checking: boolean,
		processFn: (chordTokenRanges: ChordTokenRange[], editorView: EditorView, ...extraArgs: T) => void,
		...processFnExtraArgs: T
	) {

		const editorView = editor.cm as EditorView;
		const chordPlugin = editorView.plugin(plugin);
		if (chordPlugin) {
			const chordSheetBlockAtCursor = chordPlugin.getChordSheetBlockAtCursor();
			if (!chordSheetBlockAtCursor) {
				return false;
			}

			if (!checking) {
				chordPlugin.getChordTokensForBlock(chordSheetBlockAtCursor).then(
					chordTokenRanges => processFn(chordTokenRanges, editorView, ...processFnExtraArgs)
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

	private processChords(
		chordTokenRanges: ChordTokenRange[],
		editor: EditorView,
		processNote: (note: string) => string
	) {
		const changes: ChangeSpec[] = [];
		for (const chordTokenRange of chordTokenRanges) {
			const chordToken = chordTokenRange.chordToken;
			const [rootNote, chordType] = Chord.tokenize(chordToken.value);
			const processedRootNote = processNote(rootNote);

			let transposedChord;

			// As tonal.js does not support slash chords, handle them manually
			if (chordType && chordType.includes('/')) {
				const [slashChordType, bassNote] = chordType.split('/');
				transposedChord = processedRootNote + slashChordType + "/" + processNote(bassNote);
			} else {
				transposedChord = processedRootNote + (chordType ?? "");
			}

			const chordStartIndex = chordTokenRange.from;
			const chordEndIndex = chordTokenRange.to;
			changes.push({from: chordStartIndex, to: chordEndIndex, insert: transposedChord});
		}
		editor.plugin(this.editorPlugin)?.applyChanges(changes);
	}

	private transpose(chordTokenRanges: ChordTokenRange[], editor: EditorView, direction: "up" | "down") {
		return this.processChords(chordTokenRanges, editor, (note: string) => transposeNote(note, direction));
	}

    private enharmonicToggle(chordTokenRanges: ChordTokenRange[], editor: EditorView) {
		return this.processChords(chordTokenRanges, editor, Note.enharmonic);
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
				const editorView = markdownView.editor.cm as EditorView;
				const chordPlugin = editorView.plugin(this.editorPlugin);
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

