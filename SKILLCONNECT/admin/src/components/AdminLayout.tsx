import type { AuthUserDto } from "@skillconnect/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/api";

const NAV_ITEMS = [
  { to: "/", label: "Overview", end: true },
  { to: "/providers", label: "Providers", end: false },
  { to: "/disputes", label: "Disputes", end: false },
  { to: "/users", label: "Users", end: false },
  { to: "/categories", label: "Categories", end: false },
  { to: "/localities", label: "Localities", end: false },
];

export function AdminLayout({ user }: { user: AuthUserDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSettled: () => {
      queryClient.setQueryData(["admin", "me"], null);
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="w-60 border-r border-hairline bg-surface p-4">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-primary-deep">SkillConnect</p>
          <p className="text-xs text-muted">Admin Panel</p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  isActive
                    ? "bg-primary-tint text-primary"
                    : "text-muted hover:bg-canvas"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-surface px-6">
          <span className="text-sm text-muted">Signed in as {user.email}</span>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="min-h-11 cursor-pointer rounded-xl border border-hairline px-4 text-sm font-semibold text-ink hover:bg-canvas"
          >
            Sign out
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
