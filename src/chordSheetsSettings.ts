import {Instrument} from "./chordsUtils";

export type ShowAutoscrollButtonSetting = "never" | "chord-blocks" | "always";
export type ShowChordOverviewSetting = "never" | "edit" | "preview" | "always";
export type ShowChordDiagramsOnHoverSetting = "never" | "edit" | "preview" | "always";

export const DEFAULT_BLOCK_LANGUAGE_SPECIFIER = "chords";
export const DEFAULT_CHORD_LINE_MARKER = "%c";
export const DEFAULT_TEXT_LINE_MARKER = "%t";

export interface ChordSheetsSettings {
	showChordOverview: ShowChordOverviewSetting;
	showChordDiagramsOnHover: ShowChordDiagramsOnHoverSetting
	showTransposeControl: boolean;
    showEnharmonicToggleControl: boolean;
	showInstrumentControl: boolean;
	debug: boolean;
	defaultInstrument: Instrument;
	diagramWidth: number;
	autoscrollDefaultSpeed: number;
	showAutoscrollButton: ShowAutoscrollButtonSetting;
	blockLanguageSpecifier: string;
	alwaysSaveAutoscrollSpeedToFrontmatter: boolean;
	chordLineMarker: string;
	textLineMarker: string;
	highlightChords: boolean;
	highlightSectionHeaders: boolean;
	highlightRhythmMarkers: boolean;
	displayInlineChordsOverLyrics: boolean;
}

export const DEFAULT_SETTINGS: ChordSheetsSettings = {
	showChordOverview: "always",
	showChordDiagramsOnHover: "always",
	showTransposeControl: true,
    showEnharmonicToggleControl: false,
	showInstrumentControl: true,
	debug: false,
	defaultInstrument: "guitar",
	diagramWidth: 100,
	autoscrollDefaultSpeed: 10,
	showAutoscrollButton: "chord-blocks",
	blockLanguageSpecifier: DEFAULT_BLOCK_LANGUAGE_SPECIFIER,
	alwaysSaveAutoscrollSpeedToFrontmatter: false,
	chordLineMarker: DEFAULT_CHORD_LINE_MARKER,
	textLineMarker: DEFAULT_TEXT_LINE_MARKER,
	highlightChords: true,
	highlightSectionHeaders: true,
	highlightRhythmMarkers: true,
	displayInlineChordsOverLyrics: false
};
