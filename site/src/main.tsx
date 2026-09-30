import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { TicketProvider } from "./state";
import { useReveal } from "./lib/reveal";
import { Nav, Footer } from "./components/Chrome";

const Home = React.lazy(() => import("./pages/Home"));
const Report = React.lazy(() => import("./pages/Report"));
const Track = React.lazy(() => import("./pages/Track"));
const Karma = React.lazy(() => import("./pages/Karma"));

function App() {
  useReveal();
  return (
    <HashRouter>
      <TicketProvider>
        <div className="flex min-h-screen flex-col">
          <Nav />
          <main className="flex-1">
            <React.Suspense
              fallback={
                <div className="flex min-h-[60vh] items-center justify-center text-tide-500">
                  <span className="animate-pulse text-sm tracking-widest uppercase">Loading the tide…</span>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/report" element={<Report />} />
                <Route path="/track" element={<Track />} />
                <Route path="/track/:id" element={<Track />} />
                <Route path="/karma" element={<Karma />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </React.Suspense>
          </main>
          <Footer />
        </div>
      </TicketProvider>
    </HashRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
