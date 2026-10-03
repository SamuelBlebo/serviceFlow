// @serviceflow/firebase — the SDK-agnostic Firebase contract shared by the
// web app, the React Native app and Cloud Functions: collection paths,
// callable names + payload types, and document converters. It deliberately
// imports no Firebase SDK; each app initialises its own SDK and uses this.

export * from "./paths";
export * from "./timestamp";
export * from "./callables";
