import {ChordDiagram, FrettedInstrument, InstrumentRenderer} from "./types";
import {SheetChord, UserDefinedChord} from "../chordsUtils";
import {ChordBox} from "@chordbook/charts";
import ChordsDB, {ChordDef, InstrumentChords} from "@tombatossals/chords-db";
import {Note} from "tonal";

type ChordBoxParams = Parameters<ChordBox["draw"]>[0];

export function dbChordToVexChord(input: ChordDef, positionIndex = 0): ChordBoxParams {
	const position = input.positions[positionIndex];
	const fingers = [...position.fingers].reverse();
	const frets = [...position.frets].reverse();

	const barres: ChordBoxParams["barres"] = [];
	position.barres.forEach((barreFret) => {
		const toString = frets.indexOf(barreFret) + 1;
		const fromString = frets.lastIndexOf(barreFret) + 1;

		if (fromString > 0 && toString > 0) {
			barres.push({fromString, toString, fret: barreFret});
		}
	});

	const chord = frets
		.map((fret, index) => [index + 1, fret === -1 ? 'x' : fret] as [number, number])
		.filter(c => !barres.some(barre => c[1] === barre.fret))
	;

	return {
		chord,
		position: position.baseFret,
		barres,
		// abuse tuning labels for fingering
		tuning: [...fingers].reverse().map(finger => finger > 0 ? `${finger}` : '')
	};
}

export function userDefinedToVexChord({frets, position}: UserDefinedChord, numStrings: number, defaultNumFrets: number = 4): ChordBoxParams & { numFrets: number } {
	const splitFrets = /[\s,]/.test(frets) ? frets.match(/\d+|x|_/g) : frets.split('');

	if (!splitFrets) {
		throw new Error("Could not parse fret string: " + frets);
	}


	const barres: ChordBoxParams["barres"] = [];

	const barrePositions = splitFrets
		.map((fret, index) => (fret === '_' ? index : -1))
		.filter(index => index !== -1);

	if (barrePositions.length === 2 || barrePositions.length === 4) {
		barres.push({
			fromString: numStrings - barrePositions[0],
			toString: numStrings - barrePositions[1] + 2,
			fret: parseInt(frets[barrePositions[0] + 1])
		});
	}
	if (barrePositions.length === 4) {
		barres.push({
			fromString: numStrings - barrePositions[2] + 2,
			toString: numStrings - barrePositions[3] + 4,
			fret: parseInt(frets[barrePositions[2] + 1])
		});
	}


	// map frets to chord array, skip barre markers
	let chordFrets = splitFrets
		.filter(fretSymbol => fretSymbol !== "_")
		.map(
			(fret, index) => [numStrings - index, fret === "x" ? "x" : parseInt(fret)]
		);


	// determine optimal fret position
	let finalPosition = position;
	if (position === 0) {
		const originalFrets = chordFrets
			.map(fretDef => fretDef[1])
			.filter(fret => typeof fret === 'number' && !isNaN(fret)) as number[];

		const nonOpenFrets = originalFrets.filter(fret => fret > 0);
		if (nonOpenFrets.length > 0) {
			const minFret = Math.min(...nonOpenFrets);
			const maxFret = Math.max(...nonOpenFrets);
			const fretSpan = maxFret - minFret + 1;

			// if chord spans more than available frets, or starts above fret 3 (treat low frets with muted strings like open chords)
			if (fretSpan > defaultNumFrets || minFret > 3) {
				// position at minFret to show the most compact view
				finalPosition = minFret;
				chordFrets = chordFrets.map(fretDef =>
					typeof fretDef[1] === 'number' && fretDef[1] > 0 ? [fretDef[0], fretDef[1] - finalPosition + 1] : fretDef
				);
			}
			// else: position remains 0
		}
	}


	const finalFrets = chordFrets
		.map(fretDef => fretDef[1])
		.filter(fret => typeof fret === 'number' && !isNaN(fret)) as number[];


	const numFrets = finalFrets.length > 0
		? Math.max(defaultNumFrets, Math.max(...finalFrets))
		: defaultNumFrets;

	return {
		// @ts-ignore
		chord: chordFrets,
		position: finalPosition,
		barres,
		numFrets,
		// empty string labels so spacing is equal to non-custom chords with string labels
		tuning: new Array(numStrings).fill('')
	};
}

