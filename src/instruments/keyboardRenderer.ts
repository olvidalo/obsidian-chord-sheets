import {Note} from "tonal";
import {SheetChord, tokenizeChordSymbol} from "../chordsUtils";
import {ChordDiagram, InstrumentRenderer, KeyboardInstrument} from "./types";
import {drawKeyboard, drawMissingMark, KeyRange} from "./keyboardSvg";

export interface KeyboardNote {
	readonly midi: number;
	/** Name as spelled in the chord, without octave, no double accidentals. */
	readonly name: string;
	readonly isRoot: boolean;
}

/** Ordered keyboard notes, lowest note first. The first note is the bass. */
export type Voicing = readonly KeyboardNote[];

const KEYBOARD_START = 60;

export function getKeyboardVoicings(chord: SheetChord): Voicing[] {
	const root = chord.tonic;
	if (chord.empty || !root) {
		return [];
	}
	// tonal lists the notes from the bass up; rootDegree is set only when the bass is a chord tone
	const bassIsForeign = chord.bass && !chord.rootDegree;
	if (bassIsForeign) {
		return [stackUpward(chord.notes, root)];
	}
	const rootPosition = rotate(chord.notes, chord.notes.indexOf(root));
	return inversions(rootPosition).map(names => stackUpward(names, root));
}

/** Yields the root position, then each inversion. */
function inversions(notes: readonly string[]): string[][] {
	return notes.map((_, i) => rotate(notes, i));
}

function rotate(notes: readonly string[], by: number): string[] {
	if (by < 0) {
		throw new Error(`Chord root not among its notes: ${notes.join(" ")}`);
	}
	return [...notes.slice(by), ...notes.slice(0, by)];
}

/** Places each note on the lowest key above the previous one. */
function stackUpward(names: readonly string[], root: string): Voicing {
	let previousMidi = -Infinity;
	return names.map(name => {
		const pitchClass = Note.chroma(name);
		if (pitchClass === undefined) {
			throw new Error(`Cannot place note on keyboard: ${name}`);
		}
		let midi = KEYBOARD_START + pitchClass;
		// e.g. the C in E G C: not above the G yet, so take the C an octave higher
		while (midi <= previousMidi) midi += 12;
		previousMidi = midi;
		return {midi, name: Note.simplify(name), isRoot: name === root};
	});
}

/** Two octaves, plus one for every octave the given MIDI notes reach beyond them. */
export function getKeyboardRange(midis: readonly number[]): KeyRange {
	const highest = Math.max(KEYBOARD_START, ...midis);
	const octaves = Math.max(2, Math.ceil((highest - KEYBOARD_START + 1) / 12));
	return {fromMidi: KEYBOARD_START, toMidi: KEYBOARD_START + 12 * octaves - 1};
}

/** Two octaves are drawn this much wider than a fret diagram, so that dots and labels stay legible. */
const TWO_OCTAVES_TO_DIAGRAM_WIDTH = 1.75;
const WHITE_KEYS_IN_TWO_OCTAVES = 14;

function whiteKeyWidth(diagramWidth: number): number {
	return Math.round(diagramWidth * TWO_OCTAVES_TO_DIAGRAM_WIDTH / WHITE_KEYS_IN_TWO_OCTAVES);
}


export class KeyboardDiagramRenderer implements InstrumentRenderer {
	constructor(readonly instrument: KeyboardInstrument, readonly label: string) {}

	getDiagram(chord: SheetChord, chordName: string): ChordDiagram | null {
		const voicings = getKeyboardVoicings(chord);
		if (voicings.length === 0) {
			return null;
		}
		const range = getKeyboardRange(voicings.flat().map(note => note.midi));
		const [tonic, type] = tokenizeChordSymbol(chordName);
		const nameWithoutBass = tonic + type;

		return {
			numVoicings: voicings.length,
			initialVoicing: chord.rootDegree ? chord.rootDegree - 1 : 0,
			render: (index: number, width: number) => this.draw(voicings[index], range, width),
			voicingName: (index: number) => {
				const bass = voicings[index][0];
				return bass.isRoot ? nameWithoutBass : `${nameWithoutBass}/${bass.name}`;
			}
		};
	}

	renderMissing(width: number): HTMLDivElement {
		const svg = drawKeyboard({range: getKeyboardRange([]), markers: [], whiteKeyWidth: whiteKeyWidth(width)});
		drawMissingMark(svg);

		const el = createDiv();
		el.appendChild(svg);
		return el;
	}

	private draw(voicing: Voicing, range: KeyRange, width: number): HTMLDivElement {
		const el = createDiv();
		el.appendChild(drawKeyboard({
			range,
			markers: voicing.map(note => ({midi: note.midi, label: note.name, emphasized: note.isRoot})),
			whiteKeyWidth: whiteKeyWidth(width)
		}));
		return el;
	}
}
