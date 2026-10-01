import { render, screen } from "@testing-library/react-native";
import { ConnectivityBannerView } from "./ConnectivityBanner";

describe("ConnectivityBannerView", () => {
  it("warns when offline", () => {
    render(<ConnectivityBannerView connectivity="offline" />);
    expect(screen.getByText(/You're offline/)).toBeTruthy();
  });

  it("stays out of the way when online or unknown", () => {
    const { toJSON, rerender } = render(<ConnectivityBannerView connectivity="online" />);
    expect(toJSON()).toBeNull();
    rerender(<ConnectivityBannerView connectivity="unknown" />);
    expect(toJSON()).toBeNull();
  });
});
