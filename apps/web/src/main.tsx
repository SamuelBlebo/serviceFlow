import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { createRouter } from "./app/router";
import { AuthProvider } from "./lib/auth/AuthProvider";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={createRouter()} />
    </AuthProvider>
  </StrictMode>,
);
