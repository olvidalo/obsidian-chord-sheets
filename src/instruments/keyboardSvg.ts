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
const LABEL_ROW_GAP = LABEL_HEIGHT / 2;
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

export type Hand = "left" | "right";

export interface KeyMarker {
	readonly midi: number;
	readonly label: string;
	readonly emphasized: boolean;
	readonly hand?: Hand;
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

/** The keys with their markers, and below them the note names in their own SVG so that CSS can hide them. */
export function drawKeyboard({range, markers, whiteKeyWidth}: KeyboardSvgOptions): HTMLElement {
	const keys = layOutKeys(range);
	const whiteKeys = keys.filter(key => key.isWhite);
	const blackKeys = keys.filter(key => !key.isWhite);
	const keyOf = new Map(keys.map(key => [key.midi, key]));
	const markedMidis = new Set(markers.map(marker => marker.midi));

	const keyboard = createDiv({cls: "chord-sheet-keyboard"});
	const svg = keyboard.createSvg("svg", {
		cls: "chord-sheet-keyboard-keys",
		attr: svgSize(whiteKeys.length, WHITE_KEY_HEIGHT, whiteKeyWidth)
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
	}

	const dividerX = handDividerX(keys, markers);
	if (dividerX !== null) {
		drawHandDivider(svg, dividerX, WHITE_KEY_HEIGHT);
	}

	if (markers.length > 0) {
		drawLabels(keyboard, markers, keyOf, whiteKeys.length, whiteKeyWidth, dividerX);
	}
	return keyboard;
}

/** A dashed line on a light halo, so that it also shows on black keys, like the markers' outline. */
function drawHandDivider(svg: SVGSVGElement, x: number, height: number): void {
	for (const cls of ["chord-sheet-keyboard-hand-divider-halo", "chord-sheet-keyboard-hand-divider"]) {
		svg.createSvg("line", {cls, attr: {x1: x, y1: 0, x2: x, y2: height}});
	}
}

function svgSize(widthUnits: number, heightUnits: number, whiteKeyWidth: number) {
	return {
		viewBox: `0 0 ${widthUnits} ${heightUnits}`,
		width: widthUnits * whiteKeyWidth,
		height: heightUnits * whiteKeyWidth
	};
}

/**
 * Where to draw the line between the hands: on the white key edge nearest to the middle of the gap
 * between the hands, moved to the edge of a pressed black key if one sits on that edge.
 * Null unless markers of both hands are present.
 */
export function handDividerX(keys: readonly Key[], markers: readonly KeyMarker[]): number | null {
	const leftMidis = markers.filter(marker => marker.hand === "left").map(marker => marker.midi);
	const rightMidis = markers.filter(marker => marker.hand === "right").map(marker => marker.midi);
	if (leftMidis.length === 0 || rightMidis.length === 0) {
		return null;
	}
	const highestLeft = keys.find(key => key.midi === Math.max(...leftMidis))!;
	const lowestRight = keys.find(key => key.midi === Math.min(...rightMidis))!;
	const edge = Math.round((highestLeft.x + highestLeft.width + lowestRight.x) / 2);

	const pressedBlackKeyOnEdge = keys.find(key =>
		!key.isWhite && Math.abs(key.x + key.width / 2 - edge) < 0.01 && markers.some(marker => marker.midi === key.midi)
	);
	if (!pressedBlackKeyOnEdge) {
		return edge;
	}
	return pressedBlackKeyOnEdge.midi >= lowestRight.midi ? pressedBlackKeyOnEdge.x : pressedBlackKeyOnEdge.x + pressedBlackKeyOnEdge.width;
}

export function drawMissingMark(keyboard: HTMLElement): void {
	const svg = keyboard.querySelector<SVGSVGElement>(".chord-sheet-keyboard-keys")!;
	const {width, height} = svg.viewBox.baseVal;
	svg.createSvg("text", {
		cls: "chord-sheet-no-diagram-mark",
		attr: {x: width / 2, y: height / 2, "font-size": MISSING_MARK_FONT_SIZE}
	}).textContent = "?";
}

function drawKey(svg: SVGSVGElement, key: Key, isMarked: boolean): void {
	svg.createSvg("path", {
		cls: [
			key.isWhite ? "chord-sheet-keyboard-white-key" : "chord-sheet-keyboard-black-key",
			...(isMarked ? ["chord-sheet-keyboard-marked-key"] : [])
		],
		attr: {d: keyOutline(key)}
	});
}

/** Square at the top like on a real keyboard, rounded at the bottom. */
function keyOutline({x, width, height}: Key): string {
	const r = KEY_CORNER_RADIUS;
	const right = x + width;
	return `M${x} 0 H${right} V${height - r} Q${right} ${height} ${right - r} ${height} H${x + r} Q${x} ${height} ${x} ${height - r} Z`;
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

/** Labels of neighbouring keys would overlap, so every second one moves down a row. */
export function labelRowsOf(markers: readonly KeyMarker[], keyOf: ReadonlyMap<number, Key>): Map<KeyMarker, number> {
	const rows = new Map<KeyMarker, number>();
	let previousCentre = -Infinity;
	let row = 0;
	for (const marker of [...markers].sort((a, b) => a.midi - b.midi)) {
		const centre = keyCentre(keyOf.get(marker.midi)!);
		row = centre - previousCentre < 1 ? 1 - row : 0;
		rows.set(marker, row);
		previousCentre = centre;
	}
	return rows;
}

function drawLabels(
	keyboard: HTMLElement, markers: readonly KeyMarker[], keyOf: ReadonlyMap<number, Key>,
	widthUnits: number, whiteKeyWidth: number, dividerX: number | null
): void {
	const rows = labelRowsOf(markers, keyOf);
	const numRows = Math.max(...rows.values()) + 1;
	const height = LABEL_HEIGHT + (numRows - 1) * LABEL_ROW_GAP;
	const svg = keyboard.createSvg("svg", {
		cls: "chord-sheet-keyboard-labels",
		attr: svgSize(widthUnits, height, whiteKeyWidth)
	});
	if (dividerX !== null) {
		drawHandDivider(svg, dividerX, height);
	}
	for (const marker of markers) {
		svg.createSvg("text", {
			cls: [
				"chord-sheet-keyboard-label",
				...(marker.emphasized ? ["chord-sheet-keyboard-label-emphasized"] : [])
			],
			attr: {
				x: keyCentre(keyOf.get(marker.midi)!),
				y: LABEL_HEIGHT * 0.8 + rows.get(marker)! * LABEL_ROW_GAP,
				"text-anchor": "middle",
				"font-size": LABEL_FONT_SIZE
			}
		}).textContent = marker.label;
	}
}

function keyCentre(key: Key): number {
	return key.x + key.width / 2;
}
