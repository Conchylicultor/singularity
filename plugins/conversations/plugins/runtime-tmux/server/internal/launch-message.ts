// What does the CLI do with the text a session is launched with?
//
// It reads it the way it reads the input box: text that opens with `/` and a
// bare word is a slash command. A launch message is never meant as one — it is
// a task description, an agent's brief, a forked draft — but a description that
// merely MENTIONS a command first ("/todo blocks have an extra padding…") was
// run as `/todo`. The CLI answered "Unknown command: /todo", printed the rest as
// the missing command's arguments, and the model never saw the turn; the pane
// sat at an empty prompt that the app reads as an ordinary waiting agent.
//
// One leading space is enough: the CLI only parses a command when `/` is the
// very first character, and a leading space is invisible once the turn renders.
// Verified against Claude Code 2.1.272, both interactive and `-p`. The other
// input-box prefixes (`!`, `#`) are not special for a launch message, so `/` is
// the whole class.
//
// Only the LAUNCH message is escaped. A later turn typed into the prompt box
// may be a real command (`/compact`), so send() delivers it untouched.
export function asLaunchMessage(prompt: string): string {
  return prompt.startsWith("/") ? ` ${prompt}` : prompt;
}