export function getTonicVariations(tonic: string) {
	const tonicVariations = [
		tonic, Note.simplify(tonic), Note.enharmonic(tonic)
	];

	// the guitar database of chords-db has C# as Csharp etc.
	const sharp = "#";
	const sharpVariation = tonicVariations.find(variation => variation?.includes(sharp));
	if (sharpVariation) {
		tonicVariations.push(sharpVariation.replace(sharp, "sharp"));
	}
	return tonicVariations;
}

export function findDbChord(chord: SheetChord, instrumentChords: InstrumentChords) {
	if (!chord.tonic) {
		return null;
	}
	const tonicVariations = getTonicVariations(chord.tonic);

	const availableTonicKeys = Object.keys(instrumentChords.chords);
	const tonicKey = availableTonicKeys.find(note => tonicVariations.includes(note));

	let dbChord: ChordDef | undefined;

	if (!tonicKey) {
		return null;
	}

	if (chord.bass) {
		// First priority: Exact match with bass note
		const bassSuffix = `/${chord.bass}`;
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => testChord.suffix === chord.type + bassSuffix
		);
		if (dbChord) return dbChord;

		// Second priority: Alias match with bass note
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => chord.aliases.some(alias => testChord.suffix === alias + bassSuffix)
		);
		if (dbChord) return dbChord;
	} else {
		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => testChord.suffix === chord.type
		);
		if (dbChord) return dbChord;

		dbChord = instrumentChords.chords[tonicKey].find(
			testChord => chord.aliases.includes(testChord.suffix)
		);
	}

	return dbChord ?? null;
}

export class FretDiagramRenderer implements InstrumentRenderer {
	private readonly chordDb: InstrumentChords;

	constructor(readonly instrument: FrettedInstrument, readonly label: string) {
		this.chordDb = ChordsDB[this.instrument];
	}

	private get numStrings(): number { return this.chordDb.main.strings; }
	private get numFrets(): number { return this.chordDb.main.fretsOnChord; }

	getDiagram(chord: SheetChord): ChordDiagram | null {
		if (chord.userDefinedChord) {
			return this.userDefinedChordDiagram(chord.userDefinedChord);
		}

		const dbChord = findDbChord(chord, this.chordDb);
		return dbChord ? this.dbChordDiagram(dbChord) : null;
	}

	renderMissing(width: number): HTMLDivElement {
		const missingChordContainer = createDiv({cls: "chord-sheet-fretboard"});
		const chordBox = this.makeChordBox(missingChordContainer, width, this.numFrets, "var(--text-faint)");
		chordBox.draw({chord: [], tuning: new Array(this.numStrings).fill('')});

		const gridCenterX = chordBox.x + chordBox.spacing * (chordBox.numStrings - 1) / 2;
		const gridCenterY = chordBox.y + chordBox.fretSpacing * chordBox.numFrets / 2;
		chordBox.canvas.plain("?")
			.attr({x: gridCenterX, y: gridCenterY, "font-size": "2em"})
			.addClass("chord-sheet-no-diagram-mark");


		return missingChordContainer;
	}

	private dbChordDiagram(dbChord: ChordDef): ChordDiagram {
		return {
			numVoicings: dbChord.positions.length,
			render: (index: number, width: number) => this.drawVexChord(
				dbChordToVexChord(dbChord, index), width
			)
		};
	}

	private userDefinedChordDiagram(userChord: UserDefinedChord): ChordDiagram {
		return {
			numVoicings: 1,
			render: (_index, width: number) => {
				const vexChord = userDefinedToVexChord(userChord, this.numStrings, this.numFrets);
				return this.drawVexChord(vexChord, width, vexChord.numFrets);
			}
		};
	}

	private drawVexChord(vexChord: ChordBoxParams, width: number, numFrets = this.numFrets) {
		const el = createDiv({cls: "chord-sheet-fretboard"});
		this.makeChordBox(el, width, numFrets).draw(vexChord);
		return el;
	}

	private makeChordBox(containerEl: HTMLElement, width: number, numFrets = this.numFrets, defaultColor = "var(--text-normal)") {
		return new ChordBox(containerEl, {
			numStrings: this.numStrings,
			numFrets,
			showTuning: true,
			defaultColor,
			fontFamily: "var(--font-text)",
			width: width,
			height: width * 1.2
		});
	}
}
