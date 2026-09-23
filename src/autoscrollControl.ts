import {Component, Events, MarkdownView, Platform, setIcon, setTooltip, SliderComponent} from "obsidian";

export const AUTOSCROLL_STEPS = 20;
export const SPEED_CHANGED_EVENT = "speed-changed";

export class AutoscrollControl extends Component {
	private controlEls: HTMLElement[] = [];
	private intervalId: number | null;
	private slider: SliderComponent | null;
	private speedEl: HTMLElement | null;

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
			this.speedEl?.setText(`${speedValue}`);
		}
	}

	get speed() {
		return this._speed;
	}

	onunload() {
		this.removeControls();
		super.onunload();
	}

	start() {
		if (Platform.isMobile) {
			this.addSpeedStepper();
		} else {
			this.addSpeedSlider();
		}

		this.startInterval();
	}

	stop() {
		this.stopInterval();
		this.removeControls();
	}

	// Mobile: −/+ buttons around the speed number
	private addSpeedStepper() {
		const increaseEl = this.view.addAction("plus", "Increase autoscroll speed", () => this.increaseSpeed());
		this.speedEl = createSpan({cls: "chord-sheet-autoscroll-speed", text: `${this._speed}`});
		increaseEl.before(this.speedEl);
		const decreaseEl = this.view.addAction("minus", "Decrease autoscroll speed", () => this.decreaseSpeed());
		this.controlEls = [decreaseEl, this.speedEl, increaseEl];
	}

	// Desktop: speed icon and slider
	private addSpeedSlider() {
		const actionsEl = this.view.containerEl.querySelector(".view-actions");
		if (!actionsEl) {
			throw new Error("Autoscroll: view header actions not found");
		}
		const controlEl = createDiv({cls: "chord-sheet-autoscroll-control"});
		setTooltip(controlEl, "Autoscroll speed");
		setIcon(controlEl.createSpan({cls: "chord-sheet-autoscroll-icon"}), "circle-gauge");
		actionsEl.prepend(controlEl);
		this.slider = new SliderComponent(controlEl)
			.setLimits(1, AUTOSCROLL_STEPS, 1)
			.setValue(this._speed)
			.onChange(value => {
				this.speed = value;
			});
		this.controlEls = [controlEl];
	}

	private removeControls() {
		this.controlEls.forEach(el => el.remove());
		this.controlEls = [];
		this.slider = null;
		this.speedEl = null;
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
