// noinspection JSUnusedGlobalSymbols

/**
 * Type definitions for vexchords 1.2.0 <https://github.com/0xfe/vexchords>
 * Project: Vex Chords
 * Definitions by: Marcel Schaeben <https://github.com/olvidalo>
 */

declare module "vexchords" {
	export interface ChordBoxParams {
		width?: number, // canvas width
		height?: number, // canvas height
		circleRadius?: number, // circle radius (width / 20 by default)

		numStrings?: number, // number of strings (e.g., 4 for bass)
		numFrets?: number, // number of frets (e.g., 7 for stretch chords)
		showTuning?: true, // show tuning keys

		defaultColor?: string, // default color
		bgColor?: string, // background color
		strokeColor?: string, // stroke color (overrides defaultColor)
		textColor?: string // text color (overrides defaultColor)
		stringColor?: string, // string color (overrides defaultColor)
		fretColor?: string, // fret color (overrides defaultColor)
		labelColor?: string, // label color (overrides defaultColor)
		bridgeColor?: string

		fretWidth?: number, // fret width
		stringWidth?: number, // string width

		fontFamily?: string,
		fontSize?: number,
		fontWeight?: string,
		fontStyle?: string, // font settings
		labelWeight?: string // weight of label font
	}

	export interface BarreDef {
		fromString: number;
		toString: number;
		fret: number;
	}

	export type Chord = number[][];
	export interface ChordParams {
		chord: Chord;
		position?: number;
		positionText?: number;
		barres?: BarreDef[];
		tuning?: string[];
	}

	export class ChordBox {
		constructor(sel: string | HTMLElement, params?: ChordBoxParams);
		draw(chordParams: ChordParams): void;
	}

	export function build(key: string, string: string, shape: string): ChordParams;
	export function draw(sel: string | HTMLElement, chord: ChordParams, opts?: ChordBoxParams): ChordBox;
}
