import {Instrument} from "./chordsUtils";

export type ShowAutoscrollButtonSetting = "never" | "chord-blocks" | "always";
export type ShowChordOverviewSetting = "never" | "edit" | "preview" | "always";
export type ShowChordDiagramsOnHoverSetting = "never" | "edit" | "preview" | "always";

export const DEFAULT_BLOCK_LANGUAGE_SPECIFIER = "chords";

export interface ChordSheetsSettings {
	showChordOverview: ShowChordOverviewSetting;
	showChordDiagramsOnHover: ShowChordDiagramsOnHoverSetting
	showTransposeControl: boolean;
    showHarmonicControl: boolean;
	showInstrumentControl: boolean;
	debug: boolean;
	defaultInstrument: Instrument;
	diagramWidth: number;
	autoscrollDefaultSpeed: number;
	showAutoscrollButton: ShowAutoscrollButtonSetting;
	blockLanguageSpecifier: string;
	alwaysSaveAutoscrollSpeedToFrontmatter: boolean;
}

export const DEFAULT_SETTINGS: ChordSheetsSettings = {
	showChordOverview: "always",
	showChordDiagramsOnHover: "always",
	showTransposeControl: true,
    showHarmonicControl: true,
	showInstrumentControl: true,
	debug: false,
	defaultInstrument: "guitar",
	diagramWidth: 100,
	autoscrollDefaultSpeed: 10,
	showAutoscrollButton: "chord-blocks",
	blockLanguageSpecifier: DEFAULT_BLOCK_LANGUAGE_SPECIFIER,
	alwaysSaveAutoscrollSpeedToFrontmatter: false
};
