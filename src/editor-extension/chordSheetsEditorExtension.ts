import {ChordSheetsSettings} from "../chordSheetsSettings";
import {ViewPlugin} from "@codemirror/view";
import {chordSheetEditorPlugin, ChordSheetsViewPlugin} from "./chordSheetsViewPlugin";
import {chordBlocksStateField, chordSheetsConfig, chordSheetsConfigFacet} from "./chordBlocksStateField";
import {debugExtensions} from "./debugUtils";

export const chordSheetsEditorExtension = (settings: ChordSheetsSettings, viewPlugin?: ViewPlugin<ChordSheetsViewPlugin>) => [
	chordSheetsConfig.of(chordSheetsConfigFacet.of({...settings})),
	chordBlocksStateField,
	viewPlugin ?? chordSheetEditorPlugin(),
	settings.debug ? debugExtensions : []
];
