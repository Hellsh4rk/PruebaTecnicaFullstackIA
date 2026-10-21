# Incidente: no se pueden guardar registros, 500 en varios servicios y el agente va lento

Síntoma simultáneo en tres planos: escrituras de negocio, errores 500 cruzados y latencia del asistente. Se trata como un incidente de plataforma, no como tres bugs sueltos, hasta que la traza diga lo contrario.

## 1. Hipótesis, en el orden en que las atacaría

| Orden | Hipótesis | Por qué está arriba | Qué la mataría rápido |
| --- | --- | --- | --- |
| 1 | Pool de Postgres agotado | El guardado es transaccional. Si el pool espera conexiones, el cliente ve timeout o 500 y el evento no sale del outbox. Encaja con "no pueden guardar". | `pg_stat_activity` con sesiones `idle in transaction` o `active` pegadas al límite de `max_connections`. Un `SELECT 1` en `/ready` también se queda esperando. |
| 2 | Backpressure en RabbitMQ | El outbox publica después del commit. Si el broker no acepta, el guardado igual respondió; el síntoma de "no guarda" no nace aquí. Baja respecto al pool, pero explica auditoría atrasada y DLQ creciendo. | Cola `audit.events` con consumers en 0, o `audit.events.dlq` recibiendo todo. El management en `:15672` lo muestra sin leer código. |
| 3 | Cascada HTTP desde el BFF | Crear un usuario llama Auth, User y Role en serie. Un 500 de Role se ve como 500 del gateway. Si el pool de una sola base está saturado, el gateway parece "todo caído". | Un correlation id que en el gateway termina en `UPSTREAM_TIMEOUT` o 500, y en un solo servicio downstream tiene el stack. |
| 4 | Event loop bloqueado por el LLM | Una llamada síncrona o un `await` sin timeout dentro del proceso que también atiende CRUD saturaría ese proceso. En este diseño el LLM vive solo en `ai-agent-service`, con timeout de 8 s para embed y 20 s para generar. Si los 500 están en User o Auth, esta hipótesis no explica el guardado. | El 500 y la latencia comparten el mismo `service` en el log. Si el servicio es `ai-agent-service` y el resto responde, el núcleo está sano. |
| 5 | Rate limit o contexto enorme en OpenAI | Explica la lentitud del agente y, si nadie aisló el proceso, la sensación de que "la plataforma está lenta". No explica un 500 de Postgres. | `usage.prompt_tokens` disparados, HTTP 429, o razón `rate_limited` / `timeout` / `circuit_open` en la respuesta degradada. |

No mezclo la contención. Primero devuelvo el guardado. El agente puede seguir degradado.

## 2. Triage

1. Tomo un `correlationId` de un 500 real, no de un healthcheck. El gateway lo devuelve en el cuerpo y en `x-correlation-id`.
2. Filtro los logs JSON por ese id. El orden esperado es gateway, luego un solo downstream. Si aparecen User y Role, la saga avanzó y falló en el segundo salto: miro el status de ese salto, no el 500 genérico del borde.
3. En el servicio que falló miro si el error es de pool (`timeout exceeded when trying to connect`, `too many clients`) o de dominio. `/ready` hace `SELECT 1`. Si `/health` sigue 200 y `/ready` no, el proceso vive y la base no.
4. En Postgres: conexiones por base, queries activas, locks. `auth_db`, `users_db` y `roles_db` comparten instancia. Un pool mal cerrado en Role puede impedir el commit de User.
5. En RabbitMQ miro `audit.events` (ready, unacked, consumers) y `audit.events.dlq`. Un consumidor caído no impide el commit; un publish que no drena solo retrasa la auditoría. Lo anoto, no lo confundo con la causa del guardado.
6. Recién ahí abro el agente: `GET /api/ai/metrics` (p95, p99, estado del circuito) y un query de prueba. Si el circuito está `open`, dejo de pegarle a OpenAI.

Contención inmediata, en este orden, sin esperar la causa fina:

