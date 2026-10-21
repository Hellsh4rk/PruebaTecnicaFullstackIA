export const STARTER_KNOWLEDGE = [
  {
    title: 'Consola de operaciones',
    source: 'manual',
    text: 'Toka Control administra identidad interna. El API Gateway es el único acceso público. Auth emite JWT con roles, permisos y versión de token. User guarda el perfil en PostgreSQL. Role resuelve RBAC. Audit escribe eventos append-only en MongoDB. El asistente no modifica usuarios ni roles.',
  },
  {
    title: 'Catálogo de roles',
    source: 'manual',
    text: 'ADMIN tiene users:read, users:write, roles:read, roles:assign, audit:read y ai:query. OPERATOR opera usuarios y consulta el asistente. VIEWER solo lee usuarios y auditoría. Un cambio de rol incrementa la versión del token y obliga a refrescar la sesión.',
  },
  {
    title: 'Auditoría',
    source: 'manual',
    text: 'Los eventos user.created, user.updated, user.deactivated, role.assigned, role.revoked, auth.logged_in, auth.logged_out y ai.query_completed viajan por el exchange toka.domain. Si un consumidor falla, el mensaje va al dead-letter exchange toka.domain.dlx. Los secretos se redactan antes de persistir.',
  },
  {
    title: 'Límites del asistente',
    source: 'manual',
    text: 'El asistente usa recuperación por similitud de coseno en Qdrant cuando el proveedor ofrece embeddings. Si el modelo responde 429, agota el timeout o abre el circuit breaker, la respuesta se degrada y los servicios de usuarios, roles y auditoría continúan. No debe inventar registros que no estén en el contexto.',
  },
];
