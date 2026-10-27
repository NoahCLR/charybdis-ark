# The source editor is retired

Cited as D-L04.

Profile Studio, the editor for the firmware's authored C profiles, is removed from Ark. Authored C defaults are edited directly in the firmware repository and checked by its host tests, while Ark edits only the profile on the connected keyboard and neither imports nor exports C source. Keeping a C editor would tie the app to a firmware checkout and a C parser, which a keyboard-first app does not need (D-L09, D-L11).
