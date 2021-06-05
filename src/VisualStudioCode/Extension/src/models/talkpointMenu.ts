import {
    Disposable,
    QuickInput,
    QuickInputButton,
    QuickInputButtons,
    QuickPickItem,
    window,

} from 'vscode';

export interface ITalkpointCreationState {
    type: "Tonal" | "Text" | "Expression",
    sound?: string,
    text?: string,
    expression?: string,
    shouldContinue: boolean,
    dismissedEarly: boolean,
}

const title = 'Create a Talkpoint';

export async function showTalkpointCreationSteps() : Promise<ITalkpointCreationState> {

    const talkpointTypes: QuickPickItem[] = [
        {
            label: "Tonal",
            detail: "Play a sound when a breakpoint is hit.",
        },
        {
            label: "Text",
            detail: "Read text aloud when a breakpoint is hit.",
        },
        {
            label: "Expression",
            detail: "Execute an expression at a breakpoint and read it aloud.",
        }];

    const shouldContinueItems: QuickPickItem[] = [
        {
            label: "Stop",
            detail: "Stop when this breakpoint is hit.",
        },
        {
            label: "Continue",
            detail: "Continue when this breakpoint is hit.",
        }
    ]

    async function showTalkpointTypeQuickPick(input: MultiStepInput, state: Partial<ITalkpointCreationState>) : Promise<InputStep | void> {
        const pick = await input.showQuickPick({
            title: title,
            step: 1,
            totalSteps: 2,
            placeholder: "Pick a Talkpoint type.",
            items: talkpointTypes,
            activeItem: talkpointTypes[0],
            shouldResume: () => Promise.resolve(false),
        }).catch(() => {
            state.dismissedEarly = true;
        });
        if (pick) {
            state.type = pick.label as "Tonal" | "Text" | "Expression";
            switch(pick.label) {
                case "Tonal":
                    // TO-DO: Enable quickpick to configure tone?
                    state.sound = "Default";
                    return (input: MultiStepInput) => showContinueQuickpick(input, state);
                case "Text":
                    return (input: MultiStepInput) => showTextTalkpointInput(input, state);
                case "Expression":
                    return (input: MultiStepInput) => showExpressionTalkpointInput(input, state);
                default:
                    return;
            }
        }
    }

    async function showTextTalkpointInput(input: MultiStepInput, state: Partial<ITalkpointCreationState>) : Promise<InputStep | void> {
        const text = await input.showInputBox({
            title: title,
            step: 2,
            totalSteps: 3,
            value: "",
            prompt: "Provide a message to be read aloud when breakpoint is hit.",
            validate: (value) => {
                if (!value) {
                	return Promise.resolve("Text is required");
                }
            },
            shouldResume: () => Promise.resolve(false),
        }).catch(() => {
            state.dismissedEarly = true;
        });

        if (text) {
            state.text = text;
            return (input: MultiStepInput) => showContinueQuickpick(input, state);
        }
    }

    async function showExpressionTalkpointInput(input: MultiStepInput, state: Partial<ITalkpointCreationState>) : Promise<InputStep | void> {
        const expression = await input.showInputBox({
            title: title,
            step: 2,
            totalSteps: 3,
            value: "",
            prompt: "Provide an expression to evaluate when breakpoint is hit. Value will be read aloud.",
            validate: (value) => {
                if (!value) {
                	return Promise.resolve("Expression is required");
                }
            },
            shouldResume: () => Promise.resolve(false),
        }).catch(() => {
            state.dismissedEarly = true;
        });

        if (expression) {
            state.expression = expression;
            return (input: MultiStepInput) => showContinueQuickpick(input, state);
        }
    }

    async function showContinueQuickpick(input: MultiStepInput, state: Partial<ITalkpointCreationState>) : Promise<InputStep | void> {
        const pick = await input.showQuickPick({
            title: title,
            step: 3,
            totalSteps: 3,
            placeholder: "Behavior when breakpoint is hit?",
            items: shouldContinueItems,
            activeItem: shouldContinueItems[0],
            shouldResume: () => Promise.resolve(false),
        }).catch(() => {
            state.dismissedEarly = true;
        });

        if (pick) {
            state.shouldContinue = pick.label === "Continue";
        }
    }

    async function collectInputs() {
		const state = {} as Partial<ITalkpointCreationState>;
		await MultiStepInput.run((input) => showTalkpointTypeQuickPick(input, state));
		return state as ITalkpointCreationState;
	}

    const state = await collectInputs();
    return state;
}


interface QuickPickParameters<T extends QuickPickItem> {
    title: string;
    step: number;
    totalSteps: number;
    items: T[];
    activeItem?: T;
    placeholder: string;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    value: string;
    prompt: string;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
						.catch(reject);
					}),
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}