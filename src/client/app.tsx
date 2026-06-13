// src/client/app.tsx
import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "./auth";
import { AuthGate } from "./layouts/AuthGate";
import { EmployeeLayout } from "./layouts/EmployeeLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { Login } from "./pages/Login";
import { ToastProvider } from "./components/Toast";

// Route pages are code-split: the heavy editor stack (TipTap/ProseMirror) and the
// markdown renderer load only when their route is visited, not on first paint.
// Login stays eager so the most common entry point paints without a chunk fetch.
// Pages are named exports → adapt to lazy()'s default-export contract.
const NewRequest = lazy(() =>
  import("./pages/NewRequest").then((m) => ({ default: m.NewRequest })),
);
const MyList = lazy(() =>
  import("./pages/MyList").then((m) => ({ default: m.MyList })),
);
const RequestDetailEmployee = lazy(() =>
  import("./pages/RequestDetailEmployee").then((m) => ({
    default: m.RequestDetailEmployee,
  })),
);
const RequestDetailAdmin = lazy(() =>
  import("./pages/RequestDetailAdmin").then((m) => ({
    default: m.RequestDetailAdmin,
  })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Definitions = lazy(() =>
  import("./pages/Definitions").then((m) => ({ default: m.Definitions })),
);

function Home() {
  const user = useUser();
  return <Navigate to={user.isAdmin ? "/admin" : "/my"} replace />;
}

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGate />}>
            <Route index element={<Home />} />
            <Route element={<EmployeeLayout />}>
              <Route path="/yeni" element={<NewRequest />} />
              <Route path="/my" element={<MyList />} />
              <Route path="/requests/:id" element={<RequestDetailEmployee />} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/talepler" element={<Admin />} />
              <Route path="/admin/tanimlar" element={<Definitions />} />
              <Route path="/admin/requests/:id" element={<RequestDetailAdmin />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
