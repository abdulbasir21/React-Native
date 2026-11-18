import type { AuthUserDto } from "@skillconnect/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { apiRequest } from "./lib/api";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DisputeDetailPage } from "./pages/DisputeDetailPage";
import { DisputesPage } from "./pages/DisputesPage";
import { LocalitiesPage } from "./pages/LocalitiesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProviderDetailPage } from "./pages/ProviderDetailPage";
import { ProvidersQueuePage } from "./pages/ProvidersQueuePage";
import { UsersPage } from "./pages/UsersPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function ProtectedAdminRoutes() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: async () => {
      const res = await apiRequest<{ user: AuthUserDto }>("/api/v1/admin/me");
      return res.user;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Checking session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route element={<AdminLayout user={user} />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/providers" element={<ProvidersQueuePage />} />
        <Route path="/providers/:id" element={<ProviderDetailPage />} />
        <Route path="/disputes" element={<DisputesPage />} />
        <Route path="/disputes/:id" element={<DisputeDetailPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/localities" element={<LocalitiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedAdminRoutes />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
