import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ToastProvider } from "./hooks/useToast";
import { BackendStatus } from "./components/BackendStatus";
import { PublicPage } from "./pages/public/PublicPage";
import { AdminPage } from "./pages/admin/AdminPage";

function AppRoutes() {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="page-enter">
      <Routes>
        <Route path="/" element={<PublicPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <BackendStatus />
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}
