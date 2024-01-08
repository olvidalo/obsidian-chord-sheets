import {App, debounce, PluginSettingTab, Setting} from "obsidian";
import {Instrument} from "./chordsUtils";
import {AUTOSCROLL_STEPS} from "./autoscrollControl";
import {
	DEFAULT_BLOCK_LANGUAGE_SPECIFIER,
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

		containerEl.createEl('h2', {text: 'Chord blocks'});

		const chordOverviewOptions: Record<ShowChordOverviewSetting, string> = {
			"never": "never",
			"edit": "in edit mode",
			"preview": "in reading mode",
			"always": "always"
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
			"never": "never",
			"edit": "in edit mode",
			"preview": "in reading mode",
			"always": "always"
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
				.setValue(this.plugin.settings.defaultInstrument)
				.onChange(async (value: Instrument) => {
					this.plugin.settings.defaultInstrument = value;
					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				}));

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
				.setValue(this.plugin.settings.blockLanguageSpecifier)
				.setPlaceholder("chords")
				.onChange(async value => {
					const trimmedValue = value.trim();
					if (trimmedValue.length === 0) {
						text.setValue("");
					}

					const isValid = /^[a-z]+$/.test(trimmedValue);
					if (isValid) {
						this.plugin.settings.blockLanguageSpecifier = trimmedValue;
					} else {
						text.setValue(this.plugin.settings.blockLanguageSpecifier);
						return;
					}

					await this.plugin.saveSettings();
					this.plugin.applyNewSettingsToEditors();
				})
			);


		containerEl.createEl('h2', {text: 'Chord block controls in edit mode'});

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

		containerEl.createEl('h2', {text: 'Autoscroll'});

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

		const showAutoscrollButtonOptions: Record<ShowAutoscrollButtonSetting, string> = {
			never: "never",
			"chord-blocks": "when document has chord blocks",
			always: "always"
		};
		new Setting(containerEl)
			.setName('Show autoscroll view action button')
			.setDesc('Set to \'always\' if you want to use autoscroll for all documents or \'never\' if you don\'t want to use autoscroll.')
			.addDropdown(dropdown => dropdown
				.addOptions(showAutoscrollButtonOptions)
				.setValue(this.plugin.settings.showAutoscrollButton)
				.onChange(async (value: ShowAutoscrollButtonSetting) => {
					this.plugin.stopAllAutoscrolls();
					this.plugin.settings.showAutoscrollButton = value;
					await this.plugin.saveSettings();
				})
			);


		containerEl.createEl('h2', {text: 'Other'});

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
}
