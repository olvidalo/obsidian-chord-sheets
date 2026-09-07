/**
 * Draws a piano keyboard as SVG.
 *
 * All sizes are in white key widths — the viewBox maps one unit to one white
 * key, so the constants below read as proportions.
 */

const WHITE_KEY_HEIGHT = 4.6;
const BLACK_KEY_WIDTH = 0.62;
const BLACK_KEY_HEIGHT = 2.85;
const KEY_CORNER_RADIUS = 0.06;

const LABEL_HEIGHT = 1.2;
const LABEL_FONT_SIZE = 0.75;

const MARKER_RADIUS = 0.3;
const MARKER_INSET = 0.55;

const MISSING_MARK_FONT_SIZE = 2;

const WHITE_KEY_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];   // C D E F G A B

/** MIDI note numbers, inclusive. */
export interface KeyRange {
	readonly fromMidi: number;
	readonly toMidi: number;
}

export interface KeyMarker {
	readonly midi: number;
	readonly label: string;
	readonly emphasized: boolean;
}

export interface KeyboardSvgOptions {
	readonly range: KeyRange;
	readonly markers: readonly KeyMarker[];
	readonly whiteKeyWidth: number;
}

export interface Key {
	readonly midi: number;
	readonly isWhite: boolean;
	/** Left edge, in white key widths, measured from the start of the keyboard. */
	readonly x: number;
	readonly width: number;
	readonly height: number;
}

export function isWhiteKey(midi: number): boolean {
	return WHITE_KEY_PITCH_CLASSES.includes(midi % 12);
}

/** A keyboard begins and ends with a white key; a black key straddles the gap between two white keys. */
export function layOutKeys({fromMidi, toMidi}: KeyRange): Key[] {
	const firstMidi = isWhiteKey(fromMidi) ? fromMidi : fromMidi - 1;
	const lastMidi = isWhiteKey(toMidi) ? toMidi : toMidi + 1;

	const keys: Key[] = [];
	let numWhiteKeys = 0;
	for (let midi = firstMidi; midi <= lastMidi; midi++) {
		if (isWhiteKey(midi)) {
			keys.push({midi, isWhite: true, x: numWhiteKeys, width: 1, height: WHITE_KEY_HEIGHT});
			numWhiteKeys++;
		} else {
			keys.push({midi, isWhite: false, x: numWhiteKeys - BLACK_KEY_WIDTH / 2, width: BLACK_KEY_WIDTH, height: BLACK_KEY_HEIGHT});
		}
	}
	return keys;
}

export function drawKeyboard({range, markers, whiteKeyWidth}: KeyboardSvgOptions): SVGSVGElement {
	const keys = layOutKeys(range);
	const whiteKeys = keys.filter(key => key.isWhite);
	const blackKeys = keys.filter(key => !key.isWhite);
	const keyOf = new Map(keys.map(key => [key.midi, key]));
	const markedMidis = new Set(markers.map(marker => marker.midi));
	const height = WHITE_KEY_HEIGHT + (markers.length > 0 ? LABEL_HEIGHT : 0);

	const svg = createSvg("svg", {
		cls: "chord-sheet-keyboard",
		attr: {
			viewBox: `0 0 ${whiteKeys.length} ${height}`,
			width: whiteKeys.length * whiteKeyWidth,
			height: height * whiteKeyWidth
		}
	});

	// white keys first, so that black keys are drawn on top of them
	for (const key of [...whiteKeys, ...blackKeys]) {
		drawKey(svg, key, markedMidis.has(key.midi));
	}
	for (const marker of markers) {
		const key = keyOf.get(marker.midi);
		if (!key) {
			throw new Error(`Marker at MIDI ${marker.midi} lies outside the keyboard ${range.fromMidi}–${range.toMidi}`);
		}
		drawMarker(svg, key, marker);
		drawLabel(svg, key, marker);
	}

	return svg;
}

export function drawMissingMark(svg: SVGSVGElement): void {
	const {width, height} = svg.viewBox.baseVal;
	svg.createSvg("text", {
		cls: "chord-sheet-no-diagram-mark",
		attr: {x: width / 2, y: height / 2, "font-size": MISSING_MARK_FONT_SIZE}
	}).textContent = "?";
}

function drawKey(svg: SVGSVGElement, key: Key, isMarked: boolean): void {
	svg.createSvg("rect", {
		cls: [
			key.isWhite ? "chord-sheet-keyboard-white-key" : "chord-sheet-keyboard-black-key",
			...(isMarked ? ["chord-sheet-keyboard-marked-key"] : [])
		],
		attr: {x: key.x, y: 0, width: key.width, height: key.height, rx: KEY_CORNER_RADIUS}
	});
}

function drawMarker(svg: SVGSVGElement, key: Key, marker: KeyMarker): void {
	svg.createSvg("circle", {
		cls: [
			"chord-sheet-keyboard-marker",
			...(marker.emphasized ? ["chord-sheet-keyboard-marker-emphasized"] : [])
		],
		attr: {cx: keyCentre(key), cy: key.height - MARKER_INSET, r: MARKER_RADIUS}
	});
}

function drawLabel(svg: SVGSVGElement, key: Key, marker: KeyMarker): void {
	svg.createSvg("text", {
		cls: [
			"chord-sheet-keyboard-label",
			...(marker.emphasized ? ["chord-sheet-keyboard-label-emphasized"] : [])
		],
		attr: {
			x: keyCentre(key),
			y: WHITE_KEY_HEIGHT + LABEL_HEIGHT * 0.8,
			"text-anchor": "middle",
			"font-size": LABEL_FONT_SIZE
		}
	}).textContent = marker.label;
}

function keyCentre(key: Key): number {
	return key.x + key.width / 2;
}
