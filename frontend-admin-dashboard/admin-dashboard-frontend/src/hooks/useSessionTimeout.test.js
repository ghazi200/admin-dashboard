import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useSessionTimeout, clearSession } from "./useSessionTimeout";

function TestWrapper({ options }) {
  useSessionTimeout(options);
  return null;
}

function renderWithOptions(options) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(<TestWrapper options={options} />);
  });
  return { container, root };
}

describe("useSessionTimeout", () => {
  const originalLocation = window.location;
  let removeItemSpy;
  let getItemSpy;

  beforeAll(() => {
    delete window.location;
    window.location = { href: "" };
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  beforeEach(() => {
    window.location.href = "";
    removeItemSpy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});
    getItemSpy = jest.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      return key === "adminToken" ? "fake-token" : null;
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    removeItemSpy.mockRestore();
    getItemSpy.mockRestore();
    jest.useRealTimers();
  });

  it("clears session and redirects after inactivity when no activity for timeout period", () => {
    const start = 1000000000000;
    const dateSpy = jest.spyOn(Date, "now");
    dateSpy.mockReturnValue(start); // at mount: lastActivityRef = start

    renderWithOptions({
      enabled: true,
      timeoutMinutes: 15,
      checkIntervalMs: 60000,
    });

    // When interval runs (after 60s), pretend 20 min have passed so elapsed >= 15 min
    dateSpy.mockReturnValue(start + 20 * 60 * 1000);

    act(() => {
      jest.advanceTimersByTime(60000); // first interval run
    });

    expect(removeItemSpy).toHaveBeenCalledWith("adminToken");
    expect(removeItemSpy).toHaveBeenCalledWith("adminUser");
    expect(removeItemSpy).toHaveBeenCalledWith("adminInfo");
    expect(window.location.href).toBe("/login");

    dateSpy.mockRestore();
  });

  it("does not clear session when elapsed time is less than timeout", () => {
    const start = 1000000000000;
    const dateSpy = jest.spyOn(Date, "now");
    dateSpy.mockReturnValue(start); // at mount: lastActivityRef = start

    renderWithOptions({
      enabled: true,
      timeoutMinutes: 15,
      checkIntervalMs: 60000,
    });

    // When interval runs, only 5 min "elapsed" so below 15 min timeout
    dateSpy.mockReturnValue(start + 5 * 60 * 1000);

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");

    dateSpy.mockRestore();
  });

  it("clearSession removes all storage keys and sets location", () => {
    window.location.href = "";
    clearSession();
    expect(removeItemSpy).toHaveBeenCalledWith("adminToken");
    expect(removeItemSpy).toHaveBeenCalledWith("adminUser");
    expect(removeItemSpy).toHaveBeenCalledWith("adminInfo");
    expect(window.location.href).toBe("/login");
  });
});
