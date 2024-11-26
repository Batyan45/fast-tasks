# Fast Tasks

Fast Tasks is a VS Code extension that provides quick access to your workspace tasks directly from the explorer view.

## Features

- Automatic task execution on click from the explorer view
- Enhanced task view with color-coded icons
- Visual status updates for running, successful, or failed tasks
- Rich task information display
- Quick task refresh capability
- Task filtering and selection

## Visual Features

- **Task Type Colors**: Different task types are represented by distinct colors
  - 🔴 NPM tasks
  - 🔵 Shell tasks
  - 🟣 TypeScript tasks
  - 🟡 Other tasks (default)

- **Task-specific Icons**: Icons are chosen based on task names
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
  - ⚙️ Other tasks (default)

- **Rich Tooltips**: Detailed task information on hover
- **Selected Task Highlighting**: Visual indication of your selected tasks
- **Clean Interface**: Organized and intuitive task view

![Fast Tasks View](https://raw.githubusercontent.com/Batyan45/fast-tasks/main/images/fast-tasks-view.gif)

![Fast Tasks Check](https://raw.githubusercontent.com/Batyan45/fast-tasks/main/images/fast-tasks-check.gif)

## Usage

1. Locate the Tasks section in the Explorer view
2. Click the selection button (list icon) to choose which tasks to display
3. Select tasks you want to see in the view
4. Click on any task to run it; the task will be highlighted while running
5. View the task status as 'Running...', 'Success', or 'Failed'
6. Use the refresh button to update the task list and clear task statuses

## Requirements

- Visual Studio Code version 1.80.0 or higher
- A workspace with defined tasks (in tasks.json or workspace files)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
