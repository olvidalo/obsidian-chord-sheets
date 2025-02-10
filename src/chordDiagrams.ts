import {chordSequenceString, findDbChord, Instrument, UserDefinedChord} from "./chordsUtils";
import {BarreDef, ChordBox, ChordParams} from "vexchords";
import ChordsDB, {ChordDef} from "@tombatossals/chords-db";

import {ChordToken} from "./sheet-parsing/tokens";

function dbChordToVexChord(input: ChordDef, positionIndex = 0): ChordParams {
	const position = input.positions[positionIndex];
	const fingers = [...position.fingers].reverse();
	const frets = [...position.frets].reverse();

	const barres: BarreDef[] = [];
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
		position: position.baseFret > 1 ? position.baseFret : undefined,
		barres: barres.length > 0 ? barres : undefined,
		tuning: [...fingers].reverse().map(finger => finger > 0 ? `${finger}` : '')
	};
}

function userDefinedToVexChord({frets, position}: UserDefinedChord, numStrings: number): ChordParams {
	const barres: BarreDef[] = [];

	const barrePositions = frets
		.split('')
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

	const chordFrets = Array
		.from(frets.replace(/_/g, ''))
		.map(
			(fret, index) => [numStrings - index, fret === "x" ? "x" : parseInt(fret)]
		);

	return {
		// @ts-ignore
		chord: chordFrets,
		position, barres

	}
}

export function renderChordDiagram({containerEl, userDefinedChord, chordDef, numPositions, position, numStrings, numFrets, chordName, width}: {
	containerEl: HTMLElement,
	userDefinedChord: UserDefinedChord | undefined,
	chordDef: ChordDef,
	numPositions: number,
	position: number,
	numStrings: number,
	numFrets: number,
	chordName: string,
	width: number
}) {
	const box = containerEl.querySelector(".chord-sheet-chord-box");
	if (!box) {
		return;
	}

	box.replaceChildren();

	const chordNameEl = document.createElement("div");
	chordNameEl.classList.add("chord-sheet-chord-name", "chord-sheet-chord-highlight");
	chordNameEl.innerText = chordName;
	box.appendChild(chordNameEl);

	const chordDiagram = document.createElement("div");
	box.appendChild(chordDiagram);

	const vexChord = userDefinedChord
		? userDefinedToVexChord(userDefinedChord, numStrings)
		: dbChordToVexChord(chordDef, position);

	const chordBox = new ChordBox(chordDiagram, {
		numStrings: numStrings,
		numFrets: numFrets,
		showTuning: true,
		defaultColor: "var(--text-normal)",
		fontFamily: "var(--font-text)",
		width: width,
		height: width * 1.2
	});
	chordBox.draw(vexChord);

	updateChordPosition(containerEl, numPositions, position);
}

function updateChordPosition(containerEl: HTMLElement, numPositions: number, position: number) {
	const positionEl = containerEl.querySelector(".chord-sheet-position");
	const prevBtn = containerEl.querySelector(".chord-sheet-btn-prev-position");
	const nextBtn = containerEl.querySelector(".chord-sheet-btn-next-position");

	if (positionEl && prevBtn && nextBtn) {
		positionEl.textContent = `${position + 1}`;
		if (position < numPositions - 1) {
			nextBtn.addClass("chord-sheet-pos-btn-enabled");
		} else {
			nextBtn.removeClass("chord-sheet-pos-btn-enabled");
		}

		if (position > 0) {
			prevBtn.addClass("chord-sheet-pos-btn-enabled");
		} else {
			prevBtn.removeClass("chord-sheet-pos-btn-enabled");
		}
	}
}

export function makeChordDiagram(instrument: Instrument, chordToken: ChordToken, width = 100, position = 0) {
	const containerEl = document.createElement("div");
	containerEl.addClass("chord-sheet-chord-diagram");
	const chordBox: HTMLDivElement = document.createElement('div');
	chordBox.addClass("chord-sheet-chord-box");
	containerEl.appendChild(chordBox);

	const instrumentChordDb = ChordsDB[instrument];
	const numStrings = instrumentChordDb.main.strings;
	const numFrets = instrumentChordDb.main.fretsOnChord;

	if (chordToken.chord.userDefinedChord !== undefined) {

		const highestFret = Array.from(chordToken.chord.userDefinedChord.frets)
			.map(f => parseInt(f))
			.filter(f => !isNaN(f))
			.sort((a, b) => b - a)[0];

		renderChordDiagram({
			containerEl: containerEl,
			userDefinedChord: chordToken.chord.userDefinedChord,
			chordDef: {key: "", suffix: "", positions: []},
			numPositions: 1,
			position: 0,
			numStrings: numStrings,
			numFrets: Math.max(numFrets, highestFret),
			chordName: chordToken.chordSymbol.value,
			width: width
		});
	}
	else {
		const dbChord = findDbChord(chordToken, instrumentChordDb);
		if (!dbChord) {
			return;
		}

		let currentPosition = position;
		const numPositions = dbChord.positions.length;
		if (numPositions > 0) {
			const positionChooser = Object.assign(document.createElement('div'), {
				className: "chord-sheet-position-chooser"
			});

			const positionLabelSpan = Object.assign(document.createElement('span'), {
				className: "chord-sheet-position-label",
			});

			const prevPositionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-btn-prev-position",
				textContent: "<"
			});

			const positionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-position"
			});
			const numPositionSpan = Object.assign(document.createElement("span"), {
				textContent: `/${numPositions}`
			});
			positionLabelSpan.append(positionSpan, numPositionSpan);

			const nextPositionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-btn-next-position",
				textContent: ">"
			});

			positionChooser.append(prevPositionSpan, positionLabelSpan, nextPositionSpan);
			containerEl.appendChild(positionChooser);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nextPositionButton = positionChooser.querySelector(".chord-sheet-btn-next-position")!;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const prevPositionButton = positionChooser.querySelector(".chord-sheet-btn-prev-position")!;

			nextPositionButton.addEventListener("click", () => {
				if (currentPosition < numPositions - 1) {
					renderChordDiagram({
						containerEl: containerEl,
						userDefinedChord: undefined,
						chordDef: dbChord,
						numPositions: numPositions,
						position: ++currentPosition,
						numStrings: numStrings,
						numFrets: numFrets,
						chordName: chordToken.chordSymbol.value,
						width: width
					});
				}
			});
			prevPositionButton.addEventListener("click", () => {
				if (currentPosition > 0) {
					renderChordDiagram({
						containerEl: containerEl,
						userDefinedChord: undefined,
						chordDef: dbChord,
						numPositions: numPositions,
						position: --currentPosition,
						numStrings: numStrings,
						numFrets: numFrets,
						chordName: chordToken.chordSymbol.value,
						width: width
					});
				}
			});
		}

		renderChordDiagram({
			containerEl: containerEl,
			userDefinedChord: undefined,
			chordDef: dbChord,
			numPositions: numPositions,
			position: position,
			numStrings: numStrings,
			numFrets: numFrets,
			chordName: chordToken.chordSymbol.value,
			width: width
		});
	}

	return containerEl;
}

export function makeChordOverview(instrument: Instrument, container: HTMLElement, chordTokens: ChordToken[], width?: number) {
	for (const chordToken of chordTokens) {
		const chordBox = makeChordDiagram(instrument, chordToken, width);
		if (chordBox) {
			container.appendChild(chordBox);
		}
	}
	container.dataset.chordSequence = chordSequenceString(chordTokens);
	container.dataset.instrument = instrument;
	container.dataset.diagramWidth = `${width}`;
}
