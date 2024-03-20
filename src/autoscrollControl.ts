import {Component, Events, MarkdownView, SliderComponent} from "obsidian";

export const AUTOSCROLL_STEPS = 20;
export const SPEED_CHANGED_EVENT = "speed-changed";

export class AutoscrollControl extends Component {
	private controlEl: HTMLElement | null;
	private intervalId: number | null;
	private slider: SliderComponent | null;

	readonly events = new Events();

	constructor(public readonly view: MarkdownView, private _speed: number) {
		super();
		view.addChild(this);
	}

	get isRunning() {
		return this.intervalId !== null;
	}

	set speed(value: number) {
		const speedValue = value > AUTOSCROLL_STEPS
			? AUTOSCROLL_STEPS
			: value < 1
				? 1
				: value;
		if (speedValue != this._speed) {
			this._speed = speedValue;

			if (this.isRunning) {
				this.stopInterval();
				this.startInterval();
			}

			this.events.trigger(SPEED_CHANGED_EVENT, speedValue);
			if (this.slider?.getValue() != speedValue) {
				this.slider?.setValue(speedValue);
			}
		}
	}

	get speed() {
		return this._speed;
	}

	onunload() {
		this.controlEl?.remove();
		super.onunload();
	}

	start() {
		this.controlEl = this.view.contentEl.createDiv({
			prepend: true,
			text: "Autoscroll speed",
			cls: "chord-sheet-autoscroll-control"
		});
		this.slider = new SliderComponent(this.controlEl)
			.setLimits(1, AUTOSCROLL_STEPS, 1)
			.setDynamicTooltip()
			.setValue(this._speed)
			.onChange(value => {
				this.speed = value;
			});

		this.startInterval();
	}

	stop() {
		this.stopInterval();

		if (this.controlEl) {
			this.controlEl.remove();
			this.controlEl = null;
		}
	}

	increaseSpeed() {
		if (this.speed < AUTOSCROLL_STEPS) {
			this.speed++;
		}
	}

	decreaseSpeed() {
		if (this.speed > 1) {
			this.speed--;
		}
	}

	private startInterval() {
		const highestInterval = 200;
		const lowestInterval = 13;

		// Adjust speed curve for usability. A higher exponent makes speed changes at lower speeds (i.e., higher
		// intervals) more pronounced.
		const speedCurveExponent = 2.3;
		const normalizedSpeed = (this.speed - 1) / (AUTOSCROLL_STEPS - 1);
		const adjustedSpeed = Math.pow(normalizedSpeed, speedCurveExponent);

		const intervalRangeFactor = (highestInterval - lowestInterval) / (1 - 1 / AUTOSCROLL_STEPS);
		const intervalRangeConstant = lowestInterval - intervalRangeFactor / AUTOSCROLL_STEPS;

		const interval = intervalRangeFactor / (1 + adjustedSpeed * (AUTOSCROLL_STEPS - 1)) + intervalRangeConstant;

		this.intervalId = window.setInterval(() => {
			const scrollElem = this.view.getMode() === "preview"
				? this.view.previewMode.containerEl.firstElementChild
				: this.view.editor.cm.scrollDOM;
			scrollElem?.scrollBy(0, 1);
		}, interval);

		this.view.registerInterval(this.intervalId);
	}

	private stopInterval() {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}
