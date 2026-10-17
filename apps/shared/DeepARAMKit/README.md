# DeepARAMKit

Swift package shared by the DeepARAM Apple apps (macOS, iOS, iPadOS):

- `Site`: the base URL, the sections the menus jump to, and which links stay inside the app.
- `PatchWatcher`: reads `/data/app-status.json` (`livePatch`, `pbeBuild`, `pbeUpdated`) and reports a new
  live or PBE patch since the last check. The first check only records the current patches.

`swift test --package-path apps/shared/DeepARAMKit`
