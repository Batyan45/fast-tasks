# Fast Tasks

Fast Tasks is a VS Code extension that provides quick access to your workspace tasks directly from the explorer view, with optimized performance and enhanced error handling.

![Fast Tasks View](https://raw.githubusercontent.com/Batyan45/fast-tasks/main/images/fast-tasks-view.gif)

![Fast Tasks Check](https://raw.githubusercontent.com/Batyan45/fast-tasks/main/images/fast-tasks-check.gif)

## Installation

1. Open Visual Studio Code
2. Press `Ctrl+P` to open the Quick Open dialog
3. Type `ext install batyan-soft.fast-tasks` to find the extension
4. Click Install

Or install it from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=batyan-soft.fast-tasks).

## Features

### Core Features
- Automatic task execution on click from the explorer view
- Enhanced task view with color-coded icons
- Visual status updates for running, successful, or failed tasks (with exit codes)
- Rich task information display with error recovery
- Quick task refresh capability with caching
- Task filtering and selection
- Optimized performance with task caching
- Robust error handling and recovery
- Stop button for running tasks
- Edit icon button to quickly open task definition in tasks.json file
- Multi-root workspace support with optional grouping

### Visual Features

#### Task Type Colors
- 🔴 NPM tasks
- 🔵 Shell tasks
- 🟣 TypeScript tasks
- 🟡 Other tasks (default)

#### Task-specific Icons
- 📦 Build tasks
- 🧪 Test tasks
- 🚀 Launch tasks
- 🐛 Debug tasks
- 👁️ Watch tasks
- 🗑️ Clean tasks
- ☁️ Deploy tasks
- ▶️ Start tasks
- ⏹️ Stop tasks
- ☁️ Publish tasks
- 🏃 Run tasks
- ⚙️ Other tasks (default)

#### Custom Icons (New!)

You can now define custom icons for your tasks directly in your `tasks.json` file. These custom icons will take priority over the automatically assigned icons.

To use a custom icon, add an `icon` object to your task definition with an `id` and an optional `color`:

```json
{
  "label": "build:project",
  "type": "shell",
  "command": "make build",
  "icon": {
    "id": "package", // Any valid Codicon ID
    "color": "charts.blue" // Optional: any valid ThemeColor ID
  },
  "group": "build"
}
```

- The `id` should be a valid [Codicon ID](https://microsoft.github.io/vscode-codicons/dist/codicon.html).
- The `color` (optional) should be a valid [ThemeColor ID](https://code.visualstudio.com/api/references/theme-color).

#### Rich Tooltips
- Detailed task information on hover with error recovery
- Selected Task Highlighting
- Clean Interface
- Enhanced Status

### Multi-root Workspaces

- By default, when multiple workspace folders are open, tasks are grouped by workspace.
- You can switch to a single flat list via the setting: `Fast Tasks › Flat List`.
- In flat list mode (and only then), task labels include the workspace prefix: `Folder / Task`.
- When there is only one workspace folder, the view is always flat (no grouping).

### Performance Features
- Task caching for faster updates
- Optimized icon and color lookups
- Efficient task status tracking
- Memory-efficient operation

## Planned Features

- Task favorites/pinning functionality
- Task search and filtering capabilities
- Task execution history tracking
- Task dependencies visualization

## Usage

1. Locate the Tasks section in the Explorer view
2. Click the selection button (list icon) to choose which tasks to display
3. Select tasks you want to see in the view
4. Click on any task to run it; the task will be highlighted while running
5. View the task status as 'Running...', 'Success', or 'Failed (with exit code)'
6. Use the refresh button to update the task list and clear task statuses
7. **Use inline action buttons that appear next to task names:**
   - **Edit Task** (pencil icon) - Click to open the tasks.json file at the exact location where the task is defined
   - **Stop Task** (stop icon) - Available for running tasks to terminate execution

### View Mode (Group vs Flat)

- Open Settings and search for "Fast Tasks: Flat List" to toggle the view:
  - Off (default): tasks grouped by folders when multiple folders are open
  - On: a single flat list of all tasks; labels show `Folder / Task`

### Hidden Tasks (tasks.json `hide`)

- By default, Fast Tasks hides tasks that have `"hide": true` in `tasks.json`.
- To show all tasks (ignore the `hide` flag), enable the setting: `Fast Tasks › Ignore Hide`.

### Keyboard Shortcuts
- `Ctrl+Shift+P` or `Cmd+Shift+P` (Mac) and type "Fast Tasks" to see all available commands
- Use arrow keys to navigate through tasks
- Press `Enter` to run a selected task
- Press `Esc` to stop a running task

## Requirements

- Visual Studio Code version 1.80.0 or higher
- A workspace with defined tasks (in tasks.json or workspace files)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Known Issues

Please report any issues on the [GitHub issues page](https://github.com/Batyan45/fast-tasks/issues).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.
