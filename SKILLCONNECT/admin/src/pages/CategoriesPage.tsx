import type { CategoryDto } from "@skillconnect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiRequest } from "../lib/api";

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [iconKey, setIconKey] = useState("build");
  const [sortOrder, setSortOrder] = useState("0");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const res = await apiRequest<{ categories: CategoryDto[] }>(
        "/api/v1/admin/categories"
      );
      return res.categories;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ category: CategoryDto }>("/api/v1/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          iconKey,
          isActive: true,
          sortOrder: Number(sortOrder) || 0,
        }),
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to create category");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (cat: CategoryDto) =>
      apiRequest<{ category: CategoryDto }>(`/api/v1/admin/categories/${cat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !cat.isActive }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Categories</h1>
        <p className="mt-1 text-sm text-muted">
          Manage service categories visible across discovery and onboarding.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="grid gap-3 rounded-xl border border-hairline bg-surface p-5 md:grid-cols-5"
      >
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) {
              setSlug(
                e.target.value
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
              );
            }
          }}
          placeholder="Category name"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug-name"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <input
          value={iconKey}
          onChange={(e) => setIconKey(e.target.value)}
          placeholder="iconKey"
          required
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <input
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          type="number"
          placeholder="Order"
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm"
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {createMutation.isPending ? "Adding..." : "Add Category"}
        </button>
        {errorMsg && (
          <p className="text-xs text-error md:col-span-5">{errorMsg}</p>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {isLoading ? (
          <p className="p-6 text-sm text-muted">Loading categories...</p>
        ) : categories.length === 0 ? (
          <p className="p-6 text-sm text-muted">No categories configured.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Icon</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td className="px-4 py-3 font-medium text-ink">{cat.name}</td>
                  <td className="px-4 py-3 text-muted">{cat.slug}</td>
                  <td className="px-4 py-3 text-muted">{cat.iconKey}</td>
                  <td className="px-4 py-3 text-muted">{cat.sortOrder}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        cat.isActive
                          ? "bg-primary-tint text-primary"
                          : "bg-canvas text-muted"
                      }`}
                    >
                      {cat.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate(cat)}
                      className="min-h-9 cursor-pointer rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-canvas"
                    >
                      {cat.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
