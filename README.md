# Toggl Progress CLI

Manage Toggl progress and estimates from the command line

## Setup

Install directly from npm:

`npm install -g toggl-progress-cli`

## Usage

Use the command `progress` from the bash terminal.

When asked, enter your API token. You can find this in your Profile Settings on [https://toggl.com](https://toggl.com). Reinstalling the package will clear your API token.

Make sure you have both at least one valid project and client set up in Toggl, then follow the prompts. Note: Unfortunately Toggl only lets you access data up to a year ago. The default date is a year ago from the current day.

![Toggl Progress Workflow](https://media.giphy.com/media/YQNLNHJimqkeE0CKWk/giphy.gif)

It keeps track of saved estimates so you don't have to keep typing them in. Editing of estimates coming soon.

![Saved estimates workflow](https://media.giphy.com/media/W0KKnRrOqdHVmzK5wG/giphy.gif)
