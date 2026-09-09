import {accToAlt, altToAcc, Interval, Note, Scale} from "tonal";
import {SheetChord, tokenizeChordSymbol} from "../chordsUtils";
import {ChordDiagram, InstrumentRenderer, KeyboardInstrument, NoDiagramError} from "./types";
import {drawKeyboard, drawMissingMark, Hand, KeyRange} from "./keyboardSvg";

export interface KeyboardNote {
	readonly midi: number;
	/** Name as spelled in the chord, without octave, no double accidentals. */
	readonly name: string;
	readonly isRoot: boolean;
	readonly hand?: Hand;
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

export function userDefinedVoicing(definition: string, chord: SheetChord): Voicing {
	const hands = definition.split("|").map(hand => hand.trim().split(/\s+/).filter(Boolean));
	if (hands.length > 2 || hands.some(hand => hand.length === 0)) {
		throw new NoDiagramError(`A voicing has one or two hands, separated by "|": ${definition}`);
	}
	const names = hands.flat().map(token => noteName(token, chord));
	const voicing = stackUpward(names, chord.tonic ?? "");
	return hands.length === 1 ? voicing
		: voicing.map((note, index) => ({...note, hand: index < hands[0].length ? "left" : "right"}));
}

/** A degree like "3", "b7" or "#11" resolved against the chord, or a note name. */
function noteName(token: string, chord: SheetChord): string {
	const degree = /^(?<accidentals>[#b]*)(?<number>\d+)$/.exec(token)?.groups;
	if (degree) {
		const number = parseInt(degree.number);
		// chord degrees end at the 13th
		if (!chord.tonic || number < 1 || number > 13) {
			throw new NoDiagramError(`Not a chord degree (1 to 13): ${token}`);
		}
		return degreeName(number, degree.accidentals, chord);
	}
	const note = Note.get(token);
	if (note.empty || note.oct !== undefined) {
		throw new NoDiagramError(`Not a note name or chord degree: ${token}`);
	}
	return note.name;
}

function degreeName(number: number, accidentals: string, chord: SheetChord): string {
	const ownInterval = accidentals === "" && chord.intervals.find(interval => Interval.get(interval).num === number);
	if (ownInterval) {
		return Note.transpose(chord.tonic!, ownInterval);
	}
	const scaleTone = Note.get(Scale.degrees(`${chord.tonic} major`)(number));
	return scaleTone.letter + altToAcc(scaleTone.alt + accToAlt(accidentals));
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
		return {midi, name: readableName(name), isRoot: name === root};
	});
}

/** Keeps the chord's spelling (Cb stays Cb); only double accidentals are simplified. */
function readableName(name: string): string {
	return Math.abs(Note.get(name).alt) > 1 ? Note.simplify(name) : name;
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

	getDiagram(chord: SheetChord, chordName: string): ChordDiagram {
		if (chord.userDefinedChord) {
			const voicing = userDefinedVoicing(chord.userDefinedChord, chord);
			const range = getKeyboardRange(voicing.map(note => note.midi));
			return {
				numVoicings: 1,
				render: (_index: number, width: number) => this.draw(voicing, range, width)
			};
		}

		const voicings = getKeyboardVoicings(chord);
		if (voicings.length === 0) {
			throw new NoDiagramError(`Unknown chord: ${chordName}`);
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
		const keyboard = drawKeyboard({range: getKeyboardRange([]), markers: [], whiteKeyWidth: whiteKeyWidth(width)});
		drawMissingMark(keyboard);

		const el = createDiv();
		el.appendChild(keyboard);
		return el;
	}

	private draw(voicing: Voicing, range: KeyRange, width: number): HTMLDivElement {
		const el = createDiv();
		el.appendChild(drawKeyboard({
			range,
			markers: voicing.map(note => ({midi: note.midi, label: note.name, emphasized: note.isRoot, hand: note.hand})),
			whiteKeyWidth: whiteKeyWidth(width)
		}));
		return el;
	}
}
