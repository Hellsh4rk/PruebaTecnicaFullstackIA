# Toka Control

Consola interna de identidad: seis procesos, cuatro almacenes y un agente RAG. Se levanta completo con Docker Compose.

## Arranque

```bash
docker compose up --build
```

- Consola: http://localhost:8080
- Gateway: http://localhost:3000/api/health
- RabbitMQ: http://localhost:15672 (`toka` / `toka_secret`)
- Qdrant: http://localhost:6333

Credencial inicial: `admin@toka.local` / `Toka2026!`

El asistente usa la API oficial de OpenAI. El chat es `gpt-5-nano`, el modelo más barato ($0.05 / $0.40 por millón de tokens). Pega una clave `sk-` en `OPENAI_API_KEY` y recrea el agente.

Comprobación rápida, con el stack ya arriba:

```bash
bash scripts/smoke.sh
```

## Tests

```bash
npm install --prefix shared/contracts && npm install --prefix shared/platform
npm test
```

`npm test` corre Jest en cada microservicio y escribe el reporte en `services/<servicio>/coverage` (resumen en consola y `coverage/lcov-report/index.html`). El umbral es 70% de sentencias, ramas, funciones y líneas sobre `src`, salvo `main.ts`, que solo arranca el proceso.

## Mapa de la prueba

| Ejercicio | Dónde está |
| --- | --- |
| 1. Arquitectura, DDD y compose | [docs/01-arquitectura.md](docs/01-arquitectura.md), `docker-compose.yml` |
| 2. Microservicios | `services/auth-service`, `user-service`, `role-service`, `audit-service`, `api-gateway` |
| 3. Front-end | `apps/web` |
| 4. Incidente | [docs/04-incidente.md](docs/04-incidente.md) |
| 5. Agente RAG | `services/ai-agent-service`, [docs/05-prompts.md](docs/05-prompts.md) |

## Decisiones que importan

- PostgreSQL guarda identidad, perfiles y RBAC. MongoDB solo recibe eventos. Redis guarda la versión del token, el hash del refresh y la foto de permisos. Qdrant guarda vectores.
- El gateway es el único borde público. Los servicios exigen `x-internal-token` y vuelven a comprobar el permiso.
- User, Role y Auth escriben el evento en la misma transacción que el agregado (outbox) y un poller lo publica a `toka.domain`. Si el broker falla, la fila queda y se reintenta. Audit confirma por `eventId`; un duplicado se descarta.
- Un fallo de consumo hace `nack` sin requeue y el mensaje cae en `toka.domain.dlx`.
- El chat por defecto es `gpt-5-nano` ($0.05 / $0.40 por millón) y los embeddings son `text-embedding-3-small` recortados a 768 dimensiones ($0.02 por millón). `gpt-5-nano` usa `max_completion_tokens` (2000) y `reasoning_effort: low` porque es un modelo con razonamiento.
- El circuit breaker vive solo en el agente. Si el proveedor responde 429, agota el timeout o acumula fallos, la consulta vuelve degradada y usuarios, roles y auditoría siguen sirviendo tráfico.
