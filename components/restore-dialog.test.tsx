// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RestoreDialog, type RestoreApi, type RestoreChoice } from "./restore-dialog";

beforeAll(() => {
  // jsdom has <dialog> but no modal behaviour.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(cleanup);

const today = new Date();
today.setHours(2, 15, 0, 0);

const good: RestoreChoice = {
  id: "local:daily/a",
  name: "a",
  pool: "daily",
  createdAt: today.toISOString(),
  products: 412,
  images: 530,
  location: "local",
  damaged: false,
};
const broken: RestoreChoice = { ...good, id: "local:daily/b", name: "b", createdAt: null, products: null, images: null, damaged: true };

function fakeApi(choices: RestoreChoice[] = [good, broken]): RestoreApi {
  return {
    restoreChoices: vi.fn(async () => ({ choices, preselected: choices.find((c) => !c.damaged)?.id ?? null })),
    pickExternalFolder: vi.fn(async () => ({ ok: false as const, canceled: false, message: "In diesem Ordner ist keine Sicherung der App." })),
    currentCounts: vi.fn(async () => ({ products: 418, images: 534 })),
    restore: vi.fn(async () => {}),
  };
}

async function open(api: RestoreApi) {
  await act(async () => {
    render(<RestoreDialog api={api} copyFolder={null} onClose={() => {}} />);
  });
}

describe("RestoreDialog", () => {
  it("R1: preselects the newest good backup, greys damaged rows, focuses Abbrechen", async () => {
    await open(fakeApi());
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].disabled).toBe(true);
    expect(screen.getByText("beschädigt")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Abbrechen");
  });

  it("R1: empty list shows the empty text and only Schliessen", async () => {
    await open(fakeApi([]));
    expect(screen.getByText("Es gibt noch keine Sicherung zum Zurückholen.")).toBeTruthy();
    expect(screen.queryByText("Weiter")).toBeNull();
  });

  it("R1: a folder without a backup shows the spec message", async () => {
    await open(fakeApi());
    await act(async () => fireEvent.click(screen.getByText("Andere Sicherung suchen …")));
    expect(screen.getByRole("alert").textContent).toBe("In diesem Ordner ist keine Sicherung der App.");
  });

  it("R2: red button stays locked until the checkbox is ticked", async () => {
    const api = fakeApi();
    await open(api);
    await act(async () => fireEvent.click(screen.getByText("Weiter")));
    expect(screen.getByText("Daten von heute, 02:15 zurückholen?")).toBeTruthy();
    expect(screen.getByText("Jetzt: 418 Artikel, 534 Bilder")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Abbrechen");

    const red = screen.getByText("Überschreiben und zurückholen").closest("button")!;
    expect(red.disabled).toBe(true);
    fireEvent.click(red);
    expect(api.restore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(red.disabled).toBe(false);
    await act(async () => fireEvent.click(red));
    expect(api.restore).toHaveBeenCalledWith("local:daily/a");
  });
});
