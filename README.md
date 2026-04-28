# Tetris — Neon Edition

Tetris clásico jugable en el navegador, con estética neon, perfiles por nickname y leaderboard global. Construido como proyecto de portfolio para mostrar que un sistema con apariencia simple puede tener bien resueltas las piezas reales: motor de juego desde cero (SRS-compliant), persistencia con fallback automático, validación anti-cheat y deploy.

> **Demo:** https://tetris-pp-production.up.railway.app
> **Repositorio:** https://github.com/santinocerezo/tetris-pp

---

## Tabla de contenidos

- [Qué hace](#qué-hace)
- [Stack](#stack)
- [Estructura del repo](#estructura-del-repo)
- [Cómo correrlo localmente](#cómo-correrlo-localmente)
- [Deploy](#deploy)
- [Decisiones de diseño](#decisiones-de-diseño)
- [Controles](#controles)

---

## Qué hace

- **Tetris fiel a la guideline moderna**: 7-bag randomizer, SRS-style wall kicks, ghost piece, hold piece, preview de la siguiente.
- **Scoring estándar**: 100 / 300 / 500 / 800 puntos por single / double / triple / tetris, multiplicado por el nivel actual. +1 punto por celda en soft drop, +2 por celda en hard drop.
- **Sistema de niveles**: la velocidad de caída aumenta cada 10 líneas eliminadas.
- **Perfiles por nickname**: el jugador entra un apodo, se guarda en `localStorage`, y su historial (hasta 10 mejores partidas) queda asociado a ese nickname en la DB.
- **Leaderboard global** con los 20 mejores scores de todos los jugadores.
- **DAS (Delayed Auto Shift)** en los controles laterales para que el movimiento se sienta como un Tetris real.
- **Render en HTML5 Canvas** con efectos neón, glow, y partículas en line clears.

---

## Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | JavaScript (server) + JS vanilla (cliente) |
| Runtime / framework | Node.js + Express |
| Base de datos | PostgreSQL en producción, SQLite local (autodetect según `DATABASE_URL`) |
| Renderizado | HTML5 Canvas (sin frameworks ni motores de juego) |
| Seguridad | Helmet, CORS allowlist, rate limiting (`express-rate-limit`) |
| Dev tooling | Nodemon |
| Deploy | Railway (`railway.toml`) |

> **Sin frameworks de UI ni bundlers.** Todo el motor (generación de piezas, rotaciones SRS, colisiones, line clears, scoring, render) está escrito a mano en JS sobre Canvas.

---

## Estructura del repo

```
tetris-game/
├── server.js           # Express: API de scores, sirve estáticos
├── db.js               # Capa de DB con detección automática Postgres/SQLite
├── public/
│   ├── index.html      # Login + leaderboard + área de juego
│   ├── css/            # Tema neon
│   └── js/             # Motor de juego completo
└── package.json
```

---

## Cómo correrlo localmente

**Requisitos:** Node 18+.

```bash
git clone https://github.com/santinocerezo/tetris-pp.git
cd tetris-pp
npm install
npm run dev          # nodemon, hot-reload del server
# abrir http://localhost:3000
```

Sin `DATABASE_URL` configurado, el server usa SQLite local — funciona out-of-the-box sin tener que levantar ningún Postgres.

**Variables de entorno relevantes:**

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Si está, usa Postgres. Si no, fallback a SQLite. |
| `ALLOWED_ORIGINS` | Lista separada por coma de orígenes permitidos para CORS. Vacío = same-origin. |
| `PORT` | Puerto (default 3000). |

---

## Deploy

1. Push a GitHub.
2. Crear proyecto en Railway → **Deploy from GitHub repo**.
3. (Recomendado) agregar un servicio **PostgreSQL** al proyecto. Railway inyecta `DATABASE_URL` automáticamente y la app lo detecta.
4. Las tablas se crean automáticamente en el primer arranque.

> **Atención:** sin Postgres, la app cae a SQLite — pero el filesystem de Railway no es persistente entre redeploys, así que los scores se pierden con cada deploy. Para producción, sumar el plugin de Postgres es prácticamente obligatorio.

URL en producción: https://tetris-pp-production.up.railway.app

---

## Decisiones de diseño

- **Mismo `db.js` para Postgres y SQLite.** El server llama a una interfaz única; `createDb()` decide al boot qué backend usar según `DATABASE_URL`. Permite dev cero-configuración sin sacrificar producción.
- **Validación de scores en server.** El cliente reporta el score final, pero el server valida techos plausibles (`MAX_SCORE = 10.000.000`, `MAX_LEVEL = 30`, `MAX_LINES = 100.000`). Es un anti-cheat básico — corta el grueso de scripts triviales sin introducir verificación pesada.
- **Validación de nicknames con regex** (`/^[a-zA-Z0-9 _\-\.]{1,30}$/`) y truncado a 30 chars. Sin emojis, sin caracteres invisibles.
- **Rate limiting separado para reads y writes.** `apiLimiter` para todo `/api/*` (60 req/min), `writeLimiter` (30 req/min) para los endpoints que escriben scores.
- **`trust proxy = 1`.** Necesario para que `express-rate-limit` vea el IP real del cliente detrás del proxy de Railway.
- **Helmet por default.** Headers seguros sin pensarlo.
- **Cliente sin bundler.** Tres archivos planos (`index.html`, `css/`, `js/`). Para un proyecto de este tamaño, agregar Vite/Webpack solo agrega complejidad. Cargar es instantáneo.
- **Historial limitado a 10 partidas por jugador.** Evita que la tabla crezca sin techo si alguien spamea.
- **Ghost piece + hold piece desde el principio.** Un Tetris sin esas dos features se siente viejo. Son baratas de implementar y elevan la calidad percibida.

---

## Controles

| Tecla | Acción |
|---|---|
| ← → | Mover izquierda / derecha |
| ↑ | Rotar en sentido horario |
| Z | Rotar en sentido antihorario |
| ↓ | Soft drop (+1 punto por celda) |
| Espacio | Hard drop (+2 puntos por celda) |
| C | Hold piece |
| P | Pausa / reanudar |

En mobile el cliente expone controles táctiles (swipe para mover, doble tap para hard drop).

---

## Autor

**Santino Cerezo** — [GitHub](https://github.com/santinocerezo) · santinocerezo11@gmail.com
