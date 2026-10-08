# protocol-length-test

Measures whether Windows hands a long custom-protocol link (`scheme://…`) to
its handler intact. The question came from JBrowse Desktop's `jbrowse://`
links, which run to about 11,000 characters for the largest docs figures.

`test.mjs` registers a `jbtest://` handler with the `"exe" "%1"` command an
NSIS-installed Electron app gets, launches links of several lengths through
`Start-Process`, `rundll32 url.dll`, and a real click in Chrome and Edge, and
writes a table of sent against received length to the run summary.

Handler: `handler.cjs` is run directly by `node.exe`, so no `cmd.exe` limit sits
between the shell and the handler.
