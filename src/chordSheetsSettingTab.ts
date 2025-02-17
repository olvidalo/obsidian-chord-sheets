import {App, debounce, PluginSettingTab, Setting, TextComponent} from "obsidian";
import {Instrument} from "./chordsUtils";
import {AUTOSCROLL_STEPS} from "./autoscrollControl";
import {
	ChordSheetsSettings,
	DEFAULT_BLOCK_LANGUAGE_SPECIFIER,
	DEFAULT_CHORD_LINE_MARKER,
	DEFAULT_TEXT_LINE_MARKER,
	ShowAutoscrollButtonSetting,
	ShowChordDiagramsOnHoverSetting,
	ShowChordOverviewSetting
} from "./chordSheetsSettings";
import {IChordSheetsPlugin} from "./chordSheetsPluginInterface";

export class ChordSheetsSettingTab extends PluginSettingTab {
	plugin: IChordSheetsPlugin;

	constructor(app: App, plugin: IChordSheetsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		const chordOverviewOptions: Record<ShowChordOverviewSetting, string> = {
			"never": "Never",
			"edit": "In edit mode",
			"preview": "In reading mode",
			"always": "Always"
		};
		new Setting(containerEl)
			.setName('Show chord overview')
			.setDesc('Show an overview of chord diagrams above chord blocks. Might impact performance for very (!) long documents.')
			.addDropdown(dropdown => dropdown
				.addOptions(chordOverviewOptions)
				.setValue(this.plugin.settings.showChordOverview)
				.onChange(async (value: ShowChordOverviewSetting) => {
					this.plugin.settings.showChordOverview = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		const hoverChordDiagramsOptions: Record<ShowChordDiagramsOnHoverSetting, string> = {
			"never": "Never",
			"edit": "In edit mode",
			"preview": "In reading mode",
			"always": "Always"
		};
		new Setting(containerEl)
			.setName('Show chord diagrams on hover')
			.setDesc('Show a chord diagram popup when the mouse hovers over a chord.')
			.addDropdown(dropdown => dropdown
				.addOptions(hoverChordDiagramsOptions)
				.setValue(this.plugin.settings.showChordDiagramsOnHover)
				.onChange(async (value: ShowChordDiagramsOnHoverSetting) => {
					this.plugin.settings.showChordDiagramsOnHover = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		const debouncedChangeDiagramSize = debounce(async (value: number) => {
			this.plugin.settings.diagramWidth = value;
			await this.plugin.saveSettings();
			this.plugin.applyNewSettingsToEditors();
		}, 500);
		new Setting(containerEl)
			.setName('Chord diagram size')
			.addSlider(slider => slider
				.setLimits(50, 150, 1)
				.setValue(this.plugin.settings.diagramWidth)
				.setDynamicTooltip()
				.onChange(value => debouncedChangeDiagramSize(value)));

		const defaultInstrumentDescFrag = createFragment();
		const defaultInstrumentDescEl = defaultInstrumentDescFrag.createSpan();
		defaultInstrumentDescEl.append(`
			Determines the musical instrument used for rendering chord diagrams when none is explicitly specified.
			For example, if a chord block starts with`,
			createEl("code", { text: "```chords" }),
			`without an instrument like `,
			createEl("code", { text: "```chords-guitar" }),
			`, the default instrument you set here will be used.
		`);
		new Setting(containerEl)
			.setName('Default instrument')
			.setDesc(defaultInstrumentDescFrag)
			.addDropdown(dropdown => dropdown
				.addOption("guitar", "Guitar")
				.addOption("ukulele", "Ukulele")
				.addOption("ukulele-d-tuning", "Ukulele (D tuning)")
				.addOption("ukulele-baritone", "Ukulele (Baritone)")
				.addOption("mandolin", "Mandolin")
				.setValue(this.plugin.settings.defaultInstrument)
				.onChange(async (value: Instrument) => {
					this.plugin.settings.defaultInstrument = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));


		new Setting(containerEl).setName('Highlighting').setHeading();

		new Setting(containerEl)
			.setName('Highlight chord symbols')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.highlightChords)
				.onChange(async (value) => {
					this.plugin.settings.highlightChords = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		const highlightSectionHeadersDescFrag = createFragment();
		const highlightSectionHeadersDescEl = highlightSectionHeadersDescFrag.createSpan();
		highlightSectionHeadersDescEl.append(
			`Section headers must be in square brackets and on their own line, such as:`,
			createEl("br"),
			createEl("code", { text: "[Verse 1]" })
		);
		highlightSectionHeadersDescFrag.appendChild(highlightSectionHeadersDescEl);

		new Setting(containerEl)
			.setName('Highlight section headers')
			.setDesc(highlightSectionHeadersDescFrag)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.highlightSectionHeaders)
				.onChange(async (value) => {
					this.plugin.settings.highlightSectionHeaders = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		const highlightRhythmMarkersDescFrag = createFragment();
		const highlightRhythmMarkersDescEl = highlightRhythmMarkersDescFrag.createSpan();
		highlightRhythmMarkersDescEl.append(
			`Highlight rhythm markers sometimes used in chord sheets such as in:`,
			createEl("br"),
			createEl("code", { text: "| C C/B | Am C/G | F Bb | C | % |" })
		);
		highlightRhythmMarkersDescFrag.appendChild(highlightRhythmMarkersDescEl);

		new Setting(containerEl)
			.setName('Highlight rhythm markers')
			.setDesc(highlightRhythmMarkersDescFrag)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.highlightRhythmMarkers)
				.onChange(async (value) => {
					this.plugin.settings.highlightRhythmMarkers = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		new Setting(containerEl).setName('Reading mode').setHeading();

		new Setting(containerEl)
			.setName('Display inline/ChordPro-style chords over lyrics')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.displayInlineChordsOverLyrics)
				.onChange(async (value) => {
					this.plugin.settings.displayInlineChordsOverLyrics = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				})
			);


		new Setting(containerEl).setName('Live preview / edit mode').setHeading();

		new Setting(containerEl)
			.setName('Show transpose control')
			.setDesc('Transpose all chords in a chord block up or down with the click of a button.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showTransposeControl)
				.onChange(async (value) => {
					this.plugin.settings.showTransposeControl = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		new Setting(containerEl)
			.setName('Show instrument control')
			.setDesc('Control for changing the instrument of a chord block. Chord diagrams will be rendered for the chosen instrument.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showInstrumentControl)
				.onChange(async (value) => {
					this.plugin.settings.showInstrumentControl = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

		new Setting(containerEl)
			.setName('Show enharmonic toggle control')
			.setDesc('Toggles chords between sharp (#) and flat (b) enharmonic equivalents.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showEnharmonicToggleControl)
				.onChange(async (value) => {
					this.plugin.settings.showEnharmonicToggleControl = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));


		new Setting(containerEl).setName('Autoscroll').setHeading();

		new Setting(containerEl)
			.setName('Autoscroll default speed')
			.addSlider(slider => slider
				.setLimits(1, AUTOSCROLL_STEPS, 1)
				.setValue(this.plugin.settings.autoscrollDefaultSpeed)
				.setDynamicTooltip()
				.onChange(async value => {
					this.plugin.settings.autoscrollDefaultSpeed = value;
					await this.plugin.saveSettings();
				})
			);

		const alwaysSaveAutoscrollSpeedDescFrag = createFragment();
		const alwaysSaveAutoscrollSpeedDescEl = alwaysSaveAutoscrollSpeedDescFrag.createSpan();
		alwaysSaveAutoscrollSpeedDescEl.append(`
			The plugin can read the autoscroll speed for a note from the`,
			createEl("code", { text: "autoscroll-speed" }),
			`property.`,
			createEl("br"),
			`By default, changes to the autoscroll speed are saved to a note's frontmatter only if the property is 
			already present. Enable this setting to ensure any changes to the speed are automatically saved to the 
			frontmatter, adding the `,
			createEl("code", { text: "autoscroll-speed" }),
			` property if absent.`
		);

		new Setting(containerEl)
			.setName('Always save autoscroll speed to frontmatter')
			.setDesc(alwaysSaveAutoscrollSpeedDescFrag)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.alwaysSaveAutoscrollSpeedToFrontmatter)
				.onChange(async value => {
					this.plugin.settings.alwaysSaveAutoscrollSpeedToFrontmatter = value;
					await this.plugin.saveSettings();
				})
			);

		const showAutoscrollButtonOptions: Record<ShowAutoscrollButtonSetting, string> = {
			never: "Never",
			"chord-blocks": "When note has chord blocks",
			always: "Always"
		};
		new Setting(containerEl)
			.setName('Show autoscroll view action button')
			.setDesc('Set to \'Always\' if you want to use autoscroll for all documents or \'Never\' if you don\'t want to use autoscroll.')
			.addDropdown(dropdown => dropdown
				.addOptions(showAutoscrollButtonOptions)
				.setValue(this.plugin.settings.showAutoscrollButton)
				.onChange(async (value: ShowAutoscrollButtonSetting) => {
					this.plugin.stopAllAutoscrolls();
					this.plugin.settings.showAutoscrollButton = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName('Chord block syntax').setHeading();


		const languageSpecifierDescFrag = createFragment();
		const languageSpecifierDescEl = languageSpecifierDescFrag.createSpan();
		languageSpecifierDescEl.append(`
			The block language specifier defines the keyword for identifying chord blocks. 
  			For example, using "chords" means blocks starting with `,
			createEl("code", { text: "```chords" }),
			`or `,
			createEl("code", { text: "```chords-ukulele" }),
			` will be treated as chord blocks. Change this to customize chord block identification.`,
			createEl("br"),
			createEl("br"),
			`Only lowercase characters `,
			createEl("code", { text: "a-z" }),
			`are allowed.`
		);
		languageSpecifierDescFrag.appendChild(languageSpecifierDescEl);
		new Setting(containerEl)
			.setName('Block language specifier')
			.setDesc(languageSpecifierDescFrag)
			.addText(text => text
				.setValue(this.plugin.settings.blockLanguageSpecifier === DEFAULT_BLOCK_LANGUAGE_SPECIFIER ? "" : this.plugin.settings.blockLanguageSpecifier)
				.setPlaceholder(DEFAULT_BLOCK_LANGUAGE_SPECIFIER)
				.onChange(async value => await this.handleSyntaxSettingChange(
					"blockLanguageSpecifier", value, text, DEFAULT_BLOCK_LANGUAGE_SPECIFIER, /^[a-z]+$/
				))
			);

		const chordLineMarkerDescFrag = createFragment();
		const chordLineMarkerDescEl = chordLineMarkerDescFrag.createSpan();
		chordLineMarkerDescEl.append(`
			Force detection of a line as a chord line when the plugin has mistakenly detected it as a text line.`,
			createEl("br"),
			`For example, using `, createEl("code", { text: "%c" }),`means a line such as `, createEl("br"),
			createEl("code", { text: "Am G F (a comment that breaks chord detection) C   %c" }), createEl("br"),
			`will force chord detection and highlighting for this line.`,
			createEl("br"),
			createEl("br"),
			`The marker must appear on the end of a line and seperated by one or more spaces from preceding line content. 
			It cannot contain spaces.`
		);
		chordLineMarkerDescFrag.appendChild(chordLineMarkerDescEl);
		new Setting(containerEl)
			.setName('Chord line marker')
			.setDesc(chordLineMarkerDescFrag)
			.addText(text => text
				.setValue(this.plugin.settings.chordLineMarker === DEFAULT_CHORD_LINE_MARKER ? "" : this.plugin.settings.chordLineMarker)
				.setPlaceholder(DEFAULT_CHORD_LINE_MARKER)
				.onChange(async value => await this.handleSyntaxSettingChange(
					"chordLineMarker", value, text, DEFAULT_CHORD_LINE_MARKER, /^\S+$/
				))
			);

		const textLineMarkerDescFrag = createFragment();
		const textLineMarkerDescEl = textLineMarkerDescFrag.createSpan();
		textLineMarkerDescEl.append(`
			Force detection of a line as a text line when the plugin has mistakenly detected it as a chord line.`,
			createEl("br"),
			`For example, using `, createEl("code", { text: "%t" }),`means a line such as `, createEl("br"),
			createEl("code", { text: "A Ana e a Ema estão a comer e a beber em casa.  %t" }), createEl("br"),
			`will disable chord detection and highlighting for this line.`,
			createEl("br"),
			createEl("br"),
			`The marker must appear on the end of a line and seperated by one or more spaces from preceding line content. 
			It cannot contain spaces.`
		);
		textLineMarkerDescFrag.appendChild(textLineMarkerDescEl);
		new Setting(containerEl)
			.setName('Text line marker')
			.setDesc(textLineMarkerDescFrag)
			.addText(text => text
				.setValue(this.plugin.settings.textLineMarker === DEFAULT_TEXT_LINE_MARKER ? "" : this.plugin.settings.textLineMarker)
				.setPlaceholder(DEFAULT_TEXT_LINE_MARKER)
				.onChange(async value => await this.handleSyntaxSettingChange(
					"textLineMarker", value, text,DEFAULT_TEXT_LINE_MARKER, /^\S+$/
				))

			);

		new Setting(containerEl).setName('Advanced').setHeading();

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Enables verbose logging and a debug gutter in the editor.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debug)
				.onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

	}

	private async handleSyntaxSettingChange(
		key: keyof Pick<ChordSheetsSettings, 'blockLanguageSpecifier' | 'chordLineMarker' | 'textLineMarker'>,
		value: string,
		text: TextComponent,
		defaultValue: string,
		validator: RegExp
	) {
		const trimmedValue = value.trim();
		text.setValue(trimmedValue);

		if (trimmedValue.length === 0) {
			this.plugin.settings[key] = defaultValue;
		} else {
			const isValid = validator.test(trimmedValue);
			if (isValid) {
				this.plugin.settings[key] = trimmedValue;
			} else {
				text.setValue(this.plugin.settings[key]);
				return;
			}
		}

		await this.plugin.saveSettings();
		this.plugin.applyNewSettingsToEditors();
	}
}
