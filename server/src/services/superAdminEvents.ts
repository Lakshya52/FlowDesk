const ROOM = "super_admin_room";

let seq = 0;

const dispatch = (payload: Record<string, unknown>) => {
  import("../index")
    .then(({ io }) => {
      io.to(ROOM).emit("super_admin:event", {
        id: ++seq,
        at: new Date(),
        ...payload,
      });
    })
    .catch(() => {
      // Socket server not ready yet — event is dropped silently.
    });
};

export const emitSuperAdminEvent = (payload: Record<string, unknown>) => {
  dispatch(payload);
};

export const emitUserLogin = (user: any, tenantName: string | null) =>
  dispatch({
    type: "user_login",
    action: "logged in",
    entityType: "user",
    entityId: user?._id?.toString() || null,
    user: user ? { name: user.name, email: user.email, role: user.role } : null,
    tenant: tenantName,
  });

export const emitTenantRegistered = (tenant: any, user: any) =>
  dispatch({
    type: "tenant_registered",
    action: "registered a new workspace",
    entityType: "tenant",
    entityId: tenant?._id?.toString() || null,
    tenant: tenant?.name || null,
    user: user ? { name: user.name, email: user.email, role: user.role } : null,
  });

export const emitBlueprintSpawn = (template: any, instance: any) =>
  dispatch({
    type: "blueprint_spawn",
    action: "spawned a new project instance",
    entityType: "assignment",
    entityId: instance?._id?.toString() || null,
    title: template?.title || null,
    metadata: {
      startDate: instance?.startDate || null,
      parentId: template?._id?.toString() || null,
    },
  });

export const emitBackupCompleted = (
  tenantName: string | null,
  ok: boolean,
  detail?: string,
) =>
  dispatch({
    type: "backup_completed",
    action: ok ? "backup completed" : "backup failed",
    entityType: "backup",
    tenant: tenantName,
    metadata: { ok, detail: detail || null },
  });
