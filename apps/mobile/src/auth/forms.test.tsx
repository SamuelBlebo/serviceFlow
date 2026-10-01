import { fireEvent, render, screen } from "@testing-library/react-native";
import { CodeForm, PhoneForm } from "./forms";

describe("PhoneForm", () => {
  it("rejects a non-Ghanaian number without submitting", () => {
    const onSubmit = jest.fn();
    render(<PhoneForm busy={false} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("Phone number"), "+1 415 555 2671");
    fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid Ghanaian phone number/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid number", () => {
    const onSubmit = jest.fn();
    render(<PhoneForm busy={false} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("Phone number"), "024 123 4567");
    fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(onSubmit).toHaveBeenCalledWith("024 123 4567");
  });

  it("shows a server error and disables the button while busy", () => {
    render(<PhoneForm busy serverError="Please wait 20 seconds" onSubmit={jest.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Please wait 20 seconds");
    expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
  });
});

describe("CodeForm", () => {
  it("keeps only digits and requires exactly six", () => {
    const onSubmit = jest.fn();
    render(<CodeForm busy={false} onSubmit={onSubmit} />);
    const input = screen.getByLabelText("6-digit code");
    fireEvent.changeText(input, "12a34");
    fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/6-digit code/);

    fireEvent.changeText(input, "123-456");
    fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
});
