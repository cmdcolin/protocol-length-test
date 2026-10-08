# protocol-length-test

How long can a custom-protocol link (`myapp://…`) be before Windows stops
handing it to the app whole?

The usual answer online is 2,083 characters, the value of
`INTERNET_MAX_URL_LENGTH`. This repo measures it on a GitHub Actions Windows
runner, and that limit does not apply: links arrive intact up to at least 32,000
characters, which is consistent with the 32,767-character limit on a Windows
command line.

## Result

Windows 11, build 10.0.26100 (`windows-latest`), with Chrome and Edge as
preinstalled on the runner.

| Launched through               | 1,002 to 32,000 characters | 40,000 characters                         |
| ------------------------------ | -------------------------- | ----------------------------------------- |
| `Start-Process` (ShellExecute) | intact                     | refused: "cannot find the file specified" |
| `rundll32 url.dll`             | intact                     | refused: name too long                    |
| Chrome, a real click on a link | intact                     | never reaches the handler                 |
| Edge, a real click on a link   | intact                     | never reaches the handler                 |

The lengths tested are 1,002, 2,000, 2,083, 2,084, 2,943, 4,096, 8,191, 8,192,
11,218, 20,000, 32,000 and 40,000, so both sides of the 2,083 and 8,191
boundaries are covered. The exact ceiling between 32,000 and 40,000 is not
measured.

One alteration at every length: a link sent as `scheme://open?…` arrives as
`scheme://open/?…`, with a slash after the host. Parse the link with a URL
parser and read its query, and the difference does not matter.

The latest run's full table is in its summary on the Actions tab.

## What it does

`test.mjs` registers a `jbtest://` handler under `HKCU\Software\Classes` with
the command `"node.exe" "handler.cjs" "<out dir>" "%1"`. That is the
`"exe" "%1"` shape an NSIS-installed Electron app gets, and `node.exe` is run
directly, so no `cmd.exe` limit sits between the shell and the handler.
`handler.cjs` writes the link it was handed to a file, and the test compares
that to what it sent.

The links are shaped like the ones that raised the question, JBrowse Desktop's
`jbrowse://open?url=<a whole web url, percent-encoded>`, whose payload is itself
percent-encoded JSON.

The browser rows click a real `<a href>` in a page served from localhost. The
`AutoLaunchProtocolsFromOrigins` policy is set for Chrome and Edge so the "Open
this app?" prompt does not block the click.

## What it does not cover

- Firefox and other browsers.
- Older Windows versions.
- A handler registered as `cmd.exe /c …` or a `.bat` file, which is subject to
  the 8,191-character `cmd.exe` limit.
- What an app does with the link once it has it. Electron delivers the link in
  `process.argv` (or the `second-instance` event's `commandLine`), which is what
  the handler here reads.

## Run it

Fork, enable Actions, and push, or trigger the workflow by hand. On a Windows
machine: `npm install`, then `node test.mjs` from an elevated prompt (the
browser policy keys are under `HKLM`).
