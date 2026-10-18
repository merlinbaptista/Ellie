# Three-Minute Demo Video Script

Record in English unless the non-English phone strings shown have received native-speaker review. Use Presenter mode and `F` for the side-by-side recording layout. Keep developer panels closed and system audio enabled for Headsup’s speech.

**Judges are not required to watch past 3:00**, so the first twenty seconds carry a real household moment and the gap Headsup fills — not a product abstraction. Nothing in this script states a statistic.

**Framing rules**
- 0:00–0:20 is **your own story**, first person, one true incident. 👤 You must supply this line; it is marked below.
- The hero shot at 0:40 must show **voice, the Echo Show card and the phone in one frame**. Do not cut between them.
- Say "simulator" the first time the Echo Show frame appears, and say why: the Alexa+ MCP Toolkit is US-only and partner-gated.
- Every regional number spoken on screen is a region-pack value with a `source`. Say so once, at the safety beat.

| Time | Presenter step                                          | On screen                 | Spoken line (25 words max)                                                                                                           |
| ---- | ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00 | —                                                       | You, or the kitchen       | 👤 **Your own moment.** One true incident, first person, no statistics. <!-- for example: “The gas ran out mid-meal on Saturday. I’d thought about ordering two days earlier.” --> |
| 0:10 | Intro                                                   | Simulator idle, labelled  | “Alexa+ can remind me on a date I pick. It can’t know my cylinder lasts twenty-seven days. This is a simulator; the MCP server is real.” |
| 0:20 | `due-this-week`                                         | Due card                  | “Normal reminders remember a time. Headsup remembers your home: the purifier filter is overdue, and gas is due today.”                 |
| 0:40 | `two-intent-hero`                                       | Voice + card + phone, one frame | “One sentence. Two tools. Headsup logs the cylinder change and diagnoses the beeping purifier from this home’s own filter and warranty history.” |
| 1:05 | `two-intent-hero` (after) | Prediction before → after | “Watch the due date move. That new event changed the prediction — household history beats the generic interval.”                     |
| 1:20 | `send-fix`, `open-fix`                                  | Phone fix page            | “The detailed steps, parts, warranty context, and repair-scoped chat move to the phone. Every claim cites an evidence ID.”            |
| 1:50 | `day-thirty-reminder`, `open-booking`, `confirm-booked` | Reminder and booking page | “At the reminder date, Headsup sends a booking link using the selected regional provider.”                                             |
| 2:10 | `gas-safety`                                            | Safety stop               | “A gas smell stops DIY guidance completely and gives the regional emergency number — a sourced region-pack value.”                   |
| 2:25 | `texas-propane`                                         | Texas household           | “Same code, different region pack. Texas propane vocabulary, units and rules — in fifteen seconds.”                                  |
| 2:40 | `privacy-inventory`                                     | Privacy inventory card    | “People can inspect what Headsup remembers, export it, withdraw consent, or request confirmed deletion.”                               |
| 2:48 | —                                                       | Inspector + test output   | “Real MCP: the Inspector lists every tool, 239 tests pass, and the scripted demo check is fifteen out of fifteen.” 🔑 *add the AWS console shot here only if keys exist* |
| 2:56 | Close                                                   | Simulator idle            | “Headsup turns home history into useful, explainable action, while keeping household control with the user.”                           |

Presenter steps are from `demo/script.json`; the short one-step-per-key sequence is available in the simulator with `P` and `→`.

**Shot list for the proof beat at 2:48** — prepare these before recording so the beat costs eight seconds, not thirty:

1. A terminal showing `npx @modelcontextprotocol/inspector --cli …` listing the tools (see [audit/inspector-evidence.md](audit/inspector-evidence.md)).
2. A terminal showing the final `npm test` summary line.
3. A terminal showing `npm run demo:check` at 15/15.
