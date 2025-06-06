# Change Log

All notable changes to the "Fast Tasks" extension will be documented in this file.

## [0.0.14] - 2025-06-06

### Added
- Edit Task button - inline icon to open task definition in tasks.json

## [0.0.13] - 2025-05-19

### Fixed
- Support comments in tasks.json via jsonc-parser (contributed by mitchellaha)

## [0.0.12] - 2025-05-16

### Added
- Custom icons support for tasks in tasks.json
- New icon for "run" tasks

## [0.0.11] - 2024-12-10

### Added
- Task caching mechanism to improve performance
- Better error handling with detailed error messages
- Enhanced exit code reporting in task status


## [0.0.10] - 2024-11-27

### Fixed
- Task selection now shows all available workspace tasks instead of only previously selected ones

## [0.0.9] - 2024-11-27

### Changed
- Code style
- Enhanced task tooltips with more detailed information

## [0.0.8] - 2024-11-26

### Changed
- Updated build process with automated GitHub releases

## [0.0.7] - 2024-11-26

### Added
- Stop button for running tasks

## [0.0.6] - 2024-11-26

### Added

- Visual indication for running tasks with a spinning icon
- Task status messages displaying 'Success' or 'Failed' upon completion
- Option to clear task statuses when refreshing the task list

## [0.0.5] - 2024-11-25

### Added
- Extension marketplace icon

## [0.0.4] - 2024-11-25

### Fixed
- Task filtering functionality improvements

### Added
- New icon for publish tasks

## [0.0.3] - 2024-11-24

### Changed
- Added color coding for different task types (npm, shell, typescript, etc.)
- Added specific icons based on task names (build, test, launch, etc.)
- Reduced required vscode version

## [0.0.2] - 2024-11-24

### Added
- Task selection functionality
- Persistent task selection storage
- Task filtering based on selection

## [0.0.1] - 2024-11-24

### Added
- Initial release of Fast Tasks
- Task list view in explorer sidebar
- One-click task execution
- Task refresh functionality