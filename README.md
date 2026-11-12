# Table Resizer

Resize Markdown tables in Obsidian the way you resize images: drag handles for the whole table, for each column and for each row. Sized tables can break out of the normal text column and stay centered, without widening your regular note text.

> **Status: work in progress (0.1.0).** Desktop only.
>
> **Known bug:** resize handles can still appear in Reading view, where resizing is meant to be disabled. Use Live Preview for resizing until this is fixed.

## Features

- **Column handles:** drag a column's right edge to resize that column. The table width follows.
- **Row handles:** drag a row's bottom edge to set its height.
- **Corner handle:** drag the bottom-right corner to scale the whole table (widths and heights together).
- **Centered and wide:** a sized table that is wider than the text column is centered on it. A horizontal scrollbar appears only when the table is wider than the pane.
- **Nothing is written to your notes.** Sizes are stored in the plugin's `data.json`.
- **Untouched by default:** tables you haven't resized look exactly like vanilla Obsidian.

## Usage

1. Open a note in **Live Preview**.
2. Hover a table. Resize handles appear on the column edges, row edges and bottom-right corner.
3. Drag to resize. The size is saved automatically.

Sized tables are displayed at their saved size in Reading view, but they can only be resized in Live Preview.

## How sizes are stored

Sizes are saved in `.obsidian/plugins/table-resizer/data.json`, per note. A table is identified by its header row text plus its position among tables with the same header in that note.

This means:

- Renaming or moving a note keeps its sizes. Deleting a note removes them.
- **Editing a table's header text resets that table's size.** Editing body rows is fine.
- Reordering two tables with identical headers swaps their sizes.
- Sizes are not part of the note, so they don't travel if you copy the note to another vault. They sync with your other plugin data if you sync `.obsidian`.

## Installation

### Manual

1. Download `main.js`, `manifest.json` and `styles.css`.
2. Put them in `<your vault>/.obsidian/plugins/table-resizer/`.
3. Reload Obsidian and enable **Table Resizer** under Settings → Community plugins.

Do not copy a `data.json` from someone else's vault: it holds that vault's table sizes.

### BRAT (recommended while this is in development)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Settings → Community plugins → Browse.
2. In BRAT's settings choose **Add Beta plugin** and enter `gvinagremartins/table-resizer`.
3. Enable **Table Resizer** under Settings → Community plugins.

BRAT installs the latest release of this repository and keeps it updated.

## Known limitations

- Desktop only.
- Relies on Obsidian internals that aren't part of the public API (the editor's CodeMirror instance and the Live Preview table widget's DOM). An Obsidian update may break it.
- Obsidian's own Live Preview table controls (add row/column buttons) may sit close to the resize handles.
- If you use another plugin that widens tables (for example Dynamic Wide Content), disable it for tables to avoid conflicts.

## License

[MIT](LICENSE)
