"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCog,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";

type UserItem = {
  id: string;
  name: string;
  email: string;
  is_global_admin: boolean;
  active: boolean;
  role_label: string;
};

type UserFormState = {
  name: string;
  email: string;
  password: string;
  is_global_admin: boolean;
  active: boolean;
  project_ids: string[];
};

type ProjectItem = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
  reurb_type: string;
  status: string;
};

type RoleItem = {
  id: string;
  name: string;
  description: string | null;
};

type ProjectUserLink = {
  id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  active: boolean;
  user_name: string | null;
  user_email: string | null;
  role_name: string | null;
};

type UserProjectLinkMap = Record<string, ProjectUserLink[]>;

const emptyForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  is_global_admin: false,
  active: true,
  project_ids: [],
};

function getApiErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null && "response" in err) {
    const axiosError = err as {
      response?: {
        data?: {
          detail?: string;
        };
      };
    };

    return axiosError.response?.data?.detail ?? fallback;
  }

  return fallback;
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);

  const [projects, setProjects] = useState<ProjectItem[]>([]);
const [roles, setRoles] = useState<RoleItem[]>([]);
const [userProjectLinks, setUserProjectLinks] = useState<UserProjectLinkMap>(
  {},
);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [passwordUser, setPasswordUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const isEditing = Boolean(editingUser);

  const activeUsers = useMemo(
    () => users.filter((user) => user.active).length,
    [users],
  );

  const adminUsers = useMemo(
    () => users.filter((user) => user.is_global_admin).length,
    [users],
  );

  function getAnalystRoleId() {
  const role =
    roles.find((item) =>
      item.name.toLowerCase().includes("analista"),
    ) ??
    roles.find((item) =>
      item.name.toLowerCase().includes("prefeitura"),
    ) ??
    roles[0];

  return role?.id ?? null;
}

function getLinkedProjectIds(userId: string) {
  return (userProjectLinks[userId] ?? [])
    .filter((link) => link.active)
    .map((link) => link.project_id);
}

function getLinkedProjectNames(userId: string) {
  const links = userProjectLinks[userId] ?? [];

  return links
    .filter((link) => link.active)
    .map((link) => {
      const project = projects.find((item) => item.id === link.project_id);
      return project
        ? `${project.name} - ${project.municipality}/${project.state}`
        : "Projeto não localizado";
    });
}

function toggleProjectSelection(projectId: string) {
  setForm((current) => {
    const alreadySelected = current.project_ids.includes(projectId);

    return {
      ...current,
      project_ids: alreadySelected
        ? current.project_ids.filter((id) => id !== projectId)
        : [...current.project_ids, projectId],
    };
  });
}

async function loadUsers() {
  try {
    setLoading(true);
    setError(null);

    const [meResponse, usersResponse, projectsResponse, rolesResponse] =
      await Promise.all([
        api.get<UserItem>("/auth/me"),
        api.get<UserItem[]>("/users"),
        api.get<ProjectItem[]>("/projects"),
        api.get<RoleItem[]>("/roles"),
      ]);

    const loadedProjects = projectsResponse.data ?? [];

    setCurrentUser(meResponse.data);
    setUsers(usersResponse.data ?? []);
    setProjects(loadedProjects);
    setRoles(rolesResponse.data ?? []);

    const linksByUser: UserProjectLinkMap = {};

    await Promise.all(
      loadedProjects.map(async (project) => {
        try {
          const response = await api.get<ProjectUserLink[]>(
            `/projects/${project.id}/users`,
          );

          for (const link of response.data ?? []) {
            if (!linksByUser[link.user_id]) {
              linksByUser[link.user_id] = [];
            }

            linksByUser[link.user_id].push(link);
          }
        } catch (err) {
          console.error(err);
        }
      }),
    );

    setUserProjectLinks(linksByUser);
  } catch (err) {
    console.error(err);

    const status =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { status?: number } }).response?.status
        : null;

    if (status === 401) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }

    if (status === 403) {
      setError("Seu usuário não tem permissão para gerenciar usuários.");
      return;
    }

    setError(
      getApiErrorMessage(
        err,
        "Não foi possível carregar a lista de usuários.",
      ),
    );
  } finally {
    setLoading(false);
  }
}

  function resetForm() {
    setForm(emptyForm);
    setEditingUser(null);
    setShowPassword(false);
  }

  function startCreate() {
    setError(null);
    setSuccess(null);
    resetForm();
  }

