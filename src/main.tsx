import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadBoardMap } from "./engine";
import { loadMap } from "./store/mapStorage";
import "./styles/global.css";

// Apply any authored board map saved from the Map Editor before first render.
loadBoardMap(loadMap());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
