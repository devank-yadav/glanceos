// English strings for the config app. The shipped baseline; other locales can be
// added as sibling files and registered in i18n.ts. Keys are dot-grouped by area.
// (apps/screen stays English — i18n is config-only; see the v1.5 ADR.)
const en: Record<string, string> = {
  // navigation
  "nav.screens": "Screens",
  "nav.fleet": "Fleet",
  "nav.groups": "Groups",
  "nav.setups": "Setups",
  "nav.playlists": "Playlists",
  "nav.hub": "Hub",
  "nav.integrations": "Integrations",
  "nav.inlets": "Inlets",
  "nav.automations": "Automations",
  "nav.shared": "Shared",
  "nav.account": "Account",
  "nav.search": "Search…",

  // common buttons / actions
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.connect": "Connect",
  "action.create": "Create",
  "action.close": "Close",
  "action.copyLink": "Copy link",
  "action.open": "Open",

  // common toasts (with {var} interpolation)
  "toast.saved": "Saved",
  "toast.connected": "Connected {name}",
  "toast.restored": "Restored {layouts} board(s), {playlists} playlist(s)",

  // language picker
  "settings.language": "Language",
  "lang.en": "English",
};

export default en;