function startEdit(user: UserItem) {
  setError(null);
  setSuccess(null);

  setEditingUser(user);
  setForm({
    name: user.name,
    email: user.email,
    password: "",
    is_global_admin: user.is_global_admin,
    active: user.active,
    project_ids: user.is_global_admin ? [] : getLinkedProjectIds(user.id),
  });
}

async function syncUserProjectLinks(userId: string, selectedProjectIds: string[]) {
  const analystRoleId = getAnalystRoleId();

  if (!analystRoleId) {
    throw new Error(
      "Nenhum perfil de projeto foi encontrado. Cadastre um perfil antes de vincular usuários a projetos.",
    );
  }

  const currentLinks = userProjectLinks[userId] ?? [];
  const activeLinks = currentLinks.filter((link) => link.active);

  const selectedSet = new Set(selectedProjectIds);
  const activeProjectSet = new Set(activeLinks.map((link) => link.project_id));

  const linksToCreate = selectedProjectIds.filter(
    (projectId) => !activeProjectSet.has(projectId),
  );

  const linksToRemove = activeLinks.filter(
    (link) => !selectedSet.has(link.project_id),
  );

  for (const projectId of linksToCreate) {
    await api.post(`/projects/${projectId}/users`, {
      user_id: userId,
      role_id: analystRoleId,
      active: true,
    });
  }

  for (const link of linksToRemove) {
    await api.delete(`/projects/${link.project_id}/users/${link.id}`);
  }
}

