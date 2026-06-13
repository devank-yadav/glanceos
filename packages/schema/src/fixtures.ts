import { Layout, type LayoutT } from "./layout";

// The golden layouts: hub seeds and schema regression pins. Parsed at module
// load, so an invalid fixture fails loudly and immediately. (v3 document-flow:
// rows carry an explicit height in units; the page is 24 units tall.)

function fixture(doc: unknown): LayoutT {
  return Layout.parse(doc);
}

export const personalLayout: LayoutT = fixture({
  schemaVersion: 3,
  name: "Personal dashboard",
  gap: 2,
  rows: [
    {
      id: "r1",
      h: 7,
      blocks: [
        { id: "w1", type: "clock", width: 1, props: { showDate: true } },
        { id: "w2", type: "weather", width: 1, props: { latitude: 28.6139, longitude: 77.209, label: "Delhi" } },
      ],
    },
    {
      id: "r2",
      h: 12,
      blocks: [
        { id: "w3", type: "calendar", width: 1, props: { source: "ics", url: "https://example.com/calendar.ics", maxEvents: 5 } },
        { id: "w4", type: "tasks", width: 1, props: { listId: "default", maxItems: 7 } },
      ],
    },
    {
      id: "r3",
      h: 4,
      blocks: [{ id: "w5", type: "text", width: 1, props: { content: "Drink water.", align: "left" } }],
    },
  ],
});

export const clinicLayout: LayoutT = fixture({
  schemaVersion: 3,
  name: "Clinic queue",
  gap: 2,
  rows: [
    { id: "r1", h: 4, blocks: [{ id: "w1", type: "heading", width: 1, props: { content: "Family Clinic", level: 1 } }] },
    {
      id: "r2",
      h: 14,
      blocks: [
        { id: "w2", type: "queue", width: 2, props: { queueId: "default", title: "Now serving" } },
        { id: "w3", type: "clock", width: 1, props: { showDate: true } },
      ],
    },
    { id: "r3", h: 4, blocks: [{ id: "w4", type: "text", width: 1, props: { content: "Please wait for your number.", align: "center" } }] },
  ],
});

export const homeLayout: LayoutT = fixture({
  schemaVersion: 3,
  name: "Home status",
  gap: 2,
  rows: [
    {
      id: "r1",
      h: 6,
      blocks: [
        { id: "w1", type: "clock", width: 1, props: { showDate: true } },
        { id: "w2", type: "weather", width: 1, props: { latitude: 28.6139, longitude: 77.209, label: "Home" } },
      ],
    },
    {
      id: "r2",
      h: 8,
      blocks: [
        { id: "w3", type: "deviceStatus", width: 1, props: { label: "Living room", state: "on" } },
        { id: "w4", type: "sensor", width: 1, props: { label: "Humidity", value: "48", unit: "%" } },
        { id: "w5", type: "thermostat", width: 1, props: { label: "Hallway", temperature: 22, unit: "C" } },
      ],
    },
    {
      id: "r3",
      h: 8,
      blocks: [
        { id: "w6", type: "tasks", width: 1, props: { listId: "default", maxItems: 5 } },
        { id: "w7", type: "moonPhase", width: 1, props: { label: "Tonight" } },
      ],
    },
  ],
});

export const welcomeLayout: LayoutT = fixture({
  schemaVersion: 3,
  name: "Welcome board",
  gap: 2,
  rows: [
    {
      id: "r1",
      h: 6,
      blocks: [
        { id: "w1", type: "heading", width: 3, props: { content: "Good morning.", level: 1 } },
        { id: "w2", type: "clock", width: 1, props: { showDate: true } },
      ],
    },
    { id: "r2", h: 1, blocks: [{ id: "w3", type: "divider", width: 1, props: {} }] },
    {
      id: "r3",
      h: 8,
      blocks: [
        { id: "w4", type: "callout", width: 1, props: { content: "Type to add text, drag blocks by their handle, drop them beside each other for columns, or press / to insert.", emoji: "✨" } },
        { id: "w5", type: "stat", width: 1, props: { value: "35+", label: "block types" } },
      ],
    },
    {
      id: "r4",
      h: 5,
      blocks: [
        { id: "w6", type: "countdown", width: 1, props: { label: "Until launch", target: "2027-01-01T00:00:00" } },
        { id: "w7", type: "quote", width: 2, props: { content: "Look, understand, move on.", author: "GlanceOS" } },
      ],
    },
  ],
});

export const templates: ReadonlyArray<LayoutT> = [personalLayout, clinicLayout, homeLayout, welcomeLayout];
