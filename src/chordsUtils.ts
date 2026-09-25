import {ChordToken} from "./sheet-parsing/tokens";
import {Chord, ChordType} from "tonal";
import {toWestern, toLocal} from "./notationConverter";
import {ChordSheetsSettings} from "./chordSheetsSettings";
import {IChordSheetsPlugin} from "./chordSheetsPluginInterface";


export type SheetChord = ReturnType<typeof Chord.get> & {
	userDefinedChord?: string;
	originalSymbol?: string; // Store original symbol for display purposes
};


/**
 * Wrapper for tonal to handle slash chords for chord types that contain a slash themselves,
 * such as C6/9/E, which tonal would parse as unknown chord type "6/9/E".
 * 
 * @param symbol - The chord symbol (already normalized to Western notation if needed).
 * @returns Tuple of [tonic, type, bass].
 */
export function tokenizeChordSymbol(symbol: string): [tonic: string, type: string, bass: string] {
	const [tonic, type, bass] = Chord.tokenize(symbol);
	if (!ChordType.get(type).empty || !type.includes("/")) {
		return [tonic, type, bass];
	}
	const lastSlash = type.lastIndexOf("/");
	return [tonic, type.slice(0, lastSlash), type.slice(lastSlash + 1)];
}

/**
 * Parses a chord symbol, optionally converting from German/Russian notation first.
 * 
 * @param symbol - The raw chord symbol as written by the user.
 * @param pluginOrSettings - Plugin instance or settings object containing useGermanNotation flag.
 * @returns Parsed chord object with optional originalSymbol for display.
 */
export function parseChordSymbol(
	symbol: string, 
	pluginOrSettings?: IChordSheetsPlugin | Partial<ChordSheetsSettings>
): SheetChord {
	const useGermanNotation = pluginOrSettings?.settings?.useGermanNotation ?? false;
	
	// Convert to Western notation for parsing
	const westernSymbol = toWestern(symbol, useGermanNotation);
	
	const [tonic, type, bass] = tokenizeChordSymbol(westernSymbol);
	const chord = Chord.getChord(type, tonic, bass);
	
	// Store original symbol for display if using German notation
	if (useGermanNotation) {
		(chord as SheetChord).originalSymbol = symbol;
	}
	
	return chord as SheetChord;
}

/**
 * Converts a parsed chord's display symbol back to local notation if needed.
 * 
 * @param chordSymbol - The Western notation chord symbol (e.g., from Tonal).
 * @param originalSymbol - The original user-provided symbol (if available).
 * @param pluginOrSettings - Plugin instance or settings object containing useGermanNotation flag.
 * @returns The appropriate symbol for display.
 */
export function getDisplayChordSymbol(
	chordSymbol: string, 
	originalSymbol: string | undefined, 
	pluginOrSettings?: IChordSheetsPlugin | Partial<ChordSheetsSettings>
): string {
	const useGermanNotation = pluginOrSettings?.settings?.useGermanNotation ?? false;
	
	// If we have an original symbol and are using German notation, prefer it
	// This preserves user's exact input including any custom voicings
	if (originalSymbol && useGermanNotation) {
		return originalSymbol;
	}
	
	// Otherwise convert Western back to local notation
	return toLocal(chordSymbol, useGermanNotation);
}


export function uniqueChordTokens(chordTokens: ChordToken[]) {
	const seen = new Set<string>();

	return chordTokens.filter(token => {
		const key = token.chordSymbol.value + (token.chord.userDefinedChord || "");
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function chordSequenceString(chordTokens: ChordToken[]) {
	return JSON.stringify(chordTokens.map(token => token.value));
}
