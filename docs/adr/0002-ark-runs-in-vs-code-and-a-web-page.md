# Ark runs in VS Code and a web page

Cited as D-L02.

Ark ships as a VS Code extension and as a web page in Chrome or Edge (D-L52), and both shells run the same `core/` and interface through the shared panel loop. The core imports nothing from `vscode`, so a shell supplies only its device adapter: people can use Ark without installing VS Code, and a standalone desktop app would be one more shell, not a fork of the app.
