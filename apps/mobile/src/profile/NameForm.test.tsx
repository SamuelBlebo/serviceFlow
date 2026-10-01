import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NameForm } from "./NameForm";

describe("NameForm", () => {
  it("rejects an invalid name without saving", () => {
    const onSave = jest.fn(async () => undefined);
    render(<NameForm currentName="" onSave={onSave} />);
    fireEvent.changeText(screen.getByLabelText("Your name"), "Agent 007");
    fireEvent.press(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/letters only/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the normalized name and confirms only after the server accepts it", async () => {
    const onSave = jest.fn(async () => undefined);
    render(<NameForm currentName="Kwame" onSave={onSave} />);
    fireEvent.changeText(screen.getByLabelText("Your name"), "  Kwame   Owusu ");
    fireEvent.press(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    expect(onSave).toHaveBeenCalledWith("Kwame Owusu");
  });

  it("shows an error instead of 'Saved' when the save fails", async () => {
    const onSave = jest.fn(async () => {
      throw new Error("offline");
    });
    render(<NameForm currentName="Kwame" onSave={onSave} />);
    fireEvent.changeText(screen.getByLabelText("Your name"), "Kwame Owusu");
    fireEvent.press(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/));
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
