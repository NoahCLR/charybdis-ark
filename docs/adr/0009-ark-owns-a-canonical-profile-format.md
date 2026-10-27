# Ark owns a canonical profile format, not `.c`

Cited as D-L09.

Backup, restore, sharing and version control go through Ark's own backup format (D-L15); importing and exporting the firmware's `.c` profile files stays outside Ark. This amends the product goal (now D-L68), which listed the C files as an import source and export target: honouring that would bring C parsing and a repository dependency back into the app.
