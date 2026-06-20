import { afterEach, describe, expect, it } from "vitest";
import { flashIdentify, handleFleetCommand } from "./fleet";

afterEach(() => { document.body.innerHTML = ""; });

describe("flashIdentify", () => {
  it("overlays a labelled marker that auto-removes", () => {
    const el = flashIdentify("Lobby", 10);
    expect(document.querySelector("[data-identify]")).toBe(el);
    expect(el.textContent).toBe("Lobby");
    expect(el.style.position).toBe("fixed");
  });
});

describe("handleFleetCommand", () => {
  it("identify draws the overlay with the provided label", () => {
    handleFleetCommand({ command: "identify", params: { label: "Floor 3" } });
    expect(document.querySelector("[data-identify]")?.textContent).toBe("Floor 3");
  });
  it("identify with no label falls back to a generic marker", () => {
    handleFleetCommand({ command: "identify" });
    expect(document.querySelector("[data-identify]")?.textContent).toBe("This screen");
  });
  it("ignores unknown commands without throwing", () => {
    expect(() => handleFleetCommand({ command: "nope" })).not.toThrow();
    expect(document.querySelector("[data-identify]")).toBeNull();
  });
});
