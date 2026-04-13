import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ToastProvider } from "./lib/hooks/useToast";
import { PublicPage } from "./pages/public/PublicPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { DesktopPage } from "./pages/desktop/DesktopPage";

function AppRoutes() {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="page-enter">
      <Routes>
        <Route path="/" element={<PublicPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/desktop" element={<DesktopPage />} />
        <Route path="/desktop/:screen" element={<DesktopPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}