- Bajar el tráfico de escritura si el pool está lleno. Reiniciar el servicio que deja transacciones abiertas, no los seis a la vez.
- No reintentar en masa desde el cliente: cada retry pide otra conexión.
- Confirmar que el circuit breaker del agente está abierto o abrir el aislamiento dejando de enrutar `/api/ai/*` en el gateway. El CRUD no debe compartir timeout con el modelo.
- Si la DLQ crece, no la reinyecto completa. Saco un mensaje, leo el correlation id y arreglo el consumidor.

## 3. El agente, aparte

Lo que veo en este servicio cuando OpenAI se degrada:

- **429 / `RESOURCE_EXHAUSTED`.** El cliente reintenta con backoff (200 ms, 400 ms) y, si sigue, la respuesta HTTP de la consulta es 200 con `degraded: true` y `reason: "rate_limited"`. No es un 500 del CRUD.
- **Timeout.** Embed corta a 8 s, generación a 20 s. El gateway corta la ruta de IA a 30 s para no colgar el worker del BFF. Razón `timeout`.
- **Contexto.** La búsqueda trae 4 chunks y la generación pide como máximo 2000 tokens de salida, con esfuerzo de razonamiento `low`. Si el p95 se va a segundos con pocos tokens de salida, el tiempo está en la cola de OpenAI o en el embedding, no en nuestro event loop.
- **Circuit breaker.** Tres fallos abren el circuito 15 s. Las siguientes consultas ni salen a la red. Eso es lo que evita que un 429 se convierta en un hilo ocupado por request dentro del agente, y desde luego no toca Postgres.

Si hubiera que optimizar en caliente: bajar `topK`, negarse a ingestar documentos grandes y mantener `gpt-5-nano`. No subiría el timeout para "dejar que responda": eso solo alarga la cola.

## 4. Comunicación

**T+0, primer impacto.** Canal de incidentes, no el correo largo.

> No se están guardando cambios de usuarios y hay errores 500. El asistente también está lento. Ya estamos mirando un identificador de traza concreto. Mientras tanto, no reintenten el guardado en ráfaga. El acceso de lectura puede seguir funcionando.

**T+15, contención.**

> El guardado falla por saturación de conexiones a Postgres, concentrada en un servicio. Reiniciamos ese proceso y bajamos los reintentos. El asistente quedó aislado: puede responder degradado o no responder, y eso ya no arrastra al resto. La auditoría puede ir unos minutos detrás. Siguiente update en 20 minutos.

**T+45, causa raíz identificada.**

> Causa: el pool de Postgres de la instancia compartida se agotó por transacciones que no se liberaban en Role Service. Los 500 del gateway eran la saga de alta esperando a ese servicio. La lentitud del agente es otro hecho: OpenAI respondió 429 y el circuito del agente se abrió; no es la causa de que no se pudiera guardar. Lecturas y altas nuevas ya pasan. Seguimos drenando la cola de auditoría.

**Post-mortem, al día siguiente.**

> Impacto: altas y ediciones fallaron durante X minutos. Lectura intermitente. El asistente estuvo degradado Y minutos por rate limit, sin perder datos de identidad.
> Causa: conexiones de Postgres retenidas en Role Service hasta agotar el pool de la instancia única. El BFF propagó ese fallo como 500. El 429 de OpenAI coincidió en el tiempo y se aisló con el circuit breaker.
> Qué no fue: la cola de RabbitMQ no bloqueó el commit. El outbox retuvo los eventos y Audit los consumió al recuperar consumidor.
> Acciones: pool y `statement_timeout` por servicio, alarma de conexiones por base, alarma de DLQ, no compartir el timeout del agente con el de usuarios, y un ensayo de carga que sature un solo pool sin tumbar el gateway.
> Dueños y fechas en el ticket. Este documento no reemplaza el ticket.

El mensaje ejecutivo no lleva nombres de clases ni hipótesis ya descartadas. Lleva qué está roto, qué pueden hacer ahora y cuándo vuelve el siguiente dato.
