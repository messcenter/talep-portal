// src/client/app.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "./auth";
import { AuthGate } from "./layouts/AuthGate";
import { EmployeeLayout } from "./layouts/EmployeeLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { Login } from "./pages/Login";
import { NewRequest } from "./pages/NewRequest";
import { MyList } from "./pages/MyList";
import { RequestDetailEmployee } from "./pages/RequestDetailEmployee";
import { RequestDetailAdmin } from "./pages/RequestDetailAdmin";
import { Admin } from "./pages/Admin";
import { Definitions } from "./pages/Definitions";

function Home() {
  const user = useUser();
  return <Navigate to={user.isAdmin ? "/admin" : "/my"} replace />;
}

export function App() {
  return (
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
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/tanimlar" element={<Definitions />} />
            <Route path="/admin/requests/:id" element={<RequestDetailAdmin />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
