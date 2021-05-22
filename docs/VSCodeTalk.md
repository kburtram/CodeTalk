## Shortcuts
### For focus control
* Ctrl + M
  * Toggles "Tab moves focus" option.
    * When on, use Tab and Shift + Tab to navigate through VS Code.
    * When off, use Tab to add tabs to the file.
* F6 (Shift + F6)
  * Goes to the next (previous) focus element.

### For errors
* Ctrl + Shift + M
  * Toggles Problems Panel.
    * If Problems Panel is not already visible, make visible.
    * If Problems Panel is not already in focus, place focus on panel.
      * Focus goes to the last previously focused element in the panel.
      * Focus does not necessarily go to the closest error to focused line of code.
    * If Problems Panel is already in focus, make Problems Panel unfocused and not visible.
      * Focus goes back to the file being edited.
* F8 (Shift + F8)
  * Goes to the next (previous) error or warning.

## Features
### Error Alerting
Errors exist in the Problems Panel.
* Use arrow keys to navigate through errors.
* Pressing Enter on the error will send you to the line with the error.
  * Focus goes to the file being edited.
  * NVDA will read the line of code and then the error message.

### Code Summary
Outline View panel shows the symbol tree of the currently active editor.
* NVDA does read each instance in this tree, but isn't descriptive of the instance's data type.
* Reference: https://code.visualstudio.com/updates/v1_25#_outline-view

#### **Overall Thoughts:**
Rather than implement Code Summary from scratch, it'd be more useful to make this feature more accessible.
Most of the desired functionality for Code Summary does already seem to be here.

But if we do want to implement a Tree View ourselves though, here are some links:
* https://code.visualstudio.com/api/extension-capabilities/extending-workbench
* https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample
* https://code.visualstudio.com/api/extension-guides/tree-view
* https://code.visualstudio.com/api/references/vscode-api#TreeView

### Function List
Outline View panel can also be filtered by data type in the Settings.
* Feature request reference: https://github.com/microsoft/vscode/issues/53034
* Therefore, if you only show Methods and Functions, you'd get the Function List.

#### **Bug:** There used to be a Searchbox UI in the Outline View, but then VS Code removed it.
* This triggered complaints: https://github.com/microsoft/vscode/issues/70095
* VS Code argues that "You can now simply start typing when focused in the outline. It will start filtering."
* Users argue that this feature is not discoverable.
* Users also argue that pasting text no longer works, which is an accessibility issue.
  * First-person account on pasting text: https://github.com/microsoft/vscode/issues/70575 

**Thoughts:**
* Seems like removing the Searchbox UI was a VS Code design decision.
* Therefore, I'm not sure of the likelihood of getting that added back in.
* That said, I guess the Searchbox UI is irrelevant to the Function List feature.
* Just something that was interesting to note and something we might want to tackle.

#### **Bug:** The "Filter by Type" option doesn't seem to work.

**Thoughts:**
* It probably used to work and if it did would, maybe we could use it to toggle between Code Summary and Function List.
* Although, it does bring up the point of whether all of this configuration is an unreasonable learning curve for a VI developer.
* Maybe have a single shortcut key to toggle between Code Summary and Function List for ease of access.
* Maybe extend "Filter by Type" to have a dropdown list of all the options in the Settings as well.
* I don't really know what was the intended use of this option since it doesn't work. Need to do more digging.

#### **Overall Thoughts:**
From what I understand, Code Summary and Function List both do not care about where you are in the code.
So taking advantage of Outline View would probably suffice for both of them after ironing out the accessibility issues.

### Get Context
Needs to be able to cover if/else statements, which Outline View does not currently handle.

#### **Overall Thoughts:**
I have no main thoughts on how to tackle this feature.

That said, I do want to implement something like Scan Mode from Windows Narrator but for code.
* In Scan Mode, you can use
  * up and down arrows to change specificness of narration, and
  * left and right arrows to go to the next element at the same level of specificness.
* So for websites, you'd start at landmarks, which are large elements, and go down to text and then characters.
* Comparatively, for code, you'd start at namespaces, and then go down to classes, functions, and then if/else statements.
  * Could probably be based off of brackets or whitespace for most languages.
  * Would provide more flexibility than just getting the context of the current line.
  * But maybe it'd increase the chances of the user getting lost in the file.
* This is a larger work item because I'd have no idea where to even start with this.

### TalkPoints
Breakpoints are currently very inaccessible in VS Code.
* Feature request reference: https://github.com/microsoft/vscode/issues/90842
* There's a desire for an earcon to play when a line has a breakpoint.
  * That said, earcons do not solve accessibility for users using a Braille reader.

LogPoints
* Variant of a breakpoint that does not break, but logs a message to the console.
* Can include expressions to be evalated within curly braces.

#### **Overall Thoughts:**
If we alter LogPoints to read the logged message to the console, we can implement TalkPoints.
* Tone TalkPoints would need a database of sounds to select from though and for sounds to be played.
  * How does CodeTalk implement this feature, such that users can pick which sounds are played?

We would still need to implement reading the message for BreakPoints too, in case users want to break.

### Read Indentation
Feature would be to read the amount of indentation for a line, also discussed in the CodeTalk paper.
* Feature request reference: https://github.com/microsoft/vscode/issues/88877
* Based on discussion, would toggle this feature on and off based on the "renderWhitespace" setting.
  * Where if renderWhitespace, then read the whitespace.
* Issue hasn't been worked on in a year, so likely not prioritized anymore.
  * This would be a neat area to tackle if we wanted to.
  * Also has discussed solutions with first-person accounts.

### Vocalize Watch Window
No comments on this.

## Resources
### Shortcut Keys and Accessibility
https://code.visualstudio.com/shortcuts/keyboard-shortcuts-windows.pdf
https://code.visualstudio.com/docs/editor/accessibility
https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Aaccessibility

### Creating a VS Code Extensions
https://code.visualstudio.com/api
https://code.visualstudio.com/api/get-started/your-first-extension

## Meeting Agenda
### Work Items
- [ ] Try using CodeTalk in Visual Studios.
- [ ] Determine which feature each member is tackling.
  * I'd personally prefer to work on a standalone feature because my sleep schedule is chaotic.
  * That way, I'm not blocking on others, but check with the rest of the team on preferences later today.

### Commentary
If possible, I think we should implement as many features as we can into VS Code itself as features/bug fixes.
* This would be more accessible to users who may not know a VSCodeTalk extension exists.
* This would also be more likely to be maintained as VS Code is open-source and an active project.
* We also get the additional benefit of getting first-person feedback on our features.
* But it's less likely that our fix will go in.
  * But we could implement what wasn't accepted as part of an extension.

Sorry, I didn't do any research into integrating CodeTalk's existing code into VSCodeTalk.
I haven't looked into CodeTalk at all yet, which is something I still need to do.

Question: Are there any other features of interest that we should include?