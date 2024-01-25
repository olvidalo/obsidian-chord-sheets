import {Component, MarkdownView, SliderComponent} from "obsidian";

export const AUTOSCROLL_STEPS = 20;

export class AutoscrollControl extends Component {
	private controlEl: HTMLElement | null;
	private intervalId: number | null;
	private slider: SliderComponent | null;

	constructor(public readonly view: MarkdownView, private _speed: number) {
		super();
		view.addChild(this);
	}

	get isRunning() {
		return this.intervalId !== null;
	}

	onunload() {
		super.onunload();
		this.controlEl?.remove();
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
			.onChange(value => this._speed = value);

		this.intervalId = window.setInterval(() => {
			const scrollIncrease = 0.7 + (this._speed - 1) * 0.2;
			if (this.view.getMode() === "preview") {
				this.view.previewMode.applyScroll(this.view.previewMode.getScroll() + scrollIncrease * 0.05);
			} else {
				const editor = this.view.editor;
				if (editor) {
					const scrollInfo = editor.getScrollInfo();
					editor.scrollTo(null, scrollInfo.top + scrollIncrease);
				}
			}
		}, 50) as unknown as number;

		this.view.registerInterval(this.intervalId);
	}

	stop() {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		if (this.controlEl) {
			this.controlEl.remove();
			this.controlEl = null;
		}
	}

	increaseSpeed() {
		if (this._speed < AUTOSCROLL_STEPS) {
			this.slider?.setValue(this._speed + 1);
		}
	}

	decreaseSpeed() {
		if (this._speed > 1) {
			this.slider?.setValue(this._speed - 1);
		}
	}
}
