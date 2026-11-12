import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Booking from "./pages/Booking";
import BookingDetails from "./pages/BookingDetails";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Agenda from "./pages/admin/Agenda";
import Clients from "./pages/admin/Clients";
import Services from "./pages/admin/Services";
import Professionals from "./pages/admin/Professionals";
import Settings from "./pages/admin/Settings";
import Plan from "./pages/admin/Plan";
import Support from "./pages/admin/Support";
import Users from "./pages/admin/Users";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/entrar" element={<Login />} />
      <Route path="/criar-conta" element={<Signup />} />
      <Route path="/definir-senha" element={<SetPassword />} />
      <Route path="/painel" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="servicos" element={<Services />} />
        <Route path="equipe" element={<Professionals />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="plano" element={<Plan />} />
        <Route path="suporte" element={<Support />} />
        <Route path="usuarios" element={<Users />} />
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Route>
      <Route path="/agendamento/:token" element={<BookingDetails />} />
      <Route path="/:slug" element={<Booking />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
