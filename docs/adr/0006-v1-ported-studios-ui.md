---
status: superseded by D-L35
---

# v1 ported Studio's whole UI and rebuilt only the model source

Cited as D-L06.

Studio's webview does no file access: the host posts a model, the webview renders it, and edits come back as typed messages. The reusable seam was therefore the model, not the widgets, so the first live app took Studio's UI verbatim and supplied the model from the keyboard instead of forking the presentation, whose functions all lived in one template literal.
