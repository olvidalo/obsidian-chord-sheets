import {Plugin} from "obsidian";
import {ChordSheetsSettings} from "./chordSheetsSettings";

// Avoids a circular dependency between this and main.ts
export interface IChordSheetsPlugin extends Plugin {
	settings: ChordSheetsSettings
	saveSettings: () => Promise<void>
	applyNewSettingsToEditors: () => void
	stopAllAutoscrolls: () => void
}
