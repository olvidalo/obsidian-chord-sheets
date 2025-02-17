import {Note} from "tonal";
import {ChordDef, IChordsDB, InstrumentChords} from "@tombatossals/chords-db";

import {ChordToken} from "./sheet-parsing/tokens";

export type Instrument = keyof IChordsDB;


export interface UserDefinedChord {
	frets: string;
	position: number;
}

export interface SheetChord {
	tonic: string,
	type: string,
	typeAliases: string[],
	bass: string | null,
	userDefinedChord?: UserDefinedChord
}


export function getTonicVariations(tonic: string) {
	const tonicVariations = [
		tonic, Note.simplify(tonic), Note.enharmonic(tonic)
	];

	// the guitar database of chords-db has C# as Csharp etc.
	const sharp = "#";
	const sharpVariation = tonicVariations.find(variation => variation?.contains(sharp));
	if (sharpVariation) {
		tonicVariations.push(sharpVariation.replace(sharp, "sharp"));
	}
	return tonicVariations;
}

export function findDbChord(chordToken: ChordToken, instrumentChords: InstrumentChords) {
	const tonic = chordToken.chord.tonic;
	const tonicVariations = getTonicVariations(tonic);

	const availableTonicKeys = Object.keys(instrumentChords.chords);
	const tonicKey = availableTonicKeys.find(note => tonicVariations.includes(note));

	let dbChord: ChordDef | undefined;

	if (!tonicKey) {
		return null;
	}

	if (chordToken.chord.bass) {
		// First priority: Exact match with bass note
		const bassSuffix = `/${chordToken.chord.bass}`;
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => testChord.suffix === chordToken.chord.type + bassSuffix
		);
		if (dbChord) return dbChord;

		// Second priority: Alias match with bass note
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => chordToken.chord.typeAliases.some(alias => testChord.suffix === alias + bassSuffix)
		);
		if (dbChord) return dbChord;
	} else {
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => testChord.suffix === chordToken.chord.type
		);
		if (dbChord) return dbChord;

		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => chordToken.chord.typeAliases.includes(testChord.suffix)
		);
	}

	return dbChord ?? null;
}

export function uniqueChordTokens(chordTokens: ChordToken[]) {
	const seenValues = new Set<string>();

	return chordTokens.filter(token => {
		if (!seenValues.has(token.chordSymbol.value)) {
			seenValues.add(token.chordSymbol.value);
			return true;
		}
		return false;
	});
}

export function chordSequenceString(chordTokens: ChordToken[]) {
	return JSON.stringify(chordTokens.map(token => token.value));
}
