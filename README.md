# Pi Response Duration

A small Pi extension that appends the elapsed time to the transcript after a long, completed user response.

## Example

![Pi transcript showing the response duration annotation](assets/worked-underline.png)

## Behavior

- Measures from `before_agent_start` until Pi is about to settle the run. This includes the agent's turns and tool work, rather than only model-generation time.
- Adds an entry only for completed responses that took **more than 30 seconds**.
- Does not add entries for aborted or failed runs, or outside the interactive TUI.
- Rounds up to whole seconds (`31s`, `2m 4s`) and shows the local time using the system locale.
- The annotation is a custom transcript entry and is not sent back to the model as conversation context.

## Install for personal use

Copy this directory to `~/.pi/agent/extensions/response-duration/`. Pi discovers the package manifest and loads `index.ts` automatically on startup. Restart Pi after installing or moving it.

Alternatively, from a checkout containing this package, install the local path with:

```sh
pi install ./response-duration
```

## Development

Run the tests with Node's built-in test runner:

```sh
npm test
```

Preview the npm archive without publishing:

```sh
npm pack --dry-run
```

## Publishing checklist

No public release has been made. Before publishing to npm, confirm the final package name (and scope, if any) is available, and add the source repository URL/author metadata as desired. The package uses the MIT license. Pi provides `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` at runtime; they are intentionally declared as peer dependencies rather than bundled runtime dependencies.
