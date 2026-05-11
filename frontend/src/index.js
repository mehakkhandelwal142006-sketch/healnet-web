import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global reset
document.body.style.margin     = "0";
document.body.style.padding    = "0";
document.body.style.background = "#030c2c";
document.body.style.fontFamily = "'Segoe UI', sans-serif";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