async function saveUser() {
  if (!form.name.trim()) {
    setError("Informe o nome do usuário.");
    return;
  }

  if (!form.email.trim()) {
    setError("Informe o e-mail do usuário.");
    return;
  }

  if (!isEditing && form.password.trim().length < 8) {
    setError("A senha precisa ter pelo menos 8 caracteres.");
    return;
  }

  if (!form.is_global_admin && form.project_ids.length === 0) {
    setError(
      "Selecione pelo menos um projeto REURB para o Analista Prefeitura.",
    );
    return;
  }

  try {
    setSaving(true);
    setError(null);
    setSuccess(null);

    let savedUser: UserItem;

    if (editingUser) {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        is_global_admin: form.is_global_admin,
        active: form.active,
      };

      if (form.password.trim()) {
        if (form.password.trim().length < 8) {
          setError("A senha precisa ter pelo menos 8 caracteres.");
          return;
        }

        payload.password = form.password.trim();
      }

      const response = await api.patch<UserItem>(
        `/users/${editingUser.id}`,
        payload,
      );

      savedUser = response.data;

      if (form.is_global_admin) {
        await syncUserProjectLinks(savedUser.id, []);
      } else {
        await syncUserProjectLinks(savedUser.id, form.project_ids);
      }

      setSuccess("Usuário atualizado com sucesso.");
    } else {
      const response = await api.post<UserItem>("/users", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password.trim(),
        is_global_admin: form.is_global_admin,
        active: form.active,
      });

      savedUser = response.data;

      if (!form.is_global_admin) {
        await syncUserProjectLinks(savedUser.id, form.project_ids);
      }

      setSuccess("Usuário criado com sucesso.");
    }

    resetForm();
    await loadUsers();
  } catch (err) {
    console.error(err);
    setError(
      getApiErrorMessage(
        err,
        isEditing
          ? "Não foi possível atualizar o usuário."
          : "Não foi possível criar o usuário.",
      ),
    );
  } finally {
    setSaving(false);
  }
}

  async function deleteUser(user: UserItem) {
    if (currentUser?.id === user.id) {
      setError("Você não pode excluir sua própria conta.");
      return;
    }

    const confirmed = window.confirm(
      `Deseja excluir o usuário "${user.name}"?\n\nEssa ação removerá o acesso administrativo deste usuário.`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await api.delete(`/users/${user.id}`);

      setSuccess("Usuário excluído com sucesso.");
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, "Não foi possível excluir o usuário."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleUserStatus(user: UserItem) {
    if (currentUser?.id === user.id && user.active) {
      setError("Você não pode desativar sua própria conta.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await api.patch(`/users/${user.id}`, {
        active: !user.active,
      });

      setSuccess(
        user.active
          ? "Usuário desativado com sucesso."
          : "Usuário ativado com sucesso.",
      );

      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(
        getApiErrorMessage(
          err,
          "Não foi possível alterar o status do usuário.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!passwordUser) return;

    if (newPassword.trim().length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await api.patch(`/users/${passwordUser.id}/password`, {
        password: newPassword.trim(),
      });

      setPasswordUser(null);
      setNewPassword("");
      setShowNewPassword(false);

      setSuccess("Senha redefinida com sucesso.");
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, "Não foi possível redefinir a senha."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel
          </button>

          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-green-700">
                Administração
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Usuários e permissões
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Gerencie o acesso administrativo ao sistema BIOME REURB. O
                cidadão permanece usando apenas a consulta pública por CPF e
                código da selagem.
              </p>
            </div>

            <button
              type="button"
              onClick={loadUsers}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
            {success}
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <UserCog className="h-7 w-7 text-green-700" />
            <p className="mt-4 text-sm font-bold text-slate-500">
              Usuários cadastrados
            </p>
            <p className="mt-1 text-3xl font-black">{users.length}</p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <CheckCircle2 className="h-7 w-7 text-green-700" />
            <p className="mt-4 text-sm font-bold text-slate-500">
              Usuários ativos
            </p>
            <p className="mt-1 text-3xl font-black">{activeUsers}</p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <ShieldCheck className="h-7 w-7 text-green-700" />
            <p className="mt-4 text-sm font-bold text-slate-500">
              Admins BIOME
            </p>
            <p className="mt-1 text-3xl font-black">{adminUsers}</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">
                  {isEditing ? "Editar usuário" : "Novo usuário"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Admin BIOME acessa tudo. Analista Prefeitura acessa o painel
                  técnico, sem gerenciar usuários.
                </p>
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Novo
                </button>
              )}
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Nome
                </span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-green-700"
                  placeholder="Nome do usuário"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  E-mail
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-green-700"
                  placeholder="email@dominio.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {isEditing ? "Nova senha opcional" : "Senha"}
                </span>

                <div className="mt-2 flex rounded-2xl border border-slate-200 bg-white focus-within:border-green-700">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 rounded-l-2xl px-4 py-3 text-sm font-bold outline-none"
                    placeholder={
                      isEditing
                        ? "Preencha apenas se quiser alterar"
                        : "Mínimo 8 caracteres"
                    }
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="flex w-12 items-center justify-center text-slate-500"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Perfil
                </span>

<select
  value={form.is_global_admin ? "admin" : "analyst"}
  onChange={(event) =>
    setForm((current) => ({
      ...current,
      is_global_admin: event.target.value === "admin",
      project_ids: event.target.value === "admin" ? [] : current.project_ids,
    }))
  }
  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-green-700"
>
  <option value="admin">Admin BIOME</option>
  <option value="analyst">Analista Prefeitura</option>
</select>
{!form.is_global_admin && (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="mb-3">
      <p className="text-sm font-black text-slate-800">
        Projetos vinculados ao analista
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
        Selecione os projetos REURB que este analista poderá acessar.
      </p>
    </div>

    {projects.length === 0 ? (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs font-semibold text-slate-500">
        Nenhum projeto cadastrado. Cadastre um projeto antes de criar analistas.
      </div>
    ) : (
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {projects.map((project) => (
          <label
            key={project.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-green-50"
          >
            <input
              type="checkbox"
              checked={form.project_ids.includes(project.id)}
              onChange={() => toggleProjectSelection(project.id)}
              className="mt-1 h-4 w-4"
            />

            <span>
              <span className="block text-sm font-black text-slate-800">
                {project.name}
              </span>
              <span className="block text-xs font-semibold text-slate-500">
                {project.municipality}/{project.state} ·{" "}
                {project.neighborhood}
              </span>
            </span>
          </label>
        ))}
      </div>
    )}
  </div>
)}
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-slate-800">
                    Usuário ativo
                  </span>
                  <span className="block text-xs font-semibold text-slate-500">
                    Usuários inativos não conseguem fazer login.
                  </span>
                </span>

                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  className="h-5 w-5"
                />
              </label>

              <button
                type="button"
                disabled={saving}
                onClick={saveUser}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEditing ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isEditing ? "Salvar alterações" : "Criar usuário"}
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Usuários cadastrados</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Controle de acesso administrativo ao painel BIOME REURB.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando usuários...
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                Nenhum usuário cadastrado.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const isCurrentUser = currentUser?.id === user.id;

                  return (
                    <div
                      key={user.id}
                      className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-950">
                            {user.name}
                          </p>

                          {isCurrentUser && (
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
                              Você
                            </span>
                          )}

                          <span
                            className={
                              user.active
                                ? "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800"
                                : "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700"
                            }
                          >
                            {user.active ? "Ativo" : "Inativo"}
                          </span>

                          <span
                            className={
                              user.is_global_admin
                                ? "rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800"
                                : "rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700"
                            }
                          >
                            {user.role_label}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-slate-500">
                          {user.email}
                        </p>
                        {!user.is_global_admin && (
  <div className="mt-3">
    {getLinkedProjectNames(user.id).length === 0 ? (
      <p className="text-xs font-bold text-red-600">
        Nenhum projeto vinculado.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {getLinkedProjectNames(user.id).map((projectName) => (
          <span
            key={projectName}
            className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-800"
          >
            {projectName}
          </span>
        ))}
      </div>
    )}
  </div>
)}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEdit(user)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setPasswordUser(user);
                            setNewPassword("");
                            setShowNewPassword(false);
                            setError(null);
                            setSuccess(null);
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Senha
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggleUserStatus(user)}
                          className={
                            user.active
                              ? "inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                              : "inline-flex items-center justify-center gap-2 rounded-2xl border border-green-200 bg-white px-4 py-2 text-xs font-black text-green-700 transition hover:bg-green-50 disabled:opacity-60"
                          }
                        >
                          {user.active ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          {user.active ? "Desativar" : "Ativar"}
                        </button>

                        <button
                          type="button"
                          disabled={saving || isCurrentUser}
                          onClick={() => deleteUser(user)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>

      {passwordUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black">Redefinir senha</h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Informe a nova senha para{" "}
              <span className="font-black text-slate-950">
                {passwordUser.name}
              </span>
              .
            </p>

            <label className="mt-5 block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Nova senha
              </span>

              <div className="mt-2 flex rounded-2xl border border-slate-200 bg-white focus-within:border-green-700">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="min-w-0 flex-1 rounded-l-2xl px-4 py-3 text-sm font-bold outline-none"
                  placeholder="Mínimo 8 caracteres"
                />

                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  className="flex w-12 items-center justify-center text-slate-500"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPasswordUser(null);
                  setNewPassword("");
                  setShowNewPassword(false);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={resetPassword}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar senha
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}